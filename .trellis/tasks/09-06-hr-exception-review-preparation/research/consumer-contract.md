# Verified consumer connection

Current base 8b325e2b. Main CI 33993135772 and deployment 33993135642 succeeded. Current inventory run 33994159697 established the existing target identity; allowlist contains that identity. Execution activation remains HOLD/zero targets and the actual activation assertion returns PRODUCTION_IMPORT_EXECUTION_UNAVAILABLE. No live runtime SHA receipt or current backup is established by this audit. The deployment run returned no uploaded artifacts from the artifact listing.

The current freeze configuration has reviewedDecisions=null. It produced REVIEW_HOLD and no real-decisions wrapper. The private unsigned exception proposal accounts for 47 rows; it is not a signed resolution document. Do not represent three independently required approval subjects as one operator or hash invented names. A review key proves signatures relative to the supplied trust input, not organizational authority.

Consumer wiring already exists in execute-production-import.mjs:createProductionImportArtifactCryptoProvider. It consumes the hex envelope shape, resolves an exact private 32-byte key descriptor, authenticates each envelope before PostgreSQL, and compares the decoded payload against the sealed normalized payload. The freeze resolution embeds base64 envelope fields. Both serializations must retain identical nonce/tag/ciphertext bytes, operation and key reference.

Crypto context intentionally excludes sealedPlanSha256 to avoid a sealing cycle. It includes kind, operationId, phaseName, exact scope, source identity and row hash, payload hash, target table and key reference. Build the normalized payload first, encrypt once, then sign the exact decision/envelope binding; finalization must never encrypt again.

Target field whitelist remains authoritative even for quarantine. T1 offers legacy_state and source_effective_at/snapshots; T2 changes offer source_snapshot and dates/sequence; attendance days offer legacy_symbol and date; insurance periods offer source_snapshot; insurance items offer decimal fields. Do not add arbitrary raw-source keys to the payload. Explicit partial choices are necessary, and original controlled source/evidence remains retained separately. A nonempty projection is not automatically full original-source archival.

Focused validation command:
`node --test --test-name-pattern='repository HOLD refuses|execute authenticates every encrypted quarantine|pre-sealed before image' scripts/e2e/execute-production-import.contract.mjs`

Result: 3 passed, 0 failed, no production/database access. These are synthetic entrypoint checks, not actual production import or recovery evidence.
