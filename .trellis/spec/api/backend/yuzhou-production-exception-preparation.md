# Quarantine envelope and external-review preparation

## 1. Scope / Trigger

Use for the private producer between T0–T3 candidate freeze and execution crypto consumers. Quarantine only; no new planner/writer, signing authority, source extraction, DB, production key generation or activation. See `docs/testing/yuzhou-production-exception-preparation.md` for exact operator schemas.

## 2. Signatures

`prepareProductionImportExceptions({freezeInput,choicesArtifact,operationId,keyReferenceSha256},{resolveKey})` returns `{prepared,envelopes,summary}`.

`finalizeProductionImportExceptions({...prepareInput,preparedArtifact,envelopesArtifact,attestationsArtifact,reviewersArtifact},{resolveKey})` returns `{reviewed,summary}`.

Descriptors are exact `{path,bytes,sha256}`; raw bytes are fatal-UTF-8/hash checked. Resolver receives the existing crypto context object including `keyReferenceSha256`; legacy prepare/finalize have no signing callback. Finalize's opt-in `includeBridgeEvidence` returns only small generation/output hashes and target identity from the same validated freeze, not duplicated candidate/bundle arrays.

`materializeProductionImportExceptionPreparation(configPath,options?)` / `node scripts/hr-cutover/materialize-production-import-exception-preparation.mjs --config <absolute-private-config>` own file IO. Test-only options may lower bounds or supply `currentHead`; production config cannot override code, resolvers or limits.

## 3. Contracts

- Config exact `{formatVersion,mode,triple,operationId,keyReferenceSha256,artifacts,outputDir}`. Artifacts contain exact T0–T3 phase/candidate maps, inventory, scope, choices, raw key descriptor; finalize additionally prepared/envelopes/attestations/reviewerKeys. No reviewed input is accepted in the initial freeze input.
- Choice records exactly `{phase,targetTable,sourceIdentitySha256,sourceRowSha256,reasonCode,targetFields,dependencyRefs}`. Bind all four phase/candidate byte hashes plus inventory, original scope bytes and C/S/M. Require complete quarantine coverage and original reasons. Insert projection stays automatic in existing freeze. Never convert skip/collision into quarantine or invent parent refs.
- Prepare runs existing freeze once without reviews; normalize explicit partial fields before `computeProductionImportPayloadHash` and existing encryption. Retain original candidate separately from executable ref/field choices. Emit base64 review and hex execution representations of identical bytes. Both formats retain exact operation/keyref and original crypto AAD.
- Unsigned output is `yuzhou_hr_production_import_unsigned_exception_requests`, never reviewed evidence. Bind choice bytes and execution envelope artifact bytes, retaining candidate/phase/inventory/scope identities. Do not infer review authorization from explicit choices.
- Finalize verifies external `Ed25519` signature over UTF-8 canonical `binding` without newline. Attestation exact `{binding,signatureBase64,publicKeyPem}`. Public key must match explicitly pinned SHA-256 SPKI DER in the supplied reviewer key artifact. Reject unknown keys, invalid signatures and incomplete/duplicate/excess attestations. This establishes no organizational identity or production approval.
- Verify plaintext and all AAD using the existing crypto decryptor, never re-encrypt; require identical hex entries. Assemble the existing reviewed resolution shape and invoke freeze once with reviews for authoritative full coverage/graph/model validation. Original prepared candidate must equal the candidate found by final freeze. Do not retain an extra no-review freeze result during finalize.
- IO reuses the freeze materializer's bounded canonical owner-only/no-follow/single-link helpers, exclusive output reservations, fsync/readback and receipt-last. Config <=1MiB, metadata <=32MiB, phase/candidate <=384MiB, input/output aggregate <=1GiB. External key exactly32 raw bytes, loaded lazily; zero key and shared read scratch buffers in finally. No key descriptors in public summaries/receipts.
- HEAD must equal C and all tracked files clean; known runtime dependencies must be tracked. Recheck before writes. Return HOLD and no signer identity claim; finalize's true signature flag means only the provided key set. Preserve legacy independent execution roles unless the authorization explicitly selects the single-owner policy below.

### Explicit single-owner policy

- `production-import-approval-policy.mjs` owns `single_accountable_owner_v1`. Authorization has an optional exact `approvalPolicy={kind,confirmation,operatorAttestation}`. Explicit selection requires one and only one `approvalSet` row `{role:"accountable_owner",subjectRefSha256,ownerDecisionSha256}` matching the confirmation owner and canonical confirmation+newline SHA. No policy retains the legacy three unique roles, subjects and decision hashes. Unknown policy/extra owners reject, never downgrade. Do not change the independent conflict ledger or rollback policy.
- Confirmation exact fields and private config are documented in `docs/testing/yuzhou-production-exception-preparation.md`. Record explicit-user-confirmation provenance hash separately from owner/operator subjects. Operator signature over canonical complete confirmation (no newline) binds operation, exact authorization binding, lifetime, nonce, actual prepared/reviewed/bridge-receipt byte hashes and four phase payload bundle hashes. SPKI DER key hash must match the confirmation. This verifies delegated integrity, not personal/organizational identity or business acceptance.
- `finalizeDelegatedProductionImportExceptions` signs with a supplied Ed25519 operator key, then reuses actual finalize signature/GCM/coverage/graph validation and its single freeze. Produce existing reviewed resolutions unchanged plus signed small bridge evidence. `mode:"delegate"` is the actual private-file route; use `prepared,envelopes,operatorKeyFile`, no external attestations/reviewerKeys. Never generate keys, change quarantine reasons/fields, or duplicate full freeze results.
- `authorizeDelegatedProductionImport` and `materializeProductionImportDelegatedAuthorization` read exact confirmation/provenance/prepared/reviewed/bridge evidence. Check actual provenance bytes against the reference; verify bridge and every reviewed binding signature under the confirmation-pinned operator key, original prepared row equality and exact C/S/M, operation, target/scope and bundle map. Trust the authenticated finalize receipt for its prior full graph/GCM check; do not pretend authorize reruns it. Final operator signature uses the same supplied key. CLI emits actual one-time authorization and matching sealed authorization fields, receipt last, never calls writer/sealer/DB.
- Sealed validation derives expected payload map from `plan.phases` and compares complete signed context to actual plan binding/times/nonce. Preflight v1 requires a new explicit plan/binding `targetScopeSha256` only with the explicit policy, otherwise rejects it; v1 lacks executable bundles and cannot establish v2 bundle matching. Keep schema parity. Execution/freeze/private CLI dependency lists include the shared module. Writer's approval-set digest, one-time replay controls, runtime binding, activation and separate rollback authorization stay unchanged.
- Authorization IO: config/provenance/output <=1MiB each, metadata <=32MiB, supplied signing PEM <=16KiB, aggregate input <=128MiB; same owner-only/no-follow/single-link/stable-file/exclusive/fsync/readback rules. No key descriptor in stdout/receipt; clear key byte copies on both outcomes. Stable sanitized `PRODUCTION_IMPORT_DELEGATION_INVALID` / `PRODUCTION_IMPORT_DELEGATED_AUTHORIZATION_FAILED`; approval validator uses `PRODUCTION_IMPORT_SINGLE_OWNER_POLICY_INVALID`.

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

`scripts/e2e/yuzhou-production-import-exception-preparation-contract.mjs`: actual private prepare/finalize and delegate/authorize routes, ephemeral Ed25519 signing, nonempty payload through actual execution crypto provider and real sealed validator, unchanged nonce/tag/ciphertext; root-org/child-org/employee graph; unsigned rejection; owner coverage/provenance/operation/C/S/M/target/artifact/payload-map/window/signature/GCM negatives; permission/symlink/hardlink/size/budget/occupied directory checks; key zeroing on success and post-key failure. Preflight tests preserve legacy unique subjects, explicit scope and nonce replay. Retain existing freeze/materializer/bridge/generator/crypto tests. All tests run in existing package CI entries. No real production artifacts in fixtures.

## 7. Wrong vs Correct

Wrong: `sign(binding, generatedProductionIdentity); summary.approved = true;`

Correct:

```js
const result = await finalizeProductionImportExceptions(authenticatedInputs, { resolveKey });
// Verified only relative to explicitly supplied reviewer keys; independent approval stays external.
return { ...result.summary, productionImport: "HOLD", signerAuthorityEstablished: false };
```
