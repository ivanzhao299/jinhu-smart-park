# 工资考勤来源缺员明细

## Goal
Let authorized HR identify exactly which employees in a confirmed formal payroll input lack records in an explicitly selected same-month closed/effective attendance batch. Existing source options show only missingEmployeeCount and the page disables incomplete candidates, preventing HR from inspecting the missing roster. Preserve source authority, salary rules and creation guards.

## Acceptance
- Extend existing formal run options query with optional explicit attendanceInputBatchId; validate UUID and unchanged permission-first behavior. Empty means no selected attendance, never automatically choose latest.
- Validate provided batch against same scoped period closed/effective candidates, including incomplete batches. Reject foreign scope/month/deleted/ineffective candidates. Reuse exact existing item coverage predicate and confirmed input roster. No new permission, migration or monetary projection.
- Return selected batch identity and paged per-employee attendanceCovered true/false; null/absent means not checked, never missing/zero. Preserve original full-roster missing counts, insurance choices and old clients without new query.
- Actual run creation page allows inspecting incomplete attendance candidates and displays their missing-count warning and per-person covered/missing status. Existing create guard still rejects incomplete selected attendance; inspecting a candidate never enables calculation. Preserve explicit insurance selection and original create/idempotency semantics.
- Reuse source pagination for combined attendance/insurance roster, show attendance-only rules too; selected input/period/identity changes cancel stale source reads and clear unrelated statuses. Page changes preserve selected batch. Data shown must bind to current selected batch, not an earlier response. Mobile-first shared DS controls.
- Query is read-only apart from existing required read audit, which remains same-transaction and fails closed. No wages, attendance amounts, source snapshots or new raw error exposure.
- Focused DTO/transport/service/UI regression tests; one real isolated PostgreSQL case with actual same-month partial/complete attendance, foreign scope/month/ineffective exclusion and per-page coverage. Actual component desktop and390px acceptance. No production HR business test writes or real payroll calculation/payment.

## Boundaries
This is authoritative source-presence visibility, not formula/rule/month approval, attendance correctness, full source readiness, real-role UAT or full legacy-report equivalence. Wu Enguo confirms latest complete actual payroll scope/rules; other modules continue. Historical import/quarantine remain closed.
