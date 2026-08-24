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

Every authenticated top-level business route that lives outside the `(dashboard)` route group must provide a `layout.tsx` wrapping its children with `DashboardLayout`. A `PermissionGuard` depends on the user context supplied by that layout; omitting it can turn a valid authenticated route into a blank page. Permission-gated full pages must also provide a visible 403-style fallback instead of the default empty fallback. Add a route contract assertion whenever a new top-level business module is introduced.

Reference files:
- `apps/web/app/assets/units/page.tsx`
- `apps/web/app/assets/units/UnitsPageClient.tsx`
- `apps/web/app/safety/inspect-tasks/page.tsx`
- `apps/web/app/safety/inspect-tasks/InspectTasksPageClient.tsx`

### Catch-all placeholder and not-found contract

The dashboard catch-all is only a compatibility surface for a route present in the current
authenticated user's merged menu. Resolve it with `resolveCatchAllRoute(pathname, userMenus)`:

- `/system/tenants` keeps its explicit compatibility route.
- A route found in `getDashboardMenus(userMenus)` may render the existing placeholder surface.
- A route absent from that merged menu must call Next `notFound()`; never present a typo, retired
  route, or arbitrary URL as “暂未独立成页”.
- Related placeholder links must use the same merged menu instance as the classification.
- An unauthenticated request remains owned by `DashboardLayout` and redirects to `/login` before
  protected catch-all children render. Do not move this decision into the public root layout.

Tests must cover legacy and backend-added menu placeholders, completely unknown paths, the tenants
compatibility route, and the catch-all integration with `notFound()`. Keep those specs in the Web
unit-test gate.

Reference files:
- `apps/web/lib/catch-all-route.ts`
- `apps/web/app/(dashboard)/[...segments]/page.tsx`
- `apps/web/app/not-found.tsx`

Use `"use client"` only in files that need client behavior. Keep presentational subcomponents under a route-local `components/` directory when they are specific to that workflow.

Reference files:
- `apps/web/app/assets/units/components/UnitsTable.tsx`
- `apps/web/app/workorders/list/components/WorkOrdersToolbar.tsx`

## API Calls And Idempotency

Use `apiRequest` for JSON APIs and `apiFormRequest` for `FormData`. Do not hand-roll fetch wrappers unless the shared helper cannot express the request.

Write operations that map to idempotent API routes should pass `createIdempotencyKey("<domain-action>")`.

### POST previews behind the global write guard

1. **Scope / Trigger**: apply this when a server-authoritative preview uses `POST`, even if the
   endpoint itself performs no durable domain mutation.
2. **Signature**: call `apiRequest(path, { method: "POST", idempotencyKey:
   createIdempotencyKey("<domain-preview>"), body })`.
3. **Contract**: the global write guard requires `X-Idempotency-Key` for every POST; the browser
   must not infer that a semantic preview is exempt. The service still recomputes the preview and
   returns a signed snapshot for the later write.
4. **Validation / errors**: missing key -> HTTP 400 before controller execution; stale bundle
   version/hash or stale preview signature -> fail closed in the domain service.
5. **Cases**: good = preview POST has its own action-specific key; base = GET catalog needs no key;
   bad = preview works in a mocked component test but returns 400 against the real API guard.
6. **Tests**: source/ component contract asserts the preview key, API integration asserts real
   preview success, and Chrome acceptance reaches the rendered difference before applying it.
7. **Wrong vs correct**:

```tsx
// Wrong
apiRequest(path, { method: "POST", body });

// Correct
apiRequest(path, {
  method: "POST",
  idempotencyKey: createIdempotencyKey("role-property-bundle-preview"),
  body
});
```

Reference files:
- `apps/web/lib/api-client.ts`
- `apps/web/components/assets/AssetCrudPage.tsx`
- `apps/web/app/assets/units/UnitsPageClient.tsx`

Authentication token access should go through `getAccessToken()` or the auth context utilities.

Reference files:
- `apps/web/lib/authz.ts`
- `apps/web/lib/auth-context.tsx`

### Layered 403 handling

Treat a 403 according to the boundary that owns the denied capability:

- A menu-backed page-route denial resolves through `resolveDashboardRouteDenial` and redirects to
  `/403` for permission denial or `/403?reason=module` for module denial. While redirecting,
  `DashboardLayout` must not render the protected page children.
- A data request uses `isForbiddenError(error)` and projects the result into the owning page state.
  Initial denial may use `forbidden-full`; denial after cached data may use `forbidden-partial` and
  retain the last authorized snapshot.
- A denied button or local action may remain hidden through `PermissionGuard`. Do not turn its
  default `null` fallback into an entire-page error.
- An explicitly optional dictionary or auxiliary read may degrade on 401/403 when the page contract
  documents that behavior. Do not let a shared handler upgrade it to a route redirect.

Never redirect every API 403 inside `apiRequest`: API responses also represent data-scope and
business-action denial, so the caller owns the UI projection.

Tests must cover permission/module route classification, the redirect target, protected-child
suppression, generic 403 error shapes, and any full/partial/optional-data projection changed by the task.

Reference files:
- `apps/web/lib/dashboard-route-access.ts`
- `apps/web/lib/api-client.ts`
- `apps/web/components/layout/DashboardLayout.tsx`
- `apps/web/features/property-shared/states/page-state.ts`
- `apps/web/components/safety/HazardsPageClient.tsx`

### Post-switch route prediction

After a global park-context switch returns the authoritative `nextUser`, publish that user and
predict whether the current pathname is still reachable before refreshing. A menu href and its
detail subpaths inherit that menu's permission and parent module. Keep `/dashboard` as a
module-free route, and check mobile engineering/operations terminals with the same access rules
used by `resolvePostLoginPath`.

Redirect a provably inaccessible route through `resolvePostLoginPath(nextUser)` so device-specific
terminal priority, the desktop wildcard `/dashboard`, and ordinary users' first accessible menu
stay consistent with login. Unknown non-menu utility routes are not proof of denial; keep them and
leave their page-level guards responsible. Desktop and mobile global park switchers must use the
same pure prediction helper. Do not move this navigation into `switchParkContext`, which owns token
rotation and must remain UI-agnostic.

Reference files:
- `apps/web/lib/post-login-route.ts`
- `apps/web/components/layout/UserMenu.tsx`
- `apps/web/components/layout/MobileTerminalHeader.tsx`

## Scenario: Browser Park Context Switch Before Scoped Writes

### 1. Scope / Trigger

- Trigger: a browser form writes scoped business data into a park different from the current JWT park, such as creating a building from the building management page after selecting another accessible park.

### 2. Signatures

- Client helper: `switchParkContext(parkId: string): Promise<UserContext>`.
- API request: `POST /auth/switch-context` with body `{ parkId: string, refreshToken?: string }`.
- Pre-rotation rejection marker: `X-Auth-Context-Switch-Rotation: not-started`.
- Cross-origin requirement: API CORS must expose the pre-rotation marker header, otherwise
  `ApiError.headers.get(...)` returns `null` in browsers even when the response header exists.
- Follow-up write: the business request uses `getAccessToken()` after `switchParkContext` resolves, never the pre-switch token.

### 3. Contracts

- The browser must validate the target against enabled `accessible_parks` before calling the API.
- When a legacy JS-readable refresh token exists during the compatibility period, `switchParkContext` sends it in the request body so the API's no-cookie fallback remains usable.
- Legacy refresh-token fallback values must satisfy the same coarse length bounds as the DTO before
  being included in the body; malformed stale storage must not break cookie-first switching.
- If the switch request returns the explicit `X-Auth-Context-Switch-Rotation: not-started` marker, keep the current session, clear only the in-flight park-switch marker, and surface the error in the owning form. Do not clear tokens or redirect to `/login`.
- If that marked rejection arrives after another tab has already published a different shared token,
  clear this tab's stale private `sessionStorage` credentials before preserving the newer shared
  session.
- A malformed successful response, transport failure, or 5xx is not a definite rejection; keep the ambiguous-session cleanup path because the server may already have rotated credentials.
- An unmarked 401 is also ambiguous for `switch-context`; the API may have already claimed the old refresh token before failing to issue the replacement session.
- If a rotated token has been received but cannot be safely published, preserve the existing half-published-session protection: revoke/clear the ambiguous session unless a newer login or cross-tab session has already superseded it.
- The owning form must not submit the business write after switch failure.

### 4. Validation & Error Matrix

- target park absent or disabled -> reject locally with a visible form error; no API request.
- switch-context response with `X-Auth-Context-Switch-Rotation: not-started` -> visible form error, current token preserved, no `/login` redirect, no follow-up business write.
- malformed successful response / transport failure / 5xx / unmarked 401 -> ambiguous cleanup path remains active.
- switch-context success + `/users/me` confirms target park -> publish new session, then submit the business write with the new token.
- post-rotation publication conflict -> keep the existing session-safety cleanup behavior.

### 5. Good / Base / Bad Cases

- Good: building create selects another accessible park, context switch succeeds, then `POST /buildings` uses the new token.
- Base: building create targets the current park and writes without context switch.
- Bad: a failed switch-context request clears the old session and sends the user to `/login` before the form can report the real error.

### 6. Tests Required

- Unit-test body `refreshToken` fallback, pre-rotation failure session preservation, post-rotation cancellation cleanup, and same-target switch coalescing.
- Page regression must assert switch failure remains drawer-local and does not execute the business create.
- Browser acceptance should cover desktop and a 390px viewport: route remains on the source page, error text is visible, no horizontal document overflow, and the mock API records no follow-up create.

### 7. Wrong vs Correct

#### Wrong

```ts
try {
  await apiRequest("/auth/switch-context", { method: "POST", body: { parkId } });
} catch (error) {
  await logoutSession();
  window.location.href = "/login";
  throw error;
}
```

#### Correct

```ts
try {
  const refreshToken = getRefreshToken();
  await apiRequest("/auth/switch-context", {
    method: "POST",
    body: refreshToken ? { parkId, refreshToken } : { parkId }
  });
} catch (error) {
  if (error instanceof ApiError && error.headers?.get("X-Auth-Context-Switch-Rotation") === "not-started") {
    clearInFlightSwitchMarker();
    throw error;
  }
  await cleanupAmbiguousSwitchSession();
}
```

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

For hierarchy editors, a non-null parent that is outside the actor's visible projection is an
unavailable historical binding, not a root organization. Render an explicit unavailable label
and omit that unchanged parent from the update payload. Relationship editors that allow zero or
one primary binding must expose an explicit “no primary” choice instead of forcing one relation
to remain primary in the browser.

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
