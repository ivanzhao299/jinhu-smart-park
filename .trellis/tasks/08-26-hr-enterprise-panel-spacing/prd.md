# HR enterprise panel spacing normalization

## Goal

Normalize shared HR panel padding, text-to-border spacing, panel rhythm and 390px behavior across all HR functional pages without changing global non-HR surfaces or business logic.

## Requirements

- Add consistent content padding to top-level HR panels that currently render text one pixel from their rounded border.
- Preserve global `ds-panel` behavior for non-HR modules and preserve all HR business logic, permissions, API calls, and workflows.
- Keep panel heading, filters, forms, record lists, KPI cards, and action areas visually separated.
- Use a desktop spacing appropriate for enterprise work surfaces and a smaller but touch-safe phone spacing.
- Cover every HR page that imports the shared HR workbench CSS module.

## Acceptance Criteria

- [ ] Desktop HR top-level panels have 22px content padding and no text touches a rounded border.
- [ ] Phone-width HR top-level panels use 18px padding and no horizontal document overflow at 390px.
- [ ] Nested operation cards retain their own spacing and do not receive accidental double padding.
- [ ] HR route contracts assert the shared page-panel padding rule.
- [ ] HR tests, Web lint/typecheck/build, CSS architecture, and browser acceptance pass.

## Notes

- Presentation-only change. No API, database, RBAC, or workflow changes.
