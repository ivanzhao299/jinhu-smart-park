# Original T5 profile continuity

## 1. Scope / Trigger

Original followon-only profiles and new raw profiles through the existing incremental API. Never rerun original operations, alter receipts or borrow employee identity for profile identity.

## 2. Signatures

`YuzhouProfileBaselineWitness={version:1,proof:'original_t5_whole_set_v1',operationId,bindingSha256}`. Optional incremental item `profileBaselineWitness` applies only to profile/dbo.person.core_residue and fields:{} initial acceptance. Fixed CLI uses pinned `profileManifest`, witness and independent profile exception artifacts.

## 3. Contracts

Resolve exact original source/profile/source-insert receipts, successful operation/batch/current database, scope, immutable binding and exact T0 owner chain before create. Lock original operation FOR SHARE against rollback. During initial certification lock profile/source/all receipts SHARE, fix Asia/Shanghai, recompute original SQL to_jsonb full-row sorted SHA aggregate and all-receipt aggregate, equal immutable owned_state count/hash. Cache set certificate only within the same transaction EntityManager while locks are held. Authenticate original encrypted source canonical hash, int id profile identity, distinct person-code owner identity and six nullable source columns. Prove old trim ID equals decrypted certified target plus current hash/mask/type. Source normalization and original target baseline stay separate.

Migration000330 stores encrypted immutable provenance/certificate with exact original receipt FK. Baseline-only changes ledger only; accepted baseline cannot reset. Ordinary future changes reuse source/target baseline without whole-set gate, stable identity fingerprints, existing three-way/CAS and per-domain permissions. Existing v1 T0/T2 behavior remains compatible.

## 4. Validation & Error Matrix

Wrong scope/owner/receipt/batch/rollback/binding => PROFILE_ORIGINAL_EVIDENCE_INVALID. Unreviewed mapper => PROFILE_ORIGINAL_MAPPER_UNSUPPORTED. Whole set mismatch => PROFILE_ORIGINAL_SET_CHANGED. Old ID incompatibility => PROFILE_ORIGINAL_ID_INCOMPATIBLE. Changed accepted witness => PROFILE_BASELINE_ALREADY_ANCHORED. Target version race => transaction rollback. No witness for existing unknown profile => explicit INITIAL_FIELD_BASELINE_UNKNOWN, never create.

## 5. Good / Base / Bad Cases

Good: baseline-only originals unchanged, then changed source updates only nonconflicting fields. Base: same source preserves unrelated modern edits; random encryption is not a source change. Bad: old materialized ciphertext as raw input, guessed DOB/enum/name identity, edited current row certified as original, arbitrary source row omitted, original aggregate re-gated after accepted modern edit.

## 6. Tests Required

`yuzhou-profile-incremental-projection.contract.mjs` verifies raw identity/hash/DOB/protected input/coverage/admission and fixed-entry exclusion accounting. `hr-yuzhou-profile-baseline.pg.spec.ts` applies real migrations in strict loopback fresh DB, executes real CLI packages, rejects scope/target/rollback/receipt tamper, proves baseline business equality/replay/new profile/new employee+profile, protected field conflict, immutable provenance and two-connection CAS rollback; asserts current_database and cleanup residual0. Relevant existing incremental and v1 baseline suites must also pass.

## 7. Wrong vs Correct

Wrong: treat absent legacy map as a new original T5 profile, fabricate per-row original target_after from a new hash, export keys or silently drop historical/new invalid changes. Correct: source-bound original resolver and transactional whole-set certificate once, ordinary three-way comparison thereafter, exact immutable caller-custody exception declarations and explicit pending accounting.

Direct reusable builder 的 profile witness 必须是严格完整 v1；manifestId 绑定 witness 字节与 admission 声明，配方也绑定 shared profile witness contract。禁止传入任意 `profileOmittedFields`。入口向 builder 传递 `profileAdmissionEvidence`（declaration=`caller_attests_original_unchanged_invalid_fields`、targetScope、artifactCanonicalSha256、原 artifact），builder 独立验证声明/摘要/scope/原 operation，并仅对 exact identity+原完整 sourceRowSha 的匹配行推导省略字段。私有工件仍是 caller custody 声明，不因此升级成独立认证的原字段决策。

Exact employeeIndex requires sourceTable=dbo.person and raw sourceKey=trimmed employeeCode; reject alternate raw keys instead of binding a new profile to a different employee. Original T0 owner validation holds employee row FOR SHARE through certification/commit to prevent concurrent owner scope/deletion changes.

## Scenario: Explicit original alias field acceptance

Private source preparation reuses the observer CTE in one `REPEATABLE READ READ ONLY` snapshot and the existing sensitive-data decoder inside the API container. Recompute the complete source ledger with PostgreSQL's actual newline separator; test this against real PostgreSQL, not a duplicated fixture assumption. Validate original operation binding, raw row hash and separate employee identity before calling the ordered builder. Observe actual runtime identity before and after collection, reject drift, and retain before images in a new 0700 directory with 0600 files. Public output contains only aggregate counts/hashes and HOLD; preparation does not authorize or execute a business write.

Offline original-alias batch preparation reuses `buildLegacyPersonnelAliasBackfillPlan` and the fixed package builder through `build-yuzhou-profile-alias-batch.mjs`. Authenticate raw identity/hash, full planner-source equality and exact employee owner; never accept an aggregate seal as a private per-row plan. All original baseline packages precede every alias package, including across the 2000-item boundary. Group requested aliases per profile so two first fields use one item/version. Preserve every nonnull modern target, including an empty string. Ordered packages remain separate transactions; stop and query on failed/uncertain operations. No new API writer, auth or migration. Tests must consume the real offline output through public ValidationPipe/preview/commit plus existing CAS/provenance checks; source-bound rehearsal and actual production values remain separate acceptance.

### 1. Scope / Trigger

Add verified oldaddr→nativePlace and edulevel→degree to the raw profile adapter. Existing original T5 six-field baselines remain immutable evidence, while an explicit alias-only request can establish first-field acceptance from retained original source/target proof. The unknown-field guard applies to `profile/dbo.person.core_residue`; preserve generic `dbo.profile` API behavior.

### 2. Signatures

- Staging CLI config `profileAliasAcceptance:{path,sha256}` resolves a private pinned artifact. Direct builder accepts its contents.
- API item `profileAliasAcceptance:{version:1,proof:'original_t5_alias_fields_v1',operationId,bindingSha256,fields:('nativePlace'|'degree')[]}`.
- `fields` is nonempty and unique; API item `fields` must contain exactly these requested aliases. No original baseline/initial witness may accompany it.
- `originalProfileAliasProof(original,provenance,sensitive,fields)` reads hash-authenticated raw source and 000330 `certifiedOriginalTarget`; it never reads current values as original evidence.
- Existing preview/commit routes, item/revision ledgers, permissions and CAS; no new migration or production writer.

### 3. Contracts

- Ordinary raw adapter requires the original six columns and treats new columns as optional. Missing means omitted; null/blank means null. Source maxima 50/24 Unicode code points; malformed text/length/type rejected. Modern maxima 128/64 retained at API.
- The 33-field modern DTO inventory has exactly 8 supported raw fields and 25 pending fields. No edu/secedu precedence, physical→healthStatus, grade→jobGrade or unresolved dictionary inference.
- Alias marker is included in rowDigest only when present, as well as manifest/package hash. Old marker-free digest/package semantics remain compatible.
- Existing unknown raw fields conflict unless explicitly accepted against original evidence. Validate exact operation/binding/owner/scope/receipts; re-authenticate encrypted original source row hash and original identity. Certificate counts/hashes must match immutable saved certificate and original operation commitments.
- First acceptance requires a nonempty authenticated original alias source after trimming, original alias target null, current target equal original null, and current version equal certified original version. The input value must equal authenticated original source. Force requested first fields into the write set even if the new and original source values are equal.
- Preserve old six-field source/target baselines and 000330 immutable provenance/old receipts. Successful commit merges only requested aliases into accepted field state and appends `PROFILE_ALIAS_FIELDS_ACCEPTED` with original operation, binding, source-row hash and accepted field names.
- Original source first-acceptance package precedes any changed new-source package. Subsequent accepted aliases use ordinary three-way comparison/CAS. Ordinary marker-free old six-field packages remain replayable.
- Aggregate version cannot distinguish unrelated modern edits from alias edit+clear, so either blocks first acceptance. Modern maintenance remains available; a future trusted field-history protocol is required to admit these changed targets. Accepting only one alias changes the version and does not authorize the other unknown field.
- Existing transaction/source locks serialize first acceptances; target observation version CAS rolls back target, item and acceptance revision after a competing edit.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Unknown original raw field without explicit proof | plan/commit `INITIAL_FIELD_BASELINE_UNKNOWN` plus field names |
| Wrong/null/duplicate/extra marker or non-alias payload field | `PROFILE_ALIAS_ACCEPTANCE_INVALID` (CLI `YUZHOU_PROFILE_ALIAS_ACCEPTANCE_INVALID`) |
| No accepted immutable original profile proof | `PROFILE_ALIAS_ORIGINAL_BASELINE_REQUIRED` |
| Different original operation or binding | `PROFILE_ALIAS_BINDING_MISMATCH` |
| Changed certificate/invalid original snapshot | `PROFILE_ALIAS_PROVENANCE_INVALID` |
| Original source/target lacks required alias column | `PROFILE_ALIAS_ORIGINAL_FIELD_MISSING` |
| Original alias source null/blank | `PROFILE_ALIAS_ORIGINAL_SOURCE_EMPTY` |
| Original alias source invalid type/length/Unicode | `PROFILE_ALIAS_ORIGINAL_FIELD_INVALID` |
| Original target non-null | conflict `PROFILE_ALIAS_ORIGINAL_TARGET_NOT_EMPTY` |
| First input differs from original source | conflict `PROFILE_ALIAS_ORIGINAL_SOURCE_CHANGED` |
| Current aggregate version differs from original | conflict `PROFILE_ALIAS_TARGET_HISTORY_CHANGED` |
| Current same-field modern edit | conflict, preserve modern value |
| Post-observation concurrent edit | `Incremental target changed concurrently`, atomic rollback |
| Source hash/owner/receipt/scope drift | existing `PROFILE_ORIGINAL_EVIDENCE_INVALID` path |

### 5. Good/Base/Bad Cases

Good: original source has aliases, original and current target null and same version → explicit CLI marker → actual fill → later changed source updates accepted aliases. Base: old six-field package replays without new columns; new profiles establish eight-field baselines. Bad: treating modern current null as original null, silently extending the six-field witness, or marking equal original source as unchanged before the first fill.

### 6. Tests Required

- Actual staging CLI asserts alias-only payload, row/package marker binding, field coverage, pinned reference receipt, required/optional/null/schema/date/length/Unicode/digest/duplicate checks, 2000+1 split and exact 33-field DTO inventory.
- Real PG applies original migrations and actual CLI packages; asserts first fill, replay, single-field request, later source update, modern conflict, unrelated edit and edit+clear rejection, forged owner/source/receipt/certificate, original non-null rejection, unchanged old baselines/receipts/provenance, concurrent acceptance exactly once and two-connection CAS rollback.
- New-profile alias values and explicit null clear tested; existing generic incremental and initial-baseline PG suites remain passing. Dedicated random database/current_database/zero-residual checks mandatory.

### 7. Wrong vs Correct

Wrong: `if (current.nativePlace === null) baseline.nativePlace = null` or merging modern values into original provenance.

Correct: authenticate original raw source and immutable certified target, require original null plus current equality/version proof, force first alias write, append accepted field receipt, then use normal three-way/CAS on later packages.

Alias-only CLI projection authenticates the complete raw source and employee identity, then validates/projects exactly requested nativePlace/degree. Unrequested historical birthday/email/ID values remain hash-bound source evidence with `not_requested_alias_acceptance` coverage, never ordinary profile writes. Do not run full-profile date/email/ID validation before selecting aliases; normal marker-free imports retain all existing field/admission validation. Regression must run the actual staging CLI and ordered source assembly with invalid unrelated historical fields, reject altered full source hashes and invalid requested aliases, and assert alias-only payloads.

Private source collector connection disables JIT without changing the observer CTE, 5s statement timeout or 2s lock timeout. A forced-cost-threshold PostgreSQL test must use the actual container read program and produce identical source/receipt/owner facts, then drop its owned random database and prove zero residual. Synthetic query performance is not production preparation acceptance.
