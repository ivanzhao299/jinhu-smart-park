# Technical Design

## Scope and authority

- Fix GitHub Issue #420 in `PropertyTaskReconciliationScheduler` and the five housing derived-task resolvers: billing, repair, purchase, lease, and handover.
- PostgreSQL column types are authoritative. Positional parameters reused across projection, joins, null checks, row comparisons, status comparisons, or limits receive explicit casts matching migrated schema types.
- Preserve tenant and park predicates, transaction boundaries, fail-closed runtime behavior, retry behavior, cursor ordering, and projection idempotency.
- Follow `.trellis/spec/api/backend/typeorm-raw-query-results.md`: fix inference with explicit casts rather than splitting scope parameters or weakening ownership predicates.

## Query contract

- Scheduler cursor binds retain one value per semantic field and cast every ambiguous use: tenant/park/source type as the migrated string type, source id as UUID, and batch limit as integer.
- Housing resolver scope binds are explicitly cast at their repeated predicate sites; source cursors remain UUID and limits integer. Status binds/literals are anchored where the same parameter participates in distinct PostgreSQL inference contexts.
- No schema migration is expected. If current migrations disagree on an owner-column type, stop and reconcile schema evidence rather than guessing.

## PostgreSQL regression design

- Add a focused opt-in real PostgreSQL spec using a freshly migrated PostgreSQL 16 database.
- Seed the minimum tenant/park and domain rows needed for all five sources, invoke the complete scheduler reconciliation path, and assert successful projections for billing, repair, purchase, lease, and handover.
- Exercise both initial and non-null cursor scans so `$1` null checking and row comparison run in PostgreSQL, and assert no SQLSTATE `42P08` / `inconsistent types deduced` or downstream `property-runtime-unavailable` classification.
- Assert tenant/park isolation with out-of-scope fixtures and preserve completed work-order exclusion semantics.
- Mock tests may supplement parameter-array and source registration checks but cannot satisfy the Issue acceptance gate.

## Rollout, evidence, and rollback

- Product fix lands alone through a PR that closes #420, Codex review (maximum three rounds), required CI, squash merge, and merged-main CI plus production Deploy evidence.
- After deployment, create a fresh isolated UAT environment and validate #420 projections, deposit refund correctness, C02 error/success/deep-link behavior, and dashboard KPI consistency.
- UAT cleanup uses fixture-specific DELETE statements only. Record before/after counts for party, identity, approval, outbox, workorder, and file rows plus physical files; zero residuals are mandatory for PASS.
- Any business failure remains explicit and keeps its Trellis task open. Environment retries for the same test topic are capped at two.
