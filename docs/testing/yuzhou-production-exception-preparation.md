# Private quarantine preparation and external review

This command connects validated T0–T3 candidates to the existing freeze and execution crypto consumers. It never imports data, contacts a database, signs a review, generates a key, establishes a person's authority or changes activation. Both modes retain `productionImport: "HOLD"` and `approvalClaimed: false`. All existing independent execution approvals remain necessary.

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

An independent external process must review the prepared decisions and supply genuine Ed25519 attestations. This command has no signing mode. For each `prepared.records[i].binding`, the exact signature message is UTF-8 bytes of `stableProductionImportCanonicalJson(binding)`, **without a trailing newline**. Use that repository canonicalizer, not plain `JSON.stringify` with arbitrary key order. The signed attestation bytes are JSON with exactly `{binding, signatureBase64, publicKeyPem}`; encode those complete bytes as canonical base64. The signature must be 64 bytes; the public key must be an Ed25519 SPKI `PUBLIC KEY` PEM.

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

## Private IO and failure behavior

Files must be canonical absolute, current-owner 0600, single-link regular files in canonical owner-only 0700 directories; symlinks and hardlinks are rejected. Config is bounded at 1 MiB, choices/review metadata at 32 MiB each, phase/candidate files at 384 MiB each, aggregate input at 1 GiB. Keys are exactly 32 bytes and buffers are cleared on success/failure. Output limits are 384 MiB/file and 1 GiB total including receipt. No budget increase or full-scale memory claim is implied.

Outputs are exclusive, never overwritten. Partial files are preserved after failure; a failed receipt owned by the current attempt is removed. A new empty output directory is needed to retry. Stable `EXCEPTION_PREPARATION_*` errors contain no private paths/values. `VALIDATION_FAILED` deliberately sanitizes existing lower-level validation details. Config has no callback-module, authority, DB or activation overrides.

## Synthetic verification

`node --test scripts/e2e/yuzhou-production-import-exception-preparation-contract.mjs`

The test uses only fresh ephemeral synthetic encryption/signing keys. It passes a nonempty partial payload through private prepare, an independent test signature, private finalize, existing freeze/generator and the actual execution crypto verifier; it verifies retained envelope bytes and HOLD. Negative coverage includes choices/reviews, binding/signature/GCM tampering and unsafe private IO. It provides no actual production, source migration or organizational authorization evidence.
