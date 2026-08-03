# @jinhu/web Frontend Specs

These rules describe the current Next.js management frontend in `apps/web`.

## Package Boundary

- Routes live under `apps/web/app`.
- Shared app components live under `apps/web/components`.
- API/auth/menu helpers live under `apps/web/lib`.
- Global design tokens and design-system surface classes live in `apps/web/app/globals.css`.

Reference files:
- `apps/web/app/layout.tsx`
- `apps/web/app/(dashboard)/layout.tsx`
- `apps/web/components/layout/DashboardLayout.tsx`
- `apps/web/lib/api-client.ts`

## Route And Client Component Shape

Many routes keep `page.tsx` as a thin server component that renders a client component. Use this when a page needs local state, effects, browser APIs, forms, drawers, or API calls.

Reference files:
- `apps/web/app/assets/units/page.tsx`
- `apps/web/app/assets/units/UnitsPageClient.tsx`
- `apps/web/app/safety/inspect-tasks/page.tsx`
- `apps/web/app/safety/inspect-tasks/InspectTasksPageClient.tsx`

Use `"use client"` only in files that need client behavior. Keep presentational subcomponents under a route-local `components/` directory when they are specific to that workflow.

Reference files:
- `apps/web/app/assets/units/components/UnitsTable.tsx`
- `apps/web/app/workorders/list/components/WorkOrdersToolbar.tsx`

## API Calls And Idempotency

Use `apiRequest` for JSON APIs and `apiFormRequest` for `FormData`. Do not hand-roll fetch wrappers unless the shared helper cannot express the request.

Write operations that map to idempotent API routes should pass `createIdempotencyKey("<domain-action>")`.

Reference files:
- `apps/web/lib/api-client.ts`
- `apps/web/components/assets/AssetCrudPage.tsx`
- `apps/web/app/assets/units/UnitsPageClient.tsx`

Authentication token access should go through `getAccessToken()` or the auth context utilities.

Reference files:
- `apps/web/lib/authz.ts`
- `apps/web/lib/auth-context.tsx`

## Permissions And Modules

Use `PermissionGuard` and `PermissionButton` for permission-gated UI instead of open-coding permission checks in JSX. Use shared constants from `@jinhu/shared` where available.

When an API mutation requires a generic permission plus a domain permission,
the visible control must require both. After a create flow continues into an
existing-record drawer, independently gated update surfaces must remain
read-only unless the actor also has the update permission.

Superuser status bypasses permission-code checks only; it does not bypass tenant product
availability. For module menus, routes, and login destinations, follow the cross-layer contract
in [Tenant Module Access Control](../../api/backend/module-access-control.md).

Reference files:
- `apps/web/components/auth/PermissionGuard.tsx`
- `apps/web/components/auth/PermissionButton.tsx`
- `apps/web/app/assets/units/UnitsPageClient.tsx`
- `packages/shared/src/index.ts`

## Design System And Layout

Prefer existing design-system surface classes from `apps/web/app/globals.css`: `ds-page`, `ds-panel`, `ds-command-grid`, `ds-command-card`, `ds-kpi-grid`, `ds-table-shell`, `ds-mobile-record-list`, and related tokens.

Legacy pages still use classes such as `content`, `header`, `work-panel`, `dashboard-grid`, and `data-table`. When modifying a production work surface, follow nearby page conventions and avoid unrelated visual rewrites.

Reference files:
- `apps/web/app/globals.css`
- `apps/web/components/assets/AssetCrudPage.tsx`
- `apps/web/app/workorders/list/components/WorkOrdersTable.tsx`

Operational and field-use pages must be mobile-aware. Prefer card/mobile record views over desktop-only tables for inspection, work order, hazard, terminal, device, and operations flows.

Reference files:
- `AGENTS.md`
- `apps/web/components/operations/OperationsTerminalClient.tsx`
- `apps/web/app/safety/my-inspect-tasks/page.tsx`

## File Uploads And Constrained Inputs

Read `file-upload-and-form-controls.md` before changing upload controls, attachment lists, image/PDF/video previews, numeric inputs, money inputs, GPS fields, enum selects, or other constrained form elements.

Reference files:
- `apps/web/components/files/FileUploader.tsx`
- `apps/web/components/files/AttachmentList.tsx`
- `apps/web/components/files/FilePreview.tsx`
- `packages/shared/src/index.ts`

## Local Types

Pages commonly define local row/form interfaces near the page client when the API type is not exported from `@jinhu/shared`. Keep these interfaces specific and explicit rather than using broad `any`.

Reference files:
- `apps/web/app/assets/units/UnitsPageClient.tsx`
- `apps/web/app/workorders/list/types.ts`
- `apps/web/components/assets/AssetCrudPage.tsx`

## Historical Catalog Bindings

When an edit form retains a currently bound catalog value that is no longer selectable (for
example, a disabled tenant plan), omit the unchanged binding and its coupled authorization
fields from update requests. Compare set-like fields after normalization so ordering and
duplicates do not cause an unchanged historical binding to be revalidated against the active
catalog. Submit the coupled fields together only when the operator actually changes them.

## Verification

For frontend changes, choose the smallest reliable checks:

- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/web build`
- Browser inspection for meaningful page/UI changes, including a phone-width viewport for operational pages

Reference files:
- `AGENTS.md`
- `docs/testing/how-to-run-tests.md`
