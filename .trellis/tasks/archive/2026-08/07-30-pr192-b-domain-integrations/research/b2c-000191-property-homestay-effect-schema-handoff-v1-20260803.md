# 000191 Property/Homestay Effect Schema Handoff v1

Status: **FORMAL GO / PostgreSQL 16 / open_P0_P1=[]**

Issued at: `2026-08-03T18:50:53+08:00`

## Frozen authority and identity

- repository base: `0152616fb9a25effdff68fa9da24fea7db8a21a7`
- selected-authority promotion SHA-256: `0306850ad9518af5cf0f74d5e7eacde477b822caa4239400fadda2f81e574433`
- atomic reservation SHA-256: `c8fbeaefff22b2060106dac82a616ad37a96cbe31c947bdcf340effa1d54b4f1`
- migration: `database/migrations/000191_property_b_homestay_effect_schema.sql`
- migration raw SHA-256: `77a6326acebb632bbd97a9c59380d1751d4e3c9fb500da319e70cbb436648428`

This is the `B-property-homestay-effect-schema SHA` handoff. It does not replace or
rename the 000185-000190 schema-expand authority.

## PostgreSQL evidence

Container `jinhu-b2c191192-pg16-20260803b` ran PostgreSQL `160014`.

- Empty/seeded baseline: 000191 and 000192 applied in lexical order, followed by
  000193-000195 and 000197; both history stores were byte-equal and contained no
  running/failed row.
- Representative legacy: homestay ledger currency was copied from the same-scope
  booking and housing monetary owners/children were backfilled as CNY.
- Direct-source contract: a refund-to-charge reference was rejected; a waiver-to-charge
  reference succeeded; omitted ledger currency was derived from the booking.
- Rollback injection: a forced `P0001` before COMMIT left no ledger currency column,
  occupancy release audit, or legacy source-map table.
- Lock conflict: an independently verified `AccessExclusiveLock` on
  `biz_homestay_booking` caused the migration preflight to fail after the 5 second
  `lock_timeout`; the transaction left no 000191 column/table residue.
- Later-chain compatibility: 000197 applied successfully after 000191/000192.

## Runner and checksum evidence

The production `scripts/db-migrate.sh` was run against the isolated compose project
`jinhu_b2c_runner_20260803`:

- with all current filenames recorded as `succeeded` at their current hashes, it
  returned `No new migrations ... execution skipped` (same-byte rerun);
- with both history stores changed to the same fake succeeded checksum for 000191, it
  stopped at 000191 with `migration file changed after success` before 000192;
- the failed checksum gate did not rewrite either history store or the recorded 000192
  succeeded row.

## Result

All required 000191 empty, legacy, incompatible-source, same-byte, checksum/history,
concurrent-lock, failure-rollback and later-chain checks are closed. `open_P0_P1=[]`.

