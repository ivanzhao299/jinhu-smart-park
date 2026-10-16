# Five-channel template definition maintenance

## 1. Scope / Trigger
Maintain a full five-channel definition on the existing performance template/version identity. This child delivers draft authoring only. Source facts, their target pairs, arithmetic core, evaluation, payroll and permissions are unchanged.

## 2. Signatures
`POST /hr/performance-v2/templates/channel` accepts templateCode/templateName/versionName/config. `POST templates/:id/channel-versions` also requires expectedVersionId. `POST template-versions/:id/channel-definition/revisions` accepts expectedRevisionId/config. `GET template-versions/:id/channel-definition/history?page=1&pageSize=10` returns all retained revisions through pagination. Existing detail/list project calculationMode/currentRevisionId/channelDefinition; detail also lists all version identities.

## 3. Contracts
Use `validateHrPerformanceChannelDefinition` from shared in API and Web. SchemaVersion1 requires every documented key and rejects extra keys at every level. Decimal18,2 and int32 values travel as plain strings or explicit NULL; order is an integer-valued int32 JSON number or NULL, including equivalent JSON spellings such as 1.0. Top-level templateCode/templateName/versionName must contain a non-whitespace character; valid raw text is preserved. Empty text, negative/zero/leading-zero values and duplicate grade codes with distinct stable IDs survive. Item/grade IDs are exact nonempty1..128 strings; guide IDs are unique within each item. All collections survive without30/20 caps. Policy fields describe future authoring and grant no permission.
Migration371 adds explicit `dimension_weighted_v1` vs `five_channel_v1`; dimension total_weight is non-NULL1 with no revision pointer, channel total_weight is NULL with a same-scope/version pointer. Scoped user/version/predecessor FKs and immutable history bind revisions. Lock parent then version; compare expected current identity; append successor then advance pointer in one transaction. Initial creation preallocates the deferred pointer. Deferred head check prevents unadvanced direct inserts. Historical versions cannot receive revisions once another version becomes current.
All writes require existing TEMPLATE_MANAGE, real IdempotencyInterceptor and AuditLog(captureBody:false); history/detail require TEMPLATE_READ or MANAGE and exact scope. History head, count and page are read in one SQL statement snapshot so concurrent revision commits cannot mix their generations. Version displayName is mutable config; stable parent template_name stays immutable. SQL and API reject five-channel publication, score preview and cycle creation. Channel versions cannot accept dimension/level children. Published old dimensions, old algorithms, frozen cycles and source facts remain unchanged.

## 4. Validation & Error Matrix
Malformed full config/body/UUID/paging ->400. Missing permission or mismatched actor scope ->403. Scoped absent identity ->404. Stale base, retired parent or noncurrent revision ->409. Idempotency key/body mismatch ->409, replay returns original receipt. SQL incorrect mode/NULL combinations, cross-version pointer/predecessor/actor, historical edits, mixed children and activation fail atomically.

## 5. Good / Base / Bad Cases
Good:101 items and41 candidates roundtrip18-digit decimals and NULL, then competing same-base saves yield one new revision. Base: an old published dimension version still calculates87.25 and retains its frozen cycle. Bad: coerce through Number, trim stable IDs, truncate arrays, overwrite historical config, or publish a draft-only channel definition.

## 6. Tests Required
Explicitly enable owned tmpfs PostgreSQL with `HR_PERFORMANCE_CHANNEL_DEFINITION_PG_REQUIRED=1`; inability to create/start is a failing run. Test actual258/300/302/304/321/370/371 guards, actual HTTP ValidationPipe/PermissionGuard/IdempotencyInterceptor/database service, strict rejection matrix, replay, concurrency/history and source/function preservation. Synthetic principals substitute only authentication; this is not real-role UAT. Cleanup verifies exact generated name plus ownership label even after partial creation and connection/app close failure. Run shared build, API/Web lint/typecheck and affected actual components; final builds and native desktop390px are separately recorded.

## 7. Wrong vs Correct
Wrong: insert an orphan revision, or allow SQL CHECK UNKNOWN to accept dimension weight NULL. Correct: explicit IS NOT NULL/IS NULL mode constraints, same-version deferred FK and atomic append/head enforcement. Wrong: treat channel policy allowedActors as RBAC grants. Correct: retain existing permissions and hold workflow activation until parentC is integrated.
