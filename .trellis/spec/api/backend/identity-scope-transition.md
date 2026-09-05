# Smart Park Identity Scope Transition

## 1. Scope / Trigger

Applies to the optional stage-1 identity scope component and its synthetic PostgreSQL test.
This is one step in the shared-kernel HR design, not enterprise authentication or production readiness.
Do not add this component to the default migration/deployment chain until the complete writer and
cutover closure is reviewed. Existing successful migrations stay immutable.

## 2. Signatures

- Component: `database/components/business-scope/000003_smart_park_identity_transition.sql`.
- Dependencies: `000001_core.sql`, `000002_smart_park_binding.sql`, existing identity/RBAC/Auth schema.
- Explicit owner operation: `public.backfill_smart_park_identity_scopes(requested_tenant_id text) RETURNS jsonb`.
- Local synthetic validation: `pnpm test:e2e:yuzhou-hr-identity-scope-transition`.
- New fields: `sys_user.default_scope_id`; `sys_role.scope_id`, `rel_user_role.scope_id`,
  `rel_role_perm.scope_id`, `sys_auth_refresh_token.scope_id`.

## 3. Contracts

- Additive only: retain old `park_id NOT NULL` and old uniqueness. NULL in a new column is an unmigrated
  legacy row, not enterprise authorization. A mapped scope cannot be silently cleared.
- Tenant/platform role definitions retain NULL scope; park role definitions bind the exact real park.
  Permissions stay tenant-global definitions. Authentication identities are not cloned per scope.
- User/role/permission references, including definition parents, use composite tenant-qualified foreign keys.
  Mapped rows reference the exact `(tenant_id,scope_id,park_id)` in the canonical binding.
- Backfill locks its source and target tables, binds one current live tenant row, checks every required
  real park binding, and updates only NULL new fields within the requested tenant.
  Scope `tenant_row_id` must equal that live tenant row, not merely share a recycled tenant business key.
- Every existing field, status, credential value and authorization fact remains unchanged. No new memberships,
  module grants, users, provider identities, roles or tokens are created. Deleted/revoked rows are also mapped
  or explicitly block the transition; they must not disappear from counts.
- Mapped authorization links must match park-scoped role definitions. The link trigger locks the role
  with `FOR SHARE`, and the role reverse guard rejects changes that would invalidate mapped links.
- A mapped refresh token cannot change user, tenant, park, scope or token hash. Normal revocation remains possible.
- Backfill and trigger functions use `SECURITY INVOKER`, fixed `search_path`, and no PUBLIC execute grant.
  A later installer must track exact component checksum/history; direct fixture execution is not that installer.

## 4. Validation / Error Matrix

- Missing dependency -> `SMART_PARK_IDENTITY_TRANSITION_PREREQUISITE_MISSING`.
- Invalid tenant or no unique live tenant -> stable INVALID_TENANT / TENANT_NOT_UNIQUE marker.
- Missing, ambiguous, deleted or stale tenant/park/scope binding -> stable BINDING/PARK marker, zero updates.
- Active duplicate tenant username or provider identity -> stable ACTIVE_USERNAME/PROVIDER_CONFLICT marker;
  never pick a winner or merge accounts automatically.
- Cross-tenant entity references -> composite FK rejection or explicit role-identity rejection.
- Wrong park-role link, reverse scope drift or clearing mapped scope -> stable ROLE_SCOPE/SCOPE_CLEAR marker.
- Mapped refresh identity change -> `SMART_PARK_IDENTITY_REFRESH_SCOPE_IMMUTABLE`.
- Read-only role attempts backfill/update -> PostgreSQL `42501`.
- Any later failure -> the complete function statement rolls back, including earlier table updates.

## 5. Good / Base / Bad Cases

- Good: a tenant's users, park role, grants and historical sessions get exact scope references; all prior
  fields remain equal and the next call reports zero changes.
- Base: unconverted legacy inserts can remain NULL until explicitly backfilled; mapped scope-changing
  writes must dual-write correctly or fail, rather than silently leave a stale binding.
- Bad: drop park constraints first, use a fake enterprise park, reuse a deleted tenant entity's binding,
  change grant/status flags, or label successful fixture execution as an independently usable HR product.

## 6. Required Tests

- Execute actual selected identity/RBAC/Auth migration SQL, with documented minimal tenant support.
- Assert all-row exact counts, historical session inclusion, unchanged original-field hashes, no new grants,
  untouched foreign tenant, and zero-change reentry.
- Assert installation rollback on existing cross-tenant corruption; ordinary and parent composite FKs;
  wrong mapped scopes, reverse role drift, immutable refresh identity and allowed revocation.
- Reject live tenant replacement under the same business key, duplicate identity, missing/deleted/ambiguous
  park mapping, and an injected late failure without partial updates.
- Hold an uncommitted mapped role link, prove a concurrent role move waits on its lock, then prove the
  committed link prevents that incompatible move. Keep the test on dedicated query-runner connections.
- Prove read-only denial and exact temporary-resource cleanup. Use the runner's host/Docker capacity guards.

## 7. Wrong vs Correct

Wrong: compare only `scope.tenant_id = requested_tenant_id` and assume current tenant identity.

Correct: under the source locks, resolve exactly one non-deleted `sys_tenant.id`, require
`scope.tenant_row_id` to match it, then validate the exact real park binding before any update.
