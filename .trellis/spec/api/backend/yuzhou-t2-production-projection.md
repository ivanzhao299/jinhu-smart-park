# Yuzhou T2 production field projection

## 1. Scope / Trigger

Use when converting receipt-bound T2 staging to fields for the existing production payload generator. This is a root-script data contract, not a new API or writer. Do not execute the legacy isolated SQL loader against production.

## 2. Signatures

`projectProductionT2Fields(record, resolved) -> Array<{ phase, targetTable, sourceSystem, sourceTable, sourcePkCanonical, sourceIdentitySha256, sourceRowSha256, targetFields }>`.

`verifyProductionT2StagedRecord(record)` verifies the same staged wrapper/provenance contract without semantic projection. `assembleProductionT2DecisionCandidates({triple,targetScope,targetInventory,t0Candidates,phaseArtifact,stagedRecords,resolutions,artifactHashes})` builds the in-memory candidate artifact. `resolutions` is exact one `{sourceIdentitySha256,resolved}` per source; `artifactHashes` has phaseArtifactSha256, targetInventoryArtifactSha256, t0CandidatesArtifactSha256 and resolutionArtifactSha256. These hashes are caller-verified references, not independent verification of content bytes or approvals.

## 3. Contracts

Source record has exactly `sourceTable`, `sourceKey`, `sourceIdentitySha256`, `sourceRowSha256`, `source`. Supported tables: `dbo.compacttypecode`, `dbo.compact`, `dbo.compact_c`. Resolved dictionary values are `typeCode`, `status`, or `changeType`; the caller owns approval verification, C/S/M, artifact byte identity, dependencies and collisions. Output is not a decision or sealed plan.

Target fields use the existing model and normalizer. Monetary strings must fit numeric(18,2) without rounding and always have two fractional digits. Local `hr_contract_change.signed_at` accepts exact calendar-valid `YYYY-MM-DDTHH:mm:ss.SSS` to match the writer's timestamp-without-zone readback; no offset is inferred. Other timestamp fields retain their current contract. Signature history is not inferred from one source signature date. Ambiguous terms remain snapshot values. Evidence presence accepts only extractor-produced numeric 0/1, and IDs use the existing phase projection hash; protected_file_id remains null.

Assembly requires the full 16-table read-only inventory and exact T2 phase provenance/counts, aligned with T0 scope, target identity and C/S/M. Accepted T0 dependencies are recursively checked against the model, source business code, derived insert ID or actual exact-skip inventory/canonical/version; blocked T0 records never become usable employee refs. All same-level business/target-ID duplicates are blocked before the next dependency level. Contract type names use unique exact trimmed source names, changes also require matching source employee ownership, evidence uses the parent contract. No merge, write, approval, binary access or source I/O is performed. Semantic errors produce counted quarantine candidates; structural source/phase drift fails the entire artifact. Output is deterministic and detached from input references.

`materializeProductionT2DecisionCandidates(configPath,{currentHead,maximumReadBytes}?)` is the private I/O owner. CLI only accepts `--config`; no callback/budget overrides or writer mode. It checks owned 0600 no-follow single-link files and 0700 directories, fixed stage filenames, manifest bytes, full source/target C/S/M and existing dictionary source/evidence/machine hashes. Maximum 32 MiB per file and 128 MiB aggregate; tests can lower but never raise the total cap. Production inventory sourceManifestSha256 must equal the existing source verifier's canonical hash; artifact descriptor SHA binds separate raw bytes. Empty stage files are admitted only for manifest-declared zero rows. Output creation is exclusive, followed by fsync and hash readback; no raw input errors, values or paths reach stdout/stderr. Failures preserve existing/partial outputs.

Optional per-source change classifications bind stage file SHA, row SHA, triple and evidence hash. They remain machine candidates; absent classification is unresolved rather than silently renewal. External approval/source authenticity and final execution authorization remain independent; content/semantic hashes are integrity references, not signatures.

`buildProductionT2ChangeClassifications({triple,stagedRecords,stageFileSha256,routineEvidence})` returns `{artifact,summary}` in that existing envelope. Fixed `web_compact_c` source evidence supports renewal only for a unique exact parent/employee match; missing or mismatched parent yields needs_review, all changes retained. Duplicate source identities fail before choosing a parent. Pure hash inputs are caller-verified references. `materializeProductionT2ChangeClassifications(configPath,options?)` proves current clean code, full source manifest/T2 bytes/counts/state usage and actual pinned routine bytes before output. SQL source code is non-executed, bounded256KiB, owned no-follow single-link/stable reads, and can retain archive permissions; private config/data/output still0600/0700. Output exclusive/fsynced/readback checked, no raw paths or values in errors. No source extraction, SQL, approval or target insertion. Missing-parent candidates remain blocked downstream.

## 4. Validation & Error Matrix

- Source identity/row hash drift -> `T2_SOURCE_HASH_MISMATCH`; source key mismatch -> `T2_SOURCE_KEY_MISMATCH`.
- Unknown source field -> `T2_SOURCE_FIELD_UNMAPPED`.
- Null/unknown protocol flag -> `T2_LEGACY_FLAG_UNRESOLVED`, not false.
- Invalid calendar/time -> `T2_DATE_INVALID` / `T2_TIMESTAMP_INVALID`.
- Unknown transform semantic marker -> `T2_SEMANTIC_DECISION_INVALID`.
- Non-string money -> `T2_DECIMAL_INVALID`; rounding/overflow -> `T2_DECIMAL_TARGET_PRECISION_LOSS`.
- Missing evidence hash -> `T2_EVIDENCE_HASH_INVALID`.
- Non-numeric evidence presence -> `T2_EVIDENCE_PRESENCE_INVALID`.
- Errors expose stable codes only, never source values.

## 5. Good / Base / Bad Cases

Good: exact money, known dictionary, source hashes and semantic markers agree. Base: absent renewal follows the existing explicit `ABSENT_DEFAULT_ZERO` marker and retains absence in source_snapshot. Bad: null flags become false, unknown terms populate modern duration, one signature becomes first/last signatures, or file hashes become a claimed binary migration.

## 6. Tests Required

Test all four complete field sets; source immutability and drift; null/zero; leap/invalid/reversed dates; safe integer bounds; numeric(18,2) exactness; local datetime preservation; evidence identities; no protected file ID. Run via the existing T2 artifact package command. Before production readiness, separately test actual database canonical/hash round trips, dependencies, approved conflicts, real staging, rollback and user-facing queries.

The optional explicit `YUZHOU_T2_PROJECTION_PG_CONTAINER` test permits only a local unix Docker endpoint and performs fixed literal casts in a read-only transaction, without tables or writes. A pass proves type/canonical representation only, not full writer execution. Source-derived term/count semantics remain the responsibility of the receipt-bound upstream transform; this projection must not be called with an unverified stage.

## 7. Wrong vs Correct

Wrong: `Number(source.baseSalary)` then let PostgreSQL round; duplicate `signedDate` into first/last history; call the pure projection an approved production plan.

Correct: preserve exact decimal strings, reject precision loss, keep unestablished history null with an explicit decision, then bind projected fields and approved relationships through the existing freeze/writer chain.
