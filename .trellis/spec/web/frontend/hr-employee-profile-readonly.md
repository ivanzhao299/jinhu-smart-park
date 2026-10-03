# Employee profile readonly carriage

`HrEmployeesClient` admits a profile only after its employee ID matches the selected detail and
the current request scope remains valid. Keep that admission, abort and authenticated-context
remount behavior when changing profile display.

The maintenance form is not the readonly detail. Display every field in an explicitly authorized
full API projection without independently requiring a mutation control. Existing API policy still
returns masked projections to ordinary profile-read permission; only existing manage/super access
returns full projections. A synthetic full response is not proof of new readonly-role authorization.
The summary uses
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

Required regressions: explicit full-response renderer fixture (not ordinary-role authorization),
ordinary read permission receiving a masked API response, masked/unknown projection, identity masking,
source text/null/zero, failed employee switch and authenticated-context reset. A 33-field form
or summary does not establish parity for all historical source columns.
