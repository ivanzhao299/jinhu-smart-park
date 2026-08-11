# File Upload Backend Contract

## Scenario: Shared Upload Policy Enforcement

### 1. Scope / Trigger
- Trigger: Any API endpoint that accepts multipart file uploads or stores file IDs.
- The backend must enforce the shared upload policy from `packages/shared/src/index.ts`.

### 2. Signatures
- `FilesService.upload(scope, actorId, dto, file)` validates with:
  - `resolveFileUploadPolicy(dto.biz_type)`
  - `getFileUploadLimitForMime(policy, file.mimetype)`
- Upload DTO fields:
  - `biz_type: string`
  - `original_name?: string` (UTF-8 client hint, accepted only when byte-consistent
    with the parser-provided filename)
  - `biz_id?: uuid`
  - `remark?: string`

### 3. Contracts
- Allowed MIME types and max sizes live in `FILE_UPLOAD_POLICIES`.
- Business-specific mappings live in `FILE_UPLOAD_BIZ_POLICY_MAP`.
- Storage path remains tenant/park/day scoped and must not be built from user-supplied filenames.
- Multipart `originalname` may contain UTF-8 bytes decoded as Latin-1 by the upload
  parser. Content heuristics and script ranges cannot distinguish mojibake from a
  legitimate Latin-1 name whose bytes happen to encode the same Unicode text. The
  official multipart request helper therefore sends `original_name` as an independently
  UTF-8-decoded text field for every selected `file`. Each upload controller must pass
  that hint into `FilesService.upload`. Adopt it only when it equals the parser name
  or its UTF-8 bytes decoded as Latin-1 equal the parser name; otherwise preserve the
  parser value. Never rewrite a filename based only on reversibility or CJK-looking
  output.
- Custom upload controllers use the shared `MultipartFileMetadataDto` and forward the
  complete validated metadata object through their service adapter. Do not destructure
  only `remark` or add one-off filename parameters; adapter contract tests must cover
  every production `FilesService.upload` call.
- File metadata must remain tenant_id + park_id scoped.
- The generic `/files` routes are not an authorization boundary by themselves. Protected business file types require their domain read/write permission and referenced unit data-scope check for upload, list, detail, download, and delete.
- Generic file listing without a business type excludes protected housing and homestay file types.
- An uploader with housing-purchase read or manage permission can list their own
  unassociated purchase receipts with `GET /files?biz_type=housing_purchase` until
  the purchase workflow associates them. Pending receipts from other uploaders
  remain hidden, including from the generic file list.
- The housing purchase form loads that pending list during its normal page refresh
  and replaces the attachment state only after a successful response. An API recovery
  endpoint without a production UI consumer is incomplete.
- Housing repair evidence uses `biz_type=housing_repair` with `biz_id=<lease UUID>`; do not reuse the generic `workorder_create` type for tenant repair photos.
- Reading `housing_repair` requires housing lease-read or repair-manage permission plus unit data scope; writing requires repair-manage permission plus unit data scope.
- Reading a registered housing signature requires either lease-read or lease-sign plus
  generic file-read permission. Reading legacy, move-in, or move-out handover evidence
  requires either lease-read or handover-manage plus generic file-read permission.
  The business detail projection and the file detail/download policy must authorize
  the same granular business-role alternatives.
- Housing purchase list projections include active bound receipt metadata for actors
  with purchase-read or purchase-manage plus file-read, so evidence remains recoverable
  after the pending upload is associated with its purchase.
- A `housing_purchase` reference whose `unit_id` is null is project-wide and requires `PropertyUnitAccessService.allowedUnitIds(...) === null`.
- Generic deletion locks the file row and rejects protected evidence once its ID is
  referenced by the owning business aggregate. Removal must happen through a domain
  detach/reversal workflow so signature, handover, repair, receipt, and turnover records
  never retain dangling file IDs.
- A generic file mutation that also changes an owning aggregate must authorize that
  aggregate before the side effect. Floorplan list/detail/download requires floor-read;
  floorplan upload/delete requires floor-layout permission; all paths enforce the
  referenced floor's park/building/floor data scope inside the mutation path.
- When a delete workflow starts clearing an owner's denormalized file ID or URL,
  ship a forward data migration for owner rows that already reference files soft-deleted
  before that workflow existed. The repair must join by the stored file ID, clear both
  the ID and URL, preserve active-file references, and be safe to rerun.
- Every workflow that binds protected file IDs must acquire the same file-row
  `pessimistic_write` lock and retain it in the transaction that writes the owning
  reference. Locking only the deletion path, validating outside the write transaction,
  or counting files through a different repository connection leaves a dangling-reference race.
- Optional file-ID replacement fields use omission as preservation and an explicit
  array as replacement. For repeated child updates, resolve each omitted field
  against the matching persisted child; do not normalize omission to `[]` before
  identifying whether that child already exists. A new child with an omitted field
  may initialize the association to empty.

### 4. Validation & Error Matrix
- Missing file -> `BadRequestException`.
- UTF-8 filename decoded as Latin-1 plus a byte-consistent `original_name` hint ->
  recover the original Unicode name before extension parsing and metadata persistence.
- Missing or inconsistent `original_name` hint -> preserve the parser-provided name;
  do not guess from decoded content.
- Valid Latin-1 text that merely looks like mojibake -> preserve it byte-for-byte.
- Unsupported MIME -> `UnsupportedMediaTypeException`.
- Oversized file -> `BadRequestException`.
- File ID used by another business object must belong to current tenant and park.
- Missing domain permission, cross-tenant/park reference, or out-of-scope unit -> `ForbiddenException` without revealing whether the file exists outside scope.
- Restricted property scope on a unitless project purchase -> `ForbiddenException`.
- Referenced protected evidence deletion -> `ConflictException`.
- Pending purchase receipt list -> only current actor's active, unassociated files.
- Existing child + omitted file-ID replacement -> preserve that child's association.
- New child + omitted file-ID replacement -> initialize an empty association.
- Existing child + explicit empty array -> intentionally clear after normal validation.

### 5. Good/Base/Bad Cases
- Good: Floorplan endpoint delegates to `FilesService.upload` with `biz_type: "floorplan"`.
- Base: `/files` generic endpoint accepts only policies supported by shared constants.
- Bad: Controller-level file size only with no service validation; hard-coded MIME checks in individual feature services.
- Bad: Granting `file:read` or `file:download` alone access to lease signatures, handover evidence, purchase receipts, or turnover evidence.
- Bad: Treating a null referenced `unit_id` as "no scope check required".
- Bad: Clearing a floor's layout reference from `/files/:id` after checking only
  generic file-delete permission and tenant/park equality.

### 6. Tests Required
- API build after policy changes.
- Smoke test for at least one accepted and one rejected MIME/size case when a new upload policy is added.
- Security test each protected business type for missing domain permission, cross-scope reference, generic-list exclusion, and pending-upload ownership.
- Filename tests include byte-consistent hints for Chinese, Japanese, Korean, and
  supplementary Han characters; missing/inconsistent hints; ASCII and accented
  Unicode; and reversible Latin-1 counterexamples such as `Ã©`, `Â£`, and `ä½ `.
- Frontend request tests assert `/files` uploads include the selected `File.name` as
  the independent `original_name` multipart text field.
- Adapter contract tests scan every custom `FilesService.upload` caller and assert it
  forwards the shared validated multipart metadata, including unit photos/floorplans,
  floor layouts, and tenant branding.
- API E2E: upload an unassociated purchase receipt, recover it through the protected
  pending list, and bind that exact file when creating the purchase.
- Frontend: reload the housing operations page after upload and assert the uploader's
  pending receipt remains visible and bindable; after purchase creation, assert the
  bound receipt remains visible on the purchase record.
- Security test every protected evidence projection against the actual file detail and
  download policy for each permitted granular role, not only against returned metadata.
- Security test unitless project-level references with both restricted and unrestricted property scopes.
- Security/integration test that referenced protected evidence is not generically
  deletable, while an uploaded but unreferenced file can still be removed.
- Concurrency/integration test both orderings of protected evidence binding versus
  generic deletion; exactly one operation may succeed and no committed owner may
  reference a deleted file.
- Migration contract test: historical floor rows pointing to soft-deleted floorplan
  files are cleared, while active file references and deleted floor rows are preserved.

### 7. Wrong vs Correct

#### Wrong
```ts
@UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
upload(@UploadedFile() file: Express.Multer.File) {
  return save(file);
}
```

#### Correct
```ts
const uploaded = await this.filesService.upload(scope, actor.sub, { biz_type: "floorplan", biz_id: id, remark }, file);
```
