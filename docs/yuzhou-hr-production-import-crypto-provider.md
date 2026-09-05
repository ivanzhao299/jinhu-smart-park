# Production import crypto primitive

Status: implemented primitive, not production activation or a complete CLI.

The existing T0-T3 phase writer requires pre-bound ciphertext hashes for merge
before-images and quarantine payloads. The new
`scripts/hr-cutover/production-import-crypto-provider.mjs` supplies real AES-256-GCM
encryption and authenticated decryption, replacing no existing migration or
business logic. Both integrated and standalone HR can use the same primitive.

## Contract

- `encryptProductionImportEnvelope(input, { resolveKey })`: input contains
  `kind` (before_image or quarantine), `operationId`, `phaseName`, `targetScope`,
  `record`, `keyReferenceSha256`, and `value`. Value is the existing rollback
  targetBefore object for merge, or the exact quarantine payload. Returns
  `{ envelope, binding }`. Envelope nonce/tag/ciphertext are Buffers. Binding
  matches sealed-plan beforeImage or quarantine cryptographic metadata;
  quarantine reasonCode still comes from the reviewed disposition.
- `decryptProductionImportEnvelope(input, { resolveKey })`: same context with
  `envelope`, and the sealed record's beforeImage/quarantine binding. Returns
  `{ plaintextSha256, targetBefore }` or `{ payloadSha256, payload }` only after
  GCM authentication and authoritative canonical-hash recomputation.
- `resolveKey({ keyReferenceSha256 })` supplies a 32-byte external key. The
  reference identifies the external key, not a digest of key material. This
  module neither reads files/environment nor contacts a secret store/database.
  It copies and clears its key Buffer without modifying the caller's key.

## Preparation and execution

1. Resolve a reviewed external key reference and actual pre-import before-image
   or quarantine payload. Seal each value once; save envelope bytes privately
   through the controlled artifact layer. No keys belong in the envelope.
2. Bind returned ciphertext hashes in the disposition/plan before sealing the
   plan. Never re-encrypt at execution: fresh random nonces produce new hashes.
3. The CLI adapter authenticates the fixed envelope with this primitive and
   compares its decoded targetBefore to the writer's actual locked before-image
   before returning those same ciphertext bytes. Rollback invokes authenticated
   decryption and the existing rollback writer revalidates canonical state.
4. Preserve external key access/version through the backup retention period.
   Missing key or failed authentication must stop recovery; never claim that a
   ciphertext hash alone proves recoverability.

AAD binds kind, operation, phase, scope, source and row identity, payload hash,
target table/ID, pre-import version/hash and key reference. It intentionally
does not bind the final sealed-plan hash, avoiding a ciphertext/plan hash cycle.
The record/control layer separately binds the final plan. Values are bounded
to 8 MiB per envelope; the orchestration layer still needs aggregate limits.
Use fresh independent synthetic keys in tests, never real HR values.

## Evidence and remaining work

`node --test scripts/e2e/yuzhou-production-import-crypto-provider-contract.mjs`
tests real roundtrips, random nonces, bad key/tag/ciphertext, cross-context replay,
canonical drift, malformed input and safe error messages. This is not a
production key-provider, CLI full-chain, real-data or production restore proof.
CLI wiring, controlled key resolution, envelope file permissions, key recovery,
and end-to-end import/rollback must be separately verified. Production gates
remain unchanged.
