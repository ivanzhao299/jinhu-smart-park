# Implementation validation checkpoint

Workspace: `/Users/mac/.codex/worktrees/hr-payroll-formal-trial-comparison-20261012`
Branch: `codex/hr-payroll-formal-trial-comparison-20261012`
Base: `92674283ff3c006af413c1498fa4bbd538905e1e`

## Completed scope

No-DDL transient modern payroll comparison. Shared formal source composition, full selected-month record census and all-book roster equality, receipt-bound immutable source plus same-transaction current builder hash, explicit project mappings, exact signed decimals and independent missing-net state. Results retain per-book records for cross-book employees; complete CSV contains record/item/source/input/rule/engine identities and hashes. Required metadata audit is atomic. Formal creation duplicate/correction checks are preserved.

New API `/hr/payroll/trial-comparisons`, `/options`, `/source-options`; shared contracts; modern `PayrollTrialComparison` plus full-response CSV export; dedicated service/pure/PG/HTTP/component/transport tests; backend and frontend contracts updated.

## Validation results

- Isolated `pnpm install --frozen-lockfile --offline --ignore-scripts`: passed. Both API/Web `@jinhu/shared` resolve into this workspace; recorded in private implementation-provenance.json.
- `pnpm --filter @jinhu/shared build`, `lint`, `typecheck`: passed.
- `pnpm --filter @jinhu/api lint`, `typecheck`, `build`: passed after independent review refreshed the final API source. Final 4/4 PostgreSQL/HTTP/unit checks also passed with all 2295 source identities retained.
- `pnpm --filter @jinhu/web lint`, `typecheck`, `build`: passed; production build completed (session69826 exit0). Existing unrelated CSS/autoprefixer/cache warnings remained nonfatal.
- API original formal rule/run/calculation/source plus new trial regression:20/20 passed,0 skipped. Includes actual PostgreSQL formal source consumer and formal overlap checks. `api-regression.log`.
- Final payload-bound/conditional-insurance delta:4/4 passed,0 skipped, including actual trial PostgreSQL/HTTP. `trial-final.log`.
- Web actual component trial5 + existing formal creation10:15/15 passed. `web-regression.log`.
- Actual Web `hrApi` transport:10/10 passed, including new mappings/version/body/key/AbortSignal endpoints. `web-transport.log`.
- `git diff --check`: passed.

## Exact main test commands

Run from `apps/api`:

```sh
HR_PAYROLL_TRIAL_PG_REQUIRED=1 HR_PAYROLL_FORMAL_RULE_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15490 TS_NODE_TRANSPILE_ONLY=true node --test --test-concurrency=1 --require ts-node/register src/modules/hr/hr-payroll-trial.pg.spec.ts src/modules/hr/hr-payroll-trial.spec.ts src/modules/hr/hr-payroll-formal-rule.pg.spec.ts src/modules/hr/hr-payroll-formal-run.spec.ts src/modules/hr/hr-payroll-formal-calculation.spec.ts src/modules/hr/hr-payroll-formal-source-calculation.spec.ts
HR_PAYROLL_TRIAL_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15490 TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-payroll-trial.pg.spec.ts src/modules/hr/hr-payroll-trial.spec.ts
```

Run from `apps/web`:

```sh
TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx"}' node --test --require ts-node/register lib/hr-payroll-formal-api.spec.ts
pnpm exec vitest run --config vitest.config.ts test/interaction/hr-payroll-trial.test.tsx test/interaction/hr-payroll-run-creation.test.tsx
```

## Actual PostgreSQL/HTTP proof

Owned container `jinhu-hr-trial-20261012`, image postgres:16-alpine, loopback15490, task label `hr-payroll-formal-trial-comparison`. Tests create random databases and drop them in finally. Container remains available for reviewer reruns; parent owns final removal. No other database/container was used or changed.

Trial test executes original migrations248/319/347/348/233/247/363/367/368/243/349/350/351 unchanged, with explicit synthetic receipt/control/personnel/period prerequisites. This proves actual domain SQL/guards and Nest controller/DTO/PermissionGuard/IdempotencyKeyGuard, not original complete fresh/upgrade migration runner history or production JWT/roles.

Synthetic fixture:54+39 source records,64 employees,29 overlaps,2295 source items. Confirms source/input/rule/payroll/receipt table hashes unchanged,4-decimal vs2-decimal exact differences, NULL/text/unknown project preservation, missing net, full scope/selected version/source/itembook failures, audit rollback, source append blocked while trial holds SHARE locks, next trial rejects appended unowned/stale source, formal book1 posting preserves identical item amounts and book2 posting still rejects overlap. An existing formal run does not stop calculate-only comparison.

## Remaining boundaries and next action

Product ownership handed to independent reviewer; implementer will not edit concurrently. Parent owns final browser proof and broader interaction check after review. Browser fixture uses actual component with synthetic API; actual July inputs/rules/insurance and independent owner business acceptance remain pending. No real month payroll calculation, source import, production write, merge or deploy performed.

Private logs and source hashes are under `/Users/mac/.codex/artifacts/hr-payroll-formal-trial-comparison-20261012`, directory0700/logs0600. No personal source rows, credentials or private production payloads recorded. Runtime/account model usage is unavailable, not zero.


## Independent review and final integration

Independent review fixed total deadline enforcement after metadata audit and unknown source raw-value/column-name preservation. Final API lint/typecheck/build and 4/4 PG/unit checks passed. No API source changed afterwards.

Shared export lifecycle audit proved two real React races against original code (7 existing pass, 2 new fail): old passive cleanup cancels a new context export and an old pending request prevents a new export. Context-owned requests/state fix both; shared/performance/training/payroll focused interaction 24/24 pass; ESLint and full Web typecheck pass. No timeout, retry, skip, or weakened assertions. Performance consumer test additionally waits for its actual enabled control.

Final complete Web interaction suite: 148/148 files and 1178/1178 tests PASS, zero failures/skips (93.17s; full-interaction-verified.log). Final production Web build PASS (web-build-verified.log). Only existing nonfatal CSS/plugin/lint warnings remained.

Actual trial component browser checks used synthetic data only: desktop1440/mobile390 no horizontal overflow, failure/retry preserves selections, all 93 records over five pages, CSV all558 rows/93 source IDs/64 employee codes/2 books. Evidence and source hashes in private browser directory. These are not real July payroll amounts.

Owned preview session6345 stopped and task-labelled PostgreSQL container removed after all checks. Full empty-database/upgrade migration rehearsal skipped because no DDL changed; domain migrations were exercised by the isolated fixture. Production JWT/role/business acceptance remains pending.
