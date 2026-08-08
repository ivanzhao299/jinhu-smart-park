# Property shared Web foundation

This directory is the business-neutral Web foundation shared by the homestay and
housing workbenches. Domain routes should consume the public API from `index.ts`
instead of reaching into internal reducer or rendering modules.

## Frozen inputs

- A-contract/server-safety:
  `e709459a034807b3575db604a76bc69bf1c5ff5b`
- A-schema and API-only `/users/me` property projection:
  `b1a0625b59f7c2263a1909126e335b85c81d8c13`

The `/users/me` projection is an API response contract only. It does not authorize a
client-side action, expose a canonical route, or replace the API/service permission
checks.

## Public responsibilities

- `projectPropertyCapabilities` converts the frozen manifest plus `/users/me`
  projection into display capabilities. After the required module and every module
  dependency are active, `is_super` or the system `*` permission can satisfy an
  ordinary page/action permission code, matching the API authorization contract. The
  adapter does not infer access from a Persona, Role, legacy `*:operations`
  permission, or page visibility.
- `RemoteEntityPicker` accepts only server-authorized option labels and an injected
  loader. Domain API wrappers remain in each workbench.
- `CanonicalDetailShell` and the return-context helpers provide a full-page/drawer
  presentation and same-origin allowlisted navigation.
- `ConsequenceDialog` presents a stable target, consequences, resulting state, and
  reason policy. It does not execute an approval or domain mutation.
- task, page-state, and Design System adapters render projections and callbacks. They
  do not own assignment, completion, approval, upload, or domain workflow state.
- `propertyAccessibleControlClassName` is the public helper for applying the
  foundation's touch-target, focus, forced-colors, and reduced-motion control
  treatment to workbench-owned buttons and links.

## Integration limits

- Do not import identity, approval, Track B runtime, homestay/housing API wrappers, or
  domain app routes into this directory.
- Do not add fetch calls, query keys, mutations, schema, migrations, menus, feature
  flags, or upload policies here.
- Picker scheduling, cancellation, authorization epochs, and forbidden latching are
  internal implementation details; workbenches consume `RemoteEntityPicker`, not its
  load coordinator.
- Property module/page/action/data/field/file projections are UX hints only. Every
  protected API remains authoritative and fail-closed.
- Neither `is_super` nor `*` bypasses module availability or module dependencies.
  Integrated high-risk actions use the Track B approval runtime and remain subject
  to their exact page/action permissions before Web exposes the request operation.
- The Web menu stays hidden until both workbench owners deliver real canonical route
  SHAs and the later menu integration gate consumes them.
- The final UI gate is complete only when real canonical domain routes supply
  desktop/mobile, keyboard, focus, zoom/reflow, ARIA, forced-colors, and
  screen-reader-equivalent evidence; the 2026-08-04 UAT archive records that gate.
