# Employee profile readonly carriage

`HrEmployeesClient` admits a profile only after its employee ID matches the selected detail and
the current request scope remains valid. Keep that admission, abort and authenticated-context
remount behavior when changing profile display.

The maintenance form is not the readonly detail. Readers without profile-manage permission
must be able to inspect every field in an authorized full API projection. The summary uses
`HrEmployeeProfileSummary`, shared `ds-mobile-record` surfaces and field groups matching the
existing form. It does not issue requests or create mutation controls.

Additional sensitive fixed and custom fields require `profile.masked === false`. A missing or
unknown flag is not full-read authorization. Preserve the existing masked summary for those
responses. Always use `idNumberMasked` in the summary, including full projection; never use
raw `idNumber` there. Display null/undefined/empty as unregistered, but preserve numeric text
including zero, decimals, unknown dictionary values and source validation warnings.

API values are React text, never injected HTML. Wrap both custom group headings and labels,
as well as long values. Keep shorter cards at their natural height. Verify the real component
with shared global CSS at desktop and 390px; synthetic layout acceptance does not prove a real
production role or source-field parity.

Required regressions: full reader without manage, masked/unknown projection, identity masking,
source text/null/zero, failed employee switch and authenticated-context reset. A 33-field form
or summary does not establish parity for all historical source columns.
