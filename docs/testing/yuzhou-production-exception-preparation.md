# Private quarantine preparation and external review

This command connects validated T0–T3 candidates to the existing freeze and execution crypto consumers. It never imports data, contacts a database, generates a key, establishes a person's identity or changes activation. Prepare/finalize retain `productionImport: "HOLD"` and `approvalClaimed: false`. The explicit delegated mode below can sign with a supplied operator key; it does not pretend that the owner personally signed. Legacy inputs still require three independent execution approvers. Only an explicit `single_accountable_owner_v1` policy selects the one-owner authorization contract.

Use a clean tracked checkout whose HEAD equals the explicit C. Do not relabel historical source/mapping evidence to match HEAD. The CLI validates bindings, not source extraction authenticity or operational production readiness. No real source/key artifacts belong in this repository or command output.

## Prepare

```sh
node scripts/hr-cutover/materialize-production-import-exception-preparation.mjs --config /absolute/private/prepare-config.json
```

The config has exactly these fields (angle-bracket strings below are placeholders):

```json
{
  "formatVersion": 1,
  "mode": "prepare",
  "triple": { "codeSha": "<40 lowercase hex>", "sourceSnapshotHash": "<64 lowercase hex>", "mappingContractHash": "<64 lowercase hex>" },
  "operationId": "yzprod-import-20260906T000000Z-aaaaaaaaaaaa",
  "keyReferenceSha256": "<external opaque key-reference hash, not key bytes>",
  "artifacts": {
    "phases": { "T0": {"path":"<absolute path>","sha256":"<exact byte hash>"}, "T1": {}, "T2": {}, "T3": {} },
    "candidates": { "T0": {"path":"<absolute path>","sha256":"<exact byte hash>"}, "T1": {}, "T2": {}, "T3": {} },
    "targetInventory": {"path":"<absolute path>","sha256":"<exact byte hash>"},
    "targetScope": {"path":"<absolute path>","sha256":"<exact byte hash>"},
    "choices": {"path":"<absolute path>","sha256":"<exact byte hash>"},
    "keyFile": {"path":"<external raw 32-byte key file>","sha256":"<exact private key-file byte hash>"}
  },
  "outputDir": "<absolute existing empty private directory>"
}
```

Replace every placeholder and every `{}` phase entry with an explicit `{path,sha256}` descriptor. All four phases are mandatory, including empty domains in the producer-prescribed shape. The key is an explicitly supplied external encryption key; its opaque reference and private-file hash are different concepts. There is no key discovery, environment credential lookup or signing-key input.

The choices artifact is exactly:

```js
{
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_quarantine_choices",
  bindings: {
    triple, // exactly the config C/S/M
    phaseArtifactSha256: { T0, T1, T2, T3 },
    candidateArtifactSha256: { T0, T1, T2, T3 },
    targetInventoryArtifactSha256,
    targetScopeArtifactSha256 // original file bytes, not canonical scopeSha256
  },
  records: [{
    phase, targetTable, sourceIdentitySha256, sourceRowSha256, reasonCode,
    targetFields: { /* explicitly selected partial target-model fields */ },
    dependencyRefs: [ /* explicit executable refs: role, phase, sourceIdentitySha256, expectedTargetTable */ ]
  }]
}
```

Exactly one choice is required for each non-insert candidate, and every such candidate must be quarantine. Skip/collision/merge preparation is outside this command. Choice phase/table/source/reason must match the original. Fields pass the existing partial-field whitelist and type normalizer before payload hashing and encryption. An explicit empty object is allowed but preserves no original source fields. Dependencies are explicit; omitting an orphan reference from the executable projection does not remove it from retained evidence. Selected refs must resolve. Choices are operator inputs, **not externally authorized reviews**.

Prepare runs complete no-review freeze validation once, encrypts each normalized partial payload once using the existing AES-256-GCM/AAD implementation, and writes:

- `unsigned-exception-requests.json`: complete bindings, original quarantine candidates (including reason and original refs), exact unsigned decisions and base64 envelopes; choices/envelope byte hashes; false approval and HOLD.
- `crypto-envelopes.json`: existing execution envelope format, containing the identical nonce/tag/ciphertext as hex.
- `exception-preparation-receipt.json`: written last after fsync and hash readback. Status is `AWAITING_EXTERNAL_SIGNATURES`.

Original controlled source and producer files remain immutable and separately retained. An encrypted normalized projection is not a complete raw-source archive. Unsigned requests are deliberately incompatible with reviewed-resolutions input.

## External review and finalize

For the legacy external-review route, an independent external process reviews the prepared decisions and supplies genuine Ed25519 attestations. For each `prepared.records[i].binding`, the exact signature message is UTF-8 bytes of `stableProductionImportCanonicalJson(binding)`, **without a trailing newline**. Use that repository canonicalizer, not plain `JSON.stringify` with arbitrary key order. The signed attestation bytes are JSON with exactly `{binding, signatureBase64, publicKeyPem}`; encode those complete bytes as canonical base64. The signature must be 64 bytes; the public key must be an Ed25519 SPKI `PUBLIC KEY` PEM.

External attestations artifact:

```js
{
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_external_exception_attestations",
  preparedArtifactSha256, // exact unsigned-exception-requests.json bytes
  records: [{ sourceIdentitySha256, attestationBase64 }]
}
```

Separately supply the explicitly pinned reviewer key artifact:

```js
{
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_import_external_reviewer_keys",
  publicKeys: [{ publicKeySha256, publicKeyPem }]
}
```

`publicKeySha256` is SHA-256 of `createPublicKey(publicKeyPem).export({type:"spki",format:"der"})`, not a display name or PEM text hash. The helper only proves signatures match this supplied key set. Organizational identity, review competence, key custody and the independent production approval subjects are external evidence; self-supplied keys cannot establish them.

For finalize, retain the same config fields and original artifacts, set `mode: "finalize"`, use a new empty `outputDir`, and add exactly these descriptors under `artifacts`: `prepared`, `envelopes`, `attestations`, `reviewerKeys`. They point respectively to the immutable prepare outputs and the two externally supplied artifacts. Run the same CLI with the new config. Finalize verifies exact coverage/bindings/signatures, authenticates existing envelopes against normalized payload and AAD, and invokes full reviewed freeze once. It does not encrypt again.

Successful finalize emits `reviewed-candidate-resolutions.json` and a receipt with status `VERIFIED_AGAINST_PINNED_REVIEWER_KEYS`, `signatureVerifiedAgainstProvidedKeys: true`, `signerAuthorityEstablished: false`. Use the reviewed file as `reviewedDecisions` in the [existing freeze CLI](yuzhou-production-candidate-freeze.md). Retain the original hex envelope file and key descriptors for the existing execution crypto provider. No keys or key-file descriptors are embedded in stdout/receipts. This does not seal/approve/execute a production plan.

## Explicit single accountable owner and delegated operation

This route is available only after an actual explicit owner confirmation. Retain the original confirmation provenance bytes privately. They are evidence of the instruction, not a cryptographic owner signature, identity registry or business UAT. The accountable owner and delegated operator are recorded separately; one owner is never expanded into three fabricated role identities. No production key is generated by either CLI.

1. Run prepare as above. Choose every partial field/reason/ref explicitly; the original candidates and historical C/S/M remain immutable.
2. Use the same preparation config with `mode: "delegate"`, a new empty output directory, and add only `prepared`, `envelopes`, `operatorKeyFile` descriptors. Do not supply `attestations`/`reviewerKeys` in this mode. `operatorKeyFile` points to an explicitly supplied Ed25519 private-key PEM (at most 16 KiB). The command creates genuine operator row signatures and calls the existing finalize validator: pinned-key signature checks, GCM/normalized payload comparison and one full reviewed freeze. It writes `reviewed-candidate-resolutions.json`, a signed `delegated-bridge-evidence.json`, and the final receipt. Status `DELEGATED_INTEGRITY_VERIFIED` means integrity only, with `ownerAuthorizationClaimed: false`. The small signed bridge receipt binds operation, C/S/M, scope, target identity, prepared/reviewed bytes, all four generated payload bundle hashes and frozen output hashes. It does not replace the original source evidence.
3. Create the explicit confirmation record below, using the actual prepared/reviewed/bridge-receipt byte hashes. Its context binds the final import manifest, A/B pair, target/scope, window, nonce and exact phase bundle hashes. The operator prepares this machine-readable binding under the retained owner instruction; it is not described as owner-personally-signed.
4. Run the private authorization producer:

```sh
node scripts/hr-cutover/materialize-production-import-delegated-authorization.mjs --config /absolute/private/authorize-config.json
```

Authorization config is exactly `{formatVersion:1,mode:"authorize",triple,artifacts,outputDir}`. `artifacts` contains exactly `confirmation`, `confirmationSource`, `prepared`, `reviewed`, `bridgeEvidence`, `operatorKeyFile`, each an absolute `{path,sha256}` descriptor. `confirmationSource` is the actual nonempty retained confirmation provenance file; its byte hash must equal `confirmationEvidenceSha256`. It is not parsed as an identity assertion. All private IO and clean/current-C checks apply. Config/provenance/output are bounded to 1 MiB, each other metadata file to 32 MiB, signing PEM to 16 KiB, total input to 128 MiB. Key buffers/read scratch copies are cleared; private key paths and file hashes never appear in summaries or receipts.

The confirmation artifact is exactly:

```js
{
  formatVersion: 1,
  artifactKind: "yuzhou_hr_single_owner_confirmation",
  provenance: "explicit_user_confirmation",
  decision: "AUTHORIZE_DELEGATED_OPERATION",
  ownerSubjectRefSha256, confirmationEvidenceSha256,
  operatorSubjectRefSha256, operatorPublicKeySha256, // Ed25519 SPKI DER hash
  context: {
    operationId, binding, issuedAt, expiresAt, nonceSha256,
    preparationArtifacts: { preparedSha256, reviewedSha256, bridgeEvidenceSha256 },
    payloadBundleSha256: { T0, T1, T2, T3 }
  }
}
```

`binding` is the existing exact authorization binding: C/S/M triple, `targetIdentitySha256`, `targetScopeSha256`, `finalRehearsalPairSha256`, `manifestSha256`, `windowStartsAt`, `windowEndsAt`, plus only applicable existing sealed-plan extension hashes (including runtime evidence). For v1 preflight only, use `importManifestSha256` instead of `manifestSha256`, and set the preflight plan's explicit `targetScopeSha256` to the same hash. The v1 context is not interchangeable with v2.

Authorize validates real input hashes, the signed bridge receipt against the confirmation-pinned operator key, matching operation/C/S/M/target/scope/bundles and every reviewed row signature against its original prepared binding. It trusts that signed finalize receipt for the prior full candidate/graph/GCM check; it does not reread large phase/candidate files or rerun freeze. The execution crypto consumer still independently authenticates the original envelopes. The exact operator key also signs the entire final confirmation, including expiry and nonce. Unknown policy, missing/extra/duplicate owners, absent provenance reference, signature drift, changed bindings or bundles reject; removing the policy restores strict legacy three-party validation, never an implicit downgrade.

Outputs are `one-time-import-authorization.json` and, for a v2 binding, `sealed-authorization.json`, plus the final private receipt. The first is the one-time authorization artifact; the second contains its exact byte hash and the existing sealed-plan authorization fields. The policy is `{kind:"single_accountable_owner_v1",confirmation,operatorAttestation:{publicKeyPem,signatureBase64}}`; `approvalSet` is exactly one `{role:"accountable_owner",subjectRefSha256,ownerDecisionSha256}`. The decision digest is canonical confirmation JSON plus newline; the Ed25519 signature message is canonical confirmation JSON without newline. No owner personal signature is claimed.

Use the produced authorization in the existing plan/sealing workflow. The sealed validator independently compares the signed context's bundle map with all four actual `plan.phases` bundle hashes, as well as the existing final manifest/target/runtime/window bindings. Preflight v1 has no executable bundles and therefore proves authorization-material integrity only, not v2 payload matching. The sealed validator does not independently reload confirmation/preparation source files; their integrity is the producer/operator-signature boundary. Final A/B, before-images, record maps, exact runtime proof, target allowlist, one-time ledger consumption, separate rollback intent and the activation HOLD remain unchanged. In particular the one-owner policy does not relax the separate merge/skip conflict-ledger signer-role requirements.

## Private IO and failure behavior

Files must be canonical absolute, current-owner 0600, single-link regular files in canonical owner-only 0700 directories; symlinks and hardlinks are rejected. Config is bounded at 1 MiB, choices/review metadata at 32 MiB each, phase/candidate files at 384 MiB each, aggregate input at 1 GiB. Keys are exactly 32 bytes and buffers are cleared on success/failure. Output limits are 384 MiB/file and 1 GiB total including receipt. No budget increase or full-scale memory claim is implied.

Outputs are exclusive, never overwritten. Partial files are preserved after failure; a failed receipt owned by the current attempt is removed. A new empty output directory is needed to retry. Stable `EXCEPTION_PREPARATION_*` errors contain no private paths/values. `VALIDATION_FAILED` deliberately sanitizes existing lower-level validation details. Config has no callback-module, authority, DB or activation overrides.

## Synthetic verification

### Large-input memory boundary

The 2026-09-06 private current-code T0–T3 preparation used 260,828 candidates,
including 47 quarantine projections. A 2 GiB process guard stopped the initial
prepare attempt at 2,185,199,616 bytes RSS. Lowering the Node old-space limit from
1,536 MiB to 768 MiB allowed prepare to finish at 1,443,627,008 bytes sampled RSS;
the subsequent delegated full freeze still exited unsuccessfully. No production
business write or valid delegated completion receipt resulted.

The real-artifact bridge now retains its independently parsed private object graph
instead of cloning each phase/role and cloning those same objects again into
generator envelopes. It synchronously hashes and fatally decodes the exact
non-shared byte view, preserving original artifact and generated payload hashes.
Caller-buffer mutation, repeated calls, non-zero view offsets, shared memory and
invalid UTF-8 have explicit regression coverage. This removes redundant allocations;
it does **not** yet prove the full real-data freeze/writer fits 2 GiB. Keep the guard,
failed-attempt evidence and current-code checks. Reuse successful preparation where
bindings permit; never relabel historical receipts or increase limits to hide failure.

`node --test scripts/e2e/yuzhou-production-import-exception-preparation-contract.mjs`

The test uses only fresh ephemeral synthetic encryption/signing keys. It passes a nonempty partial payload through private prepare, an independent test signature, private finalize, existing freeze/generator and the actual execution crypto verifier; it verifies retained envelope bytes and HOLD. Negative coverage includes choices/reviews, binding/signature/GCM tampering and unsafe private IO. It provides no actual production, source migration or organizational authorization evidence.
