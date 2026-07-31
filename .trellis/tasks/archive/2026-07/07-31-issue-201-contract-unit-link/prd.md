# Issue 201 contract unit linking entry

## Goal

Make the mandatory contract-unit association discoverable and reachable
immediately after a contract draft is created.

## Requirements

- Preserve the backend rule that a contract cannot be submitted without an
  active unit link.
- After draft creation, keep the drawer open, retain the created contract as the
  editing record, switch to the contract-unit tab, load candidate and linked
  units, and explain the next action.
- Keep unit controls permission-aware.
- Add regression coverage for the create-to-link transition and submit guard.

## Acceptance Criteria

- [ ] Creating a draft does not close the workflow.
- [ ] The new draft ID is used to load contract units.
- [ ] The unit tab and “添加房源” entry are visible for a permitted operator.
- [ ] Submission remains blocked until at least one active unit is linked.
- [ ] Existing production role bundles that can create contracts also contain
  the required unit read/create permissions.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
