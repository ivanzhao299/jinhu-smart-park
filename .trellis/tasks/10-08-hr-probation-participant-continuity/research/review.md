# Probation participant continuity review

2026-10-08. Workspace `/tmp/jinhu-hr-payroll-ledger-continuity-20261008`, branch `codex/hr-probation-participant-continuity-20261008`, base `6d74b9d16e022fb70aff9f828850f15b69ecd4b4` plus task changes.

## Findings fixed

1. `apps/web/app/hr/lifecycle/JobChangeApplicationsPanel.tsx`: changing the target organization retained an uncontrolled original position option, including a fallback from a different organization. Reproduced the actual selector retaining `original-position` after selecting `other-org`. The position is now controlled, cleared on organization changes, restored only when returning to the original organization, and checked against the selected organization's options or the exact retained original organization/position pair before save. Submitted employee/organization/position IDs come from the controlled state. Existing authorized bindings remain usable when options fail.
2. `JobChangeApplicationsPanel.tsx` and `ProbationApplicationsPanel.tsx`: React form actions resolved after catching rejected writes, so React reset uncontrolled edited names/dates/reasons to initial values even while showing the server error. Reproduced both actual forms reverting their edited names on rejection. Use ordinary prevented `onSubmit`, preserve native validity, and explicitly reset only after successful API writes. Failed writes retain the complete draft and participants for correction.
3. Added five acceptance regressions across the two new interaction files: exact original job employee/organization/position writer payload under options failure; coupled organization/position change-and-return; job-change failed-save draft retention; probation native validity with an empty unadded candidate plus complete failed-save draft retention; and preserved application ID/full participant payload across application pagination. Three tests failed before source fixes; two independently strengthened already-correct behavior. Isolated success mocks between tests to avoid leaking a rejected-write fixture.

4. Parent browser evidence showed non-primary actions rendering as native gray buttons and the Add button stretching alongside two participant rows. Both panels now explicitly use `ds-button-secondary` for non-primary actions. Route-only lifecycle CSS makes the participant list and Add control span the grid, keeps Add content-width/start-aligned with minimum 44px height on desktop, and full-width on mobile. No global CSS change.

Reviewer production edits are limited to the two lifecycle panels and route-owned lifecycle CSS. No reviewer edits to shared selector, contract wrapper or existing probation-date fixture.

## Semantic checks

- Read the actual API update path: probation updates delete pending participant rows then insert the complete supplied participant array. The frontend now seeds from the authorized application's full `participants`, retaining every employee and planned date independently of candidate pages. Explicit add/remove/date editing is the only way to change that controlled payload.
- Shared probation candidate requests retain existing directory permission and `status=probation` with 20-row pagination. The unadded picker is not required; it cannot block native submission of an already complete participant list. Contract wrapper/callback and eligible statuses remain unchanged.
- Candidate errors do not clear the application list or authorized participant seed. Context replacement aborts reads and resets editors; parent lifecycle context also includes employee navigation. Cross-page editing retains the deliberately opened application ID.
- Application pagination, retry/shrink handling, Shanghai defaults/apply gate and desktop grid follow the scoped requirements. Job-change candidate API and its existing 500-row boundary were not modified. The backend remains authoritative for employee state, organization/position validity and approval transitions.

## Verification

- Pre-fix evidence: `/tmp/hr-probation-continuity-review-reproduction.log`, **3 failed / 13 passed**. Failures exactly match the original position surviving an organization change and both rejected saves resetting edited names.
- Final interactions: **68/68**, 10 files: probation continuity 8, job-change continuity 8, existing probation date carriage 5, lifecycle 11 and complete existing contract group 36. Final visual-source log `/tmp/hr-probation-continuity-review-tests-final.log`. The first visual-source run used unrestricted file workers and reached 67/68 with the multi-page DOM test timing out at 5.247s; no assertion failed. Repeating all ten files with `--maxWorkers=2` passed 68/68 in 8.18s without changing test logic/timeouts. Original timeout evidence remains `/tmp/hr-probation-continuity-review-tests.log`.
- Actual candidate production/test-fixture typecheck: **pass**, `node_modules/.bin/tsc --noEmit -p /tmp/hr-probation-continuity-web-tsconfig.json`; log `/tmp/hr-probation-continuity-review-types.log`.
- Scoped ESLint: **pass**, covering the shared selector, contract wrapper, both changed panels, both continuity tests and existing date fixture. Log `/tmp/hr-probation-continuity-review-lint.log`.
- `git diff --check`: **pass**.

Tests ran through `TEST_NODE_MODULES_DIR=/tmp/hr-profile-test-runtime-20261007/node_modules node /tmp/hr-profile-test-runtime-20261007/node_modules/vitest/vitest.mjs run --maxWorkers=2 --config /tmp/hr-payroll-export-vitest-20261008.mjs` with the ten relevant interaction files, from `apps/web`. No dependency installation/rebuild or primary-checkout mutation.

## Final SHA-256

- `components/HrEmployeeSelection.tsx`: `060659bbab85c30ab9f76e6dbabb290edf3189215f9b61dc2aa09a448fbae1b8`
- `components/hr-employee-selection.module.css`: `15c723a2bd2ea4edec93a031787f592cc038767336c1f9c2759e30d45bf15369`
- `contracts/ContractEmployeeSelection.tsx`: `c12dad2551ab2943fe0d760aae76cda19cdece2607294e6104b3fa751d9b6ab1`
- `lifecycle/ProbationApplicationsPanel.tsx`: `6d668c178ea0e0e77380598e1232ded549cdaefea5d6706cfdc4a7612f1e6c45`
- `lifecycle/JobChangeApplicationsPanel.tsx`: `72b213a68cfa6ceeaf931eed08af78d315f31b3535a6a15510bb89088a0483a8`
- `lifecycle/lifecycle.module.css`: `d5ed473994c23d9c2630ffe3149f82916e3516f90ae9bb834f2eef58d92c5133`
- `test/interaction/hr-probation-participant-continuity.test.tsx`: `9b3b7a3fdba874bfad4b21846ccac35a8fbe269d8d8dbf30b6d5a0e9c5149b3c`
- `test/interaction/hr-job-change-operation-continuity.test.tsx`: `4dbfdc8f6ec37a8886b461cb8c723558f3398b4b1f2f7887a2052eeb5e34b434`
- `test/interaction/hr-probation-date-carriage.test.tsx`: `132e8350239d9577ec7a486f61d2e2c9546159ece27119a83c8536aaded1adce`

## Boundaries

No remaining scoped source defect identified. Parent reported actual native browser Save succeeded with an empty candidate selector and complete employee-1/employee-101 payload before the visual refinement. Parent owns final desktop/390px recheck after rebuilding these final visual bytes, and has synchronized the specs. Reviewer inspected the pre-refinement desktop screenshot to confirm the button/grid issues. Synthetic/local gates do not establish production role acceptance. No API/auth/database/source-recipe changes, production data writes, commits or pushes. All reviewer processes completed. Overall S0-S7/independent HR goal remains incomplete.

## CI contract synchronization

CI 37713239482 passed HR PostgreSQL, lint and typecheck, but the sole Web HR contract failure still required the removed UTC `today()` call. Updated only `hr-job-change.contract.spec.ts` to require `row.effectiveDate>businessDate()`; its focused Node test passed 1/1. Existing actual Shanghai boundary interactions remain intact. Production source and browser-tested bytes unchanged, so the 68 actual interaction results remain valid. Retain failed CI evidence and rerun full required CI on the new candidate.
