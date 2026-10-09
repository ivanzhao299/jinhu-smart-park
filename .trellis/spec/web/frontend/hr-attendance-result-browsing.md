# Attendance result browsing

## 1. Scope / Trigger

The attendance page must expose all scoped daily facts, month periods and employee month summaries. Server totals must never disappear behind a fixed first-page request.

## 2. Signatures

- `attendanceDaily(token?, page=1, pageSize=31, {from?,to?,status?}, signal?)`
- `attendancePeriods(token?, page=1, pageSize=24, status?, signal?)`
- `attendanceMonthSummaries(id, token?, page=1, pageSize=100, signal?)`
- `payrollAttendanceInputs(id, token?, signal?)` and `attendancePayrollVersions(id, token?, signal?)` share the selected detail signal.
- Existing GET endpoints return `{items,total,page,page_size}`; month summary page size is at most100. Preserve default argument compatibility.

## 3. Contracts

Daily, period and summary paging have independent state. Changing daily filters returns to page1. Range dates are inclusive and `from <= to`; do not import calendar symbols as employee daily facts.

Abort replaced/unmounted reads and check cancellation before publishing rows, totals, errors and loading. A period detail owns its summaries, payroll input, version chain and correction draft together. Selecting a different period clears prior projections and reason before fetching. Late payroll metadata must not attach to another period.

Mutation permissions and existing API state transitions remain authoritative. After a completed period action, clear its detail and refresh the period list from page1. Daily recalculation refreshes the current daily query. Scope/account changes remount the view and abort retained reads.

## 4. Validation & Error Matrix

- Invalid date range -> visible local error, no new GET.
- Read failure -> affected rows cleared, visible local error and retry; other ledgers stay independent.
- Total shrinks below current page -> reload last available page.
- Older response finishes after replacement/unmount -> ignored, including loading/error.
- Detail input/version read fails -> no payroll chain from a prior selected period.

## 5. Good / Base / Bad Cases

Good: HR pages beyond employee100 in a selected month and daily result31, retaining each ledger's identity. Base: employee self scope uses the same server-filtered API. Bad: accepting `result.items` while discarding total or publishing a late period's payroll chain.

## 6. Tests Required

Actual-page interaction: day32, period25, summary employee101, independent paging, date/status reset, cancellation, failure/retry, period switching during payroll metadata, permission/context reset and mutation refresh. Transport test asserts GET URLs/defaults/signals. Desktop and390px browser check must show later records, wrapping paging,44px controls and no horizontal overflow. Synthetic fixtures do not prove real-role production business acceptance.

Daily headings follow actual read scope: full HR, team, self. Page/filter/CSV share Chinese daily-status labels for all backend result states; unknown states remain explicit. Ordinary records show correction state, not internal calculation UUIDs.

## Scoped result exports

Daily exports retain from/to/status; selected month exports bind period ID, calendar month and active summary version. Reuse ScopedLedgerExport,100-row pages,5000-row limit and first-page drift recheck. A failure or row-version mismatch yields no partial file. This is live pagination, not an atomic snapshot or original-system report equivalence.

Use the same server HR/team/self scope and one captured token; cancel on full identity/filter/period/enabled changes and unmount. Export only business dates, punch times, attendance quantities and state; self omits employee identity. Exclude internal IDs, calculation traces, anomaly payloads, source JSON and payroll input metadata. Punch columns explicitly use Asia/Shanghai; preserve null, zero and fractional days. Reject invalid calendar dates and quantities. Shared formula-safe UTF8 CSV and44px DS buttons apply.

## 7. Wrong vs Correct

```ts
// Wrong: silently hides all remaining employees.
const response = await hrApi.attendanceMonthSummaries(id, token);
setSummaries(response.items);

// Correct: pass selected page, retain total, and reject replaced ownership.
const response = await hrApi.attendanceMonthSummaries(id, token, page, 100, controller.signal);
if (controller.signal.aborted) return;
setSummaries(response.items);
setSummaryTotal(response.total);
```

## Shift rule continuity

Expose existing late/early grace fields as integer minutes 0..240, default0, and the new-shift rule version. New shift drafts do not govern employee-day recalculation: the server resolves the saved schedule and its shift. Preserve failed drafts; after successful creation clear code/name and report a subsequent list refresh failure as committed success with refresh error. Scope changes discard operation drafts and older completions. Use the existing DS fields and responsive operation groups.
