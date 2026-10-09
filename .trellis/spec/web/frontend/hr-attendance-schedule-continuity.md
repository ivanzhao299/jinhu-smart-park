# Employee-day schedule editor

AttendanceScheduleEditor is mounted by exact employee/date inside the attendance operation gate, with the full authenticated parent key. It owns read, ready/error, current binding/version, selected shift, adjustment reason and save state. A failed GET must not enable blind create. Changing employee/date aborts old reads and remounts the editor; old save completions cannot publish into the replacement.

Show the saved shift and whether day recalculation is required. Existing binding uses PUT and exact expectedVersion, not duplicate POST. Only enabled shifts are new candidates; keep an unavailable current binding visible without authorizing it. Failed saves and conflicts retain draft; explicit reread replaces baseline. Reuse one idempotency key for an unchanged payload retry. Lock pending clicks synchronously and disable target fields; clear reason only after success.

Create and update return the committed projection, so no follow-up read can turn successful creation into a failed write. Refresh day/period ledgers with the latest callback and preserve committed-success feedback on refresh failure. Display review-recalculation and closed-period correction guidance without altering payroll authority. Use shared DS fields/buttons, wrapping action rows and stacked mobile layout.

Test actual editor and actual parent integration, GET cancellation/errors, create vs update, CAS conflict/retry, repeated clicks, key stability, late save/context change, latest refresh ownership and transport fields/signals. Desktop and390px browser inspection uses actual compiled components with synthetic transport; it is not production real-role acceptance.
