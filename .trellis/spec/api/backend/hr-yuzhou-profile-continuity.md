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
