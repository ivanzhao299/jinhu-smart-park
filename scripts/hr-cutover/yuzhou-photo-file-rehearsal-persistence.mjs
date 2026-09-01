import { createHash } from "node:crypto";

import {
  YUZHOU_PHOTO_FILE_MATERIALIZATION_BIZ_TYPE,
  YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE,
  YuzhouPhotoFileMaterializationError
} from "./yuzhou-photo-file-materialization-rehearsal.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const MD5 = /^[0-9a-f]{32}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const fail = (code, detail) => { throw new YuzhouPhotoFileMaterializationError(code, detail); };
const hash = value => createHash("sha256").update(value).digest();
const rowCount = (result, code) => {
  if (!result || !Array.isArray(result.rows)) fail(code, "database result is invalid");
  return result.rows;
};
const scopeValue = (value, label) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value)) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_SCOPE_INVALID", label);
  return value;
};

export function deriveYuzhouPhotoFileId(sourceIdentitySha256) {
  if (!SHA256.test(sourceIdentitySha256 ?? "")) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_SOURCE_INVALID", "source identity hash invalid");
  const bytes = Buffer.from(hash(`yuzhou-v10:dbo.person.photo:${sourceIdentitySha256}`));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_FILES_INVALID", "non-empty file receipt required");
  const identities = new Set(), ids = new Set(), codes = new Set();
  return files.map((file, index) => {
    const expected = ["bizId", "bizType", "mimeType", "sourceIdentitySha256", "sourceRowSha256", "sourceContentSha256", "normalizedContentSha256", "storagePath", "fileSize", "md5"].sort();
    if (!file || typeof file !== "object" || Array.isArray(file) || JSON.stringify(Object.keys(file).sort()) !== JSON.stringify(expected)) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_FILES_INVALID", `file ${index} shape differs`);
    if (file.bizType !== YUZHOU_PHOTO_FILE_MATERIALIZATION_BIZ_TYPE || file.mimeType !== "image/jpeg" || !UUID.test(file.bizId ?? "")) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_FILES_INVALID", `file ${index} target invalid`);
    for (const key of ["sourceIdentitySha256", "sourceRowSha256", "sourceContentSha256", "normalizedContentSha256"]) if (!SHA256.test(file[key] ?? "")) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_FILES_INVALID", `file ${index} hash invalid`);
    if (!MD5.test(file.md5 ?? "") || !Number.isSafeInteger(file.fileSize) || file.fileSize <= 0 || !new RegExp(`^yuzhou-hr/t5-photo/[A-Za-z0-9][A-Za-z0-9._-]{5,63}/${file.normalizedContentSha256}\\.jpg$`, "u").test(file.storagePath ?? "")) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_FILES_INVALID", `file ${index} storage invalid`);
    const id = deriveYuzhouPhotoFileId(file.sourceIdentitySha256);
    const fileCode = `YHP${file.sourceIdentitySha256.slice(0, 24)}`;
    if (identities.has(file.sourceIdentitySha256) || ids.has(id) || codes.has(fileCode)) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_DUPLICATE", `file ${index} duplicate`);
    identities.add(file.sourceIdentitySha256); ids.add(id); codes.add(fileCode);
    return Object.freeze({ ...file, id, fileCode, fileUrl: `/api/v1/files/${id}/download`, sourceTable: "dbo.person.photo", sourceSystem: "yuzhou-v10", sourcePkCanonical: `sha256:${file.sourceIdentitySha256}` });
  });
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["mode", "batchId", "tenantId", "parkId", "files", "tx"].sort())) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_INPUT_INVALID", "input shape differs");
  if (input.mode !== YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE || !UUID.test(input.batchId ?? "") || !input.tx || typeof input.tx.query !== "function") fail("YUZHOU_PHOTO_FILE_PERSISTENCE_INPUT_INVALID", "mode, batch or transaction invalid");
  return { ...input, tenantId: scopeValue(input.tenantId, "tenant"), parkId: scopeValue(input.parkId, "park"), files: validateFiles(input.files) };
}

export async function persistYuzhouPhotoFileRehearsal(input) {
  const value = validateInput(input);
  const identities = value.files.map(file => file.sourceIdentitySha256).sort();
  const isolation = rowCount(await value.tx.query("/* yuzhou-photo:transaction-isolation */ SHOW transaction_isolation", []), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (isolation.length !== 1 || String(isolation[0].transaction_isolation ?? "").toLowerCase() !== "serializable") fail("YUZHOU_PHOTO_FILE_PERSISTENCE_ISOLATION_INVALID", "serializable transaction required");
  await value.tx.query("/* yuzhou-photo:advisory-lock */ SELECT pg_advisory_xact_lock(hashtext(identity)) FROM unnest($1::text[]) identity", [identities]);
  const existing = rowCount(await value.tx.query(
    "/* yuzhou-photo:active-map-preflight */ SELECT source_identity_sha256 FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table='dbo.person.photo' AND source_identity_sha256=ANY($1::char(64)[]) AND is_active FOR KEY SHARE",
    [identities]
  ), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (existing.length !== 0) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_REPLAY_CONFLICT", "an active photo mapping already exists");
  const rows = value.files.map(file => ({
    id: file.id, tenant_id: value.tenantId, park_id: value.parkId, file_code: file.fileCode,
    original_name: `${file.normalizedContentSha256}.jpg`, stored_name: `${file.normalizedContentSha256}.jpg`, file_url: file.fileUrl,
    file_size: String(file.fileSize), mime_type: file.mimeType, md5: file.md5, content_sha256: file.normalizedContentSha256,
    biz_type: file.bizType, biz_id: file.bizId, storage_type: "local", storage_path: file.storagePath
  }));
  const inserted = rowCount(await value.tx.query(
    "/* yuzhou-photo:insert-sys-file */ INSERT INTO sys_file(id,tenant_id,park_id,file_code,original_name,stored_name,file_url,file_size,mime_type,md5,content_sha256,biz_type,biz_id,storage_type,storage_bucket,storage_path,is_encrypted,status,is_deleted,version) SELECT id,tenant_id,park_id,file_code,original_name,stored_name,file_url,file_size::bigint,mime_type,md5,content_sha256,biz_type,biz_id,storage_type,NULL,storage_path,false,1,false,1 FROM jsonb_to_recordset($1::jsonb) AS row(id uuid,tenant_id varchar,park_id varchar,file_code varchar,original_name varchar,stored_name varchar,file_url varchar,file_size varchar,mime_type varchar,md5 varchar,content_sha256 varchar,biz_type varchar,biz_id uuid,storage_type varchar,storage_path varchar) RETURNING id::text",
    [JSON.stringify(rows)]
  ), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (inserted.length !== rows.length) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_WRITE_COUNT_INVALID", "sys_file count differs");
  const maps = value.files.map(file => ({ batch_id: value.batchId, source_identity_sha256: file.sourceIdentitySha256, source_row_sha256: file.sourceRowSha256, target_id: file.id }));
  const mapped = rowCount(await value.tx.query(
    "/* yuzhou-photo:insert-record-map */ INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) SELECT batch_id::uuid,'yuzhou-v10','dbo.person.photo','sha256:'||source_identity_sha256,source_identity_sha256,source_row_sha256,'sys_file',target_id::uuid,'loaded',true FROM jsonb_to_recordset($1::jsonb) AS row(batch_id varchar,source_identity_sha256 varchar,source_row_sha256 varchar,target_id varchar) RETURNING source_identity_sha256",
    [JSON.stringify(maps)]
  ), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (mapped.length !== maps.length) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_WRITE_COUNT_INVALID", "record map count differs");
  return Object.freeze({ productionImport: "HOLD", batchId: value.batchId, files: Object.freeze(value.files) });
}

export async function rollbackYuzhouPhotoFileRehearsalPersistence({ mode, batchId, tenantId, parkId, files, tx }) {
  const value = validateInput({ mode, batchId, tenantId, parkId, files, tx });
  const expectedIds = value.files.map(file => file.id).sort();
  const isolation = rowCount(await value.tx.query("/* yuzhou-photo:transaction-isolation */ SHOW transaction_isolation", []), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (isolation.length !== 1 || String(isolation[0].transaction_isolation ?? "").toLowerCase() !== "serializable") fail("YUZHOU_PHOTO_FILE_PERSISTENCE_ISOLATION_INVALID", "serializable transaction required");
  const maps = rowCount(await value.tx.query(
    "/* yuzhou-photo:lock-record-map */ SELECT source_identity_sha256,target_id::text FROM legacy_record_map WHERE batch_id=$1::uuid AND source_system='yuzhou-v10' AND source_table='dbo.person.photo' AND target_table='sys_file' AND mapping_status='loaded' AND is_active FOR UPDATE",
    [value.batchId]
  ), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (maps.length !== expectedIds.length || maps.some(row => !expectedIds.includes(row.target_id))) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_ROLLBACK_SCOPE_INVALID", "active record map differs from receipt");
  const deleted = rowCount(await value.tx.query(
    "/* yuzhou-photo:delete-sys-file */ DELETE FROM sys_file WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND biz_type='hr_employee_photo' AND is_deleted=false RETURNING id::text",
    [value.tenantId, value.parkId, expectedIds]
  ), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (deleted.length !== expectedIds.length) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_ROLLBACK_RESIDUAL", "sys_file deletion count differs");
  const retired = rowCount(await value.tx.query(
    "/* yuzhou-photo:retire-record-map */ UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now() WHERE batch_id=$1::uuid AND source_system='yuzhou-v10' AND source_table='dbo.person.photo' AND target_table='sys_file' AND mapping_status='loaded' AND is_active RETURNING source_identity_sha256",
    [value.batchId]
  ), "YUZHOU_PHOTO_FILE_PERSISTENCE_DATABASE_INVALID");
  if (retired.length !== expectedIds.length) fail("YUZHOU_PHOTO_FILE_PERSISTENCE_ROLLBACK_RESIDUAL", "record map retirement count differs");
  return Object.freeze({ productionImport: "HOLD", batchId: value.batchId, activeDatabaseRows: 0 });
}
