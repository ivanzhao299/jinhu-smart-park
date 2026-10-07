# Employee directory filtered CSV

Export only the existing directory projection through the ordinary scoped employee list API. Admit all-domain or team directory readers; do not probe sensitive profile/detail endpoints or widen field authority. Keep filters fixed for the request and use the existing 50-record pagination contract, with an explicit 5000-record ceiling.

Validate every page's number, size, expected item count, stable total and unique employee IDs across pages. Recheck the first page before download. Reject detectable drift, partial pages and failed reads without generating a partial file. Ordinary list pagination is live data and does not prove a transaction-wide point-in-time snapshot.

Bind the download to the current authenticated/filter context with a synchronous request mutex, render-time context key and AbortController. Switching scope/filters or unmounting aborts pending reads; late successes must never download. Propagate the signal through hrApi.employees without changing existing callers.

The eight directory columns are employee code/name/type/status/location/account-link state/hire/departure dates. Preserve unknown business labels and missing dates; do not infer date classifications or export internal IDs, contacts, identity documents, wages or source snapshots. UTF-8 BOM and quoted CSV fields support Excel; prefix formula-like text after leading whitespace/control characters. Revoke the Blob URL after dispatching download.

Use shared DS controls and layout-only page CSS. Regress multipage/empty/failure/drift/limits, context cancellation and double clicks, field allowlisting and CSV text escaping; inspect the actual directory at desktop and 390px. Synthetic CSV/layout checks do not establish production-role acceptance or legacy full-report parity.
