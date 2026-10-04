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

The legacy archive labels `person.oldaddr` as 原玉舟籍贯 and `person.edulevel` as
原玉舟学位 only for `yuzhou-v10` / `employee_profile` / `dbo.person.core_residue`
with the existing sensitive archive read permission. Read own properties from the
already-authorized projection; preserve scalar source text, explicit empty values,
and malformed-value warnings. Do not infer values from the modern profile or write
them back. Suppress only these exact source keys in the corresponding generic
detail. Clear the previous detail before another detail request, including failure.
The shared scene card's two-column icon layout needs a local single-column layout
for a text-only archive card; verify typography and long values at 390px.

For profile maintenance CAS, accept a positive version only from the successful, selected employee's unmasked profile response. Send zero only after that successful response is explicitly null; missing version, masked data, a mismatched employee or a failed read leaves the form unavailable. On HTTP 409 preserve uncontrolled edits, block every retry and provide an explicit “放弃本次编辑并重新加载” action. Selection, scope or authenticated-context changes clear the conflict state. Do not auto-retry, merge, overwrite or present this behavior as a new read or write permission.


## Formal profile maintenance and provenance

Current employee status and normal permission-gated maintenance remain the primary work surface for imported and new employees alike. Original employment status and archive links belong in the collapsed `资料来源与沿革` section; they do not replace the modern state or block editing. Keep archive links gated by the existing archive-read permission and source facts scoped to the already-authorized employee response.

The existing profile PUT replaces ordinary fixed fields: empty form values are omitted and the service writes them as null. Identity is the exception: omitted `idNumber` preserves encrypted/masked/fingerprint values, while an explicit empty string clears all three. The full admitted maintenance form always submits its identity control, including an empty string when the operator clears it. A failed, masked, versionless or foreign read must never create that form. Retain the global write/audit/idempotency and expectedVersion guards.

Required regression cases: imported employee remains manageable with provenance collapsed; no archive permission means no archive link; existing identity survives an unrelated edit; clear identity travels through the real form and ValidationPipe/service; every one of the 33 fixed business fields is editable and carried in the same form submission. This proves fixed modern field carriage, not all legacy-source mappings or custom-field maintenance. Desktop/390px synthetic browser inspection and production-role acceptance are recorded separately.

## Formal employee direct navigation

`/hr/employees?employee_id=<UUID>` opens the ordinary authorized employee detail. The server rejects malformed/repeated filters using the same parser as lifecycle navigation. A supplied ID changes the authenticated view key and skips directory pagination/search; it does not grant read or edit access. Both page and employee read capability are required before the frontend detail probe, and the existing API retains self/team/tenant/park checks.

Use the existing detail/optional-section admission and abort/generation protection. A foreign detail or scope denial must not publish a target. Target/auth context changes clear previous data. Keep a return-to-directory link and refresh the exact target after a lifecycle action rather than requiring it in the first list page. Private exception materials can link here, but real employee IDs remain outside public repository files and screenshots.

Verification covers malformed/repeated server input, direct detail without list fetch, missing capability, scope denial, foreign response and late response after target change, plus ordinary directory/profile/transition regressions and desktop390px rendering. Technical synthetic evidence does not prove actual HR-role business acceptance.
