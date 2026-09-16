import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { validateSourceRestoreReceipt } from "./source-restore-receipt.mjs";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";

const SHA = /^[0-9a-f]{64}$/u;
const fail = code => { const error = new Error(code); error.code = code; throw error; };
function readEvidence(descriptor) {
  if (!descriptor || !SHA.test(descriptor.sha256 ?? "") || !(descriptor.bytes instanceof Uint8Array)
    || descriptor.bytes.byteLength < 1 || descriptor.bytes.byteLength > 262144) fail("T5_RETAINED_EVIDENCE_INVALID");
  if (createHash("sha256").update(descriptor.bytes).digest("hex") !== descriptor.sha256) fail("T5_RETAINED_EVIDENCE_HASH_DRIFT");
  try { return JSON.parse(Buffer.from(descriptor.bytes).toString("utf8")); }
  catch { fail("T5_RETAINED_EVIDENCE_JSON_INVALID"); }
}

/** Hash-only provenance result, not a stage, mapping approval, or write permit.
 * The caller must obtain pinned hashes from its trusted input descriptors and
 * enforce file ownership/no-follow boundaries before supplying bytes here.
 */
export function verifyT5RetainedSourceBinding({ historicalManifest, historicalReceipt, currentReceipt,
  projectionSourceManifestSha256, expectedSourceSnapshotSha256, historicalMappingContractSha256,
  consumerMappingContractSha256 }) {
  for (const value of [projectionSourceManifestSha256, expectedSourceSnapshotSha256,
    historicalMappingContractSha256, consumerMappingContractSha256]) {
    if (typeof value !== "string" || !SHA.test(value)) fail("T5_RETAINED_BINDING_INVALID");
  }
  const manifest = readEvidence(historicalManifest);
  const oldReceipt = readEvidence(historicalReceipt), newReceipt = readEvidence(currentReceipt);
  try { validateSourceRestoreReceipt(oldReceipt); validateSourceRestoreReceipt(newReceipt); }
  catch { fail("T5_RETAINED_RESTORE_RECEIPT_INVALID"); }
  if (manifest?.artifactKind !== "yuzhou_t5_nonfile_materialization_stage" || manifest.productionImport !== "HOLD"
    || manifest.sourceRestoreReceiptSha256 !== historicalReceipt.sha256
    || projectionSourceManifestSha256 !== historicalManifest.sha256
    || manifest.mappingContractSha256 !== historicalMappingContractSha256) fail("T5_RETAINED_SOURCE_LINK_DRIFT");
  if ([manifest.sourceSnapshotSha256, oldReceipt.sourceSnapshotSha256, newReceipt.sourceSnapshotSha256]
    .some(value => value !== expectedSourceSnapshotSha256)
    || canonical(oldReceipt.backup) !== canonical(newReceipt.backup)) fail("T5_RETAINED_BACKUP_MISMATCH");
  return Object.freeze({
    formatVersion: 1, artifactKind: "yuzhou_t5_retained_source_binding_check",
    historicalManifestSha256: historicalManifest.sha256,
    historicalRestoreReceiptSha256: historicalReceipt.sha256,
    currentRestoreReceiptSha256: currentReceipt.sha256,
    sourceSnapshotSha256: expectedSourceSnapshotSha256,
    historicalMappingContractSha256, consumerMappingContractSha256,
    sameBackupVerified: true,
    mappingCompatibilityVerified: false,
    projectionTransformationVerified: false,
    productionImport: "HOLD",
  });
}
