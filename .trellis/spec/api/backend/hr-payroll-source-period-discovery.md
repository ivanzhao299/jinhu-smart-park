# Payroll source-period discovery

GET /hr/payroll/reconciliation-sources/periods requires reconciliation review permission before all probes. Query accepts UUID batch/book and bounded page/pageSize. Return only YYYY-MM-01 months and aggregate record/mapped/unmapped/distinct employee/item counts; no identities, amounts, payloads, hashes or source paths.

Require staged unpublished same-scope batches, successful T4 receipts with matching targetScope and sourceSnapshotHash, succeeded current-database migration controls, same-scope nondeleted book-period/book/snapshots/items. Count scoped snapshots separately from items to avoid join inflation. Preserve total on empty beyond-last pages and explicitly sort outer month descending. Required metadata audit uses the same transaction manager with bounded timeouts; audit failure must reject the read.

Latest observed month does not prove completeness and cannot bypass authoritative preview/freeze ownership/hash/count validation. No archive replay, publication or formal payroll write is part of discovery. Test actual schema constraints rather than disabling triggers to insert impossible deleted or cross-scope facts.

The separate production source-coverage observer accepts an explicit first-of-month date and a fixed approved scope. Its census must retain failed/unpublished/unqualified source batches and account for them separately from receipt-qualified availability; an eligible-source query alone cannot prove all-imported coverage. Include all scoped book numbers, even zero-record books, and distinguish normalized snapshot count from source multiplicity, distinct people and independently aggregated items. Mapping and source-availability classifications each conserve the snapshot count. A person in two books is one global person; multiple mapped snapshots in one book/month are explicit exceptions, never automatic deduplication. Do not filter former employees. Keep month input in runner env and validate before constructing SSH arguments; no arbitrary SQL or scope input. Strict count-only output and fixed errors must not disclose personal/amount/payload data. Coverage never approves rules or triggers calculation/payment.


## Current typed months and original archive continuity

Current candidate uses migration380 metadata qualification for both typed receipts and original T4. A T4 archive may remain available for August while its July was superseded; filter eligibility per month, never per archive alone. Source periods and setup/frozen/trial options expose only current choices. Old immutable evidence remains available for historical audit; new preview/freeze/compute rejects superseded selected-month evidence.

Count-only coverage adds `supersededSourceCount` as a separate conserved source category, keeping all historical facts in the census while excluding superseded versions from duplicate-employee and eligible insurance-cohort calculations. A failed/unqualified batch is not called superseded merely because a current head exists. Metadata discovery is not a substitute for the locked complete source builder or real business acceptance.
