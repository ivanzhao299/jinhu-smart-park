# Frontend CSS Duplicate Audit - 2026-06-19

## Scope

Audited:

- `apps/web/app/globals.css`
- `apps/web/components/operations/OperationsTerminal.module.css`
- checkbox usage in `apps/web/app` and `apps/web/components`

The audit distinguished exact duplicate CSS bodies from layered overrides. There were no exact duplicate selector plus body blocks in `globals.css`, but there are many repeated selectors used as later overrides.

## Immediate Findings

High-risk repeated selectors found in `apps/web/app/globals.css`:

- `.data-table-actions button:not(.primary-button)` appears in multiple table migration blocks.
- `.page-content`, `.filter-bar`, `.page-header`, `.page-container`, and `.content` appear in base layout and later design-system migration blocks.
- `.signin-*` selectors appear in several login-page responsive and visual refresh blocks.
- `.app-sidebar`, `.app-header`, `.header-actions`, and `.user-menu` appear in base shell and later shell refresh blocks.
- `.role-config-layout`, `.role-tree-panel`, `.role-binding-scroll`, `.role-detail-card .permission-row`, and `.role-detail-card .binding-row` appear in role configuration overrides.
- `.native-table`, `.data-table`, `.ds-data-table`, `.page-content table`, and related `th` / `td` selectors appear in table migration blocks.

These repeated selectors are not all removable mechanically. Some are legitimate responsive or theme overrides. The cleanup rule is to remove accidental repeated base styling, and keep only scoped, documented overrides.

## Cleaned In This Pass

- Removed role-page base overrides from the early system-section CSS so role configuration relies on the later Design System configuration workbench styles.
- Replaced browser-native checkbox rendering with a global `input[type="checkbox"]` design-system control.
- Removed local `accent-color` from permission and role binding checkboxes.
- Documented the rule that normal checkboxes must not define page-local checked-state styling.
- Removed duplicate table action button definitions that forced row actions into 36px icon-only buttons.
- Consolidated `.data-table-actions`, `.ds-row-action`, `.table-action-button`, `.row-action-button`, and `.row-actions` into one canonical global table-action rule.
- Removed page-local table-action overrides from robot and lead table styling.
- Removed legacy `.work-panel td:last-child button` table-action styling from the generic icon button layer.

## Current Global Primitives Introduced Or Standardized

- `ds-config-workbench`
- `ds-panel-heading`
- `ds-subtle-count`
- `role-tree-panel`
- `role-detail-card`
- `role-meta-grid`
- `role-binding-content`
- global `input[type="checkbox"]`
- global Table Action Canonical block for `data-table-actions`, `ds-row-action`, `table-action-button`, and `row-action-button`

## Remaining Cleanup Backlog

These should be cleaned in focused batches, not by a blind global delete:

1. Page shell
   - Consolidate `.page-container`, `.page-header`, `.filter-bar`, `.page-content`, and `.content` into one page-surface layer.

2. Login page
   - Merge repeated `.signin-*` blocks into one base block plus one mobile breakpoint.

3. Sidebar and header
   - Merge repeated `.app-sidebar`, `.app-header`, `.header-actions`, and `.user-menu` blocks into the shell baseline.

4. Table layout
   - Consolidate `.native-table`, `.data-table`, `.ds-data-table`, and `.page-content table` migration styles after remaining pages move to shared table primitives.

## Guardrail

Before adding a new visual rule to `globals.css`, search for the selector first. If it already exists, update the existing rule or create a scoped `ds-*` primitive. Do not append another late override unless it is a documented media query or theme override.

Table row actions must use the canonical classes:

- `data-table-actions` for the action group.
- `ds-row-action` for semantic row actions.
- `table-action-button` or `row-action-button` only for legacy markup that cannot yet use `ds-row-action`.

Do not define page-local widths, icon-only styling, hidden SVG rules, or `font-size: 0` for table action buttons.
Do not style row actions through table position selectors such as `td:last-child button`; assign the canonical classes in markup instead.
