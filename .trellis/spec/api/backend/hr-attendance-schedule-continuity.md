# Editable employee-day schedules

## Scope and signatures

GET /hr/attendance/schedules uses HrEmployeeScheduleQueryDto with exact UUID employee_id and strict calendar work_date. PUT /hr/attendance/schedules/:id uses shiftId, integer expectedVersion>=1 and trimmed nonblank reason<=500. Both require exact HR_ATTENDANCE_OPERATE and matching principal tenant/park before querying; reads require metadata audit. PUT keeps the existing idempotency interceptor and body-free audit. No new permission or schema.

## Binding and result continuity

Read returns null for no binding, otherwise only id/employeeId/workDate/shiftId/shiftName/startLocal/endLocal/version/requiresRecalculation. GET never exposes source traces. Create now also returns that projection plus its existing source. Preserve record ID, employee, date and source; changes lock the employee and schedule, compare version, require an enabled scoped shift and persist reason plus transaction-required audit. Failed audit rolls back row and period state. Same-shift no-op preserves version; a stale version conflicts.

Every new daily result snapshots scheduleVersion. New/changed bindings require recalculation until the latest result has that exact schedule ID/version. Version1 legacy results without scheduleVersion remain compatible; edited versions cannot use that fallback. Monthly aggregation rejects absent or stale current-version daily facts, retaining prior daily/summary/input rows.

## Month ordering

Normal service writes take one transaction advisory lock on JSON scope+month before period/employee/schedule locks. Period creation, both calculation phases and failure recovery, close and correction use the same order. Schedule creation/adjustment and daily recalculation reject calculating and atomically change review to open, retaining activeVersion and immutable old summaries. Closed periods retain existing input; correction still requires HR_ATTENDANCE_CORRECT and a fresh current-version day. This is an API/service contract, not a claim that arbitrary SQL obeys these gates.

## Verification

Actual disposable PostgreSQL fixture (HR_ATTENDANCE_SCHEDULE_PG_REQUIRED=1, loopback55495/schedule_gate) covers create/read/CAS, stale month refusal/recovery, frozen closed input plus correction, scoped/disabled references, required read/write audit failure, concurrent CAS and both month race orders with actual PG lock waiters. Reuse existing calculation and close suites in the same exclusively owned migrated fixture, sequentially. Run real ValidationPipe and route authority checks; no production test writes.
