# Release interaction test budget audit

Workspace: `/Users/mac/.codex/worktrees/hr-payroll-cohort-preparation-20261012`.
Recovery branch: `codex/hr-payroll-release-test-budget-20261012`.
Base: `cdefae5ba85781f73604923663fa6d1c0926dde3` (merged payroll preparation).
Purpose: fix the test-harness blocker before a new release attempt; no runtime or business changes.

## Evidence and diagnosis

- Release validation calls `pnpm test:unit`, which runs API units and then `pnpm test:unit:web`; the Web sequence invokes `NODE_ENV=test vitest run --config vitest.config.ts` with all interaction files. Ordinary CI invokes the same root unit command.
- Deployment run 38193834266 attempt 1: performance result export's 101-review/202-dimension case exceeded the whole-test 5000ms timeout; 145 other files and 1164 other tests passed. Interaction suite duration 112.14s.
- Attempt 2: that performance file passed; training ledger status-reset/full-101-record-export case instead exceeded the whole-test 5000ms timeout. Again 145 files and 1164 tests passed; duration 110.98s.
- Both tests and vitest configuration are unchanged from deployed base `ad8e57934f3257926834f333a93c38db3b99ce74` to the merged feature SHA. Tests use synthetic mocked APIs, bounded arrays and complete pagination/assertions, with no real network dependency or explicit sleep.
- Existing `test/interaction/setup.ts` already permits each CI asynchronous assertion 5000ms. Vitest's prior default also allows only 5000ms for the entire multi-stage test. This makes the outer budget compete with valid assertion budgets and preceding rendering/user operations.
- Variable whole-test budget sensitivity is supported by the alternating failures and passing rerun. CPU/resource exhaustion is not established: no CPU/scheduler telemetry was captured. This change is not evidence of product latency or production acceptance.

## Narrow correction

Set only `test.testTimeout` in `apps/web/vitest.config.ts` to `process.env.CI === "true" ? 15000 : 5000`. The CI outer deadline is finite and three times the existing per-assertion budget; this accommodates multiple stages without claiming arbitrary workflows must fit.

Local whole-test budget remains 5000ms. Existing CI async assertion timeout remains 5000ms, local Testing Library default remains unchanged, and hook timeout remains the Vitest default. Keep every test, case, assertion, pagination record, worker setting and release gate. No retries, workflow edits, production changes or test skip additions.

## Verification

- `CI=true pnpm --filter @jinhu/web test:unit:interaction`: PASS, 146 files / 1165 tests, no failures or skips reported, 42.55s wall duration. Performance export 4/4 in 600ms; training export 5/5 in 862ms.
- `pnpm --filter @jinhu/web exec eslint vitest.config.ts`: PASS.
- `pnpm --filter @jinhu/web typecheck`: PASS (includes vitest.config.ts), session 32981 exit 0.
- `git diff --check`: PASS.
- Raw local logs retained outside repository in the task artifact directory as `release-budget-full-interaction.log` and `release-budget-typecheck.log`.
- Production build/browser/API/PG not repeated for this test-config-only correction; runtime sources are unchanged. Hosted CI and deployment validation remain parent-owned gates.

## Limits

A local CI=true run validates the entire configured suite and CI branch of configuration; it does not reproduce hosted runner scheduling or prove the next deployment. Remote CI and the new release still must pass. No third blind retry of the failed run; no PostgreSQL rerun because database code is unchanged. Reviewer does not commit/push/deploy.

Checkpoint: review complete; no active run or code blocker; next action is parent review/commit/new CI and new deployment. Cost: one full interaction run, one config lint, one Web typecheck, no subagents; account usage unavailable.
