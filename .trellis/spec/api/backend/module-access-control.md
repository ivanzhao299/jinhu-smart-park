# Tenant Module Access Control

## 1. Scope / Trigger

Read this contract before changing tenant module assignment, `@RequireModule`, `/users/me`,
frontend module filtering, post-login routing, or a migration that materializes module-specific
menus and role grants.

## 2. Signatures

- Database authority:
  `rel_tenant_module(tenant_id, park_id, module_id, enabled, status, expire_time, is_deleted)`
  joined to `sys_module(id, module_code, status, is_deleted)`.
- Runtime projection:
  `GET /users/me -> enabled_modules[]`.
- API guard:
  `@RequireModule(...moduleCodes)` -> `ModuleGuard`.
- API any-of guard:
  `@RequireAnyModule(...moduleCodes)` -> `ModuleGuard` accepts at least one enabled module and overrides an inherited all-required policy.
- Web guard:
  `hasModule(user, moduleCode)` and
  `hasAccess(user, permissionCode, moduleCode)`.

`sys_module_registry` is management metadata for the legacy registry surface. It is not the
authorization authority for the signatures above.

## 3. Contracts

- An enabled module assignment satisfies all of:
  - matching tenant and park;
  - `rel_tenant_module.is_deleted = false`;
  - `rel_tenant_module.enabled = true`;
  - `rel_tenant_module.status = 'enabled'`;
  - `expire_time IS NULL OR expire_time > now()`;
  - joined `sys_module.is_deleted = false`;
  - joined `sys_module.status = 1`.
- `SaaSModulesService.listEnabledModulesForTenant`, `/users/me.enabled_modules`,
  `ModuleGuard`, frontend `hasModule`, and module-dependent migrations must apply the same
  predicate and source.
- Superuser status or wildcard `*` bypasses permission-code checks only. It never bypasses
  product availability.
- A module-specific login destination requires the same enabled-module check as its menu and
  route guard. A module-free destination such as `/dashboard` is the safe fallback.
- A recovery endpoint shared by two product modules must declare their explicit any-of policy;
  empty module metadata is not a substitute because it bypasses product authorization entirely.
- Menu materialization may derive eligible roles from existing API permissions, but it must
  intersect those roles with an active tenant-module assignment in the same tenant and park.
- Tenant provisioning must receive either a resolvable plan or an explicit non-empty module
  set. Missing authorization input is an error; it must never silently become a reduced
  `system`-only tenant.
- Plan selection, `rel_tenant_module`, the built-in tenant administrator role permissions,
  quotas, and the resulting `/users/me` projection are one cross-layer authorization contract.
  Creating a tenant or changing its plan must converge these records in the same transaction.
- Plan permission markers and explicit permission patterns must be intersected with the final
  enabled module set before role grants are rebuilt. Removing a module must remove its role
  permissions even when the plan still contains a stale explicit permission code.
- When an inactive park temporarily suspends a selected asset module, persist an explicit
  park-status suspension marker. Reactivating that park may restore only marked assignments and
  their tenant-admin permissions; an explicit module disable must clear the marker so recovery
  cannot override administrator intent.
- A system assignment created only to expose the inactive-park recovery route carries its own
  recovery-only marker. Reactivation disables that temporary assignment and removes its marker;
  a system module that was already explicitly selected remains enabled. Reassigning a plan or
  module set while the park is inactive must preserve the marker when system was added only for
  recovery, and clear it only when system is part of the administrator's explicit selection.
- Park read/update routes may accept an effective system assignment only while the canonical park
  scope is inactive. This includes both the recovery-only marker and an administrator's explicit
  system selection; once the canonical scope is active, a stale recovery marker or ordinary system
  assignment must not keep asset-derived park grants usable after asset is disabled.
- Every park status mutation and standalone asset-module write must apply the same suspension
  state machine. Recovery restores only assignments whose effective time window is currently
  unexpired. A future-dated assignment is re-enabled before its start time so the normal module
  time-window predicate activates it later without a second recovery event; expired assignments
  remain suspended.
- Production reconciliation treats an enabled, unexpired future asset assignment as a provisioning
  candidate, while runtime module visibility continues to enforce its start time.
- Tenant expiry mutations must update the persisted expiry of every non-deleted module assignment
  in the same transaction, so extending or clearing tenant expiry cannot leave modules dormant on
  an obsolete assignment window.
- Writers that touch both asset projection state and module assignments acquire the asset-scope
  advisory lock before dependency-graph and assignment row locks. Park mutations acquire the same
  advisory lock before locking canonical park rows. Tenant login-settings and standalone tenant
  module assignment paths must acquire that lock before resolving canonical source activity.
- Web plan selectors may present module and quota projections, but the backend remains the
  authority for resolving plan modules and permission families. Browsers must not synthesize
  plan permission codes.

## 4. Validation & Error Matrix

| Assignment / principal | `/users/me.enabled_modules` | Web menu/route | API guard |
|---|---|---|---|
| Active assignment, normal authorized role | Includes module | Allowed | Allowed |
| Active assignment, superuser | Includes module | Allowed | Allowed |
| Missing assignment, superuser | Excludes module | Hidden / module 403 | HTTP 403 |
| Disabled or soft-deleted assignment | Excludes module | Hidden / module 403 | HTTP 403 |
| Expired assignment | Excludes module | Hidden / module 403 | HTTP 403 |
| Active assignment without registry row | Includes module | Allowed | Allowed |
| Registry row without active assignment | Excludes module | Hidden / module 403 | HTTP 403 |
| Disabled or deleted `sys_module` | Excludes module | Hidden / module 403 | HTTP 403 |

## 5. Good / Base / Bad Cases

- Good: the standard module-assignment API creates only `rel_tenant_module`; a later menu
  migration still recognizes the scope.
- Good: a superuser retains wildcard permission behavior while a disabled housing module is
  absent from the sidebar and rejected by route/API guards.
- Base: an active assignment with no eligible API role creates the tenant menu definitions but
  no role grants.
- Bad: querying `sys_module_registry` to decide which tenant receives menu permissions.
- Bad: returning `true` from `hasModule` solely because `is_super` or `permissions=["*"]`.
- Bad: routing a mobile superuser directly to a module terminal without checking
  `enabled_modules`.

## 6. Tests Required

- Unit: `hasPermission(super, permission)` is true while `hasModule(super, disabledOrMissing)`
  is false; `hasAccess` therefore remains false.
- Unit: disabled module entries reject both normal and super users.
- Unit: post-login routing sends a superuser to a module terminal only when the required module
  is in `enabled_modules`; otherwise it uses a module-free fallback.
- Migration contract: SQL joins `rel_tenant_module` to `sys_module`, includes every active
  predicate above, and does not read `sys_module_registry`.
- Database integration: create an assignment through the standard data shape with no registry
  row, execute the migration twice, and assert unique menu/page nodes plus park-scoped role
  grants.
- Runtime/browser: disable a module for a real superuser, reload `/users/me`, and assert the
  menu disappears, direct navigation is denied, and the API returns 403.
- Provisioning regression: create a tenant from each production plan, log in as its first
  administrator, and assert enabled modules, representative module permissions, visible menus,
  an authorized tenant API, a disabled-module 403, and a platform-management 403.
- Update regression: change only `planCode` and assert module assignments and the built-in
  administrator role permissions converge atomically. Also cover a module reduction where
  stale plan permission patterns cannot survive.

## 7. Wrong vs Correct

### Wrong

```ts
if (user.is_super) return true;
```

```sql
FROM sys_module_registry
WHERE status = 'enabled';
```

### Correct

```ts
const modules = user.enabled_modules ?? [];
return modules.some(
  (module) => module.module_code === moduleCode && module.enabled !== false
);
```

```sql
FROM rel_tenant_module assignment
JOIN sys_module module ON module.id = assignment.module_id
WHERE assignment.enabled = true
  AND assignment.status = 'enabled'
  AND assignment.is_deleted = false
  AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
  AND module.status = 1
  AND module.is_deleted = false;
```
