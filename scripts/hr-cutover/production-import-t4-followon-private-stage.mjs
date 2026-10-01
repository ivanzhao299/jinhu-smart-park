import { readBoundedPrivateArtifactBytes } from "./execute-production-import.mjs";
import { T4_FILES, canonicalT4, exactT4, failT4, hashT4, shaT4, validateT4Binding } from "./production-import-t4-followon-binding.mjs";

export function readT4PrivateArtifact(descriptor, maximumBytes = 8 * 1024 * 1024) {
  exactT4(descriptor, ["path", "sha256"]);
  shaT4(descriptor.sha256);
  const bytes = readBoundedPrivateArtifactBytes(descriptor.path, "T4 private artifact", maximumBytes);
  if (hashT4(bytes) !== descriptor.sha256) failT4("T4_ARTIFACT_HASH_MISMATCH");
  return bytes;
}

// Retain the authenticated bytes; the writer never reopens a mutable source path.
export function readT4PrivateStage(input, binding) {
  exactT4(input, ["manifest", "files"]);
  const { manifest: descriptor, files } = input;
  validateT4Binding(binding);
  exactT4(files, T4_FILES);
  if (descriptor.sha256 !== binding.manifestSha256) failT4("T4_MANIFEST_BINDING_MISMATCH");
  const manifestBytes = readT4PrivateArtifact(descriptor);
  const manifest = JSON.parse(manifestBytes);
  if (manifest.formatVersion !== 1 || manifest.productionImport !== "HOLD" || manifest.sourceBackupSha256 !== binding.triple.sourceSnapshotHash || manifest.mappingContractSha256 !== binding.triple.mappingContractHash || manifest.sourceRestoreReceiptSha256 !== binding.sourceRestoreReceiptSha256 || manifest.businessContentSha256 !== binding.sourceBusinessSha256 || manifest.actualSourceRows !== "46092" || manifest.minimumYear !== "2010" || manifest.maximumYear !== "2026") failT4("T4_SOURCE_BINDING_MISMATCH");
  exactT4(manifest.outputFiles, T4_FILES);
  const buffers = {};
  for (const name of T4_FILES) {
    if (files[name].sha256 !== binding.files[name] || manifest.outputFiles[name].fileSha256 !== binding.files[name]) failT4("T4_FILE_BINDING_MISMATCH");
    buffers[name] = readT4PrivateArtifact(files[name], name === "payslips.jsonl" ? 1_500_000_000 : 32 * 1024 * 1024);
  }
  if (manifest.businessContentSha256 !== hashT4(canonicalT4({ profileVersion: manifest.profileVersion, catalogSha256: manifest.actualCatalogSha256, outputFiles: binding.files }))) failT4("T4_BUSINESS_HASH_MISMATCH");
  return { manifest, manifestBytes, buffers };
}

export function* t4StageRows(bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const end = bytes.indexOf(10, offset);
    if (end === -1) failT4("T4_JSONL_UNTERMINATED");
    if (end === offset) failT4("T4_JSONL_EMPTY_ROW");
    let row;
    try { row = JSON.parse(bytes.subarray(offset, end).toString("utf8")); } catch { failT4("T4_JSONL_INVALID"); }
    if (!row || typeof row !== "object" || Array.isArray(row)) failT4("T4_JSONL_INVALID");
    shaT4(row.sourceRowSha256);
    yield row;
    offset = end + 1;
  }
}
