# Issue 199 contract change draft JSON parse

## Goal

Ensure contract-change commands pass structured request bodies to `apiRequest`
and are serialized exactly once by the shared client.

## Requirements

- Remove caller-side JSON serialization from create/update, delete, preview,
  submit, approve, reject, and cancel paths.
- Do not alter the direct `fetch` export flow, which correctly owns its own
  serialization.
- Add a regression test that covers the contract-change call sites and shared
  client serialization contract.

## Acceptance Criteria

- [ ] Draft create/update sends an object-shaped JSON body.
- [ ] Workflow action bodies remain object-shaped and preserve reject reasons.
- [ ] No `body: JSON.stringify(...)` remains in a contract-change `apiRequest`.
- [ ] Shared API client tests prove exactly-one serialization.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
