#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_CONTRACT = resolve(ROOT, "scripts/hr-cutover/contracts/legacy-compatibility-coverage-v1.json");
const DEFAULT_LEDGER = resolve(ROOT, "scripts/hr-cutover/contracts/legacy-compatibility-ledger-v1.json");
const ITEM_ID = /^(?:PAGE|FIELD|RULE|RBAC|MIGRATION|MODERN)-[A-Z0-9]+-[0-9]{3}$/;
const HASH_EVIDENCE_REF = /^controlled-evidence:sha256:[a-f0-9]{64}$/;
const ATTESTATION_REF = /^detached-attestation:sha256:[a-f0-9]{64}$/;

export class LegacyCoverageError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyCoverageError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new LegacyCoverageError(code, detail);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("LEDGER_SCHEMA_INVALID", `${label} must be an object`);
}

function exactKeys(value, required, label, optional = []) {
  requireObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("LEDGER_SCHEMA_INVALID", `${label}.${key} is not allowed`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail("LEDGER_SCHEMA_INVALID", `${label}.${key} is required`);
}

function evidenceRank(level, contract) {
  const index = contract.evidenceLevels.indexOf(level);
  if (index < 0) fail("EVIDENCE_LEVEL_INVALID", String(level));
  return index;
}

function hasTarget(target) {
  return ["routes", "apis", "entities", "permissions"].some((field) => target[field].length > 0);
}

function validateStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) fail("LEDGER_SCHEMA_INVALID", `${label} must be a string array`);
  if (new Set(value).size !== value.length) fail("LEDGER_SCHEMA_INVALID", `${label} must not contain duplicates`);
}

function resolveRepositoryFile(reference, label) {
  if (isAbsolute(reference) || reference.split(/[\\/]/).includes("..")) fail("REFERENCE_PATH_INVALID", `${label}:${reference}`);
  const path = resolve(ROOT, reference);
  if (!path.startsWith(`${ROOT}${sep}`)) fail("REFERENCE_PATH_INVALID", `${label}:${reference}`);
  try {
    if (!statSync(path).isFile()) fail("REFERENCE_NOT_FILE", `${label}:${reference}`);
    const real = realpathSync(path);
    if (!real.startsWith(`${realpathSync(ROOT)}${sep}`)) fail("REFERENCE_PATH_INVALID", `${label}:${reference}`);
  } catch (error) {
    if (error instanceof LegacyCoverageError) throw error;
    fail("REFERENCE_NOT_FOUND", `${label}:${reference}`);
  }
  return path;
}

function validateEvidenceRefs(refs, level, contract, label, evidenceIndex) {
  validateStringArray(refs, label);
  const rank = evidenceRank(level, contract);
  if (rank > 0 && refs.length === 0) fail("EVIDENCE_MISSING", `${label} declares ${level} without evidence refs`);
  if (rank >= evidenceRank("L4", contract) && refs.some((ref) => !HASH_EVIDENCE_REF.test(ref) && !ATTESTATION_REF.test(ref))) {
    fail("EVIDENCE_REFERENCE_INVALID", `${label} L4/L5 refs must be hash-addressed`);
  }
  if (rank >= evidenceRank("L5", contract) && !refs.some((ref) => ATTESTATION_REF.test(ref))) {
    fail("ATTESTATION_REFERENCE_MISSING", `${label} L5 evidence needs a detached attestation`);
  }
  if (rank >= evidenceRank("L4", contract)) {
    if (!(evidenceIndex instanceof Set)) fail("EVIDENCE_INDEX_MISSING", `${label} requires a controlled evidence index`);
    const unresolved = refs.filter((ref) => !evidenceIndex.has(ref));
    if (unresolved.length > 0) fail("EVIDENCE_REFERENCE_UNRESOLVED", `${label}:${unresolved.join(",")}`);
  }
}

function scanForbiddenSourceMaterial(ledger, contract) {
  const serialized = JSON.stringify(ledger);
  for (const pattern of contract.forbiddenSourcePatterns) {
    if (serialized.includes(pattern)) fail("SOURCE_MATERIAL_FORBIDDEN", `ledger contains forbidden source material pattern ${pattern}`);
  }
  const visit = (value) => {
    if (typeof value === "string") {
      if (/^[A-Za-z]:[\\/]/.test(value) || /^\/(?:tmp|var|home|root|opt|private)\//.test(value) || value.includes("\0") || /[\r\n]/.test(value)) fail("SOURCE_MATERIAL_FORBIDDEN", "ledger contains an absolute filesystem path or control character");
      if (/(?:jdbc:|file:\/\/|(?:postgres(?:ql)?|sqlserver):\/\/|password\s*=|BEGIN [A-Z ]*PRIVATE KEY)/i.test(value)) fail("SOURCE_MATERIAL_FORBIDDEN", "ledger contains connection or secret material");
      if (/(?:^|\W)(?:1[3-9]\d{9}|\d{17}[\dXx]|\d{16,19})(?:$|\W)/.test(value) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) fail("SOURCE_MATERIAL_FORBIDDEN", "ledger contains a likely phone, identity, bank-card, or email value");
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(ledger);
}

function validateContract(contract) {
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_compatibility_coverage" || contract.scoreScale !== 100) fail("COVERAGE_CONTRACT_INVALID", "contract identity/version/scale mismatch");
  const weight = Object.values(contract.dimensions).reduce((sum, dimension) => sum + dimension.weight, 0);
  if (weight !== contract.scoreScale) fail("COVERAGE_CONTRACT_INVALID", `dimension weights total ${weight}`);
  if (!Array.isArray(contract.requiredMenuFamilies) || new Set(contract.requiredMenuFamilies).size !== contract.sourceBaselines.menuFamilies) fail("COVERAGE_CONTRACT_INVALID", "required menu family cardinality mismatch");
  if (!contract.inventoryGate || contract.inventoryGate.reasonCode !== "ATOMIC_INVENTORY_INCOMPLETE") fail("COVERAGE_CONTRACT_INVALID", "inventory gate missing");
  for (const dimension of Object.keys(contract.dimensions)) {
    const minimum = contract.inventoryGate.minimumItemsByDimension?.[dimension];
    if (!Number.isInteger(minimum) || minimum < 1) fail("COVERAGE_CONTRACT_INVALID", `invalid inventory minimum for ${dimension}`);
  }
  if (contract.statusCredit.verified !== 1 || contract.statusCredit.unassessed !== 0) fail("COVERAGE_CONTRACT_INVALID", "verified/unassessed credit endpoints must be 1/0");
  for (const credit of Object.values(contract.statusCredit)) if (typeof credit !== "number" || credit < 0 || credit > 1) fail("COVERAGE_CONTRACT_INVALID", `invalid status credit ${credit}`);
}

function validateGate(gate, label, contract, expectedMissingReason, evidenceIndex) {
  exactKeys(gate, ["status", "evidenceLevel", "evidenceRefs", "reasonCode"], label);
  if (!["missing", "completed"].includes(gate.status)) fail("LEDGER_SCHEMA_INVALID", `${label}.status invalid`);
  evidenceRank(gate.evidenceLevel, contract);
  validateEvidenceRefs(gate.evidenceRefs, gate.evidenceLevel, contract, `${label}.evidenceRefs`, evidenceIndex);
  if (gate.status === "missing" && gate.reasonCode !== expectedMissingReason) fail("REASON_CODE_INVALID", `${label}.${gate.reasonCode}`);
  if (gate.status === "missing" && gate.evidenceRefs.length > 0) fail("GATE_EVIDENCE_INVALID", `${label} missing gate cannot carry completion evidence`);
  if (gate.status === "completed" && gate.reasonCode !== null) fail("REASON_CODE_INVALID", `${label} completed gate must clear reasonCode`);
  if (gate.status === "completed" && gate.evidenceRefs.length === 0) fail("GATE_EVIDENCE_INVALID", `${label} completed gate needs hash-addressed evidence`);
}

function validateItem(item, index, contract, ids, menuFamilies, dimensionStats, evidenceIndex) {
  const label = `items[${index}]`;
  exactKeys(item, ["id", "dimension", "menuFamily", "legacyObject", "currentTarget", "status", "testRefs", "reasonCode"], label);
  if (!ITEM_ID.test(item.id ?? "")) fail("ITEM_ID_INVALID", String(item.id));
  if (ids.has(item.id)) fail("ITEM_ID_DUPLICATE", item.id);
  ids.add(item.id);
  if (!Object.hasOwn(contract.dimensions, item.dimension)) fail("DIMENSION_INVALID", `${item.id}:${item.dimension}`);
  if (item.menuFamily !== null && !contract.requiredMenuFamilies.includes(item.menuFamily)) fail("MENU_FAMILY_INVALID", `${item.id}:${item.menuFamily}`);
  if (item.menuFamily !== null) menuFamilies.add(item.menuFamily);

  exactKeys(item.legacyObject, ["kind", "name", "evidenceLevel", "evidenceRefs"], `${label}.legacyObject`, ["locator"]);
  if (typeof item.legacyObject.kind !== "string" || item.legacyObject.kind.length === 0 || typeof item.legacyObject.name !== "string" || item.legacyObject.name.length === 0) fail("LEDGER_SCHEMA_INVALID", `${item.id}.legacyObject identity invalid`);
  const actualEvidenceRank = evidenceRank(item.legacyObject.evidenceLevel, contract);
  validateEvidenceRefs(item.legacyObject.evidenceRefs, item.legacyObject.evidenceLevel, contract, `${item.id}.legacyObject.evidenceRefs`, evidenceIndex);
  if (item.legacyObject.locator !== undefined) {
    exactKeys(item.legacyObject.locator, contract.atomicLocatorFields, `${label}.legacyObject.locator`);
    for (const field of contract.atomicLocatorFields) {
      const value = item.legacyObject.locator[field];
      if (value !== null && (typeof value !== "string" || value.length === 0)) fail("ATOMIC_LOCATOR_INVALID", `${item.id}.${field}`);
    }
    if (Object.values(item.legacyObject.locator).every((value) => value === null)) fail("ATOMIC_LOCATOR_INVALID", `${item.id} locator cannot be entirely null`);
  }

  exactKeys(item.currentTarget, ["routes", "apis", "entities", "permissions"], `${label}.currentTarget`);
  for (const field of ["routes", "apis", "entities", "permissions"]) validateStringArray(item.currentTarget[field], `${item.id}.currentTarget.${field}`);
  validateStringArray(item.testRefs, `${item.id}.testRefs`);
  for (const route of item.currentTarget.routes) {
    if (!route.startsWith("/hr") || route.includes("?") || route.includes("#")) fail("CURRENT_ROUTE_INVALID", `${item.id}:${route}`);
    const relative = route === "/hr" ? "apps/web/app/hr/page.tsx" : `apps/web/app${route}/page.tsx`;
    resolveRepositoryFile(relative, `${item.id}.currentTarget.routes`);
  }
  for (const testRef of item.testRefs) resolveRepositoryFile(testRef, `${item.id}.testRefs`);

  if (!Object.hasOwn(contract.statusCredit, item.status)) fail("STATUS_INVALID", `${item.id}:${item.status}`);
  if (item.reasonCode !== null && !contract.allowedDispositionReasons.includes(item.reasonCode)) fail("REASON_CODE_INVALID", `${item.id}:${item.reasonCode}`);
  if (["mapped", "implemented", "tested", "verified"].includes(item.status) && !hasTarget(item.currentTarget)) fail("CURRENT_TARGET_MISSING", `${item.id} cannot be ${item.status} without an API, route, entity, or permission target`);
  if (["tested", "verified"].includes(item.status) && item.testRefs.length === 0) fail("TEST_EVIDENCE_MISSING", `${item.id}:${item.status}`);
  if (["approved_archived", "approved_rejected"].includes(item.status) && !["DEFERRED_COLD_ARCHIVE", "LEGACY_DEFECT_NOT_REPLICATED"].includes(item.reasonCode)) fail("DISPOSITION_REASON_INVALID", `${item.id} needs an approved archival/rejection reason`);
  if (["tested", "verified", "approved_archived", "approved_rejected"].includes(item.status) && item.legacyObject.locator === undefined) fail("ATOMIC_LOCATOR_MISSING", `${item.id}:${item.status}`);
  if (["approved_archived", "approved_rejected"].includes(item.status) && !item.legacyObject.evidenceRefs.some((ref) => ATTESTATION_REF.test(ref))) fail("ATTESTATION_REFERENCE_MISSING", `${item.id}:${item.status}`);
  if (item.status === "verified" && item.reasonCode !== null) fail("REASON_CODE_INVALID", `${item.id}:verified must clear reasonCode`);

  const minimumLevel = contract.minimumEvidenceByStatus[item.status];
  if (minimumLevel && actualEvidenceRank < evidenceRank(minimumLevel, contract)) fail("EVIDENCE_LEVEL_TOO_LOW", `${item.id}:${item.status} requires ${minimumLevel}`);
  if (item.dimension === "page_entry" && item.status === "verified" && actualEvidenceRank < evidenceRank(contract.pageRuntimeGate.requiredEvidenceLevel, contract)) {
    fail("PAGE_RUNTIME_EVIDENCE_MISSING", `${item.id} cannot be verified without ${contract.pageRuntimeGate.requiredEvidenceLevel}`);
  }

  const stats = dimensionStats[item.dimension];
  stats.items += 1;
  stats.credit += contract.statusCredit[item.status];
}

export function validateCoverageLedger(ledger, contract, options = {}) {
  requireObject(contract, "contract");
  validateContract(contract);
  exactKeys(ledger, ["formatVersion", "ledgerKind", "contractVersion", "baselineReference", "legacyRuntimeTraversal", "businessSignoff", "items"], "$ledger");
  if (ledger.formatVersion !== 1 || ledger.contractVersion !== contract.formatVersion || ledger.ledgerKind !== "yuzhou_hr_legacy_compatibility_ledger") fail("LEDGER_SCHEMA_INVALID", "ledger identity/version mismatch");
  if (typeof ledger.baselineReference !== "string" || isAbsolute(ledger.baselineReference) || ledger.baselineReference.split(/[\\/]/).includes("..") || !ledger.baselineReference.endsWith("legacy-page-field-rule-coverage-baseline.md")) fail("BASELINE_REFERENCE_INVALID", String(ledger.baselineReference));
  const baselinePath = resolve(ROOT, ledger.baselineReference);
  if (!baselinePath.startsWith(`${ROOT}${sep}`)) fail("BASELINE_REFERENCE_INVALID", ledger.baselineReference);
  validateGate(ledger.legacyRuntimeTraversal, "legacyRuntimeTraversal", contract, contract.pageRuntimeGate.reasonCode, options.evidenceIndex);
  validateGate(ledger.businessSignoff, "businessSignoff", contract, contract.completionGate.reasonCode, options.evidenceIndex);
  scanForbiddenSourceMaterial(ledger, contract);
  if (!Array.isArray(ledger.items) || ledger.items.length === 0) fail("LEDGER_EMPTY", "items must not be empty");

  const dimensions = Object.fromEntries(Object.keys(contract.dimensions).map((key) => [key, { items: 0, credit: 0, rawScore: 0, score: 0 }]));
  const ids = new Set();
  const menuFamilies = new Set();
  const pageMenuFamilies = new Set();
  ledger.items.forEach((item, index) => validateItem(item, index, contract, ids, menuFamilies, dimensions, options.evidenceIndex));
  for (const item of ledger.items) if (item.dimension === "page_entry" && item.menuFamily !== null) pageMenuFamilies.add(item.menuFamily);
  for (const [key, stats] of Object.entries(dimensions)) {
    if (stats.items === 0) fail("DIMENSION_EMPTY", key);
    const weight = contract.dimensions[key].weight;
    stats.rawScore = (stats.credit / stats.items) * weight;
    stats.score = stats.rawScore;
  }
  const missingFamilies = contract.requiredMenuFamilies.filter((family) => !pageMenuFamilies.has(family));
  if (missingFamilies.length > 0) fail("MENU_FAMILY_MISSING", missingFamilies.join(","));

  const reasonCodes = [];
  const inventoryMissing = Object.entries(contract.inventoryGate.minimumItemsByDimension)
    .filter(([dimension, minimum]) => dimensions[dimension].items < minimum)
    .map(([dimension, minimum]) => `${dimension}:${dimensions[dimension].items}/${minimum}`);
  if (inventoryMissing.length > 0) reasonCodes.push(contract.inventoryGate.reasonCode);
  if (ledger.legacyRuntimeTraversal.status !== "completed" || evidenceRank(ledger.legacyRuntimeTraversal.evidenceLevel, contract) < evidenceRank(contract.pageRuntimeGate.requiredEvidenceLevel, contract)) {
    const page = dimensions.page_entry;
    page.score = Math.min(page.score, contract.dimensions.page_entry.weight * contract.pageRuntimeGate.missingRuntimeMaximumRatio);
    reasonCodes.push(contract.pageRuntimeGate.reasonCode);
  }
  if (ledger.businessSignoff.status !== "completed" || evidenceRank(ledger.businessSignoff.evidenceLevel, contract) < evidenceRank(contract.completionGate.requiredEvidenceLevel, contract)) reasonCodes.push(contract.completionGate.reasonCode);

  for (const stats of Object.values(dimensions)) {
    stats.rawScore = Number(stats.rawScore.toFixed(4));
    stats.score = Number(stats.score.toFixed(4));
    stats.coverageRatio = Number((stats.credit / stats.items).toFixed(4));
    delete stats.credit;
  }
  const totalScore = Number(Object.values(dimensions).reduce((sum, stats) => sum + stats.score, 0).toFixed(4));
  const completionStatus = totalScore === contract.completionGate.requiredScore && reasonCodes.length === 0 ? "COMPLETE" : "IN_PROGRESS";
  return {
    ok: true,
    completionStatus,
    totalScore,
    maximumScore: contract.scoreScale,
    dimensions,
    reasonCodes: [...new Set(reasonCodes)],
    sourceBaselines: contract.sourceBaselines,
    itemCount: ledger.items.length,
    menuFamilyCount: pageMenuFamilies.size,
    inventoryMissing
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(argv) {
  const options = { contractPath: DEFAULT_CONTRACT, ledgerPath: DEFAULT_LEDGER, evidenceIndexPath: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--contract" && argv[index + 1]) options.contractPath = resolve(argv[++index]);
    else if (arg === "--ledger" && argv[index + 1]) options.ledgerPath = resolve(argv[++index]);
    else if (arg === "--evidence-index" && argv[index + 1]) options.evidenceIndexPath = resolve(argv[++index]);
    else fail("ARGUMENT_INVALID", arg);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    let evidenceIndex;
    if (options.evidenceIndexPath) {
      const index = readJson(options.evidenceIndexPath);
      exactKeys(index, ["formatVersion", "evidenceRefs"], "evidenceIndex");
      if (index.formatVersion !== 1) fail("EVIDENCE_INDEX_INVALID", "unsupported formatVersion");
      validateStringArray(index.evidenceRefs, "evidenceIndex.evidenceRefs");
      if (index.evidenceRefs.some((ref) => !HASH_EVIDENCE_REF.test(ref) && !ATTESTATION_REF.test(ref))) fail("EVIDENCE_INDEX_INVALID", "evidence refs must be hash-addressed");
      evidenceIndex = new Set(index.evidenceRefs);
    }
    const report = validateCoverageLedger(readJson(options.ledgerPath), readJson(options.contractPath), { evidenceIndex });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`Yuzhou legacy compatibility coverage ${report.totalScore}/${report.maximumScore} (${report.completionStatus}); items=${report.itemCount}; gates=${report.reasonCodes.join(",") || "none"}`);
  } catch (error) {
    const code = error instanceof LegacyCoverageError ? error.code : "LEGACY_COVERAGE_UNEXPECTED";
    console.error(`${code}: ${error.message}`);
    process.exitCode = 1;
  }
}
