# Implementation report

## Delivered scope

- Added the explicit `gross_reduction` payroll role. A definition containing this role uses frozen calculation version `jinhu-formal-payroll-v2`; otherwise existing v1 evidence and result JSON shape remain unchanged.
- V2 computes gross as earnings less gross reductions. Post-gross deductions, personal tax, net amount, and the persisted run `deduction_total` contract remain separate.
- The formal-run evidence, create result, detail projection, payroll item ledger, and run-details UI carry `grossReductionAmount` only for V2. Signed reversals are preserved as signed strings through frozen evidence and detail reads.
- Source-formula preparation binds bracket references only to exactly one selected enabled decimal source version by its exact code, legacy name, or display name. It retains HR references, rejects missing/ambiguous references, and allows an operator to correct the selection and retry.
- Added the role to rule authoring, CSV labels and help text, run detail labels, and source preparation choices.

## Validation

Passed:

- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/api lint -- src/modules/hr/hr-payroll-formal-calculation.ts src/modules/hr/hr-payroll-formal-calculation.spec.ts src/modules/hr/hr-payroll-formal-run.service.ts src/modules/hr/hr-payroll-formal-rule.pg.spec.ts`
- `pnpm --filter @jinhu/web lint -- app/hr/payroll/PayrollRuleSourcePreparation.tsx app/hr/payroll/PayrollRuleChoiceCsv.tsx app/hr/payroll/PayrollRuleMaintenance.tsx app/hr/payroll/PayrollRunOperations.tsx app/hr/payroll/payroll-rule-choice-csv.ts app/hr/payroll/payroll-source-formula-binding.ts test/interaction/hr-payroll-source-preparation.test.tsx test/interaction/hr-payroll-rule-choice-workspace.test.tsx test/interaction/payroll-rule-choice-fixture.ts`
- `pnpm --filter @jinhu/api exec node --test --test-concurrency=1 --require ts-node/register src/modules/hr/hr-payroll-formal-calculation.spec.ts` — 9/9
- `HR_PAYROLL_FORMAL_RULE_PG_REQUIRED=1 POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15490 pnpm --filter @jinhu/api exec node --test --test-concurrency=1 --require ts-node/register src/modules/hr/hr-payroll-formal-rule.pg.spec.ts` — 1/1 real PostgreSQL fixture
- `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-payroll-source-preparation.test.tsx test/interaction/hr-payroll-rule-choice-workspace.test.tsx --pool=threads --maxWorkers=1` — 43/43
- `pnpm --filter @jinhu/web test:unit:hr` — 261/261
- `git diff --check`

The PostgreSQL fixture used disposable Docker container `jinhu-payroll-gross-reduction-pg-20261019` on `127.0.0.1:15490`; it was launched with `--rm` and has been stopped and removed. It exercises V2 approved rule/input/run/detail/review/confirm/frozen-write rejection and required-audit rollback, including a +10 and -20 gross-reduction pair whose frozen aggregate is `-10.00`.

## Failure receipts resolved before final checks

- Initial PG run exposed a historical global run-page count that did not include the newly added V2 run. The fixture now asserts the correct four-run page counts.
- A frozen-item assertion assumed one payslip; the V2 signed-reversal fixture creates two and now targets one bounded payslip row.
- Existing CSV workspace fixtures used unselected `[BASE]` references. They now use their explicitly selected legacy alias and assert the resulting exact item code, retaining the strict product contract.

## Boundaries

- No migration, commit, push, deployment, production calculation, approval, input confirmation, or payment operation was performed.
- Private historical source rows were not read or added to source/tests/logs. Browser acceptance is owned separately by the root task.
