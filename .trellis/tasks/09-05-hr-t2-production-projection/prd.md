# T2 production field projection

Implement the missing reusable field-conversion layer between receipt-bound T2 staging and the existing production payload generator. Cover contract types, contracts, changes and hash-only legacy evidence. Preserve ambiguous legacy terms and timestamps; never infer signature history from one signature date. No source extraction, database connection, production activation or binary processing.

Acceptance: every projected field passes the existing target model; exact decimals, null/zero distinction, invalid dates, unresolved flags, provenance drift and derived evidence identities have executable synthetic tests. This is not the full T2 candidate builder: inventory collisions, approved dictionaries, employee/contract dependencies, sealed payload assembly and real-row verification remain required.

## Continuation: T2 candidate assembly

Build the deterministic candidate graph used by the private materializer: contract types → contracts → changes/evidence, linked to T0 employees. Reuse the field projector, target model, canonical/business hashes and target-ID derivation. Bind full T2 phase coverage, C/S/M, target scope/identity and the full 16-table inventory to the T0 artifact. No guessed employee, ambiguous type-name selection or cross-employee contract association. Detect source-source and source-target business collisions before declaring insert candidates. Invalid semantic rows remain accounted for with stable review reasons; source/hash/coverage drift fails the artifact.

Acceptance: synthetic non-empty graph with all four target tables, empty T2 coverage, reordered input determinism, missing/blocked dependencies, ambiguous types, wrong contract owner, duplicate identities/business keys, target exact/collision behavior, target ID collisions and scope/inventory/triple drift. Output remains review candidates and HOLD, never an approval or executable production plan. Existing receipt-bound private I/O and dictionary verification must be connected before real-source use; this continuation must document that boundary explicitly.

## Continuation: receipt-bound private materializer

Connect the assembler to an explicit private config with byte-hashed artifact descriptors, the current committed C/S/M, existing source manifest, full inventory, T0 candidates, T2 phase, existing non-T0 machine dictionary and optional explicit change-classification decisions. Read only fixed T2 stage filenames; validate manifest/domain bytes, counts and row provenance. Verify existing type/state dictionary evidence and machine hashes against the staged sources. Machine hashes do not replace human/external approval. Never infer a renewal solely from table membership: absent change classification stays counted with a review reason. Output a new private candidate file, with counts/hashes/stable reason codes only on stdout. No source extraction, database connection or activation.

Acceptance: synthetic 0700/0600 file fixtures prove end-to-end bytes → candidate artifact and private readback, wrong code/hash/source/decision binding fails, empty stage works, output is exclusive/private and stdout contains no rows or paths. Validate filesystem/aggregate read bounds. Locate current real artifacts by safe metadata only and report any genuine binding gap instead of rewriting stale proofs.
