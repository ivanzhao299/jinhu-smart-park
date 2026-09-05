# HR shared sensitive-data provider slice

Status: implemented code-boundary extraction; not proof that the complete HR
application starts independently.

## Result

The canonical `PartySensitiveDataService` and Party keyring parser now live in
`apps/api/src/shared/security`. HR imports the shared provider directly and no
longer reaches through `modules/property-operations` for encryption, decryption,
masking, HMAC identity fingerprints, or key-version selection.

The former Property Operations paths remain compatibility re-exports. They
export the exact same class and parser objects rather than subclasses, wrappers,
or duplicate implementations, so existing Property and Property Identity
provider tokens continue to resolve without ciphertext conversion.

## Frozen compatibility

- Ciphertext remains AES-256-GCM in the `enc:v1:<iv>:<tag>:<payload>` envelope.
- `PARTY_DATA_ENCRYPTION_KEY` remains the legacy `party-data-v1` key.
- `PARTY_DATA_ENCRYPTION_KEYRING` and
  `PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID` keep their current version/rotation
  behavior.
- `PARTY_DATA_IDENTITY_HASH_KEY` remains independent of AES key rotation; its
  HMAC output is unchanged.
- Unversioned legacy reads may try configured Party-domain keys active-first.
  Reads with an explicit key id never fall back.
- No environment name, key material, ciphertext, database row, or migration is
  changed by this slice.

## Evidence boundary

The synthetic provider contract proves that old and new import paths expose the
same Nest token, cross-decrypt `enc:v1` ciphertext, generate the same HMAC, retain
historical-key behavior, reject explicit-key fallback, and create in a minimal
Nest provider graph without importing `PropertyOperationsModule`.

This is one dependency-direction correction identified by the standalone-product
inventory. HR still has other shared-platform and Smart Park dependencies; their
dynamic startup boundaries remain unresolved until later vertical slices prove
them. This slice therefore must not be described as complete standalone HR
startup or deployment readiness.
