# HR attendance enterprise UI tuning

## Goal

Align the HR attendance page layout, typography, form spacing, action grouping, table/card density, and 390px responsive behavior with the global design system without changing business logic.

## Requirements

- Preserve every existing attendance permission check, API call, handler, state transition, and legacy-history surface.
- Align headings, typography, form controls, action placement, whitespace, cards, and filters with the global design-system surfaces.
- Separate HR operations into four recognizable tasks: daily scheduling, shift templates, manual punch entry, and daily recalculation.
- Keep request and anomaly filters compact on desktop and stacked, touch-friendly, and overflow-free on a 390px viewport.
- Keep historical KPI and month-close surfaces dense enough for routine medium-enterprise use.
- Do not add explanatory copy that competes with operational content.

## Acceptance Criteria

- [ ] The anomaly title never wraps because of an adjacent full-width status control at ordinary desktop widths.
- [ ] HR operation controls are grouped by business task and each action sits with the fields it submits.
- [ ] Filter and month-close toolbars align to the same control height and spacing system.
- [ ] Desktop and 390px layouts have no horizontal document overflow.
- [ ] Existing HR attendance route contracts, Web lint, typecheck, production build, CSS architecture, and diff checks pass.
- [ ] Authenticated browser inspection confirms the adjusted production page on desktop and phone widths after deployment.

## Notes

- Scope is presentation-only: no API, schema, RBAC, workflow, or data migration changes.
