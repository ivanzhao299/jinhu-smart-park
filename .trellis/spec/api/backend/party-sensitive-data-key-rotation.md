# Party Sensitive Data Key Rotation

## Scenario: Versioned Party ciphertext keys

### 1. Scope / Trigger

- Trigger: reading or writing `biz_party` identity ciphertext, changing Party key env configuration, or rotating Party ciphertext.
- This contract covers Party, identity draft metadata, frozen snapshots, rotation receipts, and required audit. It does not authorize plaintext export or fingerprint-key replacement.

### 2. Signatures

- Runtime: `PartySensitiveDataService.encrypt(value, keyId?)`, `decrypt(value, keyId?)`, `identityProfile(value)`.
- Rotation: `PartyDataKeyRotationService.rotate({ tenantId, parkId }, actor, requestKey)`.
- CLI: `party-data-key:rotate -- --tenant-id=... --park-id=... --actor-id=... --request-key=...` from the built API package.
- DB metadata: `biz_party.identity_number_encryption_key_id`, snapshot `encryption_key_id`, submission `draft_encryption_key_id`, and `biz_party_data_key_rotation_receipt`.

### 3. Contracts

- `PARTY_DATA_ENCRYPTION_KEY` is the legacy `party-data-v1` key. It never falls back to IoT, JWT, video, or a fixed development secret.
- `PARTY_DATA_ENCRYPTION_KEYRING` is a JSON object of valid key id to secret; duplicate keys, short secrets, malformed JSON, and invalid key ids fail closed.
- `PARTY_DATA_ENCRYPTION_ACTIVE_KEY_ID` selects the only key used for new ciphertext. Historical keys are decrypt-only.
- `PARTY_DATA_IDENTITY_HASH_KEY` is stable across AES rotation. Its first explicit value must reproduce the historical v1 HMAC; replacing it requires a separate Party/snapshot hash migration.
- `enc:v1` is the payload/algorithm envelope, not the key id. Do not rename payload format merely because the AES key rotates.
- Rotation is tenant/park scoped, advisory-locked, request-key idempotent, and writes ciphertext, receipt, and required audit in one transaction. Audit includes from/to key ids and counts only.

### 4. Validation & Error Matrix

- no configured active Party key -> application/service construction fails before serving traffic.
- IoT/JWT key present but Party key absent -> fail; cross-domain fallback is forbidden.
- unknown/invalid/duplicate key id or malformed keyring -> fail before encrypt/decrypt.
- Party/draft metadata mismatch, unknown key, malformed envelope, or authentication failure -> entire scope rotation rolls back; never relabel metadata.
- repeated `(tenantId, parkId, requestKey)` -> return the stored receipt without ciphertext or audit replay.
- rotation audit persistence failure -> same transaction rolls back.

### 5. Good / Base / Bad Cases

- Good: configure v1 plus v2, set active v2, dual-read v1, rotate one scope, verify old encryption references reach zero, wait, then remove v1 from the encryption keyring.
- Base: active remains v1; migration only attributes existing Party ciphertext metadata and does not claim it was decrypted.
- Bad: update draft/snapshot key id without decrypting the referenced ciphertext, or change the stable fingerprint key during ordinary AES rotation.

### 6. Tests Required

- Unit: missing Party key with IoT/JWT present fails; malformed/duplicate keyring fails; old ciphertext decrypts by old key id; new profile uses active id; fingerprint stays stable.
- Rotation: scope lock precedes inventory; Party/draft/snapshot metadata is consistent; old ciphertext is re-encrypted; replay performs no write; required audit receives the transaction manager and no secret fields.
- Migration: PostgreSQL 16 apply plus replay; Party v1 metadata backfill; three key-id guards; scoped receipt uniqueness.
- Package gates: API unit, lint, typecheck, build, migration prerequisite contract, shell syntax, and secret/fallback source scan.

### 7. Wrong vs Correct

#### Wrong

```ts
const key = partyKey ?? iotKey ?? jwtKey ?? "dev-secret";
await manager.query("UPDATE submission SET draft_encryption_key_id=$1", [activeKeyId]);
```

#### Correct

```ts
const keyring = parsePartyDataKeyring(readConfig);
await lockTenantParkScope(manager, scope);
await inventoryAndDecryptEveryReferencedCiphertext(manager, scope, keyring);
await rotateCiphertextAndWriteRequiredAuditInOneTransaction(manager, scope, keyring.activeKeyId);
```
