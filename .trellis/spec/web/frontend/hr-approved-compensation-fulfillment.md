# Approved compensation fulfillment and ordinary salary continuity

The compensation page is the formal salary maintenance surface. Its ordinary employee picker uses the dedicated scoped, searchable, server-paged compensation employee-options API, including departed employees. Never present the first employee page as the full workforce or infer historical payroll eligibility from current employment status. Approved salary requests remain in a separate paged source queue on this page; the approvals page links to it. Source selection requires compensation READ+MANAGE and PARK_REVIEW. Ordinary assignments require READ+MANAGE in the UI; existing API MANAGE authorization remains unchanged.

Both flows share CompensationAssignmentEditor. An approved source fixes employee and approval version; its free-text description is context, never a salary parser. HR explicitly chooses plan, date range, and exact decimal amounts. Read employee-filtered paginated assignments before save. An existing active period can be explicitly selected, retaining its id/version and original period across paging. The server closes only that predecessor to the day before the new effective date. It rejects all remaining overlaps. Plan coverage and true calendar dates must be valid, including finite-plan endings. Existing calculated payroll snapshots are unchanged.

Bind reads to complete query/context and discard superseded responses. Identity, park, or permission changes remount sensitive state. Read failures or unverified plan/history responses disable save. A known version conflict keeps the draft and requires explicit history reload and predecessor reselection. Do not silently refresh a selected expected version.

Use synchronous write locks. An unknown result, malformed receipt, or same-idempotency-key processing response freezes editing/cancel and retries the exact original body, token, and key. Validate successful receipt against employee, plan, dates, canonical monetary strings, new version, source id/version and predecessor period/version metadata. Persist the confirmed receipt before refreshing lists; refresh failure or a stale source queue cannot reverse confirmed fulfillment. Plan creation uses the same single-attempt retry/confirmed-success separation.

Use shared DS surfaces, responsive domain card grids visible on desktop and phone, 44px controls, wrapped pagination, and no horizontal overflow. Verify actual compiled components/CSS at 1280px and 390px with labeled synthetic fixtures. That proves rendering only, not production business UAT.

## 1. Scope / Trigger
Compensation maintenance uses one editor for ordinary and approved-source writes, preserving formal data continuity.

## 2. Signatures
`CompensationAssignmentEditor({employee,source?,plans,onCancel,onSaved})`; paged `CompensationEmployeePicker`; paged `ApprovedCompensationRequestsPanel`. API signatures are in the backend companion specification.

## 3. Contracts
Freeze `{body,token,key,source?,predecessor}` per write attempt. Keep monetary strings without Number conversion. Full receipt validates every submitted identity/date/amount and predecessor before/after version/period. Approved receipt additionally validates source id/version. Keep saved receipt independently of queue/ledger refresh.

## 4. Validation & Error Matrix
Failed/invalid employee-history or plan read disables save. Known 409 keeps draft and requires explicit reload/reselection. Network/5xx/malformed success/processing409 freezes inputs and cancel; retry exact attempt. Abort-ignoring stale reads cannot update a newer request generation. Account/park/permission remount drops sensitive state.

## 5. Good / Base / Bad Cases
Good: approved source saves explicit salary and source linkage, then a failed list refresh still shows confirmed receipt. Base: employee selection can reach page2 and choose any scoped employee. Bad: a stale selected salary version must not silently adopt a newly loaded version or resubmit under a new idempotency key after an unknown result.

## 6. Tests Required
Focused interactions assert ordinary/source success, predecessor CAS receipt, known conflict draft preservation/reselection, unknown result same-attempt frozen retry, stale search/history/identity, read failure disabling saves, and success surviving independent refresh failures. Actual component/CSS browser check at1280 and390 with synthetic fixtures: no horizontal overflow, single-column phone layout, minimum44px controls, visible desktop plan cards. Synthetic fixture API must clone response objects like JSON transport, not mutate objects retained in React state.

## 7. Wrong vs Correct
Wrong: `employees().items.length` from one page presented as workforce count; correct: use complete dedicated employee-options paging and server total. Wrong: retry creates a new key while first result is unknown; correct: reuse the frozen body/token/key until a verified receipt or known rejection.
