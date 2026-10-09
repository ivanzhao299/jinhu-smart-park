# Employee creation and employment operation continuity

Applies to `apps/web/app/hr/employees/HrEmployeesClient.tsx`.

- Creation and employment transition forms prevent native submission; explicitly reset only after a successful API write. Rejected writes preserve the entered dates, names and reasons.
- Use a synchronous mutation ref in addition to rendered busy state. Directory navigation, selection, search and manager candidate controls cannot change the target during these writes. Do not start a write while a directory read is pending.
- Capture employee identity and request scope before the write. Ignore old completions after identity changes or unmount. Always release the synchronous lock in finally.
- A completed write remains a completed operation if subsequent directory/detail refresh fails. Render saved status separately from the read error and never reopen the submitted draft as unsaved.
- Render rejected write feedback next to its own submit button. Use shared Design System controls, at least 44px touch targets, and no horizontal overflow at 390px.
- Preserve existing API payload, exact manage/transition permissions and employment state rules. This surface does not authorize arbitrary historical-field editing or change API idempotency guarantees.

Validation: actual-component interaction tests in `test/interaction/hr-employee-operation-continuity.test.tsx`, existing employee transition/direct-navigation/profile tests, HR permission contracts, Web lint/typecheck/build, and desktop/390px local synthetic API browser checks. Synthetic browser evidence does not replace production role UAT.
