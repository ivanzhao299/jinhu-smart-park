# Checkpoint: locally verified, not deployed

## Changes

Three JavaScript layers now allow missing required dependencies only for quarantine.
The writer also checks required dependencies before its all-empty-layer early return.
Forward-only migration 000312 makes the same exception in the existing database trigger.
Regression tests, scoped spec and operational notes accompany the fix. Existing CI
entries include the static regression and the tiny PostgreSQL function check; no new
full-data rehearsal or source extraction is introduced.

## Executed validation

- Payload-generator contract: PASS, including a single orphan and no parent in staging.
- Phase-writer + orphan-trigger tests with explicit local Docker PostgreSQL: 12/12 PASS.
  Old function rejects the orphan; new function admits 22 synthetic quarantines;
  invalid active/missing-map/wrong-table dependencies fail. Rollback leaves 0 temporary
  relations and 0 temporary functions. No public table or function modified.
- V2 + CLI + real GCM + rollback contracts: 83/83 PASS.
- Real-artifact bridge contract: PASS.
- T2 projection/candidate/materializer regressions: 34 PASS; optional literal-cast
  PostgreSQL check skipped in that command (previous parent-slice evidence exists).
- `git diff --check`: PASS.

## Limits and next step

No actual production import, source re-extraction, binary import, payroll payment,
independent peer review or local full application build is claimed. The small temporary
PostgreSQL fixture validates the changed function, not the complete production schema.
The parent PR #634 CI is still running separately; do not restart it. Publish this
minimal follow-on after parent alignment, complete CI/release including the new
migration, then refresh bounded target/candidate artifacts for import preparation.
