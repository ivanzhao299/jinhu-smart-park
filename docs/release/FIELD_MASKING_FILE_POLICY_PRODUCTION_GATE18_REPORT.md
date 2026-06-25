# Field Masking And File Policy Production Gate-18 Report

Date: 2026-06-25

## Verdict

PASS

## Production Run

- GitHub Actions run: `28160825180`
- Gate run id: `gate18-field-masking-file-policy-20260625T093332Z`
- API base: `http://127.0.0.1:3010/api/v1`
- Web base: `http://127.0.0.1:3011`
- Tenant: `10000001`
- Park: `20000001`
- Production DB write: `controlled_system_and_file_policy`

## Scope

Gate-18 verifies that field masking and file policy controls are not only implemented in source code, but observable in production runtime behavior:

- Runtime field policy application for a non-super user.
- Mobile number masking on `/users/:id`.
- File upload MIME policy rejection.
- Valid image upload, download, download audit, and soft delete.
- Controlled cleanup of temporary gate system records and uploaded fixture.

## Source And Schema Evidence

- PASS: field policy masking service deployed.
- PASS: user detail field policy application deployed.
- PASS: file upload policy resolver deployed.
- PASS: unsupported file MIME rejection deployed.
- PASS: file download audit deployed.
- PASS: file soft delete deployed.
- PASS: `sys_field_policy` required columns = `6`.
- PASS: `rel_role_field_policy` required columns = `2`.
- PASS: `sys_file` required columns = `6`.
- PASS: `sys_op_log` required columns = `6`.
- PASS: field policy list endpoint HTTP `200`.

## Field Masking Runtime Evidence

- Existing active mobile masking policy reused: `87da21a7-3d14-462f-9b41-d63bae3067e0`.
- Temporary non-super gate user was assigned a temporary role bound to the mobile masking policy.
- `GET /users/:id` as the non-super actor returned HTTP `200`.
- Raw mobile: not returned.
- Masked mobile: `138****5678`.

## File Policy Runtime Evidence

- `text/plain` upload for `workorder_create` was rejected with HTTP `415`.
- `image/png` upload for `workorder_create` was accepted with HTTP `201`.
- Accepted upload MIME: `image/png`.
- Uploaded image download returned HTTP `200`.
- Download content type: `image/png`.
- Download bytes: `68`.
- Download audit rows before: `0`.
- Download audit rows after: `1`.
- Uploaded fixture soft delete endpoint returned HTTP `200`.
- Uploaded fixture `is_deleted`: `true`.

## Cleanup Evidence

- Temporary user, role, role binding, and field-policy binding are marked deleted by the gate script exit trap.
- Temporary field policy is only inserted when no active `system.user.mobile` policy exists; this run reused the existing policy.
- Uploaded gate fixture is soft-deleted.

## Risk Notes

- The gate used controlled system records and a tiny test attachment only.
- No tenant business workflow was modified.
- No secrets were printed.
- No destructive file deletion was performed; file cleanup used soft delete.

## Final Verdict

Field masking and file policy enforcement are production-verifiable through runtime API behavior, upload MIME rejection, download audit logging, and soft deletion.
