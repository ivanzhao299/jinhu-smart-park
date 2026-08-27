import { createHash } from "node:crypto";

export class LegacyGroupWebSourceAuditContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyGroupWebSourceAuditContractError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyGroupWebSourceAuditContractError(code, detail); };
const exact = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("GROUP_WEB_SOURCE_CONTRACT_SHAPE_INVALID", label);
};
const METRICS = ["traversedAspFiles", "forms", "controls", "requestKeys", "formActions", "selectStatements", "insertStatements", "updateStatements", "deleteStatements", "stateTransitions"];
const EXPECTED_SUMS = Object.freeze({ traversedAspFiles: 583, forms: 263, controls: 3507, requestKeys: 2550, formActions: 189, selectStatements: 252, insertStatements: 3, updateStatements: 1, deleteStatements: 9, stateTransitions: 752 });

export function verifyLegacyGroupWebSourceAudit(report) {
  exact(report, ["formatVersion", "auditKind", "sourceInventoryHash", "operationMode", "sourceBoundary", "navigableModules", "auditHash", "items", "security", "productionImport"], "root");
  if (report.formatVersion !== 1 || report.auditKind !== "yuzhou_hr_legacy_group_web_deployed_source" || report.sourceInventoryHash !== "b34ba532888fee122f93305403f8985bcb9bd1a5ccec69e8013b1d4c4f14e296" || report.operationMode !== "read_only") fail("GROUP_WEB_SOURCE_CONTRACT_IDENTITY_INVALID", "root");
  const serialized = JSON.stringify(report);
  if (/(?:\/Users\/|Downloads\/|file:\/\/|(?:pass(?:word)?|token|secret)\s*[=:]|(?:^|[^0-9])(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.))/i.test(serialized)) fail("GROUP_WEB_SOURCE_CONTRACT_SENSITIVE_CONTENT", "root");
  exact(report.sourceBoundary, ["files", "classicAspFiles"], "sourceBoundary");
  if (report.sourceBoundary.files !== 6304 || report.sourceBoundary.classicAspFiles !== 4026 || report.navigableModules !== 186 || !/^[a-f0-9]{64}$/.test(report.auditHash)) fail("GROUP_WEB_SOURCE_CONTRACT_BOUNDARY_INVALID", "sourceBoundary");
  if (!Array.isArray(report.items) || report.items.length !== report.navigableModules) fail("GROUP_WEB_SOURCE_CONTRACT_ITEM_COUNT_INVALID", String(report.items?.length));
  const ids = new Set();
  const sums = Object.fromEntries(METRICS.map(metric => [metric, 0]));
  for (const item of report.items) {
    exact(item, ["legacyId", "domain", "entryResolved", ...METRICS, "fieldEvidenceHash"], `item.${item?.legacyId}`);
    if (!Number.isInteger(item.legacyId) || ids.has(item.legacyId) || typeof item.domain !== "string" || !item.domain || item.entryResolved !== true || !/^[a-f0-9]{64}$/.test(item.fieldEvidenceHash)) fail("GROUP_WEB_SOURCE_CONTRACT_ITEM_INVALID", String(item?.legacyId));
    for (const metric of METRICS) {
      if (!Number.isInteger(item[metric]) || item[metric] < 0 || (metric === "traversedAspFiles" && item[metric] < 1)) fail("GROUP_WEB_SOURCE_CONTRACT_METRIC_INVALID", `${item.legacyId}:${metric}`);
      sums[metric] += item[metric];
    }
    ids.add(item.legacyId);
  }
  for (const metric of METRICS) if (sums[metric] !== EXPECTED_SUMS[metric]) fail("GROUP_WEB_SOURCE_CONTRACT_SUM_INVALID", `${metric}:${sums[metric]}/${EXPECTED_SUMS[metric]}`);
  if (createHash("sha256").update(JSON.stringify(report.items)).digest("hex") !== report.auditHash) fail("GROUP_WEB_SOURCE_CONTRACT_HASH_INVALID", "items");
  exact(report.security, ["sourceFilesCommitted", "sourceValuesCommitted", "credentialsRecorded", "personalValuesRecorded"], "security");
  if (Object.values(report.security).some(value => value !== false)) fail("GROUP_WEB_SOURCE_CONTRACT_SECURITY_INVALID", "security");
  if (report.productionImport !== "HOLD") fail("GROUP_WEB_SOURCE_CONTRACT_IMPORT_NOT_HELD", String(report.productionImport));
  return { ok: true, items: ids.size, sourceBoundary: report.sourceBoundary, sums, productionImport: report.productionImport };
}

export const LEGACY_GROUP_WEB_SOURCE_EXPECTED_SUMS = EXPECTED_SUMS;
