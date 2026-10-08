# Contract employee search review

2026-10-08. Workspace `/tmp/jinhu-hr-payroll-ledger-continuity-20261008`; branch `codex/hr-contract-employee-search-20261008`; base `aad7fe7f597933ecf94df48c7dfd77b3667e0249` plus current task changes.

## Findings fixed

- Strengthened `apps/web/test/interaction/hr-contract-employee-selection.test.tsx` with four missing acceptance cases: actual edit retains and submits the existing employee when directory permission is absent or directory loading fails, independent contract types remain available, and actual permission/park context changes cancel pending employee reads and discard late responses before reopening a clean form.
- No production TSX/CSS defect found. The reviewer did not modify `HrContractsClient.tsx`, `ContractEmployeeSelection.tsx` or `contracts.module.css`.

## Verified behavior

- Employee directory requests occur only while a contract form is mounted and request 20 rows from the existing scoped API. Search is server-side, Enter does not submit the enclosing contract form, and paging/search never chooses an employee automatically.
- Explicitly selected/current employees survive page replacement and read failures. Only preboarding, probation and active candidates can become a new selection; existing contract bindings can remain without directory authority.
- The full authenticated context key unmounts the selector on permission/account/park changes. Request replacement and unmount abort the pending signal, and late completions fail the request identity check.
- Create/edit payloads retain the deliberate/current employee ID. Existing contract types load independently. No new API authority, database behavior or source recipe was introduced.

## Verification

- Interaction tests: **36/36**, six files, including 12 employee-selection tests. Command from `apps/web`: `TEST_NODE_MODULES_DIR=/tmp/hr-profile-test-runtime-20261007/node_modules node /tmp/hr-profile-test-runtime-20261007/node_modules/vitest/vitest.mjs run --config /tmp/hr-payroll-export-vitest-20261008.mjs test/interaction/hr-contract-employee-selection.test.tsx test/interaction/hr-contract-review-information.test.tsx test/interaction/hr-contract-agreement-fields.test.tsx test/interaction/hr-contract-change-facts.test.tsx test/interaction/hr-contract-field-carriage.test.tsx test/interaction/hr-contract-reminder-paging.test.tsx`. Log `/tmp/hr-contract-employee-review-tests.log`.
- Actual-source typecheck: **pass**, `node_modules/.bin/tsc --noEmit -p /tmp/hr-contract-employee-web-tsconfig.json`; log `/tmp/hr-contract-employee-review-types.log`. This temporary configuration checks the two production TSX files against this candidate's actual shared source, avoiding stale built exports through reused dependencies.
- Scoped ESLint: **pass**, `pnpm --filter @jinhu/web exec eslint app/hr/contracts/HrContractsClient.tsx app/hr/contracts/ContractEmployeeSelection.tsx test/interaction/hr-contract-employee-selection.test.tsx`; log `/tmp/hr-contract-employee-review-lint.log`.
- `git diff --check`: **pass**.
- Actual browser desktop/390px inspection is owned by the parent and is not claimed by this review. Full CI/build and real-role business acceptance remain separate gates.

## Reviewed SHA-256

- `HrContractsClient.tsx`: `78e8d655c5d794e13cb98bbda3f62ff7362e86d288d783f3d9dc53aa8cd94ae9`
- `ContractEmployeeSelection.tsx`: `5faceba709acfeb50a82a169e336535e0ef4b38653edc59941b04520dbf71381`
- `contracts.module.css`: `eb179512f4cb844b94e9ca028ceb273efe991652d50e0573a0fa9d1e841d40b9`
- `hr-contract-employee-selection.test.tsx`: `3161de97fab4f2d9e588d07ffb8f032f4fb1555daba8f338b09ea9278774eba1`

No API/DB/source-recipe/auth changes, production data writes, commits or pushes performed. No active reviewer run remains. Overall S0-S7 and independent HR modernization remain incomplete.
