# Lifecycle employee selection review

2026-10-08, workspace `/tmp/jinhu-hr-payroll-ledger-continuity-20261008`, branch `codex/hr-lifecycle-employee-search-20261008`, base `aec767ba398563689fe253fdb248cba1793a188d` plus task changes. Reviewed the PRD/design/implementation, shared selector, contract wrapper, lifecycle effects/forms and actual interaction tests.

## Findings fixed

Production fixes are confined to `apps/web/app/hr/lifecycle/HrLifecycleClient.tsx`:

1. The context key omitted employee navigation identity. Changing the employee navigation prop kept the old selected employee, events, form fields and task detail alive. Include `employeeId` alongside the full authenticated user in the context key. A regression proves reset and pending event cancellation.
2. Checklist page cleanup aborted independent pending template, assignee and selected-employee event requests without restarting their effects. Keep list cleanup scoped to list/detail reads; template and assignee effects own their respective cleanup, and event requests are canceled on employee replacement or context unmount. A regression pauses all three reads, changes checklist page, then proves the same requests can populate their intended controls without replacement calls.
3. Clearing a pending task detail nulled the controller without clearing `detailLoading`; its eventual completion could no longer remove the spinner. Clear the loading state together with the detail, with a paging/late-response regression.
4. The task-detail card list still had only `ds-mobile-record-list`, whose global desktop default is `display:none`. Apply the existing route-owned grid class to task details as well as checklist records. No new visual tokens or CSS rules added. Parent notified to recheck actual desktop detail and phone rendering.
5. After splitting independent assignee loading, the visible Retry control only reloaded checklists, and Refresh no longer retried assignees. Introduce a reusable independently cancelable `loadUsers`, and invoke template/assignee loaders on Retry and Refresh. A regression proves a failed assignee read recovers and its option appears in the actual task detail.

Added four meaningful regression cases in `apps/web/test/interaction/hr-lifecycle-employee-selection.test.tsx` (lifecycle tests now 11). The first three failed against the pre-review source; the fourth separately reproduced the missing retry. Reviewer did not modify shared selector, contract wrapper or CSS source.

## Verification

- Pre-fix reproduction: `/tmp/hr-lifecycle-employee-review-reproduction.log`, 3 failed / 7 passed; precise failures were navigation abort, independent request cancellation and lingering detail loading.
- Retry reproduction: `/tmp/hr-lifecycle-employee-review-retry-reproduction.log`, expected second directory request but observed one.
- Final interaction gate: **47/47**, seven files (existing contract group 36 plus lifecycle 11). Log `/tmp/hr-lifecycle-employee-review-tests.log`.
- Actual candidate-source and test-fixture typecheck: **pass**, `node_modules/.bin/tsc --noEmit -p /tmp/hr-lifecycle-employee-web-tsconfig.json`. Log `/tmp/hr-lifecycle-employee-review-types.log`. The temporary config resolves this candidate's shared source and installed test runtime, avoiding stale linked built declarations.
- Scoped ESLint: **pass**, `pnpm --filter @jinhu/web exec eslint app/hr/components/HrEmployeeSelection.tsx app/hr/contracts/ContractEmployeeSelection.tsx app/hr/lifecycle/HrLifecycleClient.tsx test/interaction/hr-lifecycle-employee-selection.test.tsx`. Log `/tmp/hr-lifecycle-employee-review-lint.log`.
- `git diff --check`: **pass**.

Interaction command, from `apps/web`:

```sh
TEST_NODE_MODULES_DIR=/tmp/hr-profile-test-runtime-20261007/node_modules node /tmp/hr-profile-test-runtime-20261007/node_modules/vitest/vitest.mjs run --config /tmp/hr-payroll-export-vitest-20261008.mjs test/interaction/hr-lifecycle-employee-selection.test.tsx test/interaction/hr-contract-employee-selection.test.tsx test/interaction/hr-contract-review-information.test.tsx test/interaction/hr-contract-agreement-fields.test.tsx test/interaction/hr-contract-change-facts.test.tsx test/interaction/hr-contract-field-carriage.test.tsx test/interaction/hr-contract-reminder-paging.test.tsx
```

## Reviewed SHA-256

- `components/HrEmployeeSelection.tsx`: `8c7669e1c3e80e83006890738231df921de41c2c01f99f26de3f68f1bef8133d`
- `components/hr-employee-selection.module.css`: `15c723a2bd2ea4edec93a031787f592cc038767336c1f9c2759e30d45bf15369`
- `contracts/ContractEmployeeSelection.tsx`: `aa159e8c688bd4b835639da9ace4116839898369e88f5800930f894662610b98`
- `contracts/contracts.module.css`: `e2cb1e8cd550bd340d64df9f54cc62c49f5028cfd0b75bc7d8c21ed29e48315c`
- `lifecycle/HrLifecycleClient.tsx`: `7c6d62b60aa49dcd224a46e15f3aad837bfd262f902d27d7f1d2dbf4dd1ece7b`
- `lifecycle/lifecycle.module.css`: `c5b4d1204a31ef1beb2014be46f34e93c6e261751212f43ead2703bc19dbd71f`
- `test/interaction/hr-lifecycle-employee-selection.test.tsx`: `84e48457fd210d83efb2a852daca594a4e1badd1baa3951800b41bc2faacacc8`

## Remaining boundaries

No unresolved source defect identified within this scope. Parent owns spec/doc synchronization and the actual post-fix desktop/390px browser gate; suggested spec additions are independent request cleanup/retry and desktop task-detail cards. Full build/CI and real-role production acceptance remain separate gates. No API/auth/database/source-recipe changes, production writes, commits or pushes performed. No active reviewer run remains. Overall S0-S7/independent HR modernization remains incomplete.
