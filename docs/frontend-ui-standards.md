# Frontend UI Standards

## Page Baseline

All new management pages must use the shared page primitives from `@jinhu/ui`.

Use these building blocks instead of page-local ad hoc structures:

- `PageShell`
- `PageHeader`
- `FilterPanel`
- `ContentCard`
- `ActionGroup`
- `FeedbackNotice`
- `PaginationBar`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `MetricCard`
- `StatusPill`
- `DataTable`
- `DataTableActions`

Required structure:

- Top-level page content uses `PageShell`.
- The title area uses one `PageHeader` with actions passed through the `actions` prop.
- Query forms use `FilterPanel`; do not create custom stacked filter cards.
- Each major data block uses `ContentCard`.
- Empty rows use shared `EmptyState`, not page-local text paragraphs.
- Loading and error placeholders use shared `LoadingState` / `ErrorState`.
- Pagination uses `PaginationBar`.
- KPI cards use shared `MetricCard`.
- Status text uses shared `StatusPill`.
- Table action groups use `DataTableActions` and compact action buttons.

Style rules:

- Do not use inline styles.
- Do not hardcode colors in page components.
- Do not add page-specific layout selectors to `app/globals.css` unless the layout cannot be expressed with shared UI primitives.
- Do not redefine an existing global selector later in `app/globals.css` just to override it. Extend the shared primitive or introduce a scoped `ds-*` primitive instead.
- Do not define page-local `EmptyState`, `MetricCard`, `StatusPill`, pagination, or content-card variants.
- Prefer CSS Modules inside `@jinhu/ui` for reusable UI patterns.
- Keep page-specific CSS small and limited to domain-specific composition.
- Buttons must be grouped through `ActionGroup` or `DataTableActions`; avoid random button placement.
- Page width, card spacing, table density, and empty states must be inherited from the shared primitives.
- Native checkboxes must use the global `input[type="checkbox"]` design-system style. Do not use `accent-color` or page-local checked-state styling for normal form checkboxes.

Current baseline sample:

- `apps/web/app/robots/cleaning/page.tsx` has been migrated to `PageShell`, `PageHeader`, `FilterPanel`, `ContentCard`, shared `EmptyState`, `MetricCard`, `FeedbackNotice`, and `PaginationBar`.

Known migration backlog:

- Several historical pages still define local empty states or local card/status variants.
- Some system pages still use raw `<table>` layouts instead of `DataTable`.
- Some `/admin/*` routes are alias pages with duplicated route surfaces; keep them only when compatibility is intentional.
- `app/globals.css` still contains many page-specific selectors and should be gradually reduced after page migration.
- `app/globals.css` must be periodically audited for repeated selectors. Repeated selectors are allowed only for documented responsive/theme overrides; accidental repeated base selectors must be consolidated.

## Drawer Standard

All new drawer pages must use the shared drawer primitives from `@jinhu/ui`.

Use these building blocks instead of page-local ad hoc structures:

- `Drawer`
- `DrawerHeader`
- `DrawerActions`
- `DrawerTabs`
- `DrawerTabButton`
- `DrawerForm`
- `DrawerSection`
- `DrawerFormGrid`
- `DrawerFooter`
- `DrawerDetailGrid`
- `DrawerDetailItem`

Required behavior:

- Every drawer must pass `onClose` to `Drawer`, so overlay click and `Esc` close the drawer.
- Close actions belong in `DrawerHeader`; do not add large standalone close buttons inside content.
- Detail drawers use `DrawerHeader`, optional `DrawerActions`, optional `DrawerTabs`, then `DrawerDetailGrid`.
- Form drawers use `DrawerHeader`, `DrawerForm`, `DrawerSection`, `DrawerFormGrid`, and `DrawerFooter`.
- Avoid full-screen drawers unless the workflow truly needs a wide workspace.
- Prefer `size="md"` for ordinary forms and detail views.
- Use `size="lg"` for tabbed details or complex forms.
- Use `size="xl"` only for dense workflows with tables or multiple panels.

Style rules:

- Do not use inline styles.
- Do not hardcode colors in page components.
- Do not use Tailwind.
- Do not use old drawer layouts based on `task-item`, `form-stack`, or page-local detail item cards.
- Keep labels, values, tabs, buttons, and footer actions aligned through shared classes.
- Number inputs must use `onFocus={(event) => event.currentTarget.select()}`.

Migration priority:

1. Convert visible customer-facing drawers first.
2. Convert high-frequency management drawers next.
3. Leave only low-risk technical admin drawers for the final cleanup pass.
