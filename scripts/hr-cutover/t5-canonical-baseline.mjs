import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA256 = /^[0-9a-f]{64}$/u;
const BASELINE_PATH = resolve(ROOT, "scripts/hr-cutover/contracts/yuzhou-t5-canonical-baseline-v1.json");

const fail = (message) => { throw new Error(message); };

export function canonicalT5Baseline(path = BASELINE_PATH) {
  const baseline = JSON.parse(readFileSync(path, "utf8"));
  const expected = ["formatVersion", "artifactKind", "sourceSystem", "sourceSnapshotSha256", "sourceRestoreReceiptSha256", "businessSha256", "catalogSha256", "mappingContractSha256", "sourceRows", "photoRows", "documentRows", "nonfileMaterializationRows", "proof", "productionImport"].sort();
  if (JSON.stringify(Object.keys(baseline).sort()) !== JSON.stringify(expected)
    || baseline.formatVersion !== 1 || baseline.artifactKind !== "yuzhou_t5_canonical_baseline" || baseline.sourceSystem !== "yuzhou-v10"
    || baseline.sourceRows !== 20163 || baseline.photoRows !== 2949 || baseline.documentRows !== 1003 || baseline.nonfileMaterializationRows !== 7752
    || baseline.proof !== "two_matching_isolated_t5_extractions_with_matching_domain_hashes" || baseline.productionImport !== "HOLD") fail("T5 canonical baseline contract is invalid");
  for (const field of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "businessSha256", "catalogSha256", "mappingContractSha256"]) {
    if (!SHA256.test(baseline[field] ?? "")) fail(`T5 canonical baseline ${field} is invalid`);
  }
  return baseline;
}

export function t5BusinessHashFor({ sourceSnapshotHash, sourceRestoreReceiptSha256 }, baseline = canonicalT5Baseline()) {
  if (!SHA256.test(sourceSnapshotHash ?? "") || !SHA256.test(sourceRestoreReceiptSha256 ?? "")) fail("T5 source baseline arguments are invalid");
  if (baseline.sourceSnapshotSha256 !== sourceSnapshotHash || baseline.sourceRestoreReceiptSha256 !== sourceRestoreReceiptSha256) {
    fail("T5 canonical baseline does not bind the current source restore receipt");
  }
  return baseline.businessSha256;
}
