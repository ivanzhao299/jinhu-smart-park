# Missing-parent historical records: bounded preservation fix

## Verified source finding

The existing controlled, manifest-bound T2 stage contains 357 contract changes. Eight
have no contract match, across five nonempty contract numbers. Seven of these eight
reference an employee present in T0; one does not. There were no case-only/NFKC contract
matches, duplicate contract/sequence pairs, or parent/child employee mismatches among
matched contracts. This summary contains no personal values or source identifiers.

The failure was reproduced using a synthetic orphan quarantine decision:
`PRODUCTION_IMPORT_DEPENDENCY_REQUIRED`. The same required-parent assumption existed
in plan generation, plan validation, phase writing and the PostgreSQL trigger.

## Resolution

Preserve unresolved records in the existing encrypted quarantine/control mechanism,
without inventing a contract or employee. Keep known valid relationships and source
artifact provenance. Quarantine is accounted for separately from accepted business
rows; it is **not** successful functional migration or business approval of those rows.

Only quarantined rows may omit required references. All active writes still require
their complete graph. Every supplied reference is still validated. Existing source
retention, decision attestation, ciphertext authentication, mapping/count and rollback
rules remain mandatory. New migration 000312 changes the trigger forward-only, leaving
successful historical migrations untouched.

## Validation and limits

The optional PostgreSQL check uses 22 synthetic rows, a temporary control-table/function
fixture and rollback. It checks the actual old/new trigger bodies and zero temporary
relation/function residuals, not a real-data load or a full-schema migration rehearsal.
The phase-writer tests assert no business-target insert/merge/lock for an orphan and
retain ciphertext and a quarantined map with NULL target ID. Existing authenticated
encryption and sealed-execution regressions must also pass.

Production deployment of 000312 and current target/code evidence remain required before
using this behavior for a real import. This fix neither activates the production writer
nor authorizes payroll payments, binary imports, or a claim of complete Yuzhou parity.
