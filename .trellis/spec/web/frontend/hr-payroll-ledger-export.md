# Scoped payroll ledger CSV

Use the ordinary payroll history list API and its existing HR/self permissions. HR exports require applied month bounds; self exports use the API's published-only employee scope. Team summary permission never enables amount export. No new authority, publication or amount mutation is introduced.

Collect every page with the shared scoped export utility (100 rows/page, 5000 maximum). Validate expected page cardinality, stable total and unique IDs; recheck page one. Failure, detected drift or cancellation never produces a partial file. Live paged reads do not prove an atomic snapshot.

Bind request mutex, AbortController and render-time context to the authenticated user and applied filters. Scope/permission/filter changes and unmount invalidate pending downloads. Do not use unsubmitted month drafts. Reuse the shared CSV encoder and Blob cleanup, preserving raw decimal strings and null values. Formula-like text receives a prefix after leading whitespace/control characters.

Only HR exports contain employee business code/name and employee visibility. Self exports omit these even if the response unexpectedly includes them. All CSVs exclude internal IDs, source tables, mapping state, raw payloads and account/identity-document fields. UTF-8 CSV supports Excel; it does not establish full legacy report equivalence or downstream spreadsheet numeric precision.

Regress complete pagination, limits, bad/duplicate/partial pages, read failure, stale contexts, decimal/null/text encoding, identity allowlisting, double clicks and scope cancellation. Also regress the employee directory using the shared utility. Inspect desktop and390px using actual components; record synthetic transport separately from real production role acceptance.
