# Independent Trellis review

Workspace: `/tmp/jinhu-hr-payroll-ledger-continuity-20261008`
Branch: `codex/hr-prepared-profile-import-command-20261008`
Base: `2e45ce2152e93eef7b62410826a7322ee39144e1`

## Findings (fixed)

- File: `scripts/hr-cutover/import-yuzhou-prepared-profile.mjs`
  - Issue: A conserved terminal `conflicted` response was rejected as `RESULT_POLICY_INVALID`, so modern-edit conflicts could never be recovered into the receipt or inspected through status.
  - Fix: Accept bound, conserved conflict results for baseline and alias operations while retaining the baseline zero-applied rule. Persist the original terminal status/counts, return the redacted summary, and exit with code 2 for a conflicted standalone CLI invocation. Terminal replay performs no further commit POST; predecessor conflict still blocks the next package.
- File: `scripts/hr-cutover/import-yuzhou-prepared-profile.mjs`
  - Issue: A lost commit response persisted uncertainty but did not immediately query the original operation as required by the PRD.
  - Fix: Persist `commit-uncertain`, make exactly one original-ID GET and accept only an ID/hash/count-bound terminal result. A previewed response, unreadable response or mismatched response leaves uncertainty and the original commit key intact. Never automatically repeat the POST.
- File: `scripts/hr-cutover/tests/prepared-profile-import-command.test.mjs`
  - Issue: The fixtures covered manual recovery only and did not exercise legitimate terminal conflicts.
  - Fix: Cover immediate terminal recovery, previewed recovery requiring status before a later explicit same-key commit, unavailable GET preserving the entire receipt, baseline/alias conflicts with normal/lost responses, original terminal replay, next-package blocking, redacted JSON and CLI exit code 2. Existing foreign-ID/hash/count protection remains covered.

## Findings (not fixed)

No remaining blocking issue found within the assigned review scope. Real production login and import were not executed by this review; local fixtures do not prove production completion.

## Verification

- Tests: PASS, `node --test scripts/hr-cutover/tests/prepared-profile-import-command.test.mjs`, 14/14 after fixes.
- Lint: PASS, `pnpm exec eslint scripts/hr-cutover/import-yuzhou-prepared-profile.mjs scripts/hr-cutover/tests/prepared-profile-import-command.test.mjs --global process --global fetch --global AbortSignal --global URL --global Buffer`.
- Lint: PASS, `pnpm --filter @jinhu/api exec eslint src/modules/hr/hr-yuzhou-incremental-import.service.ts`.
- Syntax: PASS, `node --check` for both changed MJS files.
- Whitespace: PASS, `git diff --check`.
- TypeCheck: PASS reported by parent on the unchanged API candidate; intentionally not duplicated. Reviewer changed only MJS files and this report.
- PostgreSQL: PASS reported by parent for the actual incremental fixture, including same-operation replay/recomputed modern conflict, with isolated database residual zero and owned container cleanup. API service remained unchanged during this review, so the result is reusable.

Actual route/service review confirmed normal LoginDto camelCase request fields and users/me snake_case scope fields; management permission authorizes profile status as well as preview/commit. Prepared catalog checks current predecessor status, and the server enforces all earlier package commits with zero conflicts. Existing previewed replay uses the package advisory lock and operation row lock, invokes the existing plan-only path, and preserves terminal results. No auth infrastructure, migration, frozen recipe, source adapter or production mutation was added by the review.

Parent owns documentation/spec/CI synchronization and release. CLI implementation and HTTP test files are frozen after this report; no commit or push was performed by the reviewer.
