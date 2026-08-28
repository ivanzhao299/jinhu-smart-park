# Tenant Super Control Plane

## Scenario: Protected SUPER_ADMIN across tenant parks

### 1. Scope / Trigger

- Trigger: resolving authentication principal, current-user context, accessible parks, refresh, or `POST /auth/switch-context` for a user with the protected `SUPER_ADMIN` identity.
- This contract is tenant control-plane authorization; it does not turn ordinary tenant roles or wildcard permissions into tenant-wide identities.

### 2. Signatures

- Trusted principal: `JwtPrincipal.isTenantSuper?: boolean` is server-derived and never accepted from JWT claims or request input.
- Protected role predicate: `isProtectedTenantSuperRole(role)` in `apps/api/src/modules/roles/protected-super-role.ts`.
- Runtime switch audit: `action=tenant_super_context_activated`, `bizType=tenant_super_context`, target tenant/park operation scope.
- Persistence source: a live `rel_user_role` in the same tenant joined to one live protected `sys_role`; no per-target-park copy and no second binding table.

### 3. Contracts

- The role must simultaneously be `code=SUPER_ADMIN`, `role_scope=platform`, `is_super=true`, `is_system=true`, `is_builtin=true`, enabled, live, and linked to the same live user and tenant.
- A protected tenant super can resolve and list every live active park in the same tenant, including future parks and parks without `rel_user_park` or target `rel_user_role`.
- The target `biz_park` must remain same-tenant, active, and live. Super never revives or enters disabled/deleted parks.
- Ordinary target roles and role-permission links remain park-scoped. A literal `*` may keep its existing current-park super behavior but never bypasses target park access or becomes `isTenantSuper`.
- The effective principal exposes `roles` containing `SUPER_ADMIN`, `permissions=["*"]`, `dataScope=all`, `isSuper=true`, and `isTenantSuper=true`.
- Enabled modules and menus are still projected from the target park. `ModuleGuard` and domain-specific exact-grant gates are not bypassed.
- Successful cross-park activation writes a structured best-effort operation audit after refresh-token CAS and token issuance. It contains source/target scope and identity only; never tokens, cookies, passwords, or request bodies.

### 4. Validation & Error Matrix

- foreign tenant user/link/role/park -> no tenant-super elevation.
- disabled/deleted user, link, role, or target park -> no usable target principal.
- matching code without the complete protected flags -> ordinary role semantics only.
- custom `is_super=true` or literal `*` outside the target park -> no access bypass and `isTenantSuper=false`.
- tenant-super switch target lookup or refresh CAS failure -> no activation audit.
- target module disabled -> menu excludes that module and module-protected API remains forbidden.

### 5. Good / Base / Bad Cases

- Good: bootstrap SUPER_ADMIN creates or discovers a future active park, sees it in `accessible_parks`, switches, retains super, but sees only target-enabled modules.
- Base: an ordinary user with explicit target access and role continues to resolve only target-park grants.
- Bad: checking only `role.code`, any `role.is_super`, or any permission `*` and treating it as tenant-wide authority.

### 6. Tests Required

- Pure predicate matrix for every protected field and status.
- SQL principal matrix: no target link, future park, disabled park, foreign tenant, ordinary role, custom super, and literal wildcard.
- In-memory login/current-user matrix must mirror SQL and project every active tenant park only for protected tenant super.
- Switch-context tests assert target-scoped audit for protected tenant super and zero specialized audit for ordinary/wildcard/failure paths.
- Menu/module tests assert super/wildcard cannot bypass a disabled target module.
- Isolated E2E runs `EXPECT_TENANT_SUPER=yes node scripts/e2e/first-release-context-switch.mjs` and asserts switch, `/auth/me`, audit, target writes, return-scope isolation, exact cleanup, and teardown.

### 7. Wrong vs Correct

#### Wrong

```ts
const isTenantSuper = role.isSuper || permissions.includes("*");
```

This promotes custom super roles and park-local wildcards across every park.

#### Correct

```ts
const isTenantSuper = activeRoleLinks.some(
  (link) => link.tenantId === user.tenantId
    && !link.isDeleted
    && isProtectedTenantSuperRole(link.role)
);
```

The database query must mirror every predicate field and keep all tenant joins explicit.
