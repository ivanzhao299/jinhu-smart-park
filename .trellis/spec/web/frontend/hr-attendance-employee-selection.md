# Attendance operation employee selection

- Attendance schedules, manual punch events and daily recalculation share an explicit employee selection. Never load only the first 100 employees or implicitly select the first candidate.
- Use `/hr/attendance/employee-options` with existing attendance operation permission, server keyword search and 20-row pagination. General employee directory permission is not required to choose an operation target.
- Keep a deliberately selected employee visible across search/page changes. Changing candidate results must not silently change the target. Schedule, punch and recalculation buttons require a selected ID.
- Abort replaced/unmounted requests and discard late responses. Key the attendance view by the full authenticated user context so scope/account changes reset selected employee, operation inputs and retained rows.
- Use shared DS controls, wrapping candidate pagination, 44px buttons and mobile stacked fields; verify desktop and390px rendering without overflow.
- Attendance business date and month defaults use the shared `businessDate` Shanghai calendar utility, including UTC-day/month boundary tests.
- Tests: actual selection/page interaction, page6 employee101, search with retained selection, request cancellation/error, denied/module-disabled access, actual page target propagation and scope reset. Local synthetic transport does not prove production business acceptance.
