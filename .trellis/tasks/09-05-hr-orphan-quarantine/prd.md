# Preserve orphan source records without inventing business parents

## Evidence and scope

The controlled, manifest-bound T2 audit found 8 contract changes without a contract,
across 5 nonempty contract numbers. A synthetic orphan quarantine decision reproduced
`PRODUCTION_IMPORT_DEPENDENCY_REQUIRED` in the payload generator. No personal values
are included here. This is not evidence of a production import.

Fix the generator, sealed-plan graph validator and phase writer so quarantine may omit
unresolved dependencies. Validate every supplied dependency exactly as before. Keep
required references for insert/merge/skip, authorization, ciphertext authentication,
source accounting and no-target-write semantics. Do not manufacture parents or IDs.

## Acceptance

- Orphan change and employee-dependent source rows can produce valid quarantined plans.
- Partial known references are retained; malformed/missing-map references fail.
- Active writes with missing required references fail, including an all-empty layer.
- Quarantine writes only its encrypted control/map receipts, never business targets.
- Existing payload, sealed execution, phase writer and crypto tests remain green.
- No production business writes or full-source re-extraction in this slice.
