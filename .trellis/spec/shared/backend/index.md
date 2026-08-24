# @jinhu/shared Specs

`@jinhu/shared` is the cross-app contract package used by both API and Web. It should contain shared types, permission constants, status enums, and response contracts that both sides need.

Reference files:
- `packages/shared/src/index.ts`
- `apps/api/src/shared/interceptors/response.interceptor.ts`
- `apps/web/lib/api-client.ts`

## Contract Ownership

Keep shared contracts stable and explicit:

- `ApiResponse<T>` must match API response wrapping and frontend parsing.
- `PaginatedResult<T>` must match list endpoints and list page clients.
- `TenantParkScope` must match API scope decorators and service signatures.
- Permission constants in `SYSTEM_PERMISSIONS` are consumed by both controllers and UI permission gates.

When adding a permission or cross-layer enum, update this package first and then update API/Web consumers in the same task.

## Naming And Compatibility

This package currently preserves a mix of camelCase and snake_case fields for compatibility with API payloads and UI usage. Do not "clean up" field names unless the API contract, Web consumers, seeds, and smoke tests are migrated together.

Reference files:
- `packages/shared/src/index.ts`
- `apps/web/lib/auth-context.tsx`
- `apps/api/src/shared/types/jwt-principal.ts`

## Verification

Shared changes can affect both apps. Prefer:

- `pnpm --filter @jinhu/shared build`
- `pnpm typecheck`
- Targeted API/Web tests or smoke scripts for changed contracts

## Scenario: Tenant bootstrap administrator landing identity

### 1. Scope / Trigger

- Trigger: a client needs to distinguish the tenant onboarding administrator from users later assigned `TENANT_ADMIN`.

### 2. Signatures

- Shared response field: `UserContext.is_tenant_bootstrap_admin?: boolean`.
- Producer: `UsersService.getCurrentUserContext(scope, userId)` for `/auth/me` and `/users/me`.
- Consumer: `resolvePostLoginPath(user, signals)` and park-switch fallback routing.

### 3. Contracts

- `true` requires an active `TENANT_ADMIN` role in the requested park and either `sys_tenant.contact_user_id = sys_user.id`, or the pointer-less production-bootstrap provenance `sys_user.create_by IS NULL AND remark = 'bootstrap-admin created'`.
- The API emits an explicit boolean. Optionality preserves compatibility with older clients and test fixtures.
- Desktop wildcard/super users and bootstrap administrators land on `/dashboard` before menu-order selection. Mobile engineering and safety terminals retain priority.

### 4. Validation & Error Matrix

- missing tenant, inactive/missing current-park `TENANT_ADMIN`, non-matching pointer, or copied remark on an API-created user -> `false`.
- tenant query failure -> context request fails; never infer `true` in the client.
- missing field from an older API response -> existing first-accessible-menu behavior.

### 5. Good / Base / Bad Cases

- Good: onboarding transaction points `contact_user_id` at the active tenant admin -> desktop `/dashboard`.
- Base: later tenant admin has the same role but a non-matching pointer -> normal menu landing.
- Bad: Web infers bootstrap identity from role code, username, creation time, permissions, or menu order.

### 6. Tests Required

- API: pointer match, later admin, ordinary user, exact pointer-less bootstrap provenance, copied-marker rejection, and requested-park role filtering.
- Web: desktop dashboard, both mobile terminal priorities, and park-switch fallback inheritance.
- Run shared build, API focused spec/typecheck, Web typecheck/lint, and the complete auth-routing gate.

### 7. Wrong vs Correct

```ts
// Wrong: changes every tenant administrator.
user.roles.some((role) => role.role_code === "TENANT_ADMIN");

// Correct: consume the server-derived identity contract.
if (user.is_tenant_bootstrap_admin) return "/dashboard";
```
