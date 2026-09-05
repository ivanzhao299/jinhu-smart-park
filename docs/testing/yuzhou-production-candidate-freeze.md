# Private T0–T3 candidate preparation

`scripts/hr-cutover/materialize-production-import-frozen-decisions.mjs` connects the existing four candidate producers to `bridgeProductionImportRealArtifacts` and its payload generator. It reads explicitly supplied private files and creates preparation evidence plus the existing real role wrappers. It never extracts source data, connects to a database, discovers keys, signs approvals, activates a runtime or performs business writes.

Run from a clean tracked checkout whose HEAD equals the supplied C. The CLI and its direct preparation dependencies must themselves be tracked at that HEAD; an untracked copy of the command is rejected rather than treated as released code:

```sh
node scripts/hr-cutover/materialize-production-import-frozen-decisions.mjs --config /absolute/private/config.json
```

Only `--config` is accepted. The operator creates an empty owned `0700` output directory first. Config and every input must be canonical absolute paths to owned `0600`, single-link regular files, inside owned `0700` directories. Symlinks, hardlinks, replaced files, stale hashes and stale code are rejected. Inputs are preserved; retries use a new empty output directory. The CLI returns aggregate counts and hashes only.

## Config

Config is an exact object with `formatVersion: 1`, `triple`, `artifacts`, and `outputDir`. `triple` has the existing exact keys `codeSha` (40 lowercase hex), `sourceSnapshotHash` and `mappingContractHash` (64 lowercase hex). It is an explicit expected C/S/M; this command never rebases historical source/mapping evidence to newer code or changes a source manifest.

`artifacts` has exactly:

- `phases`: object with `T0`, `T1`, `T2`, `T3` descriptors for the original producer phase files. Use T3's matching normalized phase.
- `candidates`: object with the same four keys, describing the four producer candidate files.
- `targetInventory`: descriptor for the full sixteen-table `yuzhou_hr_production_target_inventory_readonly` inventory.
- `targetScope`: descriptor for the existing raw scope JSON containing exactly `tenantId` and `parkId`, or its three-field normalized form with `scopeSha256`. IDs must be nonempty trimmed strings. The adapter computes the hash using the existing target-scope helper; if a hash is supplied, it must match exactly. Unknown fields are rejected. The normalized scope must match the inventory and all candidates, while evidence retains the original scope file-byte SHA without rewriting the input.
- `reviewedDecisions`: `null` for insert-only or not-yet-reviewed preparation; otherwise a descriptor for the reviewed resolution document below.

Every descriptor is exactly `{ "path": "/absolute/private/file.json", "sha256": "<actual file-byte SHA-256>" }`. The hash covers exact bytes, including whitespace/newlines. These are distinct from canonical frozen content hashes produced by the bridge.

The adapter recognizes T1's `targetSnapshotArtifactSha256` and `t0DecisionCandidatesArtifactSha256` aliases and validates its five-key dependency annotations before projecting the generator's four-key references. It checks phase provenance one-to-one, all table/disposition counts, scope, target identity, inventory, T0 binding, target field types, actual business identity, derived IDs, target canonical hashes and versions. Legacy T0/T1 phase files without explicit table counts must contain every table in their phase. Missing legacy zero-table evidence is a HOLD/rejection requiring corrected producer coverage, not an inferred zero. T2/T3 explicit zero tables remain included.

The T2 private materializer additionally emits `resolutionEvidence`, while its pure assembler omits it. Only T2 may supply this optional exact object: `{dictionaryPackageSha256,changeDecisionsSha256,approvalClaimed:false}`. Dictionary SHA must be lowercase SHA-256; change-decision SHA may be lowercase SHA-256 or `null`. Unknown keys, invalid hashes or an approval claim reject preparation. When present, it is retained as `t2ResolutionEvidence`, together with the exact original T2 candidate byte SHA; these references do not authenticate an external approval or rebind historical mapping evidence. T3's materializer emits its candidate unchanged and keeps recovery lineage and receipt metadata in separate artifacts.

## Reviewed non-inserts

Verified `insert` candidates need no external review row. Every `skip_exact`, `review_target_collision` or `quarantine` candidate needs exactly one externally reviewed resolution before wrappers can be emitted. Missing rows return counted `REVIEW_HOLD` with retained evidence; duplicates, extras, unsupported shapes and stale bindings reject the call. Invalid inserts and candidate coverage are checked even when review is missing.

The resolution document is exactly:

```text
{
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_reviewed_candidate_resolutions",
  triple, targetScope, targetInventoryArtifactSha256,
  candidateArtifactSha256: { T0, T1, T2, T3 },
  records: [review, ...]
}
```

Each `review` is exactly `{phase,targetTable,sourceIdentitySha256,sourceRowSha256,candidateArtifactSha256,decision,attestationBase64,cryptoEnvelope}`. `decision` uses the existing frozen decision row contract: `phase`, `targetTable`, `sourceIdentitySha256`, `disposition`, `targetFields`, `dependencyRefs`, `decisionAttestationSha256`, plus disposition-specific fields:

| Candidate | Reviewed disposition | Required additional fields |
| --- | --- | --- |
| `skip_exact` | `skip_approved` | `expectedTargetVersionBefore` |
| `review_target_collision` | `merge`, only where target model permits | `expectedTargetVersionBefore`, `beforeImage` |
| Any non-insert | `quarantine` | `quarantine` |

An original quarantine stays quarantine. Source corrections require new authenticated upstream evidence. Skip/merge retain the candidate's exact fields and normalized dependencies. Quarantine requires an explicit partial `targetFields` object and explicit executable `dependencyRefs`; `{}` and `[]` are permitted only when deliberately reviewed. Every supplied executable ref must resolve. Original reasons and all original references, including dangling references, remain in retained evidence. A non-null original reason must remain the quarantine reason.

`attestationBase64` contains externally supplied UTF-8 JSON with exactly `{binding,signatureBase64,publicKeyPem}`. Its actual byte SHA must equal `decisionAttestationSha256`. Its declared `binding` must equal exactly `{triple,targetScope,targetInventoryArtifactSha256,candidateArtifactSha256,sourceRowSha256,decision,cryptoEnvelope}`, where `decision` omits only `decisionAttestationSha256` to avoid a cycle. Thus changing reviewed fields, refs, ciphertext context or source binding cannot reuse unrelated attestation bytes. Signature encoding and the public-key header are checked; this adapter does **not** establish cryptographic signature validity, signer identity, trust, authorization or approval. The external review authority supplies and authenticates that evidence; self-supplied or unsigned bytes confer no authority. Existing downstream signed approval/activation gates remain mandatory.

For `skip_approved`, `cryptoEnvelope` is `null`. For merge/quarantine it is exactly `{operationId,algorithm,keyReferenceSha256,nonceBase64,authenticationTagBase64,ciphertextBase64}`. Use an envelope already prepared with the existing crypto provider and the intended operation/phase/source/payload/scope context. Algorithm is `aes-256-gcm-external-kek-v1`, nonce is 12 bytes, tag is 16 bytes, ciphertext is nonempty and at most 8 MiB. Actual ciphertext SHA and key reference must equal existing `beforeImage` or `quarantine` metadata; merge plaintext/canonical hash and target version must equal the authenticated inventory. The adapter does not decrypt or prove AEAD authentication. The eventual crypto provider still checks the actual envelope against execution context. Retain and reuse the prepared envelope; encrypting again changes its nonce and ciphertext hash.

No original source fields are archived by encrypting `{}`. Keep the original private source, normalized phase, candidates, recovery lineage and upstream evidence, plus this preparation evidence. The retained candidate row preserves original exception details and projections, not an unobserved full raw source record.

## Outputs and limits

Every run writes `candidate-preparation-evidence.json`. A structurally `READY` bridge result also writes `real-decisions.json`, `real-inventory.json`, and `real-scope.json` using existing wrapper contracts. Supply those wrappers and the unchanged original phase descriptors to the existing bridge/generator for subsequent preparation. No sealed execution plan is produced.

`candidate-freeze-receipt.json` is written last. It includes artifact byte hashes/lengths, C/S/M, config hash, counts, `approvalClaimed: false`, `signatureAuthenticityVerified: false`, `executionReachable: false` and `productionImport: HOLD`. Missing reviews or a generator HOLD produces no decision/inventory/scope wrappers. A receipt alone is insufficient: validate all referenced output bytes, original input bindings and successful command outcome.

Config is limited to 1 MiB; inventory/scope metadata to 32 MiB each; phases/candidates/reviews to 384 MiB each; all input to 1 GiB. Each output is limited to 384 MiB, all outputs including receipt to 1 GiB. Reads/writes use 64 KiB chunks, exclusive creation, no-follow descriptors, fsync and hash readback. After receipt readback, the directory must contain exactly the declared data artifacts and that receipt; a concurrently added output prevents completion. Records serialization reuses the existing chunked canonical serializer. Processing still retains parsed data and invokes the existing in-memory bridge/generator; these bounds do not prove full-scale peak memory suitability.

Caught failures preserve partial data files. A failed completion marker is removed only if its path still names this run's inode; a replacement is preserved. An abrupt process/OS failure may leave incomplete output. Do not reuse or clean a failed directory automatically.

## Validation

```sh
pnpm test:e2e:yuzhou-production-import-real-artifact-bridge
node scripts/e2e/yuzhou-production-import-payload-generator-contract.mjs
```

The focused suites use synthetic data only, real test-only Ed25519 signatures and AES-GCM roundtrips, actual T2/T3 assembler envelopes, sixteen-table and zero-table coverage, mismatched bindings, reviewed projections, and private IO failures. They do not validate actual private artifacts, live target state, historical source authenticity, full-scale memory, production permissions, T4/binaries or import readiness.
