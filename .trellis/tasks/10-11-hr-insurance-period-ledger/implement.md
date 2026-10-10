# Plan
1. Implement dedicated list query DTO, controller/service filtering and backward-compatible hrApi options; add targeted API/DTO tests and extend existing full-schema PG fixture with same employee different months,closed original/new confirmed correction and other scope.
2. Actual owned-period UI filter state/reset/cancel and complete ScopedLedgerExport; strict whitelist/exact decimal tests, cross-page101 rows, missing/duplicate/drift/failure/cancellation/permission tests. Fix bare DS buttons within touched period page using actual global button classes.
3. Independent Trellis checker; root sole disposable PostgreSQL setup/writer/cleanup and full actual page synthetic desktop/390 export inspection. No separate schemas or migrations by children. Root owns broad checks/release.
4. Fresh baseline/source gate, PR/CI/merge/full APIWeb release and immutable runtime/health/cleanup. Business roles/months/amounts remain separate.
