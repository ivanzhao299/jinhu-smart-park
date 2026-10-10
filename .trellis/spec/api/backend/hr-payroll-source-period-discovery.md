# Payroll source-period discovery

GET /hr/payroll/reconciliation-sources/periods requires reconciliation review permission before all probes. Query accepts UUID batch/book and bounded page/pageSize. Return only YYYY-MM-01 months and aggregate record/mapped/unmapped/distinct employee/item counts; no identities, amounts, payloads, hashes or source paths.

Require staged unpublished same-scope batches, successful T4 receipts with matching targetScope and sourceSnapshotHash, succeeded current-database migration controls, same-scope nondeleted book-period/book/snapshots/items. Count scoped snapshots separately from items to avoid join inflation. Preserve total on empty beyond-last pages and explicitly sort outer month descending. Required metadata audit uses the same transaction manager with bounded timeouts; audit failure must reject the read.

Latest observed month does not prove completeness and cannot bypass authoritative preview/freeze ownership/hash/count validation. No archive replay, publication or formal payroll write is part of discovery. Test actual schema constraints rather than disabling triggers to insert impossible deleted or cross-scope facts.
