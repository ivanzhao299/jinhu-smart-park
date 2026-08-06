# 000192 Housing Effect Schema Handoff v1

Status: **FORMAL GO / PostgreSQL 16 / open_P0_P1=[]**

Issued at: `2026-08-03T18:50:53+08:00`

## Frozen authority and identity

- repository base: `0152616fb9a25effdff68fa9da24fea7db8a21a7`
- selected-authority promotion SHA-256: `0306850ad9518af5cf0f74d5e7eacde477b822caa4239400fadda2f81e574433`
- atomic reservation SHA-256: `c8fbeaefff22b2060106dac82a616ad37a96cbe31c947bdcf340effa1d54b4f1`
- migration: `database/migrations/000192_property_b_housing_effect_schema.sql`
- migration raw SHA-256: `3f77cb8feceaa4d92a8118951c0d89d5a7bf71db8fa8fe4326093335d3cd5ab7`

This is the `B-housing-effect-schema SHA` handoff. It does not replace or rename the
000185-000190 schema-expand authority.

## PostgreSQL evidence

Container `jinhu-b2c191192-pg16-20260803b` ran PostgreSQL `160014`.

- Empty/seeded baseline: 000192 applied after 000191 and before 000193-000195/000197;
  both history stores agreed on filename, checksum and `succeeded` status.
- Representative legacy: lease, purchase, charge-plan, receivable, ledger and handover
  currency all backfilled to CNY and composite scope/currency constraints validated.
- DEC-06: `approved/paid -> approved/refunded` succeeded; refunded-to-void and an
  invalid second terminal refund audit were rejected; audit UPDATE was rejected.
- Cross-scope preflight: a scope-2 charge plan referencing a scope-1 lease was rejected
  with `000192 legacy housing scope/owner preflight failed: 1 rows`; the transaction
  left no housing currency column or housing audit table.
- Rollback injection: a forced `P0001` before COMMIT left no lease currency column and
  none of the three exact housing audit tables.
- Later-chain compatibility: 000197 applied successfully after 000191/000192.

## Runner and checksum evidence

The isolated production-runner checks documented in the paired 000191 handoff cover
the atomic ordered pair: same-byte success skipped execution, and a succeeded-checksum
conflict at 000191 stopped before 000192. The 000192 history row remained at
`3f77cb8feceaa4d92a8118951c0d89d5a7bf71db8fa8fe4326093335d3cd5ab7`.

## Result

All required 000192 empty, representative legacy, cross-scope incompatible-data,
same-byte, checksum/history, failure-rollback, DEC-06 and later-chain checks are closed.
`open_P0_P1=[]`.

