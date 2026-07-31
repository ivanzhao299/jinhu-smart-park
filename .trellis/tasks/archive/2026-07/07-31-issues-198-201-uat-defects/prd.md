# Issues 198-201 UAT defects

## Goal

Resolve GitHub issues 198-201 on one integration branch while preserving the
existing authorization, validation, and financial contracts.

## Requirements

- #198: floor layout upload must use the multipart contract accepted by the
  domain upload endpoint.
- #199: contract-change requests must send JSON objects exactly once.
- #200: SLA rule selectors must load their business dictionaries without
  requiring dictionary-type administration access.
- #201: after creating a contract draft, the UI must expose the unit-linking
  workflow before submission and make the prerequisite clear.
- Each issue must have a targeted regression test and a durable project
  convention that prevents the same defect class.
- Validate desktop and 390px user flows for the affected frontend surfaces.

## Acceptance Criteria

- [ ] Each issue-specific child acceptance checklist passes.
- [ ] Web lint, typecheck, build, and relevant tests pass.
- [ ] Relevant API/shared validation passes when touched.
- [ ] Browser desktop and 390px checks show no blocking layout or workflow issue.
- [ ] Full E2E passes, or any environmental blocker is reported with evidence.
- [ ] One reviewed commit is pushed from `fix/issues-198-201`.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
