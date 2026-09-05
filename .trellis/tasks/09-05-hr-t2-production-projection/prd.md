# T2 production field projection

Implement the missing reusable field-conversion layer between receipt-bound T2 staging and the existing production payload generator. Cover contract types, contracts, changes and hash-only legacy evidence. Preserve ambiguous legacy terms and timestamps; never infer signature history from one signature date. No source extraction, database connection, production activation or binary processing.

Acceptance: every projected field passes the existing target model; exact decimals, null/zero distinction, invalid dates, unresolved flags, provenance drift and derived evidence identities have executable synthetic tests. This is not the full T2 candidate builder: inventory collisions, approved dictionaries, employee/contract dependencies, sealed payload assembly and real-row verification remain required.

## Continuation: T2 candidate assembly

Build the deterministic candidate graph used by the private materializer: contract types → contracts → changes/evidence, linked to T0 employees. Reuse the field projector, target model, canonical/business hashes and target-ID derivation. Bind full T2 phase coverage, C/S/M, target scope/identity and the full 16-table inventory to the T0 artifact. No guessed employee, ambiguous type-name selection or cross-employee contract association. Detect source-source and source-target business collisions before declaring insert candidates. Invalid semantic rows remain accounted for with stable review reasons; source/hash/coverage drift fails the artifact.

Acceptance: synthetic non-empty graph with all four target tables, empty T2 coverage, reordered input determinism, missing/blocked dependencies, ambiguous types, wrong contract owner, duplicate identities/business keys, target exact/collision behavior, target ID collisions and scope/inventory/triple drift. Output remains review candidates and HOLD, never an approval or executable production plan. Existing receipt-bound private I/O and dictionary verification must be connected before real-source use; this continuation must document that boundary explicitly.
