# @jinhu/shared Frontend Usage

Frontend code should import shared contracts and permission constants from `@jinhu/shared` instead of duplicating them locally.

Reference files:
- `packages/shared/src/index.ts`
- `apps/web/lib/api-client.ts`
- `apps/web/components/auth/PermissionGuard.tsx`
- `apps/web/app/assets/units/UnitsPageClient.tsx`

Rules:

- Use `ApiResponse<T>` and `PaginatedResult<T>` for API helper return types.
- Use `SYSTEM_PERMISSIONS` for permission-gated buttons, panels, and route actions.
- Keep UI-only row/form types local to the page when they are not shared API contracts.
- Do not add React components or browser-only helpers to `@jinhu/shared`; those belong in `apps/web` or `@jinhu/ui`.
