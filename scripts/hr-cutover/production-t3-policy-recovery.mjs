import { createHash } from "node:crypto";
import { buildLegacyInsurancePolicyItems } from "./legacy-insurance-policy-normalization.mjs";
import { verifyProductionT3StagedRecord } from "./production-t3-field-projection.mjs";
import { stableProductionImportCanonicalJson } from "./production-import-target-model.mjs";
import { buildProductionT3Provenance, deriveProductionT3ChildProvenance } from "./materialize-production-t3-phase-artifact.mjs";

const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const slots = [["baseRate", ""], ["employerRate", "_e"], ["employeeRate", "_p"], ["supplementRate", "_pc"]];
const legacyKeys = ["kind", "variant", ...slots.map(([field]) => field)].sort();
const decimal = /^[+-]?[0-9]+(?:\.[0-9]+)?$/u;

export class ProductionT3PolicyRecoveryError extends Error {
  constructor(code) { super(code); this.name = "ProductionT3PolicyRecoveryError"; this.code = code; }
}
const fail = code => { throw new ProductionT3PolicyRecoveryError(code); };

function hash(value) {
  try { return createHash("sha256").update(stableProductionImportCanonicalJson(value)).digest("hex"); }
  catch { fail("T3_POLICY_RECOVERY_SOURCE_INVALID"); }
}

function childProvenance(row, kind, variant) {
  const targetTable = "hr_insurance_policy_item";
  return buildProductionT3Provenance({ targetTable, sourceTable: row.sourceTable,
    ...deriveProductionT3ChildProvenance(row.sourceIdentitySha256, targetTable, `${kind}\0${variant}`, row.sourceRowSha256) });
}

/**
 * Recover the reversible, receipt-bound six-key policy layout only. The caller
 * must authenticate stage bytes against its current manifest before using this
 * result. Raw-row reconstruction proves integrity, never import authorization.
 * This adapter is deliberately not called by the default field/phase producer.
 */
export function recoverProductionT3LegacyPolicy(row) {
  try { verifyProductionT3StagedRecord(row); }
  catch { fail("T3_POLICY_RECOVERY_SOURCE_INVALID"); }
  if (row.sourceTable !== "dbo.insure_method") fail("T3_POLICY_RECOVERY_SOURCE_INVALID");
  if ((row.source.name !== null && typeof row.source.name !== "string")
    || (row.source.scope !== null && !["string", "number"].includes(typeof row.source.scope))) fail("T3_POLICY_RECOVERY_SOURCE_INVALID");
  if (row.items.length !== 12) fail("T3_POLICY_RECOVERY_LAYOUT_INVALID");

  const raw = { id: row.source.id, des: row.source.name, rightscope: row.source.scope };
  const seen = new Set();
  for (const item of row.items) {
    // Current or mixed layouts cannot pass: otherwise already-fractional rates
    // could be divided a second time, and suffix-2 provenance would disappear.
    if (JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(legacyKeys)
      || !kinds.includes(item.kind) || ![1, 2].includes(item.variant)) fail("T3_POLICY_RECOVERY_LAYOUT_INVALID");
    const key = `${item.kind}\0${item.variant}`;
    if (seen.has(key)) fail("T3_POLICY_RECOVERY_LAYOUT_INVALID");
    seen.add(key);
    for (const [field, suffix] of slots) {
      const value = item[field];
      if (value !== null && (typeof value !== "string" || !decimal.test(value.trim()))) fail("T3_POLICY_RECOVERY_AMOUNT_INVALID");
      // Preserve the original string spelling for the raw checksum; do not
      // canonicalize decimals or coerce SQL numeric strings through Number.
      raw[`${item.kind}${suffix}${item.variant === 2 ? "2" : ""}`] = value;
    }
  }
  if (kinds.some(kind => [1, 2].some(variant => !seen.has(`${kind}\0${variant}`)))) fail("T3_POLICY_RECOVERY_LAYOUT_INVALID");
  if (hash(raw) !== row.sourceRowSha256) fail("T3_POLICY_RECOVERY_RAW_HASH_MISMATCH");

  let items;
  try { items = buildLegacyInsurancePolicyItems(raw, kinds); }
  catch { fail("T3_POLICY_RECOVERY_NORMALIZATION_INVALID"); }
  const normalizedRecord = { ...row, source: { ...row.source }, items };
  const lineage = kinds.map(insuranceKind => ({ insuranceKind,
    sourceProjections: [childProvenance(row, insuranceKind, 1), childProvenance(row, insuranceKind, 2)],
    targetProjection: childProvenance(row, insuranceKind, 1),
  }));
  const proof = {
    formatVersion: 1, status: "SOURCE_RECONSTRUCTION_VERIFIED",
    sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256,
    reconstructedFieldCount: 51, sourceItemCount: 12, normalizedItemCount: 6,
    normalizedContentSha256: hash(normalizedRecord), productionImport: "HOLD",
  };
  return { normalizedRecord, lineage, proof };
}
