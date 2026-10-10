# Employee directory filtered CSV

Export only the existing directory projection through the ordinary scoped employee list API. Admit all-domain or team directory readers; do not probe sensitive profile/detail endpoints or widen field authority. Keep filters fixed for the request and use the existing 50-record pagination contract, with an explicit 5000-record ceiling.

Validate every page's number, size, expected item count, stable total and unique employee IDs across pages. Recheck the first page before download. Reject detectable drift, partial pages and failed reads without generating a partial file. Ordinary list pagination is live data and does not prove a transaction-wide point-in-time snapshot.

Bind the download to the current authenticated/filter context with a synchronous request mutex, render-time context key and AbortController. Switching scope/filters or unmounting aborts pending reads; late successes must never download. Propagate the signal through hrApi.employees without changing existing callers.

The eight directory columns are employee code/name/type/status/location/account-link state/hire/departure dates. Preserve unknown business labels and missing dates; do not infer date classifications or export internal IDs, contacts, identity documents, wages or source snapshots. UTF-8 BOM and quoted CSV fields support Excel; prefix formula-like text after leading whitespace/control characters. Revoke the Blob URL after dispatching download.

Use shared DS controls and layout-only page CSS. Regress multipage/empty/failure/drift/limits, context cancellation and double clicks, field allowlisting and CSV text escaping; inspect the actual directory at desktop and 390px. Synthetic CSV/layout checks do not establish production-role acceptance or legacy full-report parity.

## Scenario: Employee organization filter continuity

### 1. Scope / Trigger
Employee directory organization selection must constrain both on-screen paging and the complete CSV.

### 2. Signatures
`HrEmployeeListFilters.orgId?: string` becomes the existing `GET /hr/employees?org_id=<UUID>` parameter. `EmployeeDirectoryExport` accepts the same optional `orgId`.

### 3. Contracts
Reuse the page's already-authorized `directoryOptions.orgs`. Show the selector only for employee managers with all/team directory read and actual options, outside direct-detail/self pages. Do not add organization probes or infer permissions. Organization selection is intersected with the backend actor scope; it never expands it. Changing organization preserves keyword/status, invalidates selected detail, and resets paging to one. Include organization in the export context key and every fetch, including first-page drift recheck.

### 4. Validation & Error Matrix
Missing organization -> omit `org_id`; valid organization -> scoped filtered results. Invalid UUID -> existing API DTO rejection. Failed/unavailable organization options -> no organization selector. Organization changes during export -> abort old requests and suppress late downloads.

### 5. Good/Base/Bad Cases
Good: department selection persists through page two and all CSV reads. Base: no selection preserves existing calls. Bad: department is applied only to the visible page or is omitted from export.

### 6. Tests Required
Actual directory interactions assert reset/selection cleanup, keyword/status preservation, clearing and missing-option failure. Export interactions assert organization propagation and cancellation. Request tests assert `org_id` encoding and backward-compatible omission. Inspect desktop and390px layout; synthetic acceptance does not prove production role UAT.

### 7. Wrong vs Correct
```tsx
// Wrong: export silently drops the selected department.
hrApi.employees(token, page, size, {keyword, status});
// Correct: every export page uses the same optional organization.
hrApi.employees(token, page, size, {keyword, status, ...(orgId ? {orgId} : {})}, signal);
```
