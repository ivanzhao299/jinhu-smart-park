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
- Versioned Party reads must supply their stored key id, never fall back, and surface malformed/authentication failures instead of projecting missing plaintext. Legacy consumers without key-id metadata may try configured Party-domain keys active-first so their existing ciphertext remains readable during rotation; they must never cross into IoT/JWT/other key domains.
- `PARTY_DATA_IDENTITY_HASH_KEY` is stable across AES rotation. Its first explicit value must reproduce the historical v1 HMAC; replacing it requires a separate Party/snapshot hash migration.
- `enc:v1` is the payload/algorithm envelope, not the key id. Do not rename payload format merely because the AES key rotates.
- Rotation is tenant/park scoped, advisory-locked, request-key idempotent, validates every retained ciphertext including active-key and soft-deleted Party rows, and writes ciphertext, receipt, and required audit in one transaction. Only the current draft submission owns mutable Party draft metadata; historical submissions are not relabeled. Audit includes from/to key ids and counts only.
- The rotation CLI uses a minimal Nest context with no MQTT/schedulers and resolves `--actor-id` to an enabled in-scope database user with `party:identity_verify` (or super permission); audit never invents actor identity or roles.

### 4. Validation & Error Matrix

- no configured active Party key -> application/service construction fails before serving traffic.
- IoT/JWT key present but Party key absent -> fail; cross-domain fallback is forbidden.
- unknown/invalid/duplicate key id or malformed keyring -> fail before encrypt/decrypt.
- Party/draft metadata mismatch, unknown key, malformed envelope, or authentication failure -> entire scope rotation rolls back; never relabel metadata.
- repeated `(tenantId, parkId, requestKey)` with the same active key -> return the stored receipt without ciphertext or audit replay; if the configured active key changed, fail with conflict and require a new request key.
- rotation audit persistence failure -> same transaction rolls back.

### 5. Good / Base / Bad Cases

- Good: configure v1 plus v2, set active v2, dual-read v1, and rotate every Party/identity scope. Because current HR ciphertext has no key-id metadata and is outside this inventory, retain every historically used HR key as decrypt-only until a separate HR metadata, per-tenant inventory, and migration proves zero references; Party/identity zero alone never authorizes key retirement.
- Base: active remains v1; migration only attributes existing Party ciphertext metadata and does not claim it was decrypted.
- Bad: update draft/snapshot key id without decrypting the referenced ciphertext, or change the stable fingerprint key during ordinary AES rotation.

### 6. Tests Required

- Unit: missing Party key with IoT/JWT present fails; malformed/duplicate keyring and malformed ciphertext envelopes fail; old ciphertext decrypts by old key id and by the unversioned compatibility path; new profile uses active id; fingerprint stays stable.
- Authentication-failure fixtures must deterministically change ciphertext bytes (for example XOR one bit), assert the envelope differs, and cover the zero-byte boundary. Replacing a random trailing byte with a fixed `00` is a no-op approximately 1/256 of the time; do not fix this by retrying CI or fixing production nonces.
- Rotation: scope lock precedes inventory; active-key, soft-deleted Party and current-draft/snapshot metadata is validated; old ciphertext is re-encrypted; same-active-key replay performs no write while cross-active-key replay conflicts; required audit receives the transaction manager and no secret fields.
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

## Scenario: Party consent and retention governance

### 1. Scope / Trigger

- Trigger: changing Party consent, subject-rights, legal-hold, retention policy/classification, or due-action behavior.

### 2. Signatures

- API root: `/property/party-data-governance`; every mutation requires its exact governance permission and `X-Idempotency-Key`.
- DB authority: `biz_party_consent_fact`, `biz_party_identity_retention_*`, `biz_party_identity_legal_hold`, `biz_party_data_subject_request`, and `biz_party_data_governance_action_receipt`.

### 3. Contracts

- `biz_party.consent_status` is a compatibility projection; generic Party create/update never writes it.
- Consent facts are append-only. Legacy rows are `pending_evidence|legacy_unknown` and carry only `observed_legacy_status`.
- Every request key binds a canonical SHA-256 request hash. Same key/same hash replays; same key/different hash conflicts.
- Governance-command protected audits require an explicit Party ID from the caller; never treat an arbitrary audit business UUID as Party ownership.
- Canonical identity assignment audits and decisions carry their scoped `party_id` directly. A `sys_op_log` row may enter protected-audit retention only when `biz_type='party_identity_submission'` and its UUID `biz_id` resolves to an exact submission in the same tenant and park. Legacy rows are backfilled from the same three deterministic sources, and new rows use database creation hooks.
- `processing_restricted_at` is a consumption gate: Party/domain mutations, identity draft/verification commands, domain Party projections, and identity evidence metadata/blob access fail closed. Governance and protected audit processing remain available.
- Identity-photo retention starts from the scoped `sys_file.create_time`, not from the submission or snapshot attachment time.
- Due and hold operations always bind tenant and park. Releasing the last matching hold restores held assignments to active/due.
- Configured destructive outcomes may fall back to `processing_restricted`; audit records requested aggregate actions and the actual outcome without sensitive values.

### 4. Validation & Error Matrix

- missing/malformed idempotency key -> bad request; reused key with another body/action/target -> conflict.
- hold category without object, object without category, or object owned by another Party/scope -> bad request.
- legacy classification before legal approval -> conflict.
- active matching hold -> assignment becomes held; release with another matching hold still active -> remains held.
- reason/decision/completion values outside uppercase controlled-code syntax -> DTO rejection.

### 5. Good / Base / Bad Cases

- Good: an operator records a purpose-specific consent fact, then a same-body retry replays without a second fact.
- Base: policy GET returns unpersisted legally-unapproved defaults without writing a row.
- Bad: a policy update audit treats `parkId` as `partyId`, or a due update filters only by UUID.

### 6. Tests Required

- PostgreSQL 16 fresh apply, checksum replay, and pre-migration legacy fixture with null provenance assertions.
- Unit/source contracts for scoped writes, request-hash conflict, hold object ownership/release recovery, side-effect-free GET, restriction consumers, photo timestamp authority, and protected-audit backfill/hooks.
- Homestay check-in rejects legacy, withdrawn, wrong-purpose, stale, or restricted facts and keeps atomic rollback.
- Shared endpoint manifest exact count and canonical hash, plus API/Web lint, typecheck, tests, and build.

### 7. Wrong vs Correct

```ts
// Wrong: a UUID business id is not proof of Party ownership.
await retainAudit(bizId);

// Correct for governance commands: only the call site that owns a verified scoped Party supplies it.
await retainAudit(retentionPartyId);

// Correct for canonical identity audit sources: resolve Party ownership from a scoped FK-backed
// assignment/decision row, or from an exact party_identity_submission sys_op_log reference.
```

## Scenario: Controlled Party identity plaintext reveal

### 1. Scope / Trigger

- Trigger: reading a Party identity number in plaintext or changing the ordinary Party detail response.

### 2. Signatures

- Ordinary detail: `GET /property/parties/:id` returns `PartyDetailResponse` with masked identity only.
- Reveal: `POST /property/parties/:id/identity-reveal` accepts `{ reason_code }` and returns `{ partyId, identityNumber }`.
- Authority: atomic permission `party:identity_reveal`; audit action `查看业务相对方证件明文`.

### 3. Contracts

- `PartyListItemResponse` and `PartyDetailResponse` never contain an `identityNumber` field, including for super, wildcard, sensitive-read, and reveal-authorized actors.
- Reveal reason is one of `PARTY_IDENTITY_REVEAL_REASON_CODES`; free text is rejected and plaintext never enters audit JSON, logs, errors, lists, exports, or the ordinary Party cache.
- The POST still supplies `X-Idempotency-Key` for the global write guard, but never uses `IdempotencyInterceptor`: replay caching would retain plaintext and bypass the required per-access audit.
- Reveal binds Party lookup, permission, processing restriction, tenant, park, required audit, ciphertext key id, and decryption. Required audit completes before a successful response.
- `party:sensitive_read` controls masked/contact projection only and never authorizes plaintext reveal.

### 4. Validation & Error Matrix

- missing exact reveal permission -> forbidden before transaction or decryption.
- missing/unknown reason code -> DTO rejection.
- missing/cross-scope/deleted/restricted Party or missing ciphertext -> safe not found.
- required audit persistence failure -> reject with no plaintext response.
- asset-entitled tenant (existing asset parent or enabled asset assignment) without exactly one enabled `asset` parent -> migration fails instead of silently skipping that tenant; a non-asset tenant remains out of scope.
- unknown key, malformed ciphertext, or authentication failure -> reject; never substitute masked or empty plaintext.

### 5. Good / Base / Bad Cases

- Good: an explicitly authorized operator selects a controlled reason; scoped ciphertext decrypts, required audit commits without sensitive values, then plaintext is returned by the dedicated action.
- Base: a sensitive-read user opens Party detail and sees contact fields plus `identityNumberMasked` only.
- Bad: ordinary detail calls `decrypt()` when `party:sensitive_read` is present, or an `@AuditLog` best-effort interceptor is treated as reveal evidence.

### 6. Tests Required

- Permission matrix: ordinary, sensitive-read, reveal-only, wildcard/super, and unauthorized projections contain no ordinary-response plaintext.
- Reveal: exact permission, controlled reason validation, tenant/park query predicates, decrypt-key id, success audit metadata, no plaintext in audit serialization, and audit failure fail-closed.
- Contract: shared response type omits plaintext; endpoint manifest and controller metadata agree; Web uses a separate reveal request/state and masked ordinary detail.
- Migration: PostgreSQL 16 fresh/replay with at least two tenants proves one permission per tenant and scoped super-role grants without duplication.

### 7. Wrong vs Correct

```ts
// Wrong: broad sensitive read silently expands an ordinary response.
if (hasPermission(actor, "party:sensitive_read")) response.identityNumber = decrypt(ciphertext);

// Correct: ordinary detail remains masked; the dedicated action audits before returning.
const identityNumber = decrypt(ciphertext, keyId);
await audit.recordOperationRequired({ afterJson: { reasonCode }, /* no plaintext */ }, manager);
return { partyId, identityNumber };
```
