# File Upload And Form Controls

## Scenario: Global File Upload UX And Validation

### 1. Scope / Trigger
- Trigger: Any page that uploads, lists, previews, downloads, or deletes files.
- Use `apps/web/components/files/FileUploader.tsx`, `AttachmentList.tsx`, and `FilePreview.tsx` before creating page-local upload controls.
- Field-operation photo uploaders may use a workflow-specific wrapper, but must still reuse shared upload policy constants from `@jinhu/shared`.

### 2. Signatures
- `FileUploader` props:
  - `bizType: string`
  - `bizId?: string`
  - `uploadPath?: string`
  - `policyKey?: FileUploadPolicyKey`
  - `label?: string`
  - `helperText?: string`
  - `compact?: boolean`
  - `onUploaded(file: FileRecord): void`
- `AttachmentList` props:
  - `bizType: string`
  - `bizId?: string`
  - `compact?: boolean`
  - `refreshKey?: number`

### 3. Contracts
- Upload policy source of truth: `FILE_UPLOAD_POLICIES` and `FILE_UPLOAD_BIZ_POLICY_MAP` in `packages/shared/src/index.ts`.
- Frontend `accept`, max-size copy, selected-file validation, and helper text must be derived from the shared policy.
- Backend must enforce the same policy; frontend validation is for UX only.
- Uploaded files must be associated with `biz_type` and, when the business object exists, `biz_id`.
- Compact attachment lists must show uploaded-file preview affordance; image files should display thumbnails and click-to-preview.

### 4. Validation & Error Matrix
- Missing file -> block submit.
- Unsupported MIME -> show friendly validation message and clear selected file.
- Oversized file -> show policy size limit and clear selected file.
- Unauthorized download/preview -> clear session and redirect to login.
- Backend rejection -> display API error message; do not silently succeed.

### 5. Good/Base/Bad Cases
- Good: Floorplan upload uses `policyKey="floorplan"`, accepts image/PDF, shows compact uploaded preview, and backend rejects other types.
- Base: Generic attachment upload resolves policy from `bizType` and falls back to `general`.
- Bad: Native browser file input visible in production UI; page-local MIME strings; page-local max-size values; upload success with no visible uploaded-file record.

### 6. Tests Required
- Lint/build after changing shared policy or upload components.
- Browser check on the affected page: file input not visible, helper text visible, uploaded attachment preview visible.
- API build when backend file validation changes.

### 7. Wrong vs Correct

#### Wrong
```tsx
<input type="file" accept="image/*" />
```

#### Correct
```tsx
<FileUploader
  bizType="floorplan"
  bizId={floor.id}
  policyKey="floorplan"
  compact
  onUploaded={handleUploaded}
/>
```

## Scenario: Numeric And Constrained Form Controls

### 1. Scope / Trigger
- Trigger: Any page with numbers, money, percentages, dates, enum selects, file IDs, GPS, or other constrained values.

### 2. Signatures
- Number inputs must use `type="number"` and `onFocus={(event) => event.target.select()}`.
- The API DTO must also validate/coerce the same field; frontend constraints are not sufficient.

### 3. Contracts
- Frontend controls must express `min`, `max`, `step`, required/optional state, and user-facing error copy when possible.
- Backend DTO/service must reject invalid or unsafe values.

### 4. Validation & Error Matrix
- Negative where not allowed -> backend rejects.
- Empty required value -> frontend blocks and backend rejects.
- Invalid enum/status -> backend rejects.

### 5. Good/Base/Bad Cases
- Good: area field has numeric step and backend decimal/numeric DTO validation.
- Bad: free-text input for amount, area, GPS, count, or status.

### 6. Tests Required
- Browser check for important forms.
- API validation test or targeted smoke for business-critical forms.

### 7. Wrong vs Correct

#### Wrong
```tsx
<input value={amount} onChange={...} />
```

#### Correct
```tsx
<input type="number" min="0" step="0.01" onFocus={(event) => event.target.select()} />
```
