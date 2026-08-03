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
- The shared multipart request helper sends the selected `File.name` in the
  independent UTF-8 `original_name` text field. Do not ask the backend to infer
  mojibake from filename characters; valid Latin-1 text can be byte-identical to a
  misdecoded Unicode name.
- `FileUploader` sends client-owned `biz_type` and optional `biz_id` only to the
  generic `/files` endpoint. A custom `uploadPath` is a domain adapter whose route
  parameters own the association; its FormData contains `file`, optional `remark`,
  and the helper-added `original_name`, but no generic association fields.
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
- When the owning record denormalizes an attachment ID or URL into list, detail, edit,
  or action-target snapshots, apply both successful uploads and deletions to every
  matching local snapshot synchronously before refreshing. Upload success must replace
  the projected file ID/URL before an older attachment can be deleted; deletion must
  compare both the business-record ID and deleted file ID so a late callback for an
  older file cannot erase a newer replacement.
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
- A custom upload rejects `biz_type` or `biz_id` as non-whitelisted -> fix the
  frontend multipart boundary; do not weaken the domain DTO to accept ignored
  association fields.
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
- Frontend FormData tests cover both generic and custom upload paths: generic
  uploads include association fields, while custom routes omit them.
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
- Owner-projection lifecycle test: matching denormalized attachment references are
  replaced on upload and cleared on deletion immediately, while another record and a
  newer replacement file remain intact when an older attachment is deleted.
- Attachment owner-projection regressions must be included in a Web package test
  command that is invoked by the root `test:unit` CI verification path; a spec that
  only passes through an ad-hoc local `node --test` command is not protected.
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
- A create flow with a mandatory child relation must disclose that next step
  before the parent is saved, keep the workflow open after creation, switch to
  the child-relation surface, and use the created parent ID for the first load.
  Do not weaken the backend submit invariant to compensate for a hidden UI step.
- Browser `required`, `min`, `max`, and `step` attributes mirror the DTO/service
  contract. Backend-required housing cycle, rent, deposit, billing-day, and first-due
  fields must not be optional in native validation.
- Optional update relations distinguish omission from clearing: omit/`undefined`
  means preserve the stored relation, while explicit `null` means clear it. Cascading
  selectors must send `null` for descendants cleared by a parent change, and the DTO
  transform must preserve that `null` through service resolution.

### 4. Validation & Error Matrix
- Negative where not allowed -> backend rejects.
- Empty required value -> frontend blocks and backend rejects.
- Invalid enum/status -> backend rejects.
- End date equal to or before start date -> native form validation blocks submission;
  backend independently returns HTTP 400.
- Optional relation omitted -> service preserves the current value.
- Optional relation sent as `null` -> service clears it and reconciles descendants.

### 5. Good/Base/Bad Cases
- Good: area field has numeric step and backend decimal/numeric DTO validation.
- Good: `start=2026-07-29` produces `min=2026-07-30` for a strict lease period.
- Bad: free-text input for amount, area, GPS, count, or status.
- Bad: `min={startDate}` when the service rejects `startDate >= endDate`.

### 6. Tests Required
- Browser check for important forms.
- API validation test or targeted smoke for business-critical forms.
- Unit test the nearest boundary: equal dates rejected and the next business date accepted.
- Unit-test both omitted and explicit-null update relation payloads.

### 7. Wrong vs Correct

#### Wrong
```tsx
<input value={amount} onChange={...} />
```

#### Correct
```tsx
<input type="number" min="0" step="0.01" onFocus={(event) => event.target.select()} />
<input type="date" min={addBusinessDateDays(startDate, 1)} />
const locationPatch = { building_id: buildingId || null, floor_id: floorId || null };
```

## Scenario: Permission-Aware Projections Entering Editable Controls

### 1. Scope / Trigger
- Trigger: An API list/detail projection is copied into an editable form, especially
  attachments, GPS values, encrypted fields, or fields governed by field policies.

### 2. Signatures
- Boundary normalizers accept `unknown` and return the exact control value type:
  - attachment ID list -> comma-separated `string`
  - numeric/GPS projection -> finite numeric `string` or `""`
- Keep the normalizer next to the owning route when only that workflow uses it.

### 3. Contracts
- TypeScript response interfaces describe the canonical authorized response, but do
  not prove the runtime value survived permission projection, legacy data, or partial
  responses in that shape.
- Components must normalize projection values before calling array/string methods or
  assigning them to constrained inputs.
- An absent, masked, or malformed optional projection degrades to an empty control;
  it must not crash the page or be submitted as a mask token.
- Normalization must retain availability separately from the display value. For
  replacement-style optional fields, an unavailable projection omits the request
  field so the backend preserves its current association; only an available empty
  array means the actor intentionally submitted an empty replacement.
- For repeated child records, availability belongs to each child input. Do not use
  one parent flag or discard availability while mapping projections into a
  `Record<id, Input>`; serialize each optional replacement field independently.
- A nested child field uses the field-policy entity declared for that child. Parent
  and child fields with the same property name remain independent capabilities; do
  not gate `inspect_task_result.photo_file_ids` with the `inspect_task` photo policy.

### 4. Validation & Error Matrix
- `string[]` attachment IDs -> trim, remove empty entries, join for the control.
- `null`, missing, masked string, non-array attachment value, or an array containing
  any non-string member -> unavailable and `""`. Reject the entire malformed array;
  never filter invalid members into an available partial or empty replacement.
- finite number or finite numeric string -> preserve as a numeric input string.
- mask token, `NaN`, infinity, object, or missing numeric value -> `""`.
- unavailable attachment projection on resubmit -> omit `photo_file_ids`; backend
  preserves the existing association.
- unavailable attachment projection on one repeated result -> omit only that
  result's `photo_file_ids`; preserve its existing association without changing
  independently available siblings.
- available empty attachment array -> submit `photo_file_ids: []`; backend applies
  normal required-count and replacement validation.

### 5. Good/Base/Bad Cases
- Good: `normalizeFileIdInput(value: unknown)` validates with `Array.isArray` before
  joining.
- Base: canonical arrays and numeric strings retain their business values.
- Bad: `row.photoFileIds?.join(",")` trusts a compile-time interface at an HTTP and
  permission-policy boundary.
- Bad: converting a masked attachment projection to `""` and then submitting it as
  `photo_file_ids: []`.
- Bad: assigning `"***"` to `<input type="number">`.

### 6. Tests Required
- Unit-test canonical, empty, missing, masked, and wrong-shape values.
- Unit-test omission versus explicit empty replacement at both Web projection and
  API merge boundaries.
- A regression test must exercise the normalizer used by the affected form.
- Run Web typecheck and production build after changing the projection-to-form path.

### 7. Wrong vs Correct

#### Wrong
```tsx
setForm({
  photoFileIds: row.photoFileIds?.join(",") ?? "",
  gpsLng: row.gpsLng ?? ""
});
```

#### Correct
```tsx
setForm({
  photoFileIds: normalizeFileIdProjection(row.photoFileIds).value,
  gpsLng: normalizeNumericInput(row.gpsLng)
});

const projection = normalizeFileIdProjection(row.photoFileIds);
const payload = {
  ...(projection.available ? { photo_file_ids: parseFileIds(projection.value) } : {})
};
```

## Scenario: Async Candidate Options In Drawer Forms

### 1. Scope / Trigger
- Trigger: A create/edit drawer depends on asynchronously loaded tenant, park, plan,
  building, floor, unit, or other reference options.

### 2. Signatures
- Option loader accepts the exact parent ID and returns options for that parent.
- Form state owns controlled parent ID, selected option ID, loading state, and any
  checked option IDs that are submitted.

### 3. Contracts
- Opening a drawer must not make an empty uncontrolled `<select>` authoritative while
  its options are still loading.
- The selected value is reconciled after options arrive: preserve a valid edit value,
  otherwise use the configured default, otherwise the first valid option.
- A parent change immediately clears dependent values and stale options. Only the
  latest request may populate state; slower earlier requests are ignored.
- Async detail drawers use a monotonically increasing request generation (or an
  abort signal). Closing the drawer or selecting another record invalidates older
  responses before they can update any dependent state.
- Save remains disabled until options for the currently selected parent are ready.
- A required selector with no options shows an explicit empty/error message and cannot
  submit an empty ID.

### 4. Validation & Error Matrix
- Loading -> show loading option/state; disable dependent selector and save.
- Empty option list -> explain the missing prerequisite; disable save.
- Request failure -> retain the drawer, show the error, and do not expose stale options.
- Edit value absent from returned options -> reconcile to a valid fallback before save.
- Out-of-order response -> ignore unless its request generation is still current.
- Paginated candidate endpoint -> follow `total` through every bounded page and
  deduplicate by the stable business key before treating the selector as ready.

### 5. Good/Base/Bad Cases
- Good: a controlled default-park selector populates when tenant settings resolve.
- Base: editing preserves a valid existing default park and accessible parks.
- Bad: render `defaultValue=""`, append options later, and assume the browser selects
  the correct value.
- Bad: keep a fixed component `key` in edit mode and rely on remounting after fetch.

### 6. Tests Required
- Unit-test empty options, create defaulting, edit preservation, invalid-value repair,
  parent switching without cross-parent leakage, multi-page catalogs, and stale
  request generations.
- Run Web typecheck and production build.
- Inspect create and edit drawers at desktop and phone widths when browser tooling is
  available.

### 7. Wrong vs Correct

#### Wrong
```tsx
<select defaultValue={row.parkId}>{parks.map(renderOption)}</select>
```

#### Correct
```tsx
<select value={parkId} disabled={loading || parks.length === 0} onChange={onParkChange}>
  {parks.map(renderOption)}
</select>
```
