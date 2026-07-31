# Issue 200 SLA rule selector options

## Goal

Populate SLA rule type, urgency, and priority selectors for business users who
can read dictionary items but do not administer dictionary types.

## Requirements

- Reuse `loadDictMapByCodes` as the single business-dictionary loading path.
- Query enabled items directly by `dict_code`.
- Keep current default-value selection and error reporting.
- Add a regression test for all three required dictionary codes and prohibit
  the administrative `/dict-types` dependency on this page.

## Acceptance Criteria

- [ ] The SLA page requests `workorder_type`, `workorder_urgency`, and
  `workorder_priority` through the shared dictionary client.
- [ ] It performs no `/dict-types` request.
- [ ] Create/edit selectors receive enabled options.
- [ ] Page behavior remains permission-gated by SLA permissions.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
