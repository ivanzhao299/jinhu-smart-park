# PMA S-04 property shared UI primitives

## Goal

Issue #667；PMA-024 formatter/EmptyState/dirty-leave/route-template breadcrumb quick win

## Requirements

- Add reusable property-shared primitives for dirty-leave protection, stateful empty states, money/date/enum formatting, and route-template breadcrumbs.
- Adopt the primitives on a bounded set of property work surfaces identified from current duplication; do not redesign unrelated pages.
- Dirty-leave protection must cover browser exit and in-app navigation where the existing routing architecture permits it, without blocking a clean form.
- Empty states must distinguish at least genuine empty data, filtered-empty data, and restricted scope/permission states without claiming a false cause.
- Formatters must preserve unknown values honestly and avoid leaking raw internal codes where a display dictionary exists.
- Breadcrumbs must use route templates rather than UUID-bearing concrete paths as labels.
- Keep housing and leasing as separate business domains while sharing infrastructure.

## Acceptance Criteria

- [ ] Shared primitives are exported from `features/property-shared` and have focused unit/contract tests.
- [ ] Selected property consumers replace duplicated local behavior without expanding confirmation scope.
- [ ] Modified UI remains usable at phone width and does not force desktop-only rendering.
- [ ] Web typecheck, lint, focused tests, PR CI, merge, containing-main CI/Deploy pass.
- [ ] No migrations, seeds, HR edits, production-direct actions, or use of the shared main Chrome.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
