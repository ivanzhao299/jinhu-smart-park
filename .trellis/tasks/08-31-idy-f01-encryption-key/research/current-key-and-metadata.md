# Current key and metadata evidence

- `apps/api/src/app.module.ts:92-118`: production validates only `PARTY_DATA_ENCRYPTION_KEY` length.
- `apps/api/src/modules/property-operations/party-sensitive-data.service.ts:57-64`: runtime fallback PARTY → IOT → JWT → fixed development secret.
- `party-sensitive-data.service.ts:37-54`: new profile is fixed `party-data-v1`, payload format 1.
- `database/migrations/000176_shared_property_foundation.sql:264-298`: Party ciphertext has no key id.
- `database/migrations/000185_property_b_identity_schema_expand.sql:738-800`: snapshot/draft key id exists but is not tied to a real keyring.
- `property-identity.service.ts:965-981`: snapshot projection does not select key id before decrypt.
- Repository fixtures contain non-canonical fake key ids/ciphertext; they prove tests must be repaired, not that production data is decryptable.
- Forward migration must add Party metadata and guards. Existing non-null Party ciphertext may be attributed to historical application profile v1, but successful decrypt/rotation must be proven per tenant scope.
- Rotation audit should use `AuditService.recordOperationRequired()` and `captureBody:false` patterns; never record secrets/ciphertext/hash.
