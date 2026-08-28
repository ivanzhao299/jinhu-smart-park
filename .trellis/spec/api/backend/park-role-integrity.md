# Park Role Integrity

## Scenario: Explicit target-park user role management

### 1. Scope / Trigger

- Trigger: changing user accessible-park projections, user role candidate/assignment routes, or desktop/mobile park switchers.
- Access (`rel_user_park`) and authorization (`rel_user_role`) remain separate; access-only is a valid persisted state and is never auto-repaired.

### 2. Signatures

- Shared projection: `UserParkContext.role_summary?: { role_names: string[]; role_count: number; has_business_role: boolean }`.
- Management read: `GET /users/:id/roles?tenantId=<tenant>&parkId=<target>&paged=true...`.
- Explicit write: `POST /users/:id/park-roles` with `{ parkId: string, roleIds: UUID[] }` and `X-Idempotency-Key`.
- Legacy `POST /users/:id/roles` remains default-park compatible until its callers are retired.

### 3. Contracts

- Effective summaries include only live, enabled, same-tenant roles whose binding and role scope apply to the projected park. The complete protected tenant-super predicate applies its role to every live tenant park.
- Management summaries and assignability diagnostics require `USER_DETAIL`, `USER_ASSIGN_ROLES`, super, or wildcard. `USER_LIST` alone must not receive per-park role names or negative access-only diagnosis. Ordinary managers receive diagnostics only for their current park; inaccessible target-park summaries remain omitted.
- An authenticated user may receive only their own minimal accessible-park role names/count for switcher display; never include permissions, data scopes, candidates, protected flags, assignability reasons, or another user's roles.
- The service—not only the controller—authorizes the explicit target. Protected tenant super may target any live park in the same tenant but never another tenant. Existing platform-global super/wildcard user-management semantics remain available across target scopes. An ordinary role administrator may target only the actor's current park, and the target user must have effective access to it.
- Ordinary user-directory discovery includes both home-park users and enabled access-linked users through a database-side `EXISTS` predicate before pagination; it must not materialize the whole park population as an application-side ID list.
- Protected tenant-super directory reads stay inside the actor tenant. Access-linked rows remain role-configurable at the actor's park, but ordinary actors must not receive a broken profile-edit action for a user whose home park differs.
- Target role reads include effective tenant-scoped protected bindings even when their stored link park is the user's home park; the binding remains retained and unassignable at other live tenant parks.
- The write transaction locks the user scope, validates every role against the target tenant/park, preserves protected links, replaces only manageable links at the target park, and overrides audit scope to the target park. Audit body capture stays disabled.
- Role summaries are display-only; `/auth/switch-context` still resolves a fresh target principal and remains the authorization authority.

### 4. Validation & Error Matrix

- blank/oversized park id or invalid/too many role UUIDs -> DTO HTTP 400.
- actor tenant differs from target user -> safe not found, except for an existing global-super/wildcard user manager.
- ordinary actor targets another park -> HTTP 403 before target role disclosure.
- missing, disabled, deleted, cross-tenant, or inaccessible target park -> safe not found.
- foreign, disabled, deleted, template, system, builtin, protected, or wrong-park requested role -> reject the complete replacement.
- duplicate role IDs -> HTTP 400 before transaction writes.
- absent management diagnostic permission -> omit `role_summary`; Web renders “角色状态不可见”, never “可切换但无业务角色”.

### 5. Good / Base / Bad Cases

- Good: a park-B role administrator configures park-B roles for a user whose default park is A but who has B access; A/default and A roles remain unchanged, audit scope is B.
- Base: a protected tenant super configures any live same-tenant accessible target without changing the user's default park.
- Bad: trusting a body tenant id, deriving target from `sys_user.park_id`, letting a park-A grant manage park B, or returning all users' per-park role names under `USER_LIST`.

### 6. Tests Required

- DTO and controller contract tests assert target field, idempotency interceptor, body-free audit, and target audit override.
- Service tests cover ordinary current-park success, ordinary cross-park denial, tenant-super same-tenant success, global-super cross-tenant compatibility, ordinary cross-tenant denial, inaccessible target, protected-link preservation, and exact target-only writes.
- Projection tests cover role-bearing/access-only parks, protected tenant super across future parks, inactive/foreign roles, and diagnostic omission without permission.
- Web tests assert exact access-only danger text, neutral hidden-diagnostic text, explicit target selector/payload, and identical desktop/mobile switcher summaries.
- Run the complete API unit suite plus shared build, API/Web typecheck, lint, and build after changing this contract.

### 7. Wrong vs Correct

#### Wrong

```ts
const targetScope = { tenantId: user.tenantId, parkId: user.parkId };
return accessibleParks.map((park) => ({ ...park, roles: everyRoleAndPermission }));
```

#### Correct

```ts
const target = await authorizeTargetPark(scope, actor, userId, dto.parkId);
await replaceManageableRoles(target, dto.roleIds, { auditScope: target });
return accessibleParks.map((park) => ({ ...park, role_summary: minimalEffectiveRoleSummary(park) }));
```

## Scenario: Recoverable access-only park context

### 1. Scope / Trigger

- Trigger: changing authenticated layout denial handling, global park switch publication, session cleanup, or access-only diagnostics/audit tooling.

### 2. Signatures

- Web classifier: `isCurrentParkAccessOnly(user): boolean`.
- Tab recovery projection: `{ userId, tenantId, parkId, parkName }` in `sessionStorage`; never in shared `localStorage`.
- Read-only diagnostic: `TENANT_ID=<required> PARK_ID=<optional> sh scripts/audit-access-only-users.sh`.

### 3. Contracts

- Only an explicit current-park `role_summary.has_business_role === false` means access-only. A missing summary means diagnostics are unavailable and must not be converted into a negative role claim.
- The authenticated dashboard shell remains mounted for access-only: desktop/mobile park switcher and logout stay available while protected business children stay suppressed. Ordinary permission/module denials retain the shared `/403` projection.
- A successful global switch into access-only may remember the previous enabled, role-bearing park. Recovery state is tab-scoped, bound to the same user/tenant, revalidated against authoritative accessible parks, cleared on logout/configured-role context, and never fabricates a return target.
- The D5 audit is SELECT-only, requires an explicit tenant, separates explicit `access_only` from `legacy_home_without_access_row`, and emits no contact, credential, permission, data-scope, or candidate-role details.

### 4. Validation & Error Matrix

- `role_summary` omitted -> normal route authorization; never show the dedicated no-role claim.
- stored source user/tenant mismatch, disabled/inaccessible/same park, malformed JSON, or source without an explicit business role -> omit return action and clear stale state.
- return switch failure -> retain the access-only shell and show an inline error; do not claim recovery or clear the authenticated session unless the shared switch contract does so for an ambiguous rotation.
- D5 missing `TENANT_ID` -> exit 2 before database access; optional `PARK_ID` remains a bound psql variable.

### 5. Good / Base / Bad Cases

- Good: role-bearing park A switches to access-only park B, sees the exact dedicated message, then explicitly returns to A.
- Base: user logs directly into access-only B without a trustworthy source; selector/logout/guidance remain, but no return button is invented.
- Bad: treat an omitted summary as access-only, persist source across accounts in localStorage, render protected children behind the empty state, or turn every permission denial into the dedicated state.

### 6. Tests Required

- Pure Web tests cover explicit-false classification, omitted summary, source record/reload, stale identity/access cleanup, role-configured cleanup, and access-only-to-access-only suppression.
- Layout contracts assert exact Chinese copy, authenticated desktop/mobile headers, protected-child replacement, return switch, normal 403 redirect, 720px/390px-safe full-width action, and logout cleanup.
- D5 static contract asserts mandatory tenant binding, optional park binding, no DML/DDL, runtime effective-role predicates, protected tenant-super predicate, legacy classification, and absence of sensitive columns.

### 7. Wrong vs Correct

#### Wrong

```ts
if (!user.current_park?.role_summary) showNoRoleState();
localStorage.setItem("returnPark", previousParkId);
```

#### Correct

```ts
if (user.current_park?.role_summary?.has_business_role === false) showRecoverableState();
sessionStorage.setItem("jinhu_park_role_recovery_source", JSON.stringify(boundMinimalSource));
```
