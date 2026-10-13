# Payroll source-period discovery UI

Embed month/count discovery in ReconciliationSourcePreparation and preserve manual month entry. Display imported sources as usable business inputs, not blocked old data. Explicitly explain that latest observed month does not prove completeness and that preparation is comparison only.

Keep month-list and preview requests independent; invalidate both on source/book changes, preview on month changes. Key the workspace by account/scope/sorted permissions; abort on unmount and reject late responses. Validate response pagination/counts/month shape and preview source/book/month identity before enabling freeze. Disable selection/paging/reload during an existing freeze write.

Use shared DS surfaces and scoped HR layout. The local sourcePeriodList must remain visible on desktop despite mobile-record defaults. Phone cards use one column, readable spacing and touch buttons at least44px with unbroken labels. Verify actual desktop/390px component renders and source hashes, pagination and preview without executing a production freeze. Synthetic screenshots do not establish actual payroll month or business acceptance.


The same component supports explicit context from a modern trial book. In that mode batch/book/month are fixed to the selected book and month; do not probe or display unrelated month discovery. Require review permission before all source probes. Retain the identical freeze key and review fields after transient failure; authoritative validation/permission/conflict rejection requires re-preview. Install committed state before notifying catalog refresh and verify returned identity/counts. Use existing primary/secondary DS buttons with44px touch height in both contexts.
