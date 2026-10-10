# Decision-center workforce detail ledgers

HrDecisionCenterClient uses the existing decision-center authority and workforce snapshot. Department direct membership and enabled-position staffing are distinct current-state ledgers; date controls affect employment-event statistics only. Display organization/position codes alongside names, localized organization status and all actual source counts. Never expose employee identities or UUIDs. Null planned capacity displays 未设置, zero displays 0.

Show50 rows per ledger page, reset pages when snapshot changes, export every row in the same API snapshot rather than only visible rows. Reuse csvDocument/downloadCsv for BOM, explicit Chinese columns and formula escaping. There are no arbitrary50/500 row source truncations. A failed/aborted/outdated read must not leave an exportable previous snapshot. Identity, tenant, park, permissions, request generation and from/to guard load publication; hide mismatched-context results synchronously.

Use shared DS panel/record/button surfaces and HR module layout only. Desktop record visibility must be scoped to decision center, not all .page instances across HR. Phone ledger panels must be a single column despite global command-grid mobile two-column rules; desktop can use two columns. Use existing section/header spacing and touch controls at least44px for ledger exports/pagers. Check actual desktop and390px components; a lack of horizontal overflow alone does not prove usable text layout.

Verify full501-row exports, pagination reset, zero/null, localized statuses/CSV escaping, page-level filter/identity/failure/retry/late reads, and actual browser screenshots. Synthetic browser acceptance does not substitute production role UAT or prove complete original-system rule parity.
