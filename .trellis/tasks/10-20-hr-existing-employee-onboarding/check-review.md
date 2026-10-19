# Full-scope check review — 2026-10-20

## Scope reviewed

- Web implementation against `prd.md`, `design.md`, `implement.md`, `source-facts.md`, and curated Web/frontend guide specifications.
- Direct preboarding-employee onboarding, existing recruitment-conversion onboarding, shared employee selection behavior, receipt matching, unknown-result retry locking, and authenticated-context remount behavior.
- No API, database, permission, production, or release configuration changes are in this task.

## Finding fixed

`HrEmployeeSelection` correctly requested `status=preboarding` and refused a non-preboarding row, but its generic disabled-option label represented every non-departed ineligible row as “停职”. For the onboarding purpose this makes an anomalous `active` response misleading. The onboarding-specific disabled label is now “非预入职”; selection remains blocked. A real recruitment-client interaction regression verifies the scoped request, disabled row, and cleared selection.

## Contract review

- Candidate source keeps the selected hired-candidate snapshot and sends its original `candidateId` with its converted `employeeId`.
- Existing-employee source uses only the shared picker with `status=preboarding`, server-side page size 20, no automatic choice, and existing employee-read permission.
- Switching sources clears both mutually exclusive selections. The keyed parent continues to reset state on identity, permission, or park-context changes.
- Direct employee creation omits `candidateId`; receipt acceptance treats missing `candidateId` as `null` only for that optional field while requiring all other submitted values, employee ID, status, and version to match. Unknown-result retry preserves the original body and idempotency key.
- The focused specification was synchronized with both entry paths and the normalization rule.

## Validation

- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-initial-onboarding.test.tsx test/interaction/hr-contract-employee-selection.test.tsx test/interaction/hr-recruitment-selection.test.tsx test/interaction/hr-recruitment-results.test.tsx test/interaction/hr-recruitment-ledger-filters.test.tsx` — 5 files, 75 tests passed.
- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-candidate-conversion.test.tsx test/interaction/hr-candidate-profile-parent.test.tsx` — 2 files, 10 tests passed.
- `pnpm --filter @jinhu/web lint` — passed.
- `pnpm --filter @jinhu/web typecheck` — passed.
- `git diff --check` — passed.

## Remaining boundaries

Browser desktop and 390px real-component checks were completed by the root agent. This review does not claim production-role acceptance, production data import, payroll handling, or any API/DDL/permission change.
