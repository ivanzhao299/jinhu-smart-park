# 工资薪酬区间覆盖核对

## Goal
Identify per-employee salary effective-range problems before formal payroll generation. Existing options expose compensation-required but no compensation diagnostics, while create resolves approved eligibility/policy and rejects incomplete or overlapping ranges. Reuse those exact rules so HR can fix current business sources without trial generation.

## Acceptance
- Extend the existing authorized formal-run options response with paged compensation range coverage and whole-confirmed-roster counts; null/absent means unchecked or unused, never missing/ready. No new endpoint/permission/migration. Preserve attendance/insurance selections and paging.
- Reuse the exact existing eligibility resolver (including explicitly approved settlement windows), compensation policy, source identity/version and date/range checks consumed by create. Extract a small pure amount-free range validator if needed and reuse it in the current projector. Preserve current exception types/messages and all exact monetary arithmetic/rounding/output. Never pass fabricated zero salaries to the projector.
- Query scoped active nondeleted salary assignments and nondeleted plans with the same overlap predicates as the actual consumer, in one bounded batch. Metadata dates/identity/version/currency only; no salary amounts or raw snapshot in options. Unsupported currency must be diagnosed honestly, not converted or assumed CNY.
- Expose truthful categories for covered, missing/incomplete, overlap, incompatible approved policy, invalid source metadata/unsupported currency where applicable. Date-only coverage does not prove amount validity, full calculation readiness or business approval. Catch only expected domain validation outcomes, never swallow DB/audit errors.
- Whole-roster counts remain independent of pages (23 people, employee21 issue on page2). Options read audit remains required and same-transaction. Missing permission rejects before probes; unused compensation does not query salary sources.
- Actual PayrollRunCreation shows salary-range status/counts and employee diagnostic plus a route to existing compensation maintenance. Salary-only rules show source roster. Current input/version/batch identity must bind responses; abort stale requests. Shared DS and390px baseline. Do not remove existing create guards; create always revalidates actual sources.
- Focused pure validator/projector regression proves unchanged amounts and error behavior, API permission/transport/UI tests and one true full-original-schema isolated PostgreSQL service case. Include gap/contiguous/range-policy/foreign scope/deleted sources within actual DB constraints; do not disable constraints to fabricate invalid rows. Actual component desktop/390px validation.
- No production HR test writes, grants, password resets, real payroll calculation/payment, historical reimport or unrelated auth work.

## Limits
Coverage means salary source date/policy eligibility only; no amount validity claim, real-role UAT, latest complete payroll approval, Windows/GroupWeb equivalence, cutover or independent-product completion. Wu Enguo owns latest complete actual data/rules and calculate-only reconciliation; other work continues.
