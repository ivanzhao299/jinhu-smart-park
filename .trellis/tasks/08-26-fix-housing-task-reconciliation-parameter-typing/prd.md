# Fix housing task reconciliation PostgreSQL parameter typing

## Goal

Track Issue #420: reproduce and fix PropertyTaskReconciliationScheduler PostgreSQL parameter typing failures across housing sources, then retest UAT.

## Requirements

- Reproduce Issue #420 against disposable PostgreSQL with housing billing, repair, purchase, lease, handover, and the shared `homestay_turnover` scheduler source.
- Identify the exact reconciliation query/bind that causes PostgreSQL to infer incompatible types for parameter 1.
- Preserve tenant/park scoping, runtime-control fail-closed behavior, retries, and task projection idempotency.
- Add focused real-PostgreSQL regression coverage and rerun the housing UAT gates affected by task projection.

## Acceptance Criteria

- [ ] A focused test fails on the pre-fix query with the observed PostgreSQL error.
- [ ] All five housing source types and `homestay_turnover` reconcile without parameter inference errors.
- [ ] Completed work-order status 60 remains excluded from eligibility while completed history remains queryable.
- [ ] Relevant lint, typecheck, unit/PG tests, CI, review, merge, and main Deploy are green.
- [ ] Housing UAT report is updated with fixture-scoped before/after residual evidence.

## Notes

- GitHub Issue: #420.
- Parent: `08-26-housing-full-flow-browser-uat`.
- This task remains planning; no implementation was attempted during the evidence-report PR.
