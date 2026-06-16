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
