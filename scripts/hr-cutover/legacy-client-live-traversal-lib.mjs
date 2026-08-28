import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export class LegacyClientTraversalError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = "LegacyClientTraversalError"; this.code = code; }
}

const REQUIRED_FAMILIES = ["organization_job", "employee_profile", "employment_change", "contract", "training", "performance", "reward_discipline", "payroll", "attendance", "insurance_welfare", "recruitment", "group_web_self_service", "permission_log_reminder"];
const COVERAGE_KEYS = ["page", "tabs", "dialogs", "thirdLevelMenus", "fields", "actions", "states", "rules"];
const LIST_KEYS = ["pageIds", "tabIds", "dialogIds", "thirdLevelMenuIds", "fieldIds", "actionIds", "stateIds", "ruleIds"];
const COVERAGE_TO_LIST = Object.freeze(Object.fromEntries(COVERAGE_KEYS.map((key, index) => [key, LIST_KEYS[index]])));
const LIST_ID_PREFIX = Object.freeze(Object.fromEntries(LIST_KEYS.map((key, index) => [key, `${COVERAGE_KEYS[index].replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}.`])));
const SURFACE = Object.freeze(Object.fromEntries(REQUIRED_FAMILIES.map(id => [id, id === "group_web_self_service" ? "group_web" : "desktop_client"])));
const EXPECTED_ATOMIC_COUNTS = Object.freeze({ entries: 83, desktopClientEntries: 68, groupWebEntries: 15 });
const EXPECTED_ATOMIC_IDENTITY_SHA256 = "e11ec5041d46a13668f12381a3f72dc12513b8df5963831cd08da3f1dc7a9a4d";
const ATOMIC_GAP_REASONS = new Set(["ATOMIC_RUNTIME_OBSERVATION_PENDING", "ATOMIC_RUNTIME_OBSERVATION_PARTIAL"]);
const FAMILY_GAP_REASONS = Object.freeze({
  organization_job: "ORGANIZATION_JOB_ACTIONS_AND_ROLE_MATRIX_PENDING",
  employee_profile: "PROFILE_SUBPAGES_PENDING",
  employment_change: "EMPLOYMENT_EVENT_PAGES_PENDING",
  contract: "CONTRACT_ACTION_PAGES_PENDING",
  training: "TRAINING_RECORD_AND_REPORT_PAGES_PENDING",
  performance: "PERFORMANCE_RECORD_RESULT_PAGES_PENDING",
  reward_discipline: "REWARD_RECORD_AND_LINKAGE_PENDING",
  payroll: "PAYROLL_INPUT_AND_REPORT_PAGES_PENDING",
  attendance: "ATTENDANCE_DATA_CALCULATION_PAGES_PENDING",
  insurance_welfare: "INSURANCE_POLICY_CALCULATION_PAGES_PENDING",
  recruitment: "RECRUITMENT_APPROVAL_PUBLISH_HIRE_PAGES_PENDING",
  group_web_self_service: "WEB_ROLE_MENUS_AND_FIELD_PROJECTIONS_PENDING",
  permission_log_reminder: "ADMIN_BUILTIN_CHECK_AND_PERMISSION_MATRIX_PENDING"
});
const FAIL = (code, detail) => { throw new LegacyClientTraversalError(code, detail); };
const isObject = value => value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected, label) => {
  if (!isObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) FAIL("TRAVERSAL_SHAPE_INVALID", label);
};
const uniqueStrings = (value, label) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) FAIL("TRAVERSAL_LIST_INVALID", label);
  if (new Set(value).size !== value.length) FAIL("TRAVERSAL_LIST_DUPLICATE", label);
  return value;
};
const canonicalize = value => Array.isArray(value)
  ? `[${value.map(canonicalize).join(",")}]`
  : isObject(value)
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const sha256 = value => createHash("sha256").update(canonicalize(value)).digest("hex");
const containsPrivateIpv4 = value => (value.match(/(?:^|[^0-9])((?:\d{1,3}\.){3}\d{1,3})(?=$|[^0-9])/g) ?? []).some(candidate => {
  const octets = (candidate.match(/\d{1,3}/g) ?? []).map(Number);
  return octets.length === 4 && octets.every(octet => octet <= 255) && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
});
const decodedVariants = input => {
  const values = new Set([input]); let frontier = [input];
  for (let depth = 0; depth < 3; depth += 1) {
    const next = [];
    for (const current of frontier) {
      const candidates = [current.replace(/&#(?:x([0-9a-f]+)|(\d+));?/giu, (_match, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))];
      try { candidates.push(decodeURIComponent(current)); } catch { /* raw value remains scanned */ }
      if (/^[A-Za-z0-9+/_-]+={0,2}$/u.test(current) && current.length >= 16) {
        try { candidates.push(Buffer.from(current, current.includes("-") || current.includes("_") ? "base64url" : "base64").toString("utf8")); } catch { /* invalid encoding */ }
      }
      if (/^[0-9a-f]+$/iu.test(current) && current.length >= 24 && current.length % 2 === 0) candidates.push(Buffer.from(current, "hex").toString("utf8"));
      for (const candidate of candidates) if (typeof candidate === "string" && !values.has(candidate)) { values.add(candidate); next.push(candidate); }
    }
    frontier = next;
  }
  return [...values];
};
const assertNoSensitiveContent = value => {
  const visit = candidate => {
    if (typeof candidate === "string") {
      for (const variant of decodedVariants(candidate)) {
        if (/(?:\/Users\/|Downloads\/|file:\/\/|[A-Za-z]:[\\/]|(?:postgres(?:ql)?|sqlserver):\/\/|(?:pass(?:word)?|passwd|pwd|token|secret)\s*[=:]|Bearer\s+[A-Za-z0-9._-]+|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/iu.test(variant) || containsPrivateIpv4(variant)) FAIL("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", "redacted hash-only evidence required");
        if (/(?:^|[^0-9])1[3-9]\d{9}(?:[^0-9]|$)|(?:^|[^0-9])\d{17}[0-9Xx](?:[^0-9A-Za-z]|$)/u.test(variant)) FAIL("TRAVERSAL_PERSONAL_VALUE_FORBIDDEN", "phone or identity-card shaped values are forbidden");
      }
    } else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (isObject(candidate)) Object.values(candidate).forEach(visit);
  };
  visit(value);
};

const verifyAtomicInventory = (manifest, atomicInventory, families) => {
  if (!isObject(atomicInventory)) FAIL("TRAVERSAL_ATOMIC_INVENTORY_REQUIRED", "load the referenced hash-bound atomic inventory");
  exactKeys(atomicInventory, ["formatVersion", "inventoryKind", "status", "evidenceLevel", "surfaceIsolation", "entries"], "atomicInventory");
  if (atomicInventory.formatVersion !== 1 || atomicInventory.inventoryKind !== "yuzhou_hr_legacy_client_atomic_entry_inventory") FAIL("TRAVERSAL_ATOMIC_IDENTITY_INVALID", "formatVersion or inventoryKind");
  if (atomicInventory.status !== "scaffold_with_partial_observation" || atomicInventory.evidenceLevel !== "L3_RUNTIME_PARTIAL") FAIL("TRAVERSAL_ATOMIC_EVIDENCE_OVERRATED", "inventory is not L4 evidence");
  exactKeys(atomicInventory.surfaceIsolation, ["desktopClientEvidenceCannotComeFrom", "groupWebEvidenceCannotComeFrom"], "atomicInventory.surfaceIsolation");
  if (JSON.stringify(atomicInventory.surfaceIsolation) !== JSON.stringify({ desktopClientEvidenceCannotComeFrom: ["group_web"], groupWebEvidenceCannotComeFrom: ["desktop_client"] })) FAIL("TRAVERSAL_SURFACE_ISOLATION_INVALID", "client and Group Web evidence are independent");
  assertNoSensitiveContent(atomicInventory);
  const contract = manifest.atomicInventoryContract;
  exactKeys(contract, ["path", "canonicalSha256", "entries", "desktopClientEntries", "groupWebEntries"], "atomicInventoryContract");
  if (contract.path !== "scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json" || !/^[a-f0-9]{64}$/.test(contract.canonicalSha256 ?? "")) FAIL("TRAVERSAL_ATOMIC_CONTRACT_INVALID", "path or hash");
  if (sha256(atomicInventory) !== contract.canonicalSha256) FAIL("TRAVERSAL_ATOMIC_HASH_MISMATCH", contract.path);
  if (!Array.isArray(atomicInventory.entries)) FAIL("TRAVERSAL_ATOMIC_ENTRIES_INVALID", "entries");
  const expected = new Map();
  for (const family of families.values()) for (const entryPoint of family.entryPoints) expected.set(`${family.id}\u0000${entryPoint}`, SURFACE[family.id]);
  const seenKeys = new Set(); const seenIds = new Set();
  const atomicIdentities = [];
  const evidenceSurface = new Map(); const familyObservation = new Map();
  let observed = 0; let partial = 0; let pending = 0; let desktopClientEntries = 0; let groupWebEntries = 0;
  for (const entry of atomicInventory.entries) {
    const label = `atomicInventory.entries.${String(entry?.atomicId)}`;
    exactKeys(entry, ["atomicId", "familyId", "entryPoint", "surface", "observationStatus", "coverage", ...LIST_KEYS, "evidence", "gapReasonCode"], label);
    if (!/^(?:client|web)\.[a-z_]+\.\d{3}$/.test(entry.atomicId ?? "") || seenIds.has(entry.atomicId)) FAIL("TRAVERSAL_ATOMIC_ID_DUPLICATE_OR_INVALID", String(entry.atomicId));
    seenIds.add(entry.atomicId);
    const key = `${entry.familyId}\u0000${entry.entryPoint}`;
    if (!expected.has(key) || seenKeys.has(key)) FAIL("TRAVERSAL_ATOMIC_ENTRY_DUPLICATE_OR_UNKNOWN", `${entry.familyId}:${entry.entryPoint}`);
    seenKeys.add(key);
    atomicIdentities.push({ atomicId: entry.atomicId, familyId: entry.familyId, entryPoint: entry.entryPoint, surface: entry.surface });
    const expectedSurface = expected.get(key);
    if (entry.surface !== expectedSurface || !entry.atomicId.startsWith(expectedSurface === "desktop_client" ? "client." : "web.")) FAIL("TRAVERSAL_CROSS_SURFACE_SUBSTITUTION", entry.atomicId);
    if (!isObject(entry.coverage) || JSON.stringify(Object.keys(entry.coverage).sort()) !== JSON.stringify([...COVERAGE_KEYS].sort()) || COVERAGE_KEYS.some(keyName => typeof entry.coverage[keyName] !== "boolean")) FAIL("TRAVERSAL_ATOMIC_COVERAGE_INVALID", entry.atomicId);
    for (const listKey of LIST_KEYS) {
      uniqueStrings(entry[listKey], `${entry.atomicId}.${listKey}`);
      if (entry[listKey].some(id => !id.startsWith(LIST_ID_PREFIX[listKey]) || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(id))) FAIL("TRAVERSAL_ATOMIC_IDENTIFIER_INVALID", `${entry.atomicId}.${listKey}`);
    }
    for (const coverageKey of COVERAGE_KEYS) {
      const hasDetails = entry[COVERAGE_TO_LIST[coverageKey]].length > 0;
      if (entry.coverage[coverageKey] !== hasDetails) FAIL("TRAVERSAL_ATOMIC_COVERAGE_DETAIL_DRIFT", `${entry.atomicId}.${coverageKey}`);
    }
    exactKeys(entry.evidence, ["mode", "sha256"], `${entry.atomicId}.evidence`);
    if (entry.evidence.mode !== "hash_only" || !Array.isArray(entry.evidence.sha256) || entry.evidence.sha256.some(hash => !/^[a-f0-9]{64}$/.test(hash)) || new Set(entry.evidence.sha256).size !== entry.evidence.sha256.length) FAIL("TRAVERSAL_ATOMIC_EVIDENCE_INVALID", entry.atomicId);
    for (const hash of entry.evidence.sha256) {
      if (evidenceSurface.has(hash) && evidenceSurface.get(hash) !== entry.surface) FAIL("TRAVERSAL_CROSS_SURFACE_EVIDENCE_REUSE", hash);
      evidenceSurface.set(hash, entry.surface);
    }
    if (!["pending", "partial", "observed"].includes(entry.observationStatus)) FAIL("TRAVERSAL_ATOMIC_STATUS_INVALID", entry.atomicId);
    const coverageValues = COVERAGE_KEYS.map(keyName => entry.coverage[keyName]);
    const detailCount = LIST_KEYS.reduce((count, keyName) => count + entry[keyName].length, 0);
    if (entry.observationStatus === "pending") {
      if (coverageValues.some(Boolean) || detailCount || entry.evidence.sha256.length || entry.gapReasonCode !== "ATOMIC_RUNTIME_OBSERVATION_PENDING") FAIL("TRAVERSAL_ATOMIC_PENDING_INVALID", entry.atomicId);
      pending += 1;
    } else if (entry.observationStatus === "partial") {
      if (!coverageValues.some(Boolean) || !entry.evidence.sha256.length || !ATOMIC_GAP_REASONS.has(entry.gapReasonCode) || entry.gapReasonCode !== "ATOMIC_RUNTIME_OBSERVATION_PARTIAL") FAIL("TRAVERSAL_ATOMIC_PARTIAL_INVALID", entry.atomicId);
      partial += 1;
    } else {
      if (coverageValues.some(value => value !== true) || !entry.evidence.sha256.length || entry.gapReasonCode !== null) FAIL("TRAVERSAL_ATOMIC_OBSERVED_INVALID", entry.atomicId);
      observed += 1;
    }
    const familyStats = familyObservation.get(entry.familyId) ?? { total: 0, observed: 0 };
    familyStats.total += 1;
    if (entry.observationStatus === "observed") familyStats.observed += 1;
    familyObservation.set(entry.familyId, familyStats);
    if (entry.surface === "desktop_client") desktopClientEntries += 1; else groupWebEntries += 1;
  }
  if (seenKeys.size !== expected.size || [...expected.keys()].some(key => !seenKeys.has(key))) FAIL("TRAVERSAL_ATOMIC_INVENTORY_INCOMPLETE", `${seenKeys.size}/${expected.size}`);
  const identitySha256 = sha256(atomicIdentities.sort((left, right) => left.atomicId.localeCompare(right.atomicId)));
  if (identitySha256 !== EXPECTED_ATOMIC_IDENTITY_SHA256) FAIL("TRAVERSAL_ATOMIC_IDENTITY_DRIFT", identitySha256);
  if (expected.size !== EXPECTED_ATOMIC_COUNTS.entries || desktopClientEntries !== EXPECTED_ATOMIC_COUNTS.desktopClientEntries || groupWebEntries !== EXPECTED_ATOMIC_COUNTS.groupWebEntries || contract.entries !== EXPECTED_ATOMIC_COUNTS.entries || contract.desktopClientEntries !== EXPECTED_ATOMIC_COUNTS.desktopClientEntries || contract.groupWebEntries !== EXPECTED_ATOMIC_COUNTS.groupWebEntries) FAIL("TRAVERSAL_ATOMIC_COUNT_DRIFT", `${expected.size}/${desktopClientEntries}/${groupWebEntries}`);
  return { total: expected.size, observed, partial, pending, desktopClientEntries, groupWebEntries, familyObservation };
};

export function verifyLegacyClientLiveTraversal(manifest, atomicInventory) {
  if (!isObject(manifest) || manifest.formatVersion !== 1 || manifest.traversalKind !== "yuzhou_hr_legacy_client_live_traversal") FAIL("TRAVERSAL_IDENTITY_INVALID", "formatVersion or traversalKind");
  exactKeys(manifest, ["formatVersion", "traversalKind", "traversalVersion", "status", "evidenceLevel", "compatibilityScoreContribution", "decisionMaturity", "operationMode", "inventoryContract", "atomicInventoryContract", "security", "requiredMenuFamilies", "menuFamilies", "completionRequirements", "productionImport"], "manifest");
  assertNoSensitiveContent(manifest);
  if (manifest.operationMode !== "read_only") FAIL("TRAVERSAL_MODE_INVALID", String(manifest.operationMode));
  if (manifest.status !== "in_progress" || manifest.evidenceLevel !== "L3_RUNTIME_PARTIAL" || manifest.compatibilityScoreContribution !== 0 || manifest.decisionMaturity !== "provisional") FAIL("TRAVERSAL_PARTIAL_EVIDENCE_OVERRATED", "format v1 contributes zero to L4 compatibility");
  exactKeys(manifest.security, ["credentialsRecorded", "personalValuesRecorded", "screenshotsCommitted", "writeActionsExecuted", "forbiddenActions"], "security");
  if (!isObject(manifest.security) || manifest.security.credentialsRecorded !== false || manifest.security.personalValuesRecorded !== false || manifest.security.screenshotsCommitted !== false || manifest.security.writeActionsExecuted !== false) FAIL("TRAVERSAL_SECURITY_CONTRACT_INVALID", "security flags must remain false");
  const forbiddenActions = uniqueStrings(manifest.security.forbiddenActions, "security.forbiddenActions");
  for (const action of ["save", "approve", "reverse_approve", "close_period", "payroll_payment", "export_personal_data"]) if (!forbiddenActions.includes(action)) FAIL("TRAVERSAL_FORBIDDEN_ACTION_MISSING", action);
  const inventory = manifest.inventoryContract;
  exactKeys(inventory, ["inventoryHash", "tables", "fields", "rules", "helpTopics"], "inventoryContract");
  if (!isObject(inventory) || !/^[a-f0-9]{64}$/.test(inventory.inventoryHash ?? "") || inventory.tables !== 162 || inventory.fields !== 2364 || inventory.rules !== 212 || inventory.helpTopics !== 46) FAIL("TRAVERSAL_INVENTORY_CONTRACT_INVALID", "expected 162/2364/212/46 boundary");
  const required = uniqueStrings(manifest.requiredMenuFamilies, "requiredMenuFamilies");
  if (JSON.stringify([...required].sort()) !== JSON.stringify([...REQUIRED_FAMILIES].sort())) FAIL("TRAVERSAL_REQUIRED_FAMILY_SET_INVALID", required.join(","));
  if (!Array.isArray(manifest.menuFamilies)) FAIL("TRAVERSAL_FAMILIES_INVALID", "menuFamilies");
  const families = new Map();
  for (const family of manifest.menuFamilies) {
    exactKeys(family, ["id", "runtimeStatus", "entryPoints", "pageChecks", "decision", "reasonCode"], `menuFamilies.${String(family?.id)}`);
    if (!isObject(family) || !required.includes(family.id) || families.has(family.id)) FAIL("TRAVERSAL_FAMILY_INVALID", String(family?.id));
    if (!["missing", "partial", "observed"].includes(family.runtimeStatus)) FAIL("TRAVERSAL_RUNTIME_STATUS_INVALID", family.id);
    uniqueStrings(family.entryPoints, `${family.id}.entryPoints`); uniqueStrings(family.pageChecks, `${family.id}.pageChecks`);
    if (family.runtimeStatus === "missing") {
      if (family.entryPoints.length || family.pageChecks.length || family.decision !== null || typeof family.reasonCode !== "string" || !family.reasonCode) FAIL("TRAVERSAL_MISSING_FAMILY_INVALID", family.id);
    } else if (family.runtimeStatus === "partial") {
      if (!family.entryPoints.length || !family.pageChecks.length || !["preserve", "modernize", "archive", "reject"].includes(family.decision) || family.reasonCode !== FAMILY_GAP_REASONS[family.id]) FAIL("TRAVERSAL_PARTIAL_FAMILY_INVALID", family.id);
    } else if (!family.entryPoints.length || !family.pageChecks.length || !["preserve", "modernize", "archive", "reject"].includes(family.decision) || family.reasonCode !== null) FAIL("TRAVERSAL_OBSERVED_FAMILY_INVALID", family.id);
    families.set(family.id, family);
  }
  if (families.size !== required.length || required.some(id => !families.has(id))) FAIL("TRAVERSAL_FAMILY_SET_INCOMPLETE", `${families.size}/${required.length}`);
  const atomic = verifyAtomicInventory(manifest, atomicInventory, families);
  for (const family of families.values()) {
    const familyStats = atomic.familyObservation.get(family.id);
    if (family.runtimeStatus === "observed" && familyStats?.observed !== familyStats?.total) FAIL("TRAVERSAL_FAMILY_ATOMIC_STATUS_DRIFT", family.id);
  }
  const requirements = manifest.completionRequirements;
  const requirementKeys = ["allFamiliesObserved", "allRequiredPagesChecked", "atomicInventoryReconciled", "targetEvidenceBound", "roleMatrixVerified", "businessSignoffAttached"];
  exactKeys(requirements, requirementKeys, "completionRequirements");
  if (!isObject(requirements) || requirementKeys.some(key => typeof requirements[key] !== "boolean")) FAIL("TRAVERSAL_COMPLETION_REQUIREMENTS_INVALID", "completionRequirements");
  if (requirementKeys.some(key => requirements[key] !== false)) FAIL("TRAVERSAL_FALSE_COMPLETION", "format v1 cannot assert L4 completion requirements");
  const allFamiliesObserved = [...families.values()].every(family => family.runtimeStatus === "observed");
  if (requirements.allFamiliesObserved !== allFamiliesObserved) FAIL("TRAVERSAL_FAMILY_COMPLETION_DRIFT", String(allFamiliesObserved));
  if (manifest.productionImport !== "HOLD") FAIL("TRAVERSAL_PRODUCTION_IMPORT_NOT_HELD", String(manifest.productionImport));
  return {
    ok: true, status: manifest.status, evidenceLevel: manifest.evidenceLevel, families: families.size,
    observedFamilies: [...families.values()].filter(family => family.runtimeStatus === "observed").length,
    partialFamilies: [...families.values()].filter(family => family.runtimeStatus === "partial").length,
    missingFamilies: [...families.values()].filter(family => family.runtimeStatus === "missing").length,
    entryPoints: [...families.values()].reduce((sum, family) => sum + family.entryPoints.length, 0),
    pageChecks: [...families.values()].reduce((sum, family) => sum + family.pageChecks.length, 0),
    atomicEntries: atomic.total, atomicObserved: atomic.observed, atomicPartial: atomic.partial, atomicPending: atomic.pending,
    desktopClientEntries: atomic.desktopClientEntries, groupWebEntries: atomic.groupWebEntries,
    incompleteRequirements: requirementKeys.filter(key => !requirements[key]), productionImport: manifest.productionImport
  };
}

export const LEGACY_CLIENT_REQUIRED_FAMILIES = Object.freeze([...REQUIRED_FAMILIES]);
