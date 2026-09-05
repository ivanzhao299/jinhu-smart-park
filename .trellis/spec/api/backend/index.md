# @jinhu/api Backend Specs

Cross-layer scoped asset writes: [Asset Park Context Writes](./asset-park-context-writes.md).

Protected tenant SUPER_ADMIN context evaluation: [Tenant Super Control Plane](./tenant-super-control-plane.md).

Per-park role integrity projection and explicit target-park assignment: [Park Role Integrity](./park-role-integrity.md).

Optional identity/RBAC/session range preparation: [Identity Scope Transition](./identity-scope-transition.md).

Physical-to-operating space conversion: [Asset To Operating Space Mapping](./asset-operating-space-mapping.md).

Apartment operating-space inclusion: [Apartment Inclusion And Availability](./apartment-inclusion-availability.md).

Apartment handover energy ledger: [Apartment Handover Energy Integration](./apartment-handover-energy-integration.md).

These rules describe the current NestJS API in `apps/api`. Follow them when changing controllers, services, DTOs, entities, migrations, seeds, and API smoke scripts.

Versioned Party sensitive-data keys and tenant-scoped rotation: [Party Sensitive Data Key Rotation](./party-sensitive-data-key-rotation.md).

Human resources lifecycle, goals, performance, protected documents, approvals, and payroll: [HR Management Domain Contract](./hr-management.md).

T3 historical attendance/insurance field conversion: [Yuzhou T3 Production Projection](./yuzhou-t3-production-projection.md).

Exact old-policy source recovery and two-to-one lineage: [T3 Policy Recovery](./yuzhou-t3-policy-recovery.md).

Same-source normalized phase and eight-table review assembly: [T3 Decision Candidates](./yuzhou-t3-decision-candidates.md).

Real-browser smoke and rehearsal interaction readiness: [Browser Rehearsal Hydration](./browser-rehearsal-hydration.md).

## Package Boundary

- Source lives in `apps/api/src`.
- Feature modules live under `apps/api/src/modules/<domain>/`.
- Shared API infrastructure lives under `apps/api/src/shared/`.
- SQL migrations live in `database/migrations`; operational scripts live in `scripts/`.

Reference files:
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.module.ts`
- `apps/api/src/shared/interceptors/response.interceptor.ts`

## Module Shape

Feature modules use the NestJS module/controller/service/entity/DTO split:

- `*.module.ts` wires TypeORM repositories and providers.
- `*.controller.ts` owns route decorators, permissions, audit decorators, and request DTO wiring.
- `*.service.ts` owns business logic, transactions, query builders, field policy application, and persistence.
- `dto/*.dto.ts` uses `class-validator` and `class-transformer`.
- `entities/*.entity.ts` maps TypeORM columns and indexes.

Reference files:
- `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.service.ts`
- `apps/api/src/modules/leasing-payments/dto/create-leasing-payment.dto.ts`
- `apps/api/src/modules/leasing-payments/entities/leasing-payment.entity.ts`

Avoid placing business rules in controllers. Controllers should delegate to services after binding `@CurrentScope`, `@CurrentUser`, `@Param`, `@Query`, and `@Body`.

## Scenario: Tenant Asset Projection Provisioning

### 1. Scope / Trigger

- Trigger: creating a tenant or changing tenant module authorization so the `asset` module becomes enabled.

### 2. Signatures

- Asset provisioning is a shared transaction primitive used by tenant `create`, `updateLoginSettings`, `assignModules`,
  public SaaS tenant-module assign/enable, and direct asset-park creation. Every writer uses the same tenant/park
  advisory lock before reading or writing `asset_park`.
- Canonical source is the active `biz_park` row; the derived destination is `asset_park(tenant_id, park_id)`.
- The production diagnostic may emit `ready_missing_asset_seed_reconcile` before the production seed runs.

### 3. Contracts

- The tenant transaction must serialize scope convergence by tenant and park, require one active canonical `biz_park` source (except the fixed default scope's reviewed globally unique `JH` fallback), and create or restore exactly one enabled `asset_park` from those canonical fields.
- Module and tenant-admin permission convergence covers every non-deleted tenant park so an inactive park cannot retain stale authorization. Asset projection/runtime-control provisioning remains limited to active parks.
- An inactive park keeps its selected `asset` assignment and asset-derived TENANT_ADMIN permissions disabled; other selected modules still converge normally. Direct asset-park create performs canonical provisioning, while update/delete take the same scope lock and cannot disable or delete the projection while the asset assignment is active.
- An inactive park retains an enabled `system` assignment plus only `park:read` and `park:update` as recovery capabilities only when the scope has an asset assignment or retained runtime history, even when the selected plan/module set omitted `system`. An orphan `asset_park` projection is synchronized but never creates recovery assignments or grants. Park list/detail/update use their explicit park permission as the shared authority for active asset and inactive system-recovery callers; the Web exposes the route under both filtered module menus. Park create/delete and all building/floor/unit/property operations remain asset-gated.
- The same transaction must initialize the signed 12 disabled property runtime controls through the audited v1 -> v2 -> v3 contract path, yielding 24 immutable correction audits. A fully canonical scope is a no-op; partial or drifted control/audit state fails closed.
- Disabling `asset` does not delete existing asset-domain business data.
- Disabling or expiring an existing asset assignment also preserves the signed runtime controls and immutable audits. A scope with that historical assignment is retained for exact-set validation only; it is never interpreted as a currently enabled module or initialized by the seed.
- Retained validation does not require the tenant to remain active or unexpired, but it still requires the exact projection,
  control, and correction-audit history. Active and retained scopes both validate the contents and evidence of all 24
  immutable correction audits, not only their row counts. Missing or extra control sets remain classified by the
  parity report before audit-content validation so deployment output preserves the precise repair boundary.
- A retained scope is ready only at `post_000195`; before the final contract stage it fails closed because the forward migrations operate only on active assignments. Application-side audit validation enforces the 000194 -> 000195 -> final-control timestamp chain as well as hashes and evidence.
- Historical convergence is ordered: production seed `000007` creates the projection, then `000008` creates the 12 disabled runtime controls and their correction audits.
- The predeploy classifier is read-only and may allow convergence only when this release will run production seed, migration compatibility is final, no non-deleted projection exists, the source is deterministic, and controls are entirely absent.

### 4. Validation & Error Matrix

- missing active canonical park during direct module assignment -> `Park not found`; the transaction rolls back.
- multiple active canonical sources, multiple non-deleted projections, or partial controls/audits -> conflict; the transaction rolls back.
- disabled existing projection on an authorized business write -> restore and synchronize it.
- direct asset-park update/delete while the asset assignment is active and the result would remove the enabled projection -> conflict.
- canonical `biz_park` create/update/delete uses the same scope lock; every transition from status `1` to a non-active status removes a source. A protected active/retained asset scope keeps exactly one active source after mutation, permits removal of redundant sources that restores that invariant, and immediately reprojects from the surviving source in that transaction.
- Tenant reactivation is transactional across the dedicated enable route, generic tenant update, and login-settings status/expiry update. On every runtime inactive-to-active edge, each active park with an enabled and unexpired asset assignment runs the same projection/runtime-control provisioning primitive before commit. Future assignments are provisioned before their start time, while runtime module visibility continues to enforce the normal start-time predicate. Dormant scopes intentionally skipped by production seed therefore cannot become active in a partial state.
- Reactivation iterates eligible assignment scopes directly and delegates source selection to the canonical resolver, preserving the fixed default scope's reviewed global `JH` fallback when no exact source exists.
- Tenant-wide authorization convergence and reactivation acquire per-park advisory locks in the same deterministic `parkId` order; never depend on repository row order for multi-scope lock acquisition.
- asset projection create/update treats code/name/address/area/status as canonical assertions rather than independent mutable data; mismatches are rejected instead of silently accepted.
- Projection update resolves the authoritative `biz_park` under the scope lock before validating DTO fields; a drifted projection cannot become the reference canonical value.
- A validated projection update runs full provisioning so canonical fields and enabled status are actually persisted. Canonical `biz_park` mutation with only an orphan projection and no active/retained asset assignment performs projection-only synchronization and must not create runtime controls/audits.
- disabled, duplicate, or otherwise non-deleted historical projection at predeploy -> `invalid_scope`.
- one enabled projection plus any additional disabled non-deleted projection -> `invalid_scope` for both active and retained scopes.
- ambiguous/missing park source, partial controls, definition drift, seed disabled, or migration-history drift -> deployment remains blocked.
- A legacy scope with multiple active canonical sources may enter a migration-only reconcile state only before the reviewed canonical-source migration succeeds, when exactly one enabled projection exists and its `park_code` uniquely identifies the survivor. The migration must lock, immutably audit, and soft-disable only non-matching sources; after migration, both scope and runtime-control gates must be rerun before seed or API startup, and any repeated ambiguity is invalid.

### 5. Good / Base / Bad Cases

- Good: a system-only tenant enables `asset`; the same transaction creates one enabled projection.
- Base: an already valid projection is synchronized without creating a duplicate.
- Bad: a deployment gate treats every missing projection as repairable or copies an arbitrary park across scopes.

### 6. Tests Required

- Unit-test serialization, deterministic source selection, duplicate rejection, create/restore behavior, signed controls, audited correction, partial-state rejection, and every tenant/module/asset write entry point.
- In isolated PostgreSQL, assert missing projection -> diagnostic reconcile state -> `000007`/`000008` -> `ready_exact`.
- Assert disabled/duplicate projections and partial controls stay fail-closed.
- Assert a disabled assignment on an expired tenant with exact 12 controls/24 audits is `ready_retained_exact`, while unknown scopes and active/retained partial, altered, or unknown controls/audits remain blocked.
- Run the complete `verify-000194-runtime-control-retry.sh` historical and fresh-order fixture.

### 7. Wrong vs Correct

#### Wrong

```ts
if (moduleCodes.includes("asset") && !(await repository.findOne(...))) {
  await repository.save(repository.create(...));
}
```

#### Correct

```ts
await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [scopeKey]);
const projection = (await repository.findOne(...)) ?? repository.create(...);
projection.status = "enabled";
await repository.save(projection);
```

## Scenario: Additional Tenant Park Scope Provisioning

### 1. Scope / Trigger

- Trigger: `POST /parks` by a tenant administrator creates an additional park for the current tenant.

### 2. Signatures

- Request remains `CreateParkDto`; clients never submit trusted `tenantId` or `parkId`.
- Response is the created `ParkEntity`, including the server-generated `parkId`.

### 3. Contracts

- An additional park is a new `(tenantId, parkId)` scope, never a second `biz_park` canonical source inside the JWT's current park scope.
- The server generates a globally unused `parkId`; the database permits only one non-deleted `biz_park` per `parkId`.
- Park, root organization, target-park RBAC binding rows, the existing administrator's secondary user-park/org links, module assignments, and active asset projection/runtime controls commit in one transaction. Permission and TENANT_ADMIN role entities remain tenant-wide and are reused.
- The target asset-scope advisory lock is acquired before target-dependent writes. Existing source/default scope lock ordering remains deterministic.
- The existing administrator remains the single login identity; additional park links are non-default and must not force the current Web client into an unsupported context-selection login.
- Tenant administrators may list and manage all parks in their tenant; other users remain restricted to the JWT park and normal data scope.
- Every module assignment preserves the source park's exact start/expiry window, enabled/status state, plan, and feature configuration; park creation must not extend, activate early, or revive a scheduled/expired module.

### 4. Validation & Error Matrix

- non-tenant-admin with `park:create` -> forbidden before provisioning.
- duplicate park code or tenant park limit -> conflict/bad request and full rollback.
- duplicate active `parkId` history before the uniqueness migration -> deployment fails closed.
- missing source modules/permissions/administrator identity -> request fails and full rollback.
- inactive initial status -> bad request; an additional park starts active so its module/asset provisioning is complete.

### 5. Good / Base / Bad Cases

- Good: tenant admin creates a second active park; both scopes have one canonical source and independent authorization/projection rows.
- Base: existing first-park tenant onboarding remains unchanged.
- Bad: insert a second active `biz_park` with the current JWT `parkId`, or link a target role to source-park permission entities.

### 6. Tests Required

- Assert generated target scope, target lock, root organization, modules, tenant-wide role/permission reuse, the single login identity, and all three target-park binding relations.
- Assert ordinary users cannot widen list/detail scope and inactive parks do not receive asset authorization.
- Rehearse the forward-only uniqueness migration against clean data, active duplicates, and soft-deleted historical canonical rows.
- Run API unit/type/lint/build plus a PostgreSQL/API E2E that creates and logs into the second park context.

### 7. Wrong vs Correct

#### Wrong

```ts
repository.create({ tenantId: current.tenantId, parkId: current.parkId, ...dto });
```

#### Correct

```ts
const targetScope = { tenantId: current.tenantId, parkId: await generateParkScopeId(manager) };
await lockAssetScope(manager, targetScope);
await provisionAdditionalPark(manager, current, targetScope, actor, dto);
```

## Scenario: Tenant Code-Rule Scope Provisioning

### 1. Scope / Trigger

- Trigger: tenant creation, additional-park creation, login/module settings update, or direct module assignment creates or changes a `(tenantId, parkId)` module scope.
- Trigger: a forward migration must repair pre-existing active scopes that predate runtime provisioning.

### 2. Signatures

- Runtime entry point: `ensureCodeRuleScopeProvisioned(manager, scope, actorId)` inside the caller's existing transaction. Tenant create/update/reactivation, park reactivation (including bounded default-scope recovery), additional-park creation, tenant login/module settings, and direct SaaS module assign/enable writers must all use it after persisting or restoring assignments.
- Standard source: enabled, non-deleted `sys_code_rule` rows in fixed platform scope `10000001/20000001`, selected by persisted enabled module assignments.
- Migration entry point: forward-only `database/migrations/000213_code_rule_scope_provisioning.sql` with the same source, eligibility, sequence-reset, and history-preservation semantics.

### 3. Contracts

- Never trust raw DTO `moduleCodes`; read persisted `rel_tenant_module JOIN sys_module` in the transaction. Both rows must be enabled and non-deleted, and the assignment must not be expired.
- Provision future-start assignments ahead of activation. Runtime module visibility still enforces `start_time`; provisioning must not grant permissions or activate a module early.
- Copy rule definitions and examples, but reset `current_seq/current_sequence` to `0` and `next_reset_time` to `NULL` so each park has an independent sequence.
- If any target row has the same `rule_code` **or the same `entity_type`**, including disabled or soft-deleted history, do not insert, update, enable, or resurrect it. Both identities are database-unique for non-deleted rows, and administrators may use a custom rule code for a standard entity.
- Lock the validated fixed-source core rows through the copy statement. A preflight and insert under separate unlocked `READ COMMITTED` snapshots may otherwise commit a partial asset rule set.
- The fixed source must contain enabled `BUILDING_CODE`, `FLOOR_CODE`, and `UNIT_CODE` when asset provisioning is required. A missing core source is a configuration conflict, not a reason to use another tenant or park as fallback.
- Validate each asset core source by its complete identity tuple (`rule_code`, `target_module`, `entity_type`, `target_entity`); an enabled but remapped platform rule is incomplete and must fail before target writes.
- Every park inactive-to-active transition runs provisioning, including future-start assignments. Current asset-runtime protection gates authorization restoration only and must not gate rule projection.
- New code-rule-backed modules extend the fixed standard source and persisted module assignment data; do not add a second application-only rule-code list.

### 4. Validation & Error Matrix

- asset assignment plus incomplete fixed core source -> conflict and full transaction rollback.
- disabled/deleted/expired assignment or disabled/deleted module -> no new target rules.
- future-start enabled assignment -> rules provisioned, module remains unavailable until its normal start-time gate passes.
- target disabled/deleted/customized history -> preserve it exactly and skip the matching rule.
- concurrent or repeated provisioning -> advisory-lock serialized, idempotent result with no duplicate rule.
- tenant or park reactivation/expiry extension and direct SaaS module assign/enable -> provision in the same transaction after assignments become active; no entry point may rely only on the one-time migration.
- unknown target scope or source in another tenant/park -> never infer or cross-scope copy.

### 5. Good / Base / Bad Cases

- Good: a newly provisioned tenant creates building, floor, and unit with empty user codes; generated values begin at sequence 1 in that park.
- Base: rerunning provisioning or migration inserts zero additional rows and preserves the current sequence.
- Bad: production seed initializes only the default scope while tenant/park creation omits runtime rule provisioning.

### 6. Tests Required

- Unit-test source module filtering, future-start provisioning, expired/disabled exclusion, core-source conflict, history preservation, sequence reset, and idempotency.
- Contract-test every tenant/module/park writer so no onboarding or module-change entry point bypasses the shared helper.
- In disposable PostgreSQL, run migration, production seed, legacy-scope fixtures, migration replay, runtime helper replay, and independent building/floor/unit generation assertions.
- API/browser regression must cover: new tenant -> real current park name -> create building/floor/unit -> add park -> refreshed accessible park list -> switch context -> create a second park's building without `Enabled code rule not found`.

### 7. Wrong vs Correct

#### Wrong

```ts
// Seed-only initialization leaves every future tenant/park incomplete.
if (scopeIsPlatformDefault) await insertDefaultRules();
```

#### Correct

```ts
await manager.transaction(async (transaction) => {
  await persistTenantModuleAssignments(transaction, scope, moduleCodes);
  await ensureCodeRuleScopeProvisioned(transaction, scope, actorId);
});
```

## Authentication, Permissions, And Scope

Non-public endpoints must declare permission metadata. `PermissionGuard` rejects endpoints with neither `@RequirePermissions` nor `@RequireAnyPermissions`.

Routes that belong to a product module should also use `@RequireModule("<module>")` at controller level when the module is gated.

Use shared permission constants from `@jinhu/shared` instead of string literals in controllers.

For unscoped password login, resolve duplicate usernames only after password, lockout,
deletion, and enabled-state checks. A unique candidate with an active super role (or active
`*` permission) may be selected ahead of matching tenant accounts; never infer this from the
username. Zero super candidates retain normal tenant ambiguity/context selection, while
multiple super candidates must fail as duplicate privileged identities. Token issuance and
candidate selection must share the same active-role and active-permission definition.

Reference files:
- `apps/api/src/shared/guards/permission.guard.ts`
- `apps/api/src/shared/decorators/permissions.decorator.ts`
- `apps/api/src/shared/decorators/modules.decorator.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
- `packages/shared/src/index.ts`

## Scenario: Current-User Permission Survives JWT Rehydration

### 1. Scope / Trigger

- Trigger: changing login authorization assembly, `UsersService.resolveJwtPrincipal`, or the `system:user:me` permission contract.

### 2. Signatures

- `POST /auth/login` returns a token for an active user even when the user has no roles.
- Authenticated requests rehydrate `JwtPrincipal` from the database through `UsersService.resolveJwtPrincipal(scope, userId)`.
- `GET /auth/me` requires `SYSTEM_PERMISSIONS.USER_ME`.

### 3. Contracts

- Every active non-super user principal includes `SYSTEM_PERMISSIONS.USER_ME`, both at login-result assembly and at database rehydration.
- Entity-based principal assembly used by current-user context follows the same rule.
- Super users retain the wildcard representation `permissions=["*"]`; do not append redundant base permissions to it.
- Role and permission status, deletion, tenant, and park filtering remain fail-closed.

### 4. Validation & Error Matrix

- active user without roles -> login succeeds and `GET /auth/me` returns HTTP 200.
- active user with roles -> role permissions plus `system:user:me` are available after rehydration.
- active super user -> wildcard principal and HTTP 200.
- missing, disabled, deleted, or cross-scope user -> authentication context is rejected.

### 5. Good / Base / Bad Cases

- Good: a newly created user resets a password, logs in before role assignment, and can read only their own login context.
- Base: a role-bearing user keeps role grants and the current-user base permission.
- Bad: login response adds `system:user:me`, but the next JWT validation rebuilds a principal without it and returns HTTP 403.

### 6. Tests Required

- Unit-test database principal rehydration for an active role-less user and assert exactly `system:user:me`.
- Preserve active-grant filtering and wildcard-super tests.
- Run `first-release-users-assets.mjs` or the full first-release regression so login followed by `GET /auth/me` is exercised before and after role assignment.

### 7. Wrong vs Correct

#### Wrong

```ts
permissions: isSuper ? ["*"] : expand(rolePermissions)
```

#### Correct

```ts
permissions: isSuper
  ? ["*"]
  : expand([...rolePermissions, SYSTEM_PERMISSIONS.USER_ME])
```

## DTO Validation

Global validation is configured in `apps/api/src/main.ts` with:

- `whitelist: true`
- `transform: true`
- `forbidNonWhitelisted: true`

DTOs should use `class-validator` decorators and `class-transformer` transforms for trimming and numeric coercion. Reuse existing helpers when a domain already exposes them, such as `trimOptional` and `optionalNumber` in leasing receivable DTOs.

Business display names used as catalog labels must be required and normalized before validation.
Remove Unicode `\\p{Default_Ignorable_Code_Point}` characters before checking that the result contains
at least one Unicode letter (`\\p{L}`), including alphabetic or ideographic text; some default-ignorable
fillers are themselves classified as letters. A negated number/whitespace class is insufficient because
punctuation, decimal separators, and invisible characters would pass. Reject omission, blank, number-only,
punctuation-only, and invisible-only names at the API boundary even when the Web form also validates them.
Identifiers and codes belong in their dedicated fields.

## Scenario: Organization Hierarchy And Assignment Scope Integrity

### Contracts

- A submitted parent organization must be active, in the target tenant/park, cycle-safe, and visible in the
  actor's organization data scope. Do not authorize a hidden `parentId` merely because it exists.
- When validating submitted organization assignments, first resolve the actor-visible organization ids and
  explicitly intersect the submitted ids with that set. Do not merge a submitted `id: In(...)` predicate with
  a data-scope mapping for the same column because the mapped predicate can overwrite the submitted ids.
- User profile fields and optional organization assignments in one update request commit in the same database
  transaction under the user/scope advisory locks. A validation or relationship-write failure rolls back the
  profile update.
- Production `api` and `full` deployments stop the old API before migration and keep it stopped through the
  optional production seed until the new API starts. Migration failure remains fail-closed with API stopped.
- Persisted user-role and role-data-scope links are park-scoped authorization inputs. Scoped resolution must filter
  both `tenantId` and `parkId`; a stale relationship from another park must never widen the current park's data scope.
- A user move may leave an old active organization link whose `tenantId` no longer matches the canonical user.
  Forward migration retires that cross-tenant link, while same-tenant secondary-park links remain valid. Organization
  deletion counts only links whose active user still belongs to the organization tenant.

### Tests Required

- Reject an existing but actor-hidden parent for both create and reparent operations.
- Reject a submitted hidden assignment even if a separate entity count would find that organization.
- Prove profile save and relationship replacement execute inside the same transaction manager.
- Assert deploy ordering is `stop api -> db-migrate -> up -d api` (or `api web`).
- Assert scoped role and role-data-scope repository predicates include the current park.
- Rehearse the organization-integrity migration with one stale cross-tenant link and one same-tenant secondary-park
  link; only the stale cross-tenant link is retired.

Pagination DTOs must validate `page` and `page_size` as integers and cap
`page_size` at the endpoint's documented maximum before values reach
`skip`/`take`. Candidate endpoints are not exempt from the bound.

Reference files:
- `apps/api/src/main.ts`
- `apps/api/src/modules/leasing-payments/dto/create-leasing-payment.dto.ts`
- `apps/api/src/modules/leasing-receivables/dto/create-leasing-receivable.dto.ts`

## Scenario: Role Permission Bulk Assignment Capacity

### 1. Scope / Trigger
- Trigger: changing the system permission catalog or the role permission replacement endpoint.

### 2. Signatures
- `POST /roles/:id/permissions` accepts `{ permissionIds: UUID[] }`.
- `AssignPermissionsDto.permissionIds` uses `ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE` as its bounded capacity.

### 3. Contracts
- The DTO capacity must remain greater than or equal to the complete current system permission catalog plus documented tenant-extension headroom.
- Keep a finite `ArrayMaxSize`; do not remove the request bound merely because the catalog grows.
- `RolesService.assignPermissions` remains authoritative for tenant scope, active/non-deleted permission existence, and replacement semantics.

### 4. Validation & Error Matrix
- Valid UUID array at or below the capacity -> DTO accepts; the service validates every permission in the current tenant.
- Array above the capacity -> DTO validation returns HTTP 400.
- Unknown, deleted, or cross-tenant ID -> the service rejects the complete assignment.

### 5. Good/Base/Bad Cases
- Good: a role can select the complete seeded permission tree when it contains more than 200 entries.
- Base: a small role assignment follows the same replacement path.
- Bad: a hard-coded limit below the seeded catalog makes selecting a parent permission impossible to save.

### 6. Tests Required
- DTO test with a permission array larger than the retired limit and representative of the current seed count.
- DTO test with `ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE + 1` entries rejected.
- Preserve service tests for tenant isolation and missing permission IDs.

### 7. Wrong vs Correct

#### Wrong
```ts
@ArrayMaxSize(200) // smaller than the current permission tree
permissionIds!: string[];
```

#### Correct
```ts
export const ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE = 1000;
@ArrayMaxSize(ROLE_PERMISSION_ASSIGNMENT_MAX_SIZE)
permissionIds!: string[];
```

## Scenario: Role Field Policy Authority

### 1. Scope / Trigger
- Trigger: changing role field-policy assignment, role copy, user login context, or any legacy field-permission endpoint.

### 2. Signatures
- Authoritative write endpoints are `POST /field-policies/role-bindings/:roleId` and `POST /roles/:id/field-policies`.
- Deprecated legacy write endpoint `POST /roles/:id/field-permissions` must return a deprecated error and must not write `rel_role_field_perm`.

### 3. Contracts
- Runtime field policy authority is `sys_field_policy + rel_role_field_policy + FieldPolicyService`.
- `rel_role_field_perm` is retained only as deprecated historical input for migration or read-only audit; it is not a runtime authorization source.
- Role copy must copy `rel_role_field_policy` links, not legacy `rel_role_field_perm` rows.
- Legacy migration maps access modes as `none -> hidden`, `mask -> masked`, `read -> readonly`, and `write -> editable`.
- If legacy rows disagree for the same tenant/module/entity/field, convergence must be deterministic and audited because the new active policy unique key allows only one policy per field.

### 4. Validation & Error Matrix
- New role field-policy assignment with valid policy IDs in the current tenant -> replaces only the caller park's role-policy links.
- Unknown, deleted, or cross-tenant policy ID -> rejects the complete assignment before retiring existing links.
- Legacy `POST /roles/:id/field-permissions` -> HTTP 410 deprecated, no transaction write against the legacy relation.

### 5. Tests Required
- Service/source tests prove role copy uses `RoleFieldPolicyEntity`.
- Service test proves legacy field-permission write returns the deprecated error without writing old bindings.
- Migration or SQL review test proves old `read` maps to `readonly`, old links populate `rel_role_field_policy`, and conflict/convergence counts are queryable from an audit table.

## File Upload Validation

Read `file-upload.md` before changing multipart upload endpoints, file metadata persistence, feature-specific attachment upload routes, or file ID validation.

Reference files:
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/files/files.controller.ts`
- `packages/shared/src/index.ts`

## Apartment Formal Documents

Read [Apartment Formal Documents And Signing](./apartment-documents.md) before changing apartment templates, document generation, signing evidence, default reasons, or responsibility-user role convergence.

## Response And Error Shape

Successful responses are wrapped by `ResponseInterceptor` as:

```ts
{ code: 0, message: "success", data, request_id, server_time }
```

Errors are normalized by `ApiExceptionFilter` as `ApiResponse<null>` with HTTP status in `code`.

Reference files:
- `apps/api/src/shared/interceptors/response.interceptor.ts`
- `apps/api/src/shared/filters/api-exception.filter.ts`
- `packages/shared/src/index.ts`

Use Nest exceptions (`BadRequestException`, `ForbiddenException`, `ConflictException`, `NotFoundException`, etc.) from services. Do not return ad hoc error objects from controllers or services.

## Scenario: Organization Hierarchy And User Assignments

### 1. Scope / Trigger

- Trigger: changing `sys_org.parent_id`, organization tree APIs, user organization/post assignments, or `org_and_children` data-scope behavior.

### 2. Signatures

- `GET /orgs/tree` returns scoped `OrgTreeNode[]` with recursive `children`.
- `GET /orgs/leaders` returns every enabled, non-deleted user in the current tenant/park; it is not a silently truncated candidate page.
- `POST /users` optionally accepts `assignments: { orgId, postId, isPrimary }[]` for atomic account creation.
- `GET /users/:id/org-candidates` returns enabled organizations and posts in the target user's scope.
- `GET /users/:id/orgs` returns active `UserOrgAssignment[]`.
- `POST /users/:id/orgs` accepts `{ assignments: { orgId, postId, isPrimary }[] }` with replacement semantics.
- Database parent identity is `(parent_id, tenant_id, park_id) -> sys_org(id, tenant_id, park_id)`.

### 3. Contracts

- Existing paginated `GET /orgs` remains compatible; tree reading is a separate endpoint and applies the same `org` data-scope predicate. Authorized children whose ancestors are filtered out become projection roots; unauthorized ancestors are never restored.
- Parent organizations must exist, be enabled, share the child's tenant/park, and must not create self or ancestor cycles.
- Organization hierarchy writes in one tenant/park are serialized across create, update, disable, and delete before parent/child validation. A pre-transaction validation is insufficient because concurrent inverse parent changes can both pass the same old snapshot.
- User creation saves the account, accessible-park links, and optional organization/post assignments in one database transaction. Assignment validation or persistence failure rolls back the complete create operation.
- User-organization replacement resolves the target scope from the target user, not from the acting super administrator's current JWT scope.
- Replacement is transactional, soft-deletes previous active relationships only for that user and target tenant/park, and creates the requested target-scope set without changing links in other parks.
- Organization deletion is blocked only by active children or links to active users; historical links owned by soft-deleted users do not permanently block deletion.
- At most one active primary organization exists per user and scope; duplicate organization/post assignments are rejected.
- `org_and_children` expands only enabled, non-deleted descendants inside the current tenant/park; an empty root set denies access.

### 4. Validation & Error Matrix

- missing, disabled, or cross-scope parent -> HTTP 400.
- self-parent or cycle -> HTTP 400.
- delete organization with active child or user assignment -> HTTP 400.
- duplicate assignment or multiple primary organizations -> HTTP 400.
- missing, disabled, or cross-scope organization/post assignment -> HTTP 400 and no partial replacement.
- invalid organization/post assignment during `POST /users` -> HTTP 400 and no user, accessible-park link, or organization link remains.
- empty `org_and_children` roots -> empty allowed ID set, never unrestricted access.
- two concurrent inverse parent updates -> at most one succeeds; the committed hierarchy remains acyclic.

### 5. Good / Base / Bad Cases

- Good: a super administrator edits a user in another tenant; candidates and writes use that user's tenant/park.
- Good: creating a user with a valid primary organization produces the account and relationship atomically; retrying after invalid assignments cannot collide with a partially created username.
- Base: a three-level tree is returned in stable sibling order while `GET /orgs` remains paginated.
- Bad: writing `rel_user_org.tenant_id/park_id` from the actor's current scope when the target user belongs elsewhere.
- Bad: treating an empty recursive root set as `null`/unrestricted.
- Bad: validating `A -> B` and `B -> A` outside a shared transaction lock, allowing both requests to commit a cycle.

### 6. Tests Required

- Unit-test three-level tree ordering, self/missing/disabled/cyclic parents, child/user deletion blockers.
- Unit-test recursive scope SQL, tenant/park predicates, descendant de-duplication, and empty-root deny behavior.
- Test replacement duplicate/primary validation, target-scope soft-delete predicates, and transaction rollback for invalid organizations/posts.
- E2E-create a three-level tree plus siblings and test cycle rejection, concurrent inverse-parent serialization, parent deletion blocking, atomic user/primary assignment creation, invalid-assignment rollback, duplicate rejection, and cleanup.
- Run Shared/API/Web typecheck and build; inspect organization and user pages at desktop and 390px when a browser runtime is available.

### 7. Wrong vs Correct

#### Wrong

```ts
await links.save({ userId, tenantId: actor.tenantId, parkId: actor.parkId, orgId });
```

#### Correct

```ts
const target = await getEntityForActor(scope, userId, actor);
const targetScope = { tenantId: target.tenantId, parkId: target.parkId };
await validateAndReplaceInTransaction(targetScope, userId, assignments);
```

## Business Action Context Endpoints

An authorized business action must receive its minimum execution context from the owning
aggregate. Do not require the browser to join an unrelated management endpoint whose read
permission is not part of the action contract. For safety inspection execution,
`GET /safety/inspect-tasks/:id/execution` is authorized by the task start/check-in/result
permissions, revalidates that the actor can execute the target task, and returns the enabled
template items together with the task. Ordinary task detail remains a read-only projection.

Lifecycle action entry points must distinguish start, resume, and reject states. A repeated
start request for an already in-progress inspection returns the current execution projection
without writing a second transition or audit log; terminal states remain rejected by both the
mutation and action-context route. Determine the disposition while holding the aggregate row's
`pessimistic_write` lock inside the mutation transaction; a browser lock or pre-transaction read
cannot serialize separate clients.
After a transition commits, its response must preserve that success even if another actor advances
the aggregate before response enrichment. Build the authorized mutation response without routing
it back through a context guard whose state predicate may now reject the already-committed action.
Nested result collections are independent field-policy entities: every task detail/action projection
must apply `safety.inspect_task_result` policies to each result before attaching it to a parent whose
own `inspect_task` policy is necessarily shallow.
For partial result writes, an omitted protected optional field means preserve the stored value;
explicit `null` means clear it. Finish-time validation must evaluate the resolved stored/submitted
value under the result-row write lock so a hidden field neither corrupts concurrent edits nor
falsely fails an abnormal-result requirement.

## Scenario: Candidate Catalog Matches Write-Side Resolution

### 1. Scope / Trigger
- Trigger: A form selects a scoped reference that the write service can resolve from
  a shared/default catalog, such as the tenant SaaS plan selector.

### 2. Signatures
- Candidate API: `GET /plans/available?page=<int>&page_size=<1..100>&keyword=<optional string>`.
- Write contract: `POST /tenants` and tenant configuration updates accept
  `planCode: string | null`.

### 3. Contracts
- The candidate API and write-side resolver use the same precedence: an enabled,
  non-deleted current-scope record overrides the enabled, non-deleted default catalog
  record with the same business code.
- The default SaaS plan catalog scope is `tenantId=10000001`, `parkId=20000001`.
- Candidate pagination occurs after precedence/deduplication and remains bounded by
  `PaginationQueryDto.page_size`.
- SQL pagination must apply a stable top-level `ORDER BY` before `OFFSET`/`LIMIT`;
  window-function ordering alone does not define the rows consumed by pagination.
- Every paginated candidate query ends its ordering with stable unique tie-breakers
  such as business code and row ID; non-unique group/sort columns are insufficient.
- For precedence catalogs, rank and select the effective scoped row before applying
  keyword filters, so a shadowed default row cannot reappear with different behavior.
- Selector clients must either expose server pagination/search or consume all pages
  reported by `total`; loading only page 1 does not satisfy the candidate/write
  parity contract.
- The scoped `GET /plans` management list remains scoped; do not broaden edit/manage
  surfaces merely to populate a cross-scope candidate selector.

### 4. Validation & Error Matrix
- Invalid page/page size -> global DTO validation returns HTTP 400.
- Disabled or deleted plan -> absent from candidates and rejected by resolution.
- Unknown `planCode` -> tenant service returns HTTP 404.
- Same code in current and default scopes -> return/resolve current scope exactly once.

### 5. Good/Base/Bad Cases
- Good: tenant creation uses `/plans/available` and can submit every returned code.
- Base: a current-scope plan shadows the default plan with the same code.
- Bad: selector calls scoped `/plans` while the write path silently searches another
  scope.

### 6. Tests Required
- Unit-test scope precedence, default fallback, keyword parameters, and page bounds.
- Run API typecheck/build and Web typecheck/build after changing this contract.
- When a database is available, verify tenant creation with a default-catalog plan.

### 7. Wrong vs Correct

#### Wrong
```ts
const candidates = await listPlans(currentScope);
const selected = await resolveFromAnyScope(planCode);
```

#### Correct
```ts
const candidates = await listAvailablePlans(currentScope);
const selected = await resolveCurrentThenDefaultCatalog(currentScope, planCode);
```

## Scenario: Optional Update Relation Clear Semantics

### 1. Scope / Trigger
- Trigger: A partial update DTO includes an optional nullable relation such as
  `building_id`, `floor_id`, or `unit_id`.

### 2. Signatures
- Update request field: `relation_id?: UUID | null`.
- Service resolution input: `string | null | undefined`.

### 3. Contracts
- Omitted/`undefined` means preserve the stored relation.
- Explicit `null` means clear the stored relation.
- DTO transforms for nullable update relations must preserve `null`; do not reuse a
  trim helper that converts both `null` and omission to `undefined`.
- Parent relation clears must reconcile and clear dependent child relations in the
  same update.
- A partial update that explicitly clears only a parent must cascade that clear to
  omitted descendants before location resolution; stored child IDs must not infer
  the cleared parent back into existence.

### 4. Validation & Error Matrix
- Omitted relation -> retain current value.
- `null` relation -> clear value; nullable validation succeeds.
- Parent `null` with omitted descendants -> clear the complete descendant cascade.
- Valid UUID -> resolve inside tenant/park scope.
- Invalid UUID or cross-scope UUID -> HTTP 400.

### 5. Good/Base/Bad Cases
- Good: `{ building_id: null, floor_id: null, unit_id: null }` clears the cascade.
- Base: `{}` leaves all three relations unchanged.
- Bad: a transform converts explicit `null` into `undefined`, silently restoring the
  old relations.

### 6. Tests Required
- DTO transformation test asserts both explicit-null preservation and omission.
- Service or payload logic test asserts clearing a parent clears descendants.
- Run API/Web typecheck and affected unit tests.

### 7. Wrong vs Correct

#### Wrong
```ts
const trimOptional = (value: unknown) => value == null ? undefined : String(value).trim();
```

#### Correct
```ts
const trimNullable = (value: unknown) => value === null ? null : trimOptional(value);
```

## Idempotent Writes

For retryable write endpoints, attach `new IdempotencyInterceptor()` and require the frontend to send `X-Idempotency-Key`. The interceptor persists successful responses and detects processing/conflicting retries.

Reference files:
- `apps/api/src/shared/interceptors/idempotency.interceptor.ts`
- `apps/api/src/shared/services/idempotency.service.ts`
- `apps/api/src/modules/leasing-payments/leasing-payments.controller.ts`
- `apps/web/lib/api-client.ts`

Guard-only idempotency is not equivalent to replay/conflict semantics. When documenting or changing idempotency behavior, distinguish routes using `IdempotencyInterceptor` from routes that only validate a key.

## Persistence And Financial Safety

Entities extend `AuditableEntity` when they participate in tenant/park scoped business data. It provides `id`, `tenantId`, `parkId`, audit columns, soft-delete state, optimistic `version`, and `remark`.

Historical financial selectors must not discard an otherwise actionable record
because its current reference row was soft-deleted. Join the historical label
without an `is_deleted = false` filter (and provide a stable fallback if the
reference is absent), while retaining tenant/park scoping.

Reference files:
- `apps/api/src/shared/entities/auditable.entity.ts`
- `apps/api/src/modules/leasing-payments/entities/leasing-payment.entity.ts`
- `apps/api/src/modules/leasing-receivables/entities/leasing-receivable.entity.ts`

Financial delete operations use soft-delete and status transitions, not physical deletes. Preserve checks for applied, partially applied, invoiced, waived, voided, or otherwise active records.

Reference files:
- `apps/api/src/modules/leasing-payments/leasing-payments.service.ts`
- `apps/api/src/modules/leasing-receivables/leasing-receivables.service.ts`
- `AGENTS.md`

Read [TypeORM Raw Query Result Shapes](./typeorm-raw-query-results.md) before using
`EntityManager.query()` or `QueryRunner.query()` results from PostgreSQL DML with
`RETURNING`, especially for optimistic-version CAS and financial effect cardinality.

## Shared Property Occupancy

Read [shared-property-occupancy.md](./shared-property-occupancy.md) before changing whole-unit operating modes, homestay/housing rental availability, shared occupancy, or commercial contract unit binding.

The cross-table concurrency contract is mandatory: service checks alone do not prevent a commercial-contract write racing a homestay or housing-rental occupancy write.

## Property Business Controls

Read [property-business-controls.md](./property-business-controls.md) before changing homestay/housing business dates, guest identity verification, finance detail permissions, billing-period math, purchase rounding/recharge, or granular-role page loading.

Read [Property Approval Domain Effects](./property-approval-domain-effects.md) before
changing homestay cancellation/refund/waiver or housing checkout, handover, purchase
payment/refund/void, and purchase-to-receivable transfer approval flows.

## Tenant Module Access Control

Read [module-access-control.md](./module-access-control.md) before changing tenant module
assignments, `@RequireModule`, `/users/me.enabled_modules`, frontend module filtering,
post-login routing, or module-specific menu migrations.

## Migrations And Seeds

Migrations are forward-only SQL files in `database/migrations`. Do not edit migrations that may already have succeeded in production. `scripts/db-migrate.sh` records filename, checksum, running/succeeded/failed status, executor, and batch id in `public.sys_schema_migration_history`.

Read [Historical Migration Prerequisites](./migration-prerequisites.md) before adding a
`database/migration-prerequisites/<target>/` repair, or when an immutable migration's PostgreSQL
`ON CONFLICT` target no longer has an exactly inferable unique/exclusion arbiter.

Reference files:
- `scripts/db-migrate.sh`
- `database/migrations/000139_sys_schema_migration_history.sql`
- `docs/release/production-migration-execution-policy.md`

Production seed and development seed are separate:

- Production seed: `pnpm db:seed:prod`, requires `ALLOW_PRODUCTION_SEED=yes`.
- Development seed: `pnpm db:seed:dev`, local only.

For partial unique indexes, PostgreSQL conflict inference is an executable schema contract: an
`ON CONFLICT` column list and predicate must match the active unique index exactly. All later joins
that resolve the upserted record must use the same business identity; do not upsert a tenant-wide
role by `(tenant_id, code)` and then require `(tenant_id, park_id, code)` to bind it.

Failed migrations remain forward-only. Correct a failed file only after confirming it never
succeeded in a long-lived environment and its transaction rolled back; successful history is
immutable. Keep account, role, permission, and relationship provisioning in production-safe seeds.

Reference files:
- `database/seeds/README.md`
- `database/seeds/production/README.md`
- `database/seeds/dev/README.md`
- `AGENTS.md`

## Admin Issue Runner Lease And Evidence Contract

- Feedback create/mine/detail are universal authenticated-user capabilities and declare the explicit
  `RequireAuthenticated` guard contract. Do not approximate universal access with a point-in-time
  role-permission seed. Detail still enforces reporter ownership unless the actor has read permission
  or super-admin authority.
- Claim, lease renewal, triage, and result writeback serialize the target issue with a database
  write lock. An active claim cannot be triaged, renewed by another runner, or completed by an old token.
- Lease renewal and result writeback match both `runner_id` and `lease_token`, require an unexpired
  `IN_PROGRESS/CLAIMED` state, and clear the lease when the runner yields a result.
- Validate approval against the final merged and trimmed acceptance criteria, not the old row before
  applying the DTO.
- `SUCCEEDED` requires structured passing gates for CI, deployment, and production health. A generic
  root `status=PASS` or `conclusion=SUCCESS` is not release evidence.

## Verification

For API changes, choose the smallest reliable verification:

- `pnpm --filter @jinhu/api build`
- `pnpm --filter @jinhu/api lint`
- A targeted script from `scripts/e2e/`
- `pnpm db:migrate` only when migration behavior is in scope and a database is available

For first-release behavior, prefer the documented smoke/regression entry related to the touched module.

Multi-park identities remain one `sys_user` row. Context switching must validate an enabled
`rel_user_park` link, resolve RBAC bindings against the requested park, and issue both access and
refresh tokens scoped to that park. Cross-park mutations must set the audit scope override to the
target park. `POST /auth/switch-context` must mark refresh-token failures that occur before the
old refresh token is claimed with `X-Auth-Context-Switch-Rotation: not-started`; do not set that
header for errors after the old token may have been revoked or replacement credentials may have
been issued. A conditional refresh-token claim conflict (`affected !== 1`) or a lookup that finds
the same token already revoked but unexpired is ambiguous, not `not-started`, because another
request may already have revoked the token. Target-principal lookup failures must remain ambiguous
unless the old refresh-token row is locked through target resolution; a post-failure active read is
not enough because another request can still revoke the token before the response is emitted.
Same-context switch rejections are still `not-started` because no refresh token has to be inspected
or claimed. Because Web can call API on a different origin, switch-context refresh-cookie Origin
rejections also happen before token claim and must carry the same marker. This marker must also be listed in
the API CORS `exposedHeaders`; otherwise browser Fetch cannot read it and will incorrectly treat a
definite pre-rotation rejection as ambiguous.

Reference files:
- `package.json`
- `docs/testing/how-to-run-tests.md`
- `scripts/e2e/first-release-regression.mjs`
