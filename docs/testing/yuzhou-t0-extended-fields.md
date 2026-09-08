# T0 extended field verification

The production candidate projection and target model preserve three organization
columns (`contact_phone`, `planned_headcount`, `legacy_source_id`) and six position
columns (`authority`, `legacy_source_id`, `legacy_upto_code`, `position_manual`,
`qualification`, `responsibilities`). Existing migration 000295 owns their storage
types; this change does not alter an applied migration.

A missing position department may use the established root fallback. A nonempty,
unresolved reference must remain quarantined together with dependent candidates;
unrelated employee candidates continue. No guessed organization is assigned.

Focused checks:

- `node scripts/e2e/yuzhou-production-import-t0-decision-candidates-contract.mjs`
- `node --test scripts/e2e/yuzhou-production-import-target-model-contract.mjs scripts/e2e/yuzhou-production-import-phase-writers-contract.mjs scripts/e2e/yuzhou-production-import-writer-receipts-contract.mjs`
- `yuzhou-t0-extended-fields.pg.mjs`: explicit lab opt-in and retained staging;
  validates hashes, migration column types, exact temporary-table readback and rollback.
- `yuzhou-production-import-full-chain-direct-pg.mjs`: explicit isolated target;
  synthetic T0-T3 writes, canonical readback, reverse rollback and failure recovery.
  Organization extended fields differ before/after merge to test actual restoration.

Real retained-stage checks passed for 138 organizations and 18 positions. Synthetic
full-chain checks passed against the existing isolated target. Neither result is
production authorization or evidence of full source coverage, API/UI acceptance,
or production completion. Old candidates, target inventories and frozen references
must be reviewed against the changed model before use; do not relabel their hashes.
