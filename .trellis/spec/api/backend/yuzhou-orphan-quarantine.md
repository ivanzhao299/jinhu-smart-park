# Yuzhou orphan quarantine dependency semantics

## Trigger and boundaries

An authentic historical source row may lack its parent. Required business foreign keys
must not prevent preserving that row as a quarantined record. Quarantine is not an
active business projection, and does not satisfy an active child's required reference.

## Executable contract

- Generator, sealed-plan validator, phase writer and PostgreSQL dependency trigger all
  allow absent required references **only** for `disposition="quarantine"`.
- Keep the table's dependency mode. An employee-mode quarantine may have zero refs;
  a record-graph quarantine may retain only its known employee. No fake scope fallback.
- Check every supplied reference's declared role, table, phase, exact source map,
  sequence and cycles. Do not silently discard an invalid supplied reference.
- Insert/merge/skip still require every required reference and an active target map.
  Validate this before the writer's empty-reference-layer early return.
- Quarantine still requires its decision attestation, sealed source/payload identity,
  authenticated encryption, counts, quarantined map and projection receipt. No target ID
  or business-table insert/update is permitted. An empty canonical payload does not
  replace the retained, hash-bound source artifact.
- SQL fixes are forward-only. Migration 000312 preserves the 000292 function body except
  moving required roles into the optional set for quarantine. Existing graph foreign
  keys, target constraints, authorizations and T5 allowlists remain unchanged.

## Regression evidence

Run payload-generator, v2, phase-writers, crypto, rollback and real-artifact bridge tests.
`YUZHOU_ORPHAN_QUARANTINE_PG_CONTAINER=<local-container>` enables the optional real
PostgreSQL function test. It installs the old and new function in `pg_temp`, reproduces
the old orphan failure, covers all 22 admitted target names and invalid dependencies,
then rolls back and asserts zero temporary relation/function residuals. Its minimal
control tables test this function, **not** the full production schema or authorization
chain. Actual deployment and import acceptance remain separate.
