# Files Center Test Plan

## API

- `POST /api/v1/files` requires JWT and `file:upload`.
- `POST /api/v1/files` requires `X-Idempotency-Key`.
- Multipart field names: `file`, `biz_type`, optional `biz_id`, optional `remark`.
- Allowed MIME types: JPEG, PNG, WebP, PDF, XLSX, XLS, MP4.
- Non-video file over 20MB returns unified error response.
- MP4 file over 100MB returns unified error response.
- `GET /api/v1/files?biz_type=contract&biz_id=<id>` returns only current `tenant_id + park_id` and `is_deleted = false`.
- `GET /api/v1/files/:id/download` requires `file:download`.
- Download records `sys_op_log` with action `download`.
- `DELETE /api/v1/files/:id` requires `file:delete` and only soft deletes.

## Frontend Components

- `FileUploader` accepts `bizType`, optional `bizId`, and `onUploaded`.
- `AttachmentList` accepts `bizType`, optional `bizId`, and supports preview, download, delete.
- `FilePreview` supports image, PDF, and MP4 preview.
- Delete action prompts for second confirmation.
- Upload, download, and delete all check `res.ok`.

