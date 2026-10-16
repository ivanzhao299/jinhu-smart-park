# Reviewer record

## Fixed findings

- `HrPerformanceLegacyPanel` invalidated an in-flight rubric request without clearing `rubricLoading`. Its stale `finally` is intentionally fenced by the generation, which left the manual action disabled indefinitely after a template/type/page/filter change. `clearRubric` now aborts, releases the local request reference, clears the loading state, result, selected source and error.
- Page navigation and applying a results/master batch filter now invalidate the selected rubric. The keyed outer panel already handles account/tenant/park replacement through unmount cleanup.
- A template-row action now writes the exact captured integer, including `0`, back to the manual assessment field and keeps the selected name/number visible while loading or failed. Retrying the same target through the manual button retains that source context. Missing source identifiers render no row action and cannot fall back to `0`.
- Editing the manual assessment identifier now cancels an in-flight row request and clears its selected context before validation. The control is editable while a request is pending, so leaving the old target/request active would otherwise let an invalid replacement continue to display stale rubric data.
- Remaining ordinary UI language now uses `绩效资料`, `考核批次`, and `尚未关联`; raw source values and IDs, readonly treatment, sensitive pay gating, and API field names remain unchanged.
- `hr-performance-legacy.contract.spec.ts` contained assertions for the intentionally removed technical copy. Its source-contract checks now assert the business rubric labels and the exact `Number.isSafeInteger(sourceAssessment)` guard instead.
- The legacy panel's local tabs and shared DS actions measured 40px/42px at phone width. The scoped CSS now gives tabs and only this panel's filter, pager, and record actions a 44px minimum. The DS selector is explicitly global inside the local containers, so CSS Modules does not hash it away; `nowrap` preserves the already verified readable action labels.

## Added actual component evidence

`apps/web/test/interaction/hr-performance-record-rubric-entry.test.tsx` renders the actual panel and verifies: row-to-rubric capture for `0`; no definition/rubric request without definition read; quick row switching aborts and ignores the old completion; failure preserves a current retry target; page and batch-filter changes cancel and release the control; manual invalid replacement cancels the old request and context; missing IDs do not become `0`; account/park replacement aborts old work; StrictMode replay remains usable; and payroll detail permission controls `sourcePay` visibility.

## Validation

- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-performance-record-rubric-entry.test.tsx --reporter=dot` — 1 file, 10 tests passed.
- `pnpm --filter @jinhu/web typecheck` — passed.
- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-performance-record-rubric-entry.test.tsx test/interaction/hr-performance-template-workflow.test.tsx test/interaction/hr-performance-operation-workflow.test.tsx test/interaction/hr-performance-review-browsing.test.tsx test/interaction/hr-performance-result-export.test.tsx --reporter=dot` — 5 files, 62 tests passed.
- `pnpm --filter @jinhu/web test:unit:hr` — 261 tests passed, including the corrected legacy-performance contract assertions.
- `pnpm --filter @jinhu/web lint` — passed.
- `pnpm --filter @jinhu/web build` — passed (terminal session `3872`, exit 0). Existing unrelated CSS/autoprefixer/cache warnings and an unrelated `lib/canteen-peripherals.ts` unused-disable warning remained warnings only.
- After the touch-target correction: `pnpm --filter @jinhu/web test:unit:hr` — 261 tests passed; `pnpm --filter @jinhu/web lint`, `pnpm --filter @jinhu/web typecheck`, `git diff --check`, and `pnpm --filter @jinhu/web build` — passed (terminal session `19224`, exit 0).
- `git diff --check` — passed.

No backend, data, permission, legacy-calculation, migration, production or release change was made. Root owns the final actual desktop/390 browser verification against this final build.
