# Employee creation and employment operation continuity

Applies to `apps/web/app/hr/employees/HrEmployeesClient.tsx`.

- Creation and employment transition forms prevent native submission; explicitly reset only after a successful API write. Rejected writes preserve the entered dates, names and reasons.
- Use a synchronous mutation ref in addition to rendered busy state. Directory navigation, selection, search and manager candidate controls cannot change the target during these writes. Do not start a write while a directory read is pending.
- Capture employee identity and request scope before the write. Ignore old completions after identity changes or unmount. Always release the synchronous lock in finally.
- A completed write remains a completed operation if subsequent directory/detail refresh fails. Render saved status separately from the read error and never reopen the submitted draft as unsaved.
- Render rejected write feedback next to its own submit button. Use shared Design System controls, at least 44px touch targets, and no horizontal overflow at 390px.
- Preserve existing API payload, exact manage/transition permissions and employment state rules. This surface does not authorize arbitrary historical-field editing or change API idempotency guarantees.

Validation: actual-component interaction tests in `test/interaction/hr-employee-operation-continuity.test.tsx`, existing employee transition/direct-navigation/profile tests, HR permission contracts, Web lint/typecheck/build, and desktop/390px local synthetic API browser checks. Synthetic browser evidence does not replace production role UAT.

## Sensitive profile save continuation

### Scope and signatures
The existing complete fixed-field form in `HrEmployeesClient` uses `hrApi.updateProfile(employeeId, body, token, callerKey?)`; omitted caller keys preserve compatibility. The server remains `PUT /hr/employees/:id/profile` with existing manage permission, expectedVersion and replacement-field semantics. No new edit grant or source/new distinction is introduced.

### Attempt and receipt contract
Keep one bounded attempt containing exact employee/version/body/token/key. While a write is active or its outcome is unknown, freeze mutable profile controls and employee navigation; retry sends only that attempt. Never build a retry from current uncontrolled inputs or create a fresh key. Require a nonempty returned profile id, exact employeeId, masked=false and version=expectedVersion+1 before admitting success. Persist the actual receipt before optional independent readback; a read failure cannot clear that saved profile or turn success into failed write. Read recovery issues GET only, synchronously suppresses duplicate clicks, and never admits a version older than the currently confirmed saved profile. Context changes/unmount suppress late callbacks and clear unrelated attempts.

### Error matrix and examples
- Transport failure, malformed 2xx receipt or idempotency still-processing conflict: retain exact frozen attempt and allow retry.
- Confirmed validation/rejection: preserve inputs for correction; true version conflict requires explicit latest-version reload after operator checks/copies edits.
- Matched save receipt followed by failed read: retain saved result and display separate refresh warning.
- Good: lost-response retry uses the same body/key and receives the saved profile. Base: ordinary success admits the next version. Bad: retry generates another UUID, or failed GET destroys the already saved editor.

### Required checks
Actual employee-page interactions cover duplicate submit, lost response/exact retry, processing-409, malformed response, known rejection/conflict retention, saved-read failure/read recovery, next save uses next version/new key, all existing fields and late context/unmount callbacks. Existing full-field and imported formal profile tests remain required. Desktop and390px actual-component synthetic browser evidence is separate from production-role acceptance.
