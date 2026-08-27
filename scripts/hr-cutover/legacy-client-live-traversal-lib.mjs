export class LegacyClientTraversalError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyClientTraversalError";
    this.code = code;
  }
}

const REQUIRED_FAMILIES = [
  "organization_job",
  "employee_profile",
  "employment_change",
  "contract",
  "training",
  "performance",
  "reward_discipline",
  "payroll",
  "attendance",
  "insurance_welfare",
  "recruitment",
  "group_web_self_service",
  "permission_log_reminder"
];

const FAIL = (code, detail) => {
  throw new LegacyClientTraversalError(code, detail);
};
const isObject = value => value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected, label) => {
  if (!isObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    FAIL("TRAVERSAL_SHAPE_INVALID", label);
  }
};
const sorted = value => [...value].sort();
const uniqueStrings = (value, label) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
    FAIL("TRAVERSAL_LIST_INVALID", label);
  }
  if (new Set(value).size !== value.length) FAIL("TRAVERSAL_LIST_DUPLICATE", label);
  return value;
};

const containsPrivateIpv4 = value => {
  const candidates = value.match(/(?:^|[^0-9])((?:\d{1,3}\.){3}\d{1,3})(?=$|[^0-9])/g) ?? [];
  return candidates.some(candidate => {
    const octets = (candidate.match(/\d{1,3}/g) ?? []).map(Number);
    if (octets.length !== 4 || octets.some(octet => octet > 255)) return false;
    return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
  });
};

const assertNoSensitiveContent = manifest => {
  const serialized = JSON.stringify(manifest);
  if (/(?:\/Users\/|Downloads\/|file:\/\/|(?:postgres(?:ql)?|sqlserver):\/\/|(?:pass(?:word)?|passwd|pwd|token|secret)\s*[=:]|BEGIN [A-Z ]*PRIVATE KEY)/i.test(serialized) || containsPrivateIpv4(serialized)) {
    FAIL("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", "credentials, workstation paths, connection strings or private addresses are forbidden");
  }
  if (/(?:^|[^0-9])1[3-9]\d{9}(?:[^0-9]|$)|(?:^|[^0-9])\d{17}[0-9Xx](?:[^0-9A-Za-z]|$)/.test(serialized)) {
    FAIL("TRAVERSAL_PERSONAL_VALUE_FORBIDDEN", "phone or identity-card shaped values are forbidden");
  }
};

export function verifyLegacyClientLiveTraversal(manifest) {
  if (!isObject(manifest) || manifest.formatVersion !== 1 || manifest.traversalKind !== "yuzhou_hr_legacy_client_live_traversal") {
    FAIL("TRAVERSAL_IDENTITY_INVALID", "formatVersion or traversalKind");
  }
  exactKeys(manifest, ["formatVersion", "traversalKind", "traversalVersion", "status", "evidenceLevel", "compatibilityScoreContribution", "decisionMaturity", "operationMode", "inventoryContract", "security", "requiredMenuFamilies", "menuFamilies", "completionRequirements", "productionImport"], "manifest");
  assertNoSensitiveContent(manifest);
  if (manifest.operationMode !== "read_only") FAIL("TRAVERSAL_MODE_INVALID", String(manifest.operationMode));
  if (manifest.status !== "in_progress" || manifest.evidenceLevel !== "L3_RUNTIME_PARTIAL" || manifest.compatibilityScoreContribution !== 0 || manifest.decisionMaturity !== "provisional") {
    FAIL("TRAVERSAL_PARTIAL_EVIDENCE_OVERRATED", "format v1 is progress evidence only and contributes zero to L4 compatibility");
  }
  exactKeys(manifest.security, ["credentialsRecorded", "personalValuesRecorded", "screenshotsCommitted", "writeActionsExecuted", "forbiddenActions"], "security");
  if (!isObject(manifest.security) || manifest.security.credentialsRecorded !== false || manifest.security.personalValuesRecorded !== false || manifest.security.screenshotsCommitted !== false || manifest.security.writeActionsExecuted !== false) {
    FAIL("TRAVERSAL_SECURITY_CONTRACT_INVALID", "security flags must remain false");
  }
  const forbiddenActions = uniqueStrings(manifest.security.forbiddenActions, "security.forbiddenActions");
  for (const action of ["save", "approve", "reverse_approve", "close_period", "payroll_payment", "export_personal_data"]) {
    if (!forbiddenActions.includes(action)) FAIL("TRAVERSAL_FORBIDDEN_ACTION_MISSING", action);
  }
  const inventory = manifest.inventoryContract;
  exactKeys(inventory, ["inventoryHash", "tables", "fields", "rules", "helpTopics"], "inventoryContract");
  if (!isObject(inventory) || !/^[a-f0-9]{64}$/.test(inventory.inventoryHash ?? "") || inventory.tables !== 162 || inventory.fields !== 2364 || inventory.rules !== 212 || inventory.helpTopics !== 46) {
    FAIL("TRAVERSAL_INVENTORY_CONTRACT_INVALID", "expected reviewed 162/2364/212/46 boundary");
  }
  const required = uniqueStrings(manifest.requiredMenuFamilies, "requiredMenuFamilies");
  if (JSON.stringify(sorted(required)) !== JSON.stringify(sorted(REQUIRED_FAMILIES))) {
    FAIL("TRAVERSAL_REQUIRED_FAMILY_SET_INVALID", required.join(","));
  }
  if (!Array.isArray(manifest.menuFamilies)) FAIL("TRAVERSAL_FAMILIES_INVALID", "menuFamilies");
  const families = new Map();
  for (const family of manifest.menuFamilies) {
    exactKeys(family, ["id", "runtimeStatus", "entryPoints", "pageChecks", "decision", "reasonCode"], `menuFamilies.${String(family?.id)}`);
    if (!isObject(family) || !required.includes(family.id) || families.has(family.id)) FAIL("TRAVERSAL_FAMILY_INVALID", String(family?.id));
    if (!["missing", "partial", "observed"].includes(family.runtimeStatus)) FAIL("TRAVERSAL_RUNTIME_STATUS_INVALID", family.id);
    uniqueStrings(family.entryPoints, `${family.id}.entryPoints`);
    uniqueStrings(family.pageChecks, `${family.id}.pageChecks`);
    if (family.runtimeStatus === "missing") {
      if (family.entryPoints.length || family.pageChecks.length || family.decision !== null || typeof family.reasonCode !== "string" || !family.reasonCode) FAIL("TRAVERSAL_MISSING_FAMILY_INVALID", family.id);
    } else if (family.runtimeStatus === "partial") {
      if (!family.entryPoints.length || !family.pageChecks.length || !["preserve", "modernize", "archive", "reject"].includes(family.decision) || typeof family.reasonCode !== "string" || !family.reasonCode) FAIL("TRAVERSAL_PARTIAL_FAMILY_INVALID", family.id);
    } else if (!family.entryPoints.length || !family.pageChecks.length || !["preserve", "modernize", "archive", "reject"].includes(family.decision) || family.reasonCode !== null) {
      FAIL("TRAVERSAL_OBSERVED_FAMILY_INVALID", family.id);
    }
    families.set(family.id, family);
  }
  if (families.size !== required.length || required.some(id => !families.has(id))) FAIL("TRAVERSAL_FAMILY_SET_INCOMPLETE", `${families.size}/${required.length}`);
  const requirements = manifest.completionRequirements;
  const requirementKeys = ["allFamiliesObserved", "allRequiredPagesChecked", "atomicInventoryReconciled", "targetEvidenceBound", "roleMatrixVerified", "businessSignoffAttached"];
  exactKeys(requirements, requirementKeys, "completionRequirements");
  if (!isObject(requirements) || requirementKeys.some(key => typeof requirements[key] !== "boolean")) FAIL("TRAVERSAL_COMPLETION_REQUIREMENTS_INVALID", "completionRequirements");
  if (requirementKeys.some(key => requirements[key] !== false)) {
    FAIL("TRAVERSAL_FALSE_COMPLETION", "format v1 cannot assert L4 completion requirements");
  }
  const allFamiliesObserved = [...families.values()].every(family => family.runtimeStatus === "observed");
  if (requirements.allFamiliesObserved !== allFamiliesObserved) FAIL("TRAVERSAL_FAMILY_COMPLETION_DRIFT", String(allFamiliesObserved));
  if (manifest.productionImport !== "HOLD") FAIL("TRAVERSAL_PRODUCTION_IMPORT_NOT_HELD", String(manifest.productionImport));
  return {
    ok: true,
    status: manifest.status,
    evidenceLevel: manifest.evidenceLevel,
    families: families.size,
    observedFamilies: [...families.values()].filter(family => family.runtimeStatus === "observed").length,
    partialFamilies: [...families.values()].filter(family => family.runtimeStatus === "partial").length,
    missingFamilies: [...families.values()].filter(family => family.runtimeStatus === "missing").length,
    entryPoints: [...families.values()].reduce((sum, family) => sum + family.entryPoints.length, 0),
    pageChecks: [...families.values()].reduce((sum, family) => sum + family.pageChecks.length, 0),
    incompleteRequirements: requirementKeys.filter(key => !requirements[key]),
    productionImport: manifest.productionImport
  };
}

export const LEGACY_CLIENT_REQUIRED_FAMILIES = Object.freeze([...REQUIRED_FAMILIES]);
