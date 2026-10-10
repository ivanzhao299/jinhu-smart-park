# 社保期间按月状态检索与完整台账导出

## Goal
Enable HR to locate and reconcile actual modern insurance payroll inputs by exact month, confirmation/close state and current/history revision instead of manually paging every month. Existing production observed zero modern closed inputs; this feature enables operation, does not manufacture inputs or prove payroll readiness. Preserve historical facts and authoritative access.

## Acceptance
- Existing GET owned-periods accepts optional explicit YYYY-MM, status confirmed/closed, revision current/history (empty means all), plus employee keyword/page/page_size. Validate malformed months/enums; no default latest month.
- Count and data use identical scope/filter semantics. Current means no higher revision in the same tenant/park/employee/month, independently of status filter. Historical latest-closed must not be mistaken for current when a newer confirmed correction exists.
- Preserve existing sensitive read authority/audit and old list calls; no employee-option/policy-query widening, no new permission, migration, mutation or import.
- Actual modern periods UI submits all filters together, resets paging/detail/editor on explicit filter change, aborts stale requests, retains clear read/write feedback. Existing preview/confirm/close/correct operations unchanged.
- Complete filtered CSV with existing ScopedLedgerExport/collectScopedExport, same100-row pages/5000 limit/first-page drift check/cancellation, exact decimal strings and formula-safe UTF8. Explicit allowlist only: employee code/name, month, revision,status,current/history, fund inclusion and six contribution bases plus four exact component totals. No IDs/hash/request/source/reason/extra fields. Invalid/missing financial projection fails export rather than zero/partial output.
- Export disabled during writes, loading, unsubmitted filter edits; captured filter/auth context applies to every page. This is a live paged ledger, not atomic snapshot or statutory report equivalence.
- Relevant API validation/service tests, real isolated PostgreSQL scope/month/status/current semantics, meaningful UI/export tests and desktop/390 browser acceptance. No production test writes; independent real role/rules/month UAT remains pending.

## Out of scope
Bulk creation, automatic rule choices, actual production confirmation/close/payment, re-import, independent HR deployment or overall legacy parity credit.
