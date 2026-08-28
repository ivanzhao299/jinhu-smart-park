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
- Management summaries and assignability diagnostics require `USER_DETAIL`, `USER_ASSIGN_ROLES`, super, or wildcard. `USER_LIST` alone must not receive per-park role names or negative access-only diagnosis.
- An authenticated user may receive only their own minimal accessible-park role names/count for switcher display; never include permissions, data scopes, candidates, protected flags, assignability reasons, or another user's roles.
- The service—not only the controller—authorizes the explicit target. Protected tenant super may target any live park in the same tenant. An ordinary role administrator may target only the actor's current park, and the target user must have effective access to it.
- The write transaction locks the user scope, validates every role against the target tenant/park, preserves protected links, replaces only manageable links at the target park, and overrides audit scope to the target park. Audit body capture stays disabled.
- Role summaries are display-only; `/auth/switch-context` still resolves a fresh target principal and remains the authorization authority.

### 4. Validation & Error Matrix

- blank/oversized park id or invalid/too many role UUIDs -> DTO HTTP 400.
- actor tenant differs from target user -> safe not found.
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
- Service tests cover ordinary current-park success, ordinary cross-park denial, tenant-super same-tenant success, cross-tenant denial, inaccessible target, protected-link preservation, and exact target-only writes.
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
