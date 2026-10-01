import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { hashT4 } from "./production-import-t4-followon-binding.mjs";
import { deriveYuzhouPhotoFileId } from "./yuzhou-photo-file-rehearsal-persistence.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const SHA = /^[a-f0-9]{64}$/u;

/** Authenticate real normalized bytes against every original photo row. The
 * returned paths are relative to the actual API storage root; no path or owner
 * is accepted from the source document. Empty/unmapped photos keep receipts. */
export function prepareT5FollowonPhotos({ bytes, binding, stage, byCode }) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 64 * 1024 * 1024 || hashT4(bytes) !== binding.photoBundleSha256)
    fail("T5_PHOTO_BUNDLE_DRIFT");
  const bundle = JSON.parse(bytes);
  if (bundle.formatVersion !== 1 || bundle.artifactKind !== "yuzhou_normalized_photo_bundle"
    || bundle.sourceSnapshotHash !== binding.triple.sourceSnapshotHash
    || bundle.sourceRestoreReceiptSha256 !== binding.sourceRestoreReceiptSha256
    || bundle.sourceCustodySha256 !== binding.photoSourceCustodySha256
    || bundle.normalizationReceiptSha256 !== binding.photoNormalizationReceiptSha256
    || bundle.workerImageId !== binding.photoWorkerImageId
    || bundle.images?.length !== 2150 || bundle.sourceAssociations?.length !== 2949)
    fail("T5_PHOTO_PROVENANCE_DRIFT");
  const images = new Map(), sourceImages = new Map();
  for (const image of bundle.images) {
    if (!SHA.test(image.sourceContentSha256 ?? "") || !SHA.test(image.normalizedContentSha256 ?? "")
      || typeof image.base64 !== "string" || !Number.isSafeInteger(image.bytes) || image.bytes < 1 || image.bytes > 5 * 1024 * 1024)
      fail("T5_PHOTO_IMAGE_INVALID");
    const data = Buffer.from(image.base64, "base64");
    if (data.toString("base64") !== image.base64 || data.length !== image.bytes || hashT4(data) !== image.normalizedContentSha256
      || !data.subarray(0, 3).equals(Buffer.from([255, 216, 255])) || !data.subarray(-2).equals(Buffer.from([255, 217]))
      || sourceImages.has(image.sourceContentSha256) || images.has(image.normalizedContentSha256)) fail("T5_PHOTO_IMAGE_DRIFT");
    sourceImages.set(image.sourceContentSha256, image.normalizedContentSha256);
    images.set(image.normalizedContentSha256, { ...image, md5: createHash("md5").update(data).digest("hex") });
  }
  const photos = stage.records.filter(row => row.fileRole === "employee_photo"), originals = new Map(photos.map(row => [row.sourceIdentitySha256, row]));
  if (photos.length !== 2949 || originals.size !== 2949) fail("T5_PHOTO_SOURCE_COUNT_DRIFT");
  const files = [], quarantined = [], seen = new Set(); let content = 0, empty = 0, unresolved = 0;
  const directory = `yuzhou-hr/t5-photo/${binding.operationId}`;
  for (const association of bundle.sourceAssociations) {
    const record = originals.get(association.sourceIdentitySha256);
    if (!record || seen.has(record.sourceIdentitySha256) || association.sourceRowSha256 !== record.sourceRowSha256
      || !Number.isSafeInteger(association.bytes) || association.bytes < 0
      || !(String(record.actualSize) === String(association.bytes)
        || (record.actualSize === null && record.contentSha256 === null && record.readabilityStatus === "empty" && association.bytes === 0))
      || association.contentSha256 !== record.contentSha256)
      fail("T5_PHOTO_SOURCE_ROW_DRIFT");
    seen.add(record.sourceIdentitySha256);
    const owner = byCode.get(record.employeeCode);
    let reason;
    if (association.bytes === 0) { empty += 1; reason = "PHOTO_SOURCE_EMPTY"; }
    else {
      content += 1;
      const image = images.get(association.normalizedContentSha256);
      if (!image || sourceImages.get(association.contentSha256) !== association.normalizedContentSha256
        || association.normalizationStatus !== "NORMALIZED" || record.contentSha256 !== association.contentSha256)
        fail("T5_PHOTO_ASSOCIATION_DRIFT");
      if (!owner) { unresolved += 1; reason = "PHOTO_OWNER_NOT_MAPPED"; }
      else {
        const id = deriveYuzhouPhotoFileId(record.sourceIdentitySha256);
        files.push({ record: { targetTable: "sys_file", sourceIdentitySha256: record.sourceIdentitySha256,
          sourceRowSha256: record.sourceRowSha256 }, id, fileCode: `YHP${record.sourceIdentitySha256.slice(0, 24)}`,
        bizId: owner.employee_id, storagePath: `${directory}/${image.normalizedContentSha256}.jpg`,
        normalizedContentSha256: image.normalizedContentSha256, fileSize: image.bytes, md5: image.md5 });
      }
    }
    if (reason) quarantined.push({ targetTable: "sys_file", sourceIdentitySha256: record.sourceIdentitySha256,
      sourceRowSha256: record.sourceRowSha256, quarantineReason: reason });
  }
  if (content !== 2155 || empty !== 794 || files.length + quarantined.length !== 2949) fail("T5_PHOTO_SOURCE_COUNT_DRIFT");
  return { directory, images: [...images.values()], files, quarantined,
    receipt: { sourceRows: 2949, readableSourceRows: content, emptySourceRows: empty,
      readableUnmappedRows: unresolved, employeePhotoFiles: files.length, distinctPhysicalFiles: images.size } };
}

export async function insertT5FollowonPhotoFiles(client, binding, prepared, actorId) {
  let count = 0;
  for (let offset = 0; offset < prepared.files.length; offset += 500) {
    const rows = prepared.files.slice(offset, offset + 500).map(file => ({ id: file.id,
      tenant_id: binding.targetScope.tenantId, park_id: binding.targetScope.parkId, file_code: file.fileCode,
      original_name: `${file.normalizedContentSha256}.jpg`, stored_name: `${file.normalizedContentSha256}.jpg`,
      file_url: `/api/v1/files/${file.id}/download`, file_size: file.fileSize, mime_type: "image/jpeg", md5: file.md5,
      content_sha256: file.normalizedContentSha256, biz_type: "hr_employee_photo", biz_id: file.bizId,
      storage_type: "local", storage_path: file.storagePath, create_by: actorId, update_by: actorId }));
    const result = await client.query(`INSERT INTO sys_file(id,tenant_id,park_id,file_code,original_name,stored_name,file_url,
      file_size,mime_type,md5,content_sha256,biz_type,biz_id,storage_type,storage_path,create_by,update_by,is_encrypted,status,is_deleted,version)
      SELECT x.*,false,1,false,1 FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,tenant_id varchar,park_id varchar,file_code varchar,
      original_name varchar,stored_name varchar,file_url varchar,file_size bigint,mime_type varchar,md5 varchar,content_sha256 varchar,
      biz_type varchar,biz_id uuid,storage_type varchar,storage_path varchar,create_by uuid,update_by uuid)`, [JSON.stringify(rows)]);
    count += result.rowCount;
  }
  if (count !== prepared.files.length) fail("T5_PHOTO_INSERT_CONSERVATION_FAILED");
}
