# Frontend Form And Drawer Audit - 2026-06-24

## Scope

This audit covers the Jinhu Smart Park web frontend form controls, drawer layouts, and high-frequency management surfaces.

Touched layers:

- `apps/web/app/globals.css`
- `packages/ui/src/components/Drawer/Drawer.module.css`

No business logic, deployment scripts, credentials, server access, or production operations were changed.

## Findings

- Form controls had multiple competing heights: 32px, 36px, 38px, 40px, and 44px appeared across global fields, drawer forms, compact drawers, and mobile overrides.
- Drawers were styled through shared `@jinhu/ui` primitives, old `.drawer-form` classes, and `[data-ui-drawer-panel]` overrides at the same time, which made migrated and legacy drawers feel inconsistent.
- Text inputs, selects, and textareas shared only partial focus and disabled states. Select elements did not have one consistent arrow, padding, and hover treatment.
- Drawer footers existed in multiple variants and could visually detach from long forms instead of acting as one stable action area.
- Helper and error text conventions were implicit, which encouraged page-local exceptions.

## Changes

- Added shared form tokens for control height, compact height, touch height, radius, padding, focus ring, label color, and helper text size.
- Unified native input, select, textarea, checkbox, and radio states: hover, focus, disabled, invalid, placeholder, and select arrow.
- Standardized `.field`, `.form-field`, `.field-help`, `.field-error`, `.ds-field-help`, and `.ds-field-error`.
- Standardized drawer form grids with responsive `auto-fit` columns and stable minimum widths.
- Standardized drawer headers, scroll areas, and sticky footers in the shared Drawer component.
- Kept mobile controls readable and touch-safe, including 16px font sizing in existing phone-width overrides.

## Forward Rules

- New forms should use `.field` or `.form-field` and rely on global form tokens instead of page-local control dimensions.
- New drawer workflows should use `Drawer`, `DrawerHeader`, `DrawerForm`, `DrawerSection`, `DrawerFormGrid`, and `DrawerFooter` from `@jinhu/ui`.
- Helper text should use `.field-help` or `.ds-field-help`; validation text should use `.field-error` or `.ds-field-error`.
- Avoid redefining input/select/textarea heights in page-local CSS unless the exception is tied to a specific compact operational workflow.
- Number inputs in operational forms should keep select-on-focus behavior where already required by the design-system rules.
