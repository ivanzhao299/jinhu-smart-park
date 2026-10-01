import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { hashT4 } from "../hr-cutover/production-import-t4-followon-binding.mjs";
import { prepareT5FollowonPhotos } from "../hr-cutover/t5-followon-photos.mjs";

test("all photo source rows bind actual bytes, preserve duplicate associations and distinguish NULL content", () => {
  const binding = { operationId: "yzprod-import-20261001T000000Z-aaaaaaaaaaaa", triple: { sourceSnapshotHash: hashT4("source") },
    sourceRestoreReceiptSha256: hashT4("restore"), photoSourceCustodySha256: hashT4("custody"),
    photoNormalizationReceiptSha256: hashT4("normalization"), photoWorkerImageId: `sha256:${hashT4("worker")}` };
  const images = Array.from({ length: 2150 }, (_, index) => {
    const bytes = Buffer.from([255, 216, 255, 0, 0, 0, 0, 0, 255, 217]); bytes.writeUInt32BE(index, 4);
    return { sourceContentSha256: hashT4(`source-${index}`), normalizedContentSha256: hashT4(bytes), bytes: bytes.length, base64: bytes.toString("base64") };
  });
  const records = [], sourceAssociations = [];
  for (let index = 0; index < 2949; index += 1) {
    const image = index < 2155 ? images[index % 2150] : null;
    const identity = hashT4(`photo-${index}`), row = hashT4(`row-${index}`);
    records.push({ sourceTable: "dbo.person.photo", sourceIdentitySha256: identity, sourceRowSha256: row,
      fileRole: "employee_photo", employeeCode: index === 0 ? "unmapped" : "mapped",
      actualSize: image?.bytes ?? null, contentSha256: image?.sourceContentSha256 ?? null, readabilityStatus: image ? "readable" : "empty" });
    sourceAssociations.push({ sourceIdentitySha256: identity, sourceRowSha256: row, bytes: image?.bytes ?? 0,
      contentSha256: image?.sourceContentSha256 ?? null,
      ...(image ? { normalizedContentSha256: image.normalizedContentSha256, normalizationStatus: "NORMALIZED" } : {}) });
  }
  const bundle = { formatVersion: 1, artifactKind: "yuzhou_normalized_photo_bundle",
    sourceSnapshotHash: binding.triple.sourceSnapshotHash, sourceRestoreReceiptSha256: binding.sourceRestoreReceiptSha256,
    sourceCustodySha256: binding.photoSourceCustodySha256, normalizationReceiptSha256: binding.photoNormalizationReceiptSha256,
    workerImageId: binding.photoWorkerImageId, images, sourceAssociations };
  const encode = () => { const bytes = Buffer.from(JSON.stringify(bundle)); binding.photoBundleSha256 = hashT4(bytes); return bytes; };
  const args = { binding, stage: { records }, byCode: new Map([["mapped", { employee_id: "00000000-0000-4000-8000-000000000001" }]]) };
  const prepared = prepareT5FollowonPhotos({ ...args, bytes: encode() });
  assert.equal(prepared.files.length, 2154); assert.equal(prepared.quarantined.length, 795);
  assert.equal(prepared.images.length, 2150);
  assert.equal(new Set(prepared.files.map(row => row.id)).size, 2154, "duplicate images retain distinct source associations");
  assert.equal(prepared.quarantined.filter(row => row.quarantineReason === "PHOTO_SOURCE_EMPTY").length, 794);
  bundle.sourceAssociations[2155].bytes = 1;
  assert.throws(() => prepareT5FollowonPhotos({ ...args, bytes: encode() }), /SOURCE_ROW_DRIFT/u);
  bundle.sourceAssociations[2155].bytes = 0; bundle.images[0].base64 = Buffer.from("changed").toString("base64");
  assert.throws(() => prepareT5FollowonPhotos({ ...args, bytes: encode() }), /IMAGE_DRIFT/u);
});
