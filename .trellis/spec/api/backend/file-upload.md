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
  - `biz_id?: uuid`
  - `remark?: string`

### 3. Contracts
- Allowed MIME types and max sizes live in `FILE_UPLOAD_POLICIES`.
- Business-specific mappings live in `FILE_UPLOAD_BIZ_POLICY_MAP`.
- Storage path remains tenant/park/day scoped and must not be built from user-supplied filenames.
- File metadata must remain tenant_id + park_id scoped.

### 4. Validation & Error Matrix
- Missing file -> `BadRequestException`.
- Unsupported MIME -> `UnsupportedMediaTypeException`.
- Oversized file -> `BadRequestException`.
- File ID used by another business object must belong to current tenant and park.

### 5. Good/Base/Bad Cases
- Good: Floorplan endpoint delegates to `FilesService.upload` with `biz_type: "floorplan"`.
- Base: `/files` generic endpoint accepts only policies supported by shared constants.
- Bad: Controller-level file size only with no service validation; hard-coded MIME checks in individual feature services.

### 6. Tests Required
- API build after policy changes.
- Smoke test for at least one accepted and one rejected MIME/size case when a new upload policy is added.

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
