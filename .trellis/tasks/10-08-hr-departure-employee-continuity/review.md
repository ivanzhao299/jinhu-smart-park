# Review checkpoint (2026-10-08)

Workspace `/tmp/jinhu-hr-payroll-ledger-continuity-20261008`; branch `codex/hr-departure-employee-continuity-20261008`; baseline `9b83f37a7a40b45468ece6d55bb50fae62e20f97`. Reviewer is finished; writer ownership returns to parent. No active review processes remain.

## Findings (fixed)

- P2 — `apps/api/src/modules/hr/dto/hr-departure.dto.ts`: unbounded pages accepted values whose computed OFFSET exceeds PostgreSQL bigint, producing a server error instead of validation rejection. Number coercion also accepted one-element arrays and booleans. The new employee-options DTO now accepts scalar integer numbers/digit strings only, caps page at 2147483647 and retains page-size 1..100. Existing list DTO stays unchanged. New actual Nest ValidationPipe regression covers malformed/repeated query values and valid string pagination.
- P2 — `apps/api/src/modules/hr/hr-departure-employee-options.pg.spec.ts`: the fixture left persistent tables and failed on its second invocation. Each invocation now creates an independently named random schema, uses connection startup search_path for every pooled connection, and drops/asserts removal of only that schema in teardown. Existing public tables are untouched; parent owns disposable database/container removal.
- `.trellis/spec/api/backend/hr-management.md` synchronized with page bounds, scalar validation and fixture cleanup.

## Review coverage

Traced dedicated controller route through purpose-specific service permission, principal/scope equality, park/team recursive organization SQL, stable count/page ordering, literal search escaping, exclusion and scoped selected lookup, minimal projection and fail-closed required audit. Application candidates follow the existing active employment set. Existing application write validation and handover same-park/non-self active-recipient validation remain intact; this change does not widen mutation authority. Reviewed controlled selection, detail binding retention, route hydration/explicit clear, request abort/generation checks, independent selectors, failed draft retention and desktop DS record visibility. No additional production-code issues found in the scoped change.

## Verification

- API affected ESLint: PASS, `review-api-lint.log`.
- API typecheck: PASS, `review-api-typecheck.log`.
- API Node contracts plus real PostgreSQL: 10/10 PASS, zero skips, `review-api-tests.log`.
- Repeat invocation of the real PostgreSQL fixture against the same database: 1/1 PASS, zero skips, `review-pg-repeat.log`; both executions asserted removal of their own schema.
- Web files/dependencies unchanged by reviewer: reused prior Web typecheck/affected lint and 11/11 component interactions, verified existing logs. No browser rerun needed for these API/test-only repairs; parent retains actual desktop/390px proof.
- `git diff --check`: PASS.
- Logs are under `/tmp/hr-departure-continuity-checks/`.

Exact changed-code commands:

```sh
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api exec eslint src/modules/hr/dto/hr-departure.dto.ts src/modules/hr/hr-departure.controller.ts src/modules/hr/hr-departure.service.ts src/modules/hr/hr-departure-employee-options.contract.spec.ts src/modules/hr/hr-departure-employee-options.pg.spec.ts
TS_NODE_TRANSPILE_ONLY=true HR_DEPARTURE_OPTIONS_PG_TEST=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15481 POSTGRES_DB=hr_departure_options_gate pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-departure-employee-options.contract.spec.ts src/modules/hr/hr-departure-employee-options.pg.spec.ts src/modules/hr/hr-departure.contract.spec.ts src/modules/hr/hr-departure-filter.contract.spec.ts
TS_NODE_TRANSPILE_ONLY=true HR_DEPARTURE_OPTIONS_PG_TEST=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15481 POSTGRES_DB=hr_departure_options_gate pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-departure-employee-options.pg.spec.ts
```

## Findings (not fixed)

None in reviewed scope. Full production builds/full migration-lifecycle PostgreSQL suite were not rerun in this bounded review: no schema/lifecycle mutation was changed and they remain release milestone checks. Real authenticated production HR acceptance remains unavailable, distinct from synthetic browser and isolated-query evidence. Parent owns current remote synchronization, PR/CI, release decisions and fixture-container cleanup. Reviewer made no commit, merge, deployment or production write and preserved the unrelated parent task/checkpoints.
