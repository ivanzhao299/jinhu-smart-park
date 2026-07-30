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
  - `disabled?: boolean`
  - `onUploadingChange?(uploading: boolean): void`
  - `onUploaded(file: FileRecord): void`
- `AttachmentList` props:
  - `bizType: string`
  - `bizId?: string`
  - `compact?: boolean`
  - `refreshKey?: number`
  - `mutationDisabled?: boolean`

### 3. Contracts
- Upload policy source of truth: `FILE_UPLOAD_POLICIES` and `FILE_UPLOAD_BIZ_POLICY_MAP` in `packages/shared/src/index.ts`.
- Frontend `accept`, max-size copy, selected-file validation, and helper text must be derived from the shared policy.
- Backend must enforce the same policy; frontend validation is for UX only.
- Uploaded files must be associated with `biz_type` and, when the business object exists, `biz_id`.
- Workflows that permit pre-object uploads must reload the current actor's pending
  files after refresh/revisit; relying only on the current-session `onUploaded`
  callback makes successfully uploaded evidence unreachable.
- Workflows that upload against an existing `bizId` must render a shared
  `AttachmentList` (or equivalent shared recovery surface) for that exact business
  association. After reload, the persisted association is authoritative; an
  action payload assembled only from the current session's callback IDs must not
  erase or hide previously uploaded evidence.
- Compact attachment lists must show uploaded-file preview affordance; image files should display thumbnails and click-to-preview.
- Compact attachment lists may load image blobs and expose preview affordances only
  when the actor has `file:download`. With `file:read` alone, render metadata and a
  non-interactive file marker without issuing `/files/:id/download`.
- A business permission never implies a generic file permission. Mount `FileUploader`
  only when the actor has both the domain write permission and `file:upload`; mount
  API-backed attachment lists only when the actor has both the domain read permission
  and `file:read`.
- Read-only detail pages must not render mutable file-backed form fields merely because
  the submit button is permission-aware. Gate the complete mutable form on its domain
  write permission, then gate its uploader on the additional generic file permission.
- Attachment mutation is locked for the complete child-upload interval. Housing repair
  evidence cannot be removed while upload is in flight, even before submission starts.
- Terminal attachment registration changes ownership: an unsigned pending lease may
  upload/select its signature, while a persisted signature is read-only evidence and
  the uploader is unmounted.
- When a pending purchase receipt becomes bound, remove it from draft recovery but
  render it from the authoritative purchase-list projection. Association must never
  make successfully submitted evidence disappear from the operations page.
- After a successful file-delete response, notify the owning business component before
  refreshing the attachment projection and remove the file from the shared list's
  local projection. The server mutation is authoritative; a secondary list-refresh
  failure must become a separate warning, must not reject the completed deletion, and
  must not leave the deleted row or file ID in client state.
- Protected business-file deletion controls require both `file:delete` and the domain
  mutation permission enforced by the backend (for example,
  `floor:upload_layout` for a floorplan).

### 4. Validation & Error Matrix
- Missing file -> block submit.
- Unsupported MIME -> show friendly validation message and clear selected file.
- Oversized file -> show policy size limit and clear selected file.
- Unauthorized download/preview -> clear session and redirect to login.
- Domain read without `file:read` -> preserve business details; do not mount the
  attachment list or issue a predictable unauthorized request.
- `file:read` without `file:download` -> list metadata, but do not fetch thumbnails,
  create object URLs, or offer preview/download actions.
- Domain write without `file:upload` -> preserve non-file workflow actions; omit the
  uploader.
- Backend rejection -> display API error message; do not silently succeed.
- Pending-list load failure -> preserve current visible files and show an error; do not
  replace them with an empty list.
- Post-delete attachment refresh failure -> retain deletion success in the owning form,
  report the refresh error separately, and allow the next refresh to reconcile the list.
- Post-delete record-list refresh failure -> remove the committed row from the local
  page immediately, decrement the visible total, and distinguish refresh failure from
  deletion failure. Apply this to every sibling delete handler changed in the same PR.
- Business action in flight -> disable file selection, upload, pending-file removal,
  and persisted-file deletion for the submitted aggregate until success or failure.
- Upload in flight -> notify the owning business form through `onUploadingChange`;
  block snapshot/submission until every uploader contributing IDs has settled.
- Completed workflow snapshots may contain structured records without a
  `description` field. Render their non-empty key/value data instead of silently
  displaying “未登记”.
- Evidence history needed on both desktop and mobile must use an always-visible
  shared card/grid surface, not a `ds-mobile-record-list` container that hides on
  desktop.

### 5. Good/Base/Bad Cases
- Good: Floorplan upload uses `policyKey="floorplan"`, accepts image/PDF, shows compact uploaded preview, and backend rejects other types.
- Base: Generic attachment upload resolves policy from `bizType` and falls back to `general`.
- Bad: Native browser file input visible in production UI; page-local MIME strings; page-local max-size values; upload success with no visible uploaded-file record.
- Bad: A read-only form shows editable fields and relies on a hidden submit button, or
  a domain permission alone exposes a file control whose endpoint requires a second
  generic permission.

### 6. Tests Required
- Lint/build after changing shared policy or upload components.
- Browser check on the affected page: file input not visible, helper text visible, uploaded attachment preview visible.
- Browser/API check: a pending upload survives page refresh and can be submitted with
  the later-created business object.
- Browser/API check: an upload already associated with a business object remains
  visible after refresh and the next workflow action retains that evidence.
- Permission test: cover domain-only, generic-file-only, both, and neither permission
  combinations for uploader and attachment-list visibility/effects, including delete.
- Deletion-order test: owner notification runs after DELETE success and before list
  refresh, the shared list removes the committed row before refresh, and a rejected
  refresh returns a warning instead of rejecting the deletion.
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
- For a strict date period `start < end`, the end-date input minimum is the next
  business date, not the start date itself. Changing the start date reconciles an
  end date that is now below that minimum.
- Repeated selector forms own separate candidate arrays and pagination state; sharing
  an endpoint does not authorize sharing mutable page/selection state.
- Browser `required`, `min`, `max`, and `step` attributes mirror the DTO/service
  contract. Backend-required housing cycle, rent, deposit, billing-day, and first-due
  fields must not be optional in native validation.

### 4. Validation & Error Matrix
- Negative where not allowed -> backend rejects.
- Empty required value -> frontend blocks and backend rejects.
- Invalid enum/status -> backend rejects.
- End date equal to or before start date -> native form validation blocks submission;
  backend independently returns HTTP 400.

### 5. Good/Base/Bad Cases
- Good: area field has numeric step and backend decimal/numeric DTO validation.
- Good: `start=2026-07-29` produces `min=2026-07-30` for a strict lease period.
- Bad: free-text input for amount, area, GPS, count, or status.
- Bad: `min={startDate}` when the service rejects `startDate >= endDate`.

### 6. Tests Required
- Browser check for important forms.
- API validation test or targeted smoke for business-critical forms.
- Unit test the nearest boundary: equal dates rejected and the next business date accepted.

### 7. Wrong vs Correct

#### Wrong
```tsx
<input value={amount} onChange={...} />
```

#### Correct
```tsx
<input type="number" min="0" step="0.01" onFocus={(event) => event.target.select()} />
<input type="date" min={addBusinessDateDays(startDate, 1)} />
```
