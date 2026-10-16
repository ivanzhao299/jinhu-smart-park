# Goal/report ledger review

## Finding fixed

`exportGoalLedger` and the goal side of the check-in export previously called the unrestricted `listGoals` query and only then rejected a result above 5000. That could materialize an arbitrarily large authorized result before enforcing the stated bound. `listGoals` now accepts an internal limit and export callers request exactly 5001 rows, preserving the required explicit rejection while bounding the probe. The existing full UI list remains unbounded.

The source-contract test now asserts the export path supplies that 5001 bound.

## Validation

- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-goal-report-ledger-export.contract.spec.ts` — pass, 1 test.
- `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-goal-execution-workflow.test.tsx test/interaction/hr-goal-report-ledger-export.test.tsx` — pass, 2 files / 21 tests.
- `pnpm --filter @jinhu/api typecheck` — pass.
- `git diff --check` — pass.

## Remaining required evidence

The task acceptance criterion requiring a disposable PostgreSQL plus real Nest HTTP/controller/guard/DTO test has not been met by the implementation. The added/available API test is static source-contract coverage only. A release decision must remain blocked until an owned Docker PostgreSQL fixture and HTTP application harness prove: guard denial before service/table probes, tenant/park/self/managed-tree/status filtering, full consistent snapshot under a concurrent writer, 5000/5001 behavior, and fail-closed required audit. No production or business database was used in this review.

No browser, build, commit, push, deployment, or production action was performed by this reviewer.

## Final verified completion — root integration

The prior missing-PG/runtime blocker above is resolved. Root added the owned tmpfs PostgreSQL fixture and real-service HTTP checks, passing with no skipped tests; container cleanup asserted. Final related API contracts/HTTP:16/16; full Web interactions:150 files/1212 tests PASS. API/Web lint/typecheck and both builds PASS. Actual browser final source hashes: desktop1440 and phone390, allfour exports and cycle/status filters; StrictMode setup replay also exercised. No production business test writes and no real-role UAT claimed.

Independent read-only review accepted the root runtime fixture, deleted-employee filtering, relationship CSV preservation, StrictMode lifecycle fix and camelCase cycleId to HTTP cycle_id mapping. Original source-rule/legacy report equivalence and business signoff remain outside this reporting slice. Merge/deploy/runtime verification is the next gate.
