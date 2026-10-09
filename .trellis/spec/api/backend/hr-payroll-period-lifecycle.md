# Payroll period close and closed-period corrections

## Scope and current stage

`HrPayrollPeriodLifecycleService` and migration000351 implement the lifecycle foundation. It is not yet registered as a public controller. Public routes, shared/Web contracts, operator pages, full-schema migration/HTTP checks and production release remain required before this slice is delivered.

## State and transaction contracts

Period open→closed is irreversible. A close requires at least one confirmed nondeleted run and no pending nondeleted runs. An immutable close record binds the prior period version and actor; a deferred constraint requires record and period transition to commit together. Closed periods cannot reopen, change business dates/scope, delete or soft-delete. Existing closed periods are preserved without fabricated receipts.

A closed-period correction uses an explicit window bound to a scoped confirmed formal run, its exact version and rule set. Only one window per period is open. No active successor may already exist. Window identity and original reason are immutable. Open→completed requires its own confirmed successor result; open→cancelled requires no active result. Terminal windows cannot reopen or delete. Required audit failure rolls back each action.

Callers authorize before probes. Context metadata uses PAYROLL_READ and returns counts/window transport IDs without salary, actor or frozen evidence. Close and window completion/cancellation require PAYROLL_CONFIRM, DETAIL_READ and EMPLOYEE_READ. Opening uses PAYROLL_MANAGE plus the same detail/employee capabilities. Window and period versions protect stale requests; they do not supply HTTP replay semantics. All public mutations must use the existing idempotency interceptor when wired.

`lockPayrollPeriodContext` owns the common period-first lock and explicit-window validation. Ordinary input and run operations require an open period with no window; correction operations require a closed period and the exact open window. Inputs store correction_window_id, preserve the original rule set and full employee roster and must have revision greater than the head recorded at opening. Preparation pages only that roster. Latest input/confirmed version, employee versions, approved effective rules and explicit settlement windows remain validated. The new input DB guard retains normal input hashes and binds window identity for correction hashes. No existing stored hash is recomputed during upgrade.

Formal calculation must reference that window's original confirmed run. Options do not offer base calculation in correction context. Review and confirmation keep independent operator requirements; advisories reflect period/window actionability, and writes recheck under locks. Frozen evidence includes the period/window and original correction reference. Confirmed results remain immutable. Pending calculated/reviewing runs can be cancelled by MANAGE plus detail/employee reads; a governed immutable action and all payslip status changes share the transaction. Cancellation never changes amounts or evidence. Active-base-input and active-successor unique slots exclude cancelled runs, so retry creates a new run number and preserves cancelled history.

## Validation evidence and remaining gates

Owned loopback PostgreSQL15490 executes original233/243 and complete347–351 with synthetic employee/catalog prerequisites. It covers upgrade over existing input/run evidence and a closed period, preserved old input hash, exact correction result, roster/rule/window mismatch, close/open/calculate/cancel/complete races, stale versions, scope, required audit rollback, period/window immutability, confirmed-result preservation and cancelled-base retry. The existing broader rule/input/run PostgreSQL suite includes351 and no longer toggles a closed period back to open. Unit checks deny missing capabilities and malformed DTOs before transactions.

These are synthetic service/DB checks, not full original schema history, HTTP idempotency, production-role or actual payroll amount acceptance. Do not deploy the close foundation alone without reachable correction and recovery workflows.
