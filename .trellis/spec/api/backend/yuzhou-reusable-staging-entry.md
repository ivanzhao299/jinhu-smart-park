# Reusable Yuzhou staging entry

## 1. Scope / Trigger

Offline T0/T2 and pinned person_core staging to the existing employee/profile/contract incremental package builder. Reuse reviewed mappings and original exclusion receipts for unchanged historical exceptions. This command neither extracts SQL Server backups nor writes production. Organization/position inputs and employee source relationships follow [Organization Continuity](hr-yuzhou-organization-continuity.md); other unsupported fields remain pending.

## 2. Signatures

`node scripts/hr-cutover/build-yuzhou-import-from-staging.mjs --config /absolute/private/import-config.json`

Exports `assembleYuzhouImportFromStaging(configPath)` and `materializeYuzhouImportFromStaging(configPath)`. Assembly returns `{input, receipt, outputDir}`. Materialization returns the existing reusable builder result and writes `assembly-receipt.json` beside its ordered packages, manifest and coverage.

## 3. Contracts

Configuration version 1 requires `t0Manifest`, `includeEmployees`, UTC `extractedAt`, `sourceCustody` and absolute new `outputDir`. Optional references are `t2Manifest`, `jobStateDecisionArtifact`, `contractTypeMappingArtifact`, `contractStateResolutions`, `historicalExclusions`. Each reference is exactly `{path,sha256}` using actual file bytes.

Custody requires snapshot/evidence SHA-256 and `declaration=caller_attests_same_controlled_snapshot`; optional `{tenantId,parkId}` binds a provided type artifact. Exclusions require that scope. Integrity does not independently authenticate source custody or authorize production.

T0 verifies all six fixed domains; T2 all four. Validate manifest filenames, counts, byte hashes, source identities and row hashes before mapping. Invert T2 transport backslash doubling before JSON parsing, then invoke the existing staged-record verifier. Never rewrite parsed source strings or recompute a supplied digest to make invalid input pass.

Exclusion version 1 is `yuzhou_original_historical_exclusions`, policy `ARCHIVE_UNCHANGED_ORIGINAL_QUARANTINE`, with original snapshot, operation, sealed-plan, plan-file, execution-proof hashes and scope. Operation follows `yzprod-import-YYYYMMDDTHHMMSSZ-12hex`. Entries bind employee/dbo.person or contract/dbo.compact identity and exact row hash, decision hash and reason code. Only unchanged rows are excluded. Changed rows enter normal validation; absent old rows imply no deletion.

Receipt distinguishes requested/excluded/eligible source rows, actual `apiInput` and `dependencyIndex`. Contract-only mode uses verified eligible employees as an index rather than employee output. Materialized item count must equal API organization plus position plus employee plus profile plus contract input counts. Pending domains remain accounted for, not silently declared imported.

Inputs are regular single-link 0600 files under 0700 immediate directories, with absolute paths and no symlink ancestors. Maximum file size is 64 MiB, aggregate input is 256 MiB. Outputs must be new and private. Owned temporary files and partial outputs are removed on failure; existing output is preserved.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Manifest/schema/count/hash/identity/privacy invalid | Fixed safe failure; no package or production write |
| Custody/type scope mismatch | `YUZHOU_STAGING_ENTRY_SCOPE_MISMATCH` |
| Unresolved employee/contract state or missing type | Exact reviewed builder constant survives CLI sanitization |
| Excluded employee leaves an eligible dependent contract | `YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_MISSING`; whole build fails |
| Output count differs from actual input | `YUZHOU_STAGING_ENTRY_ACCOUNTING_MISMATCH` |
| Arbitrary parser/filesystem/downstream message | `YUZHOU_STAGING_ENTRY_FAILED`; no private values in stderr |

## 5. Good / Base / Bad Cases

Good: pinned existing mappings plus valid new staging produce employee-first bounded packages, ready for ordinary authenticated API preview.

Base: unchanged original exceptions are accounted as archived; empty eligible input produces no API package. Source hash changes disable the old exact exclusion.

Bad: new unknown state, forged identity, changed hash, duplicate source, wrong scope or missing dependency must fail instead of guessing or dropping a new contract.

## 6. Tests Required

`node scripts/e2e/yuzhou-staging-import-entry.contract.mjs`: manifest/tamper/privacy validation, literal T2 transport round trip, direct-builder equivalence, exact/changed/absent exclusions, dependency failures and cleanup, contract-only index/count conservation, scope without exclusions, safe CLI errors. Existing builder tests retain count/byte splitting and field coverage assertions.

Genuine-source preparation proves retained source integrity, original mapping binding and package counts only. Synthetic checks and offline packages do not prove new-batch production acceptance, all-field coverage or original operation replay safety.

## 7. Wrong vs Correct

Wrong: rerun original T0–T5 operation or overwrite modern fields because a source record is historical.

Correct: generate a new package with stable source identity, use existing scoped preview/commit baseline comparison and CAS, preserve modern changes, and route actual lifecycle transitions through normal business operations. Review only changed structure/rules or unresolved new facts rather than repeat complete historical A/B.

Profile continuity, raw transport and independent exact historical exception contracts are specified in [hr-yuzhou-profile-continuity.md](hr-yuzhou-profile-continuity.md). The eight supported raw profile fields, explicit alias-only first acceptance and remaining field matrix are specified there.

## Family raw entry

Optional `familyManifest:{path,sha256}` selects `domains.family` from the existing pinned T5 manifest (`family.jsonl`, sourceObject `dbo.family`). The shared retained-domain reader verifies manifest binding, snapshot, bytes/count, exact transport, identity and source-row hash before fixed seven-field projection. Recipe SHA binds the family projector, original date materializer and shared protocol bytes.

Optional `familyExclusions` references version1 `yuzhou_original_family_exclusions`, binding original operation/binding SHA, targetScope and entries `{sourceIdentitySha256,sourceRowSha256,decisionReceiptSha256,reasonCode}`. Only exact unchanged rows are archived; changed and absent rows are counted separately. Receipt explicitly records caller-declared custody and exclusions; integrity is not independent authentication. Family requested/excluded/eligible counts and actual API input are reconciled. Invalid dates stay pending in package declarations and coverage, never clear modern dates.
