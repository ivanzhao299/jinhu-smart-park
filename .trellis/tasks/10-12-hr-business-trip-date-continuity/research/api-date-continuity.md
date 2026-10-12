# API date correction implementation checkpoint

- Workspace: /Users/mac/.codex/worktrees/hr-business-trip-date-continuity-20261012; base c538f80961696db17145f7cff77b6eeb17ababc0.
- Owned files: API DTO/controller/service, focused date unit/PG fixtures, migration369, API approved-fact contract.
- No current generic terminal/source immutability guard protects all attendance fields. Existing362 cancellation source,364 classification and366 declaration guards remain untouched.369 adds a date-correction guard that compares every non-date business/source field when date/duration changes.
- OLD intervals are handled through saved scoped daily/schedule/period evidence; no old-span enumeration. NEW intervals use existing31day validation and bounded date enumeration. Old unknown endpoints invalidate the existing unknown quantity footprint conservatively.
- Added immutable affected_work_dates in date history and latest per-request/date amendment markers in daily traces. This prevents removed old dates or old unknown footprints from passing monthly close merely because the corrected request no longer overlaps the old month. New and old overnight dates are included.
- New request version invalidates existing declaration allocation; original approved state, employee, approval link, source hashes, original reason and declared days stay unchanged. Required audit failure rolls back period reopening, request CAS and history together.
- Missing/reversed endpoints cannot persist under existing CHECK; unit read-boundary fixtures cover those shapes without disabling DB protection. Real PostgreSQL tests cover a100-year old interval with existing duration1, which current schema permits.
- Validation logs and owned-container harness: /Users/mac/.codex/artifacts/hr-business-trip-date-continuity-20261012. Full schema snapshot plus362..369; fresh isolated random DB per suite, free loopback port, explicit cleanup. No host5432 or production writes.

## Final local verification

- `pnpm install --frozen-lockfile`: passed; `apps/api/node_modules/@jinhu/shared` resolves inside this worktree. `pnpm --filter @jinhu/shared build`: passed.
- `pnpm --filter @jinhu/api typecheck`, `pnpm --filter @jinhu/api lint`, `pnpm --filter @jinhu/api build`: passed.
- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-business-trip-dates.spec.ts src/modules/hr/hr-business-trip-formal.spec.ts src/modules/hr/hr-business-trip-month-allocation.spec.ts`:10 passed,0 skipped.
- `python3 /Users/mac/.codex/artifacts/hr-business-trip-date-continuity-20261012/run-api-pg.py`:36 passed,0 skipped. Date1, allocation1, formal2, month14, calculation5, approved-facts5, overnight8. First run used a random available loopback port; expanded regression uses free55498 to satisfy the existing approved-fact fixture safety contract. Each suite restores full schema plus362..369 into a fresh random database, or owned approved_fact_gate for the two legacy strict suites, inside the newly owned disposable container. Final `owned_container_removed=True`.
- `git diff --check`: passed. No commit, PR, production or import operation.
- Remaining: parent-owned Web/browser validation, any frozen service-source hash contract rebinding, whole-worktree review and release gates. No actual-role business acceptance, historical import or payroll result claimed.
