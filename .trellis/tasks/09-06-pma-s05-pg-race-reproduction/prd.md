# PMA S-05 PostgreSQL race reproduction

## Goal

Issue #670；PMA-011/012 leasing renewal/write-off PG concurrency reproduction tests only

## Requirements

- Add PostgreSQL-backed tests that deliberately synchronize two competing leasing renewal requests and record the observed invariant/outcome.
- Add PostgreSQL-backed tests that deliberately synchronize competing receivable write-off operations and record the observed invariant/outcome.
- Tests must exercise current production service/database paths rather than mocks and must remain deterministic enough for CI diagnosis.
- This task is reproduction-only: do not change product behavior, migrations, schemas, seeds, locking, idempotency, or conflict translation.
- Publish observed conclusions to Issue #670 without secrets or environment details.

## Acceptance Criteria

- [ ] Both races have explicit start barriers and assert the current persisted result, not a presumed desired fix.
- [ ] Tests clean up their own isolated records and run against a task-owned PostgreSQL instance only.
- [ ] Existing focused API tests/typecheck/lint and PR CI pass, or any reproduced failure is honestly quarantined/documented per existing test convention.
- [ ] No migration, seed, HR, production-direct, shared-container, or main-Chrome changes.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
