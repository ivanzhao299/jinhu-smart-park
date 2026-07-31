# PR214 policy and hazard-route review fixes

## Goal

Use independent result-photo policy and keep ordinary hazard creation independent from the overdue list filter.

## Requirements

- Gate inspection-result photo inputs with the independent
  `inspect_task_result.photo_file_ids` field policy.
- Keep task-level check-in photos governed by `inspect_task.photo_file_ids`.
- Hide ordinary hazard creation only on the dedicated forced-overdue route, not when
  the ordinary page's mutable overdue filter is enabled.
- Add regression coverage and document entity-specific field-policy and route/filter
  separation rules.

## Acceptance Criteria

- [x] Result photos remain editable when their policy allows them, regardless of the
  task-level photo policy.
- [x] Ordinary hazard creation remains available while “仅看超期” filters the list.
- [x] Dedicated overdue route still suppresses ordinary creation.
- [x] Web safety tests, lint, typecheck, and build pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
