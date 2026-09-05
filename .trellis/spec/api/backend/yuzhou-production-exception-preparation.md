# Quarantine envelope and external-review preparation

## 1. Scope / Trigger

Use for the private producer between T0–T3 candidate freeze and execution crypto consumers. Quarantine only; no new planner/writer, signing authority, source extraction, DB, production key generation or activation. See `docs/testing/yuzhou-production-exception-preparation.md` for exact operator schemas.

## 2. Signatures

`prepareProductionImportExceptions({freezeInput,choicesArtifact,operationId,keyReferenceSha256},{resolveKey})` returns `{prepared,envelopes,summary}`.

`finalizeProductionImportExceptions({...prepareInput,preparedArtifact,envelopesArtifact,attestationsArtifact,reviewersArtifact},{resolveKey})` returns `{reviewed,summary}`.

Descriptors are exact `{path,bytes,sha256}`; raw bytes are fatal-UTF-8/hash checked. Resolver receives the existing crypto context object including `keyReferenceSha256`; no signing callback exists.

`materializeProductionImportExceptionPreparation(configPath,options?)` / `node scripts/hr-cutover/materialize-production-import-exception-preparation.mjs --config <absolute-private-config>` own file IO. Test-only options may lower bounds or supply `currentHead`; production config cannot override code, resolvers or limits.

## 3. Contracts

- Config exact `{formatVersion,mode,triple,operationId,keyReferenceSha256,artifacts,outputDir}`. Artifacts contain exact T0–T3 phase/candidate maps, inventory, scope, choices, raw key descriptor; finalize additionally prepared/envelopes/attestations/reviewerKeys. No reviewed input is accepted in the initial freeze input.
- Choice records exactly `{phase,targetTable,sourceIdentitySha256,sourceRowSha256,reasonCode,targetFields,dependencyRefs}`. Bind all four phase/candidate byte hashes plus inventory, original scope bytes and C/S/M. Require complete quarantine coverage and original reasons. Insert projection stays automatic in existing freeze. Never convert skip/collision into quarantine or invent parent refs.
- Prepare runs existing freeze once without reviews; normalize explicit partial fields before `computeProductionImportPayloadHash` and existing encryption. Retain original candidate separately from executable ref/field choices. Emit base64 review and hex execution representations of identical bytes. Both formats retain exact operation/keyref and original crypto AAD.
- Unsigned output is `yuzhou_hr_production_import_unsigned_exception_requests`, never reviewed evidence. Bind choice bytes and execution envelope artifact bytes, retaining candidate/phase/inventory/scope identities. Do not infer review authorization from explicit choices.
- Finalize verifies external `Ed25519` signature over UTF-8 canonical `binding` without newline. Attestation exact `{binding,signatureBase64,publicKeyPem}`. Public key must match explicitly pinned SHA-256 SPKI DER in the supplied reviewer key artifact. Reject unknown keys, invalid signatures and incomplete/duplicate/excess attestations. This establishes no organizational identity or production approval.
- Verify plaintext and all AAD using the existing crypto decryptor, never re-encrypt; require identical hex entries. Assemble the existing reviewed resolution shape and invoke freeze once with reviews for authoritative full coverage/graph/model validation. Original prepared candidate must equal the candidate found by final freeze. Do not retain an extra no-review freeze result during finalize.
- IO reuses the freeze materializer's bounded canonical owner-only/no-follow/single-link helpers, exclusive output reservations, fsync/readback and receipt-last. Config <=1MiB, metadata <=32MiB, phase/candidate <=384MiB, input/output aggregate <=1GiB. External key exactly32 raw bytes, loaded lazily; zero key and shared read scratch buffers in finally. No key descriptors in public summaries/receipts.
- HEAD must equal C and all tracked files clean; known runtime dependencies must be tracked. Recheck before writes. Return `HOLD`, `approvalClaimed:false`, `signerAuthorityEstablished:false`; finalize's true signature flag means only the provided key set. Preserve independent execution role requirements.

## 4. Validation & Error Matrix

| Condition | Stable result |
| --- | --- |
| Descriptor byte hash / JSON invalid | `EXCEPTION_PREPARATION_HASH_MISMATCH` / `JSON_INVALID` |
| Wrong choice bindings or coverage | `CHOICE_BINDING_INVALID` / `CHOICE_COVERAGE_INVALID` (same prefix) |
| Invalid explicit executable ref | `CHOICE_DEPENDENCY_INVALID` |
| Prepared/envelope binding drift | `PREPARED_BINDING_INVALID` / `ENVELOPE_BINDING_INVALID` |
| Missing/extra/duplicate attestations | `ATTESTATION_COVERAGE_INVALID` or later stable coverage/encoding rejection |
| Unpinned key or invalid signature | `SIGNATURE_INVALID` |
| Existing model/crypto validation fails | sanitized `VALIDATION_FAILED` |
| Reviewed freeze not READY | `FREEZE_NOT_READY`; no finalized artifact |
| Unsafe private IO or unexpected lower-level failure | sanitized `PRIVATE_IO_OR_VALIDATION_FAILED` |
| Output failure | no valid completion receipt, preserve partial data |

All short codes above use `EXCEPTION_PREPARATION_` prefix; messages equal codes and never include private data/path details.

## 5. Good / Base / Bad Cases

Good: nonempty decimal/boolean/text partial fields are encrypted and a genuine externally signed binding finalizes into the existing freeze/generator/execute crypto flow, preserving identical ciphertext and orphan evidence.

Base: explicit empty projection encrypts `{}` but retains original candidate references separately and claims no raw-source archival. Unsigned preparation awaits external signatures and remains HOLD.

Bad: infer parent refs, sign with an invented identity, use raw unnormalized fields for payload hash, re-encrypt at finalize, trust PEM header without signature validation, or treat pinned-key verification as organizational authorization.

## 6. Tests Required

`scripts/e2e/yuzhou-production-import-exception-preparation-contract.mjs`: actual private prepare/finalize, ephemeral external Ed25519 signing, nonempty payload through actual execution crypto provider, unchanged nonce/tag/ciphertext; unsigned rejection; choices/coverage/ref/type/hash/signature/GCM/context negatives; permission/symlink/hardlink/size/budget/occupied directory checks; key zeroing on success and post-key failure. Retain existing freeze/materializer/bridge/generator/crypto tests. No real production artifacts in test fixtures.

## 7. Wrong vs Correct

Wrong: `sign(binding, generatedProductionIdentity); summary.approved = true;`

Correct:

```js
const result = await finalizeProductionImportExceptions(authenticatedInputs, { resolveKey });
// Verified only relative to explicitly supplied reviewer keys; independent approval stays external.
return { ...result.summary, productionImport: "HOLD", signerAuthorityEstablished: false };
```
