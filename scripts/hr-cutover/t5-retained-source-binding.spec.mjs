import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import { sealSourceRestoreReceipt } from "./source-restore-receipt.mjs";
import { verifyT5RetainedSourceBinding } from "./t5-retained-source-binding.mjs";

const sha = char => char.repeat(64);
const descriptor = value => {
  const bytes = Buffer.from(JSON.stringify(value));
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
};
function receipt(identity, snapshot = sha("a"), bytes = 100) {
  return sealSourceRestoreReceipt({ formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt",
    sourceSnapshotSha256: snapshot,
    backup: { sha256: snapshot, bytes, containerCopySha256: snapshot, containerCopyBytes: bytes },
    identities: Object.fromEntries(["containerSha256", "imageSha256", "databaseSha256", "restoreSha256", "catalogSha256"].map(key => [key, sha(identity)])),
    state: { online: true, readOnly: true },
    etlAuthority: { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false },
    productionImport: "HOLD" });
}
function fixture() {
  const historicalReceipt = descriptor(receipt("b"));
  const historicalManifest = descriptor({ artifactKind: "yuzhou_t5_nonfile_materialization_stage", productionImport: "HOLD",
    sourceSnapshotSha256: sha("a"), sourceRestoreReceiptSha256: historicalReceipt.sha256, mappingContractSha256: sha("c") });
  return { historicalReceipt, historicalManifest, currentReceipt: descriptor(receipt("d")),
    projectionSourceManifestSha256: historicalManifest.sha256, expectedSourceSnapshotSha256: sha("a"),
    historicalMappingContractSha256: sha("c"), consumerMappingContractSha256: sha("e") };
}
const rejects = (input, code) => assert.throws(() => verifyT5RetainedSourceBinding(input), { message: code, code });
test("different restore identities preserve separate mappings without granting import", () => {
  const input = fixture(), before = JSON.stringify(input);
  const result = verifyT5RetainedSourceBinding(input);
  assert.equal(result.sameBackupVerified, true);
  assert.equal(result.historicalMappingContractSha256, sha("c"));
  assert.equal(result.consumerMappingContractSha256, sha("e"));
  assert.equal(result.mappingCompatibilityVerified, false);
  assert.equal(result.projectionTransformationVerified, false);
  assert.equal(result.productionImport, "HOLD");
  assert.equal(JSON.stringify(input), before);
  assert.ok(Object.isFrozen(result));
  assert.ok(!JSON.stringify(result).includes("etlAuthority"));
});
test("reject byte tampering and malformed JSON with stable errors", () => {
  const a = fixture(); a.historicalManifest.bytes[0] = 0;
  rejects(a, "T5_RETAINED_EVIDENCE_HASH_DRIFT");
  const b = fixture(); const bytes = Buffer.from("not-json");
  b.historicalManifest = { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  rejects(b, "T5_RETAINED_EVIDENCE_JSON_INVALID");
});
test("reject another snapshot or inconsistent backup metadata", () => {
  for (const replacement of [receipt("d", sha("f")), receipt("d", sha("a"), 101)]) {
    const a = fixture(); a.currentReceipt = descriptor(replacement);
    rejects(a, "T5_RETAINED_BACKUP_MISMATCH");
  }
});
test("reject receipt tampering even when outer descriptor is recomputed", () => {
  const a = fixture(), r = receipt("d"); r.state.readOnly = false;
  a.currentReceipt = descriptor(r); rejects(a, "T5_RETAINED_RESTORE_RECEIPT_INVALID");
});
test("reject projection and historical mapping relabeling", () => {
  for (const key of ["projectionSourceManifestSha256", "historicalMappingContractSha256"]) {
    const a = fixture(); a[key] = sha("f"); rejects(a, "T5_RETAINED_SOURCE_LINK_DRIFT");
  }
});
