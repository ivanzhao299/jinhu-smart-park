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
- Database authority: nullable UUID `sys_tenant.contact_user_id`; historical backfill migration `000252_tenant_bootstrap_admin_pointer_backfill.sql`.

### 3. Contracts

- `true` requires only exact equality `sys_tenant.contact_user_id = sys_user.id`. Runtime roles, remarks, creator provenance, usernames, and creation time never infer or override identity.
- `TenantsService.create` writes the pointer in the onboarding transaction. Migration `000252` backfills only non-deleted pointer-less tenants from enabled, non-deleted users with an enabled, non-deleted tenant-wide `TENANT_ADMIN` role; candidate order is `sys_user.create_time ASC, sys_user.id ASC`.
- `TENANT_ADMIN` is tenant-wide and reused across parks. A valid `rel_user_role.park_id` is the target park and may differ from both the user's home park and the role row's park; tenant identity must match across user, link, and role.
- Zero-candidate tenants remain NULL. Multiple valid candidates use the stable order. Structurally inconsistent tenant identities fail migration preflight before any update.
- The API emits an explicit boolean. Optionality preserves compatibility with older clients and test fixtures.
- Desktop wildcard/super users and bootstrap administrators land on `/dashboard` before menu-order selection. Mobile engineering and safety terminals retain priority.

### 4. Validation & Error Matrix

- missing tenant, NULL pointer, non-matching pointer, or pointer targeting another tenant's user ID -> `false`.
- target user no longer has a current-park `TENANT_ADMIN` role but remains the exact contact pointer -> `true`; persisted identity is not re-inferred from current RBAC.
- active `TENANT_ADMIN` binding whose tenant differs from its user or role -> migration preflight exception and no pointer updates.
- no eligible historical administrator -> leave pointer NULL and emit a migration notice; this is not a migration failure.
- tenant query failure -> context request fails; never infer `true` in the client.
- missing field from an older API response -> existing first-accessible-menu behavior.

### 5. Good / Base / Bad Cases

- Good: onboarding transaction points `contact_user_id` at the initial admin -> desktop `/dashboard`.
- Base: later tenant admin has the same role but a non-matching pointer -> normal menu landing; a historical empty tenant remains NULL.
- Bad: API/Web infers bootstrap identity from role code, `create_by IS NULL`, remark, username, permissions, or menu order; migration treats a tenant-wide role's cross-park binding as corrupt.

### 6. Tests Required

- API: pointer match, NULL pointer, non-matching pointer, cross-tenant pointer, and exact pointer match without role re-inference.
- Migration: formal runner on an empty database; upgrade fixtures for earliest-time selection, UUID tie-break, tenant-wide cross-park role reuse, zero candidates, existing pointer preservation, and replay stability; malformed tenant identity must fail preflight.
- Web: desktop dashboard, both mobile terminal priorities, and park-switch fallback inheritance.
- Run shared build, API focused spec/typecheck, Web typecheck/lint, and the complete auth-routing gate.

### 7. Wrong vs Correct

```ts
// Wrong: revives the mutable legacy heuristic.
tenant.contactUserId == null && user.createBy == null;

// Correct: the persisted tenant pointer is the only runtime authority.
const isTenantBootstrapAdmin = tenant?.contactUserId === user.id;
```
