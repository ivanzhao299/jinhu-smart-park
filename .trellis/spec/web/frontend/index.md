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

## Stateful Business Action Entries

An action-labelled list control must perform or resume that action; it must not merely preload
detail and hide the real transition behind a second button. Model pending/overdue, in-progress,
and terminal states explicitly: safety inspection “执行” starts pending/overdue tasks in one
click, “继续执行” restores in-progress context, and completed tasks expose no execution action.

Action context must come from an endpoint owned and authorized by that action. Do not load a
template/item administration endpoint to assemble an inspection execution form. Protect rapid
clicks with a synchronous ref lock in addition to rendered disabled state, and publish a
successful transition before optional list refreshes so a refresh failure cannot erase success.
Resume controls must accept any permission authorized for that execution context, while each
mutable sub-form remains independently gated by its exact mutation permission. Validate the
complete preflight action projection before issuing a state transition; after success, retain the
validated preflight children if the mutation response's optional projection cannot be trusted.
When the transition response contains a valid child projection, prefer that newer authoritative
snapshot; fall back atomically to the validated preflight item/result pair only when either returned
collection is unusable, so mixed-version form state cannot overwrite concurrent drafts.
Field visibility is not field editability. Hidden, masked, or readonly result values must be
disabled and omitted from mutation payloads; editable empty values use explicit `null` so the API
can distinguish user clearing from protected-field preservation.
Every consumer of an authorized inspection result projection—including the operations terminal—must
retain per-result editability while copying API data into controls and local drafts. A saved browser
draft must never restore a value or attachment that the actor's current field policy protects, and
replacement-style attachments are omitted unless the child field is currently editable.
Prepare and validate the complete drawer state before publishing its selected aggregate; validation
failure must not open a new target with a previous target's child inputs. A start/resume response must
atomically reconcile both children and derived inputs, preferring its valid authoritative snapshot and
falling back to the previously validated snapshot only when the returned child pair is unusable.
Once a mutation reaches a terminal state, do not refresh it through an active-action context
endpoint; retain the committed response and use the ordinary list/detail projection instead.

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

Global overlays such as problem feedback may keep page-local positioning, backdrop, and
domain-specific layout, but must compose shared `ds-panel`, `ds-button`, `form-field`, and
`ds-mobile-record` surfaces instead of redefining panel, input, button, border, color, and shadow
systems in a CSS module.

Every retained server-side history must remain reachable. A list response with `total/page/page_size`
must expose paging/load-more controls or consume all pages; a fixed `page=1&page_size=N` request is
not a history view. Reset page state when switching independent tabs and ignore stale responses from
the previous tab/page generation.

Reference files:
- `AGENTS.md`
- `apps/web/components/operations/OperationsTerminalClient.tsx`
- `apps/web/app/safety/my-inspect-tasks/page.tsx`

### Drawer-Local Error Feedback

Validation and submission errors produced while a fixed drawer is open must render inside that
drawer with `role="alert"`. A page-level message behind the drawer backdrop is not visible feedback
and makes a rejected submit appear unresponsive. Clear the drawer error when the operator edits the
form, opens a new target, or closes the drawer; keep success messages on the owning page after close.

```tsx
// Wrong: the drawer remains open while the message renders behind its backdrop.
if (validationError) setPageMessage(validationError);

// Correct: pass drawer-owned error state into the visible form surface.
if (validationError) setDrawerError(validationError);
{drawerError ? <p className="status-pill status-danger" role="alert">{drawerError}</p> : null}
```

Regression tests must assert both the business validation text and the drawer-local alert binding.

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

## User-Facing Catalog Labels

Catalog selectors must show stable business labels rather than database IDs. Keep the ID in the
control value/key, but do not append it to the visible option text merely to make the label unique.
When historical catalog data has no Unicode letter, resolve a domain-specific fallback (for example,
the tenant's default-park label) in one shared helper used by every view of that option. Punctuation,
decimal separators, and default-ignorable Unicode characters are not readable business-name text.
Normalize by removing `\p{Default_Ignorable_Code_Point}`, normalizing to NFC, and collapsing whitespace
before display and collision counting so invisible-, canonically-, or whitespace-equivalent labels share
the same comparison value. Apply the removal before any readable-letter check as some default-ignorable
characters are also Unicode letters; mirror this order in browser constraints and submitted values.
Deduplicate catalog candidates by the submitted business identifier before
rendering; repeated values must not create duplicate controls or overwrite labels in a keyed projection.
If multiple candidates resolve to the same visible label, append a stable
user-facing business code only to those colliding labels. The code
suffix must use an injective ASCII-safe representation: escape non-ASCII code points, whitespace, and
the escape marker itself rather than allowing Unicode normalization or HTML collapsing to merge distinct
codes. Normalize the complete generated label before every collision-counting pass, then repeat
disambiguation for any new collision with a genuine business name; uniqueness of the base-label groups
alone is insufficient.
Never expose an internal database ID. A display fallback must not broaden the API candidate scope or
bypass tenant ownership.

## Verification

For frontend changes, choose the smallest reliable checks:

- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/web build`
- Browser inspection for meaningful page/UI changes, including a phone-width viewport for operational pages

Reference files:
- `AGENTS.md`
- `docs/testing/how-to-run-tests.md`
