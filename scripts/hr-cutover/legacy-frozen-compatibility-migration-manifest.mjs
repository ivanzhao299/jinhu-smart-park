#!/usr/bin/env node
/* global process, structuredClone */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLegacyCompatibilityProgress } from "./legacy-compatibility-progress-v2.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_CONTRACT = "scripts/hr-cutover/contracts/legacy-frozen-compatibility-migration-manifest-v1.json";
const SHA256 = /^[0-9a-f]{64}$/u;
const REQUIRED_MILESTONES = ["M0", "M1", "M2", "M3", "M4"];
const EVIDENCE = [
  ["PROGRESS_ENGINE", "scripts/hr-cutover/legacy-compatibility-progress-v2.mjs"],
  ["FIELD_TABLE_MAP", "scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json"],
  ["FIELD_CORE_MAPPING", "scripts/hr-cutover/contracts/legacy-core-domain-reviewed-mapping-v1.json"],
  ["FIELD_ORGANIZATION_POSITION", "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json"],
  ["FIELD_PAYROLL", "scripts/hr-cutover/contracts/legacy-payroll-rule-family-parity-v1.json"],
  ["FIELD_EMPLOYEE_PROFILE", "scripts/hr-cutover/contracts/legacy-employee-profile-materialization-reviewed-v1.json"],
  ["FIELD_KNOWHOW", "scripts/hr-cutover/contracts/legacy-knowhow-field-map-v1.json"],
  ["FIELD_REWARD_DISCIPLINE", "scripts/hr-cutover/contracts/legacy-reward-discipline-field-map-v1.json"],
  ["FIELD_TRAINING_HISTORY", "scripts/hr-cutover/contracts/legacy-training-history-field-map-v1.json"],
  ["FIELD_INSURANCE_POLICY", "scripts/hr-cutover/contracts/legacy-insurance-policy-field-map-v1.json"],
  ["FIELD_PERFORMANCE_ASSESSMENT", "scripts/hr-cutover/contracts/legacy-performance-assessmentcode-field-map-v1.json"],
  ["ROUTINE_LEDGER", "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"],
  ["ROUTINE_BS_READFROMLEAVE", "scripts/hr-cutover/contracts/legacy-bs-readfromleave-parity-v1.json"],
  ["ROUTINE_U_ERRANDRECORDS", "scripts/hr-cutover/contracts/legacy-u-errandrecords-parity-v1.json"],
  ["ROUTINE_U_INPUTBASEPAY", "scripts/hr-cutover/contracts/legacy-u-inputbasepay-parity-v1.json"],
  ["ROUTINE_U_INPUTJOBPAY", "scripts/hr-cutover/contracts/legacy-u-inputjobpay-parity-v1.json"],
  ["ROUTINE_ATTENDANCE_SCHEMA_HOOKS", "scripts/hr-cutover/contracts/legacy-attendance-item-schema-hook-parity-v1.json"],
  ["ROUTINE_PROFESSIONAL_TITLE_LOOKUP", "scripts/hr-cutover/contracts/legacy-professional-title-lookup-parity-v1.json"],
  ["ROUTINE_FAMILY_QUERY", "scripts/hr-cutover/contracts/legacy-family-query-parity-v1.json"],
  ["PAGE_CUSTOM_FIELD", "scripts/hr-cutover/contracts/legacy-employee-custom-field-page-family-v1.json"],
  ["PAGE_GROUP_WEB", "scripts/hr-cutover/contracts/legacy-group-web-completeness-ledger-v1.json"],
  ["PAGE_CLIENT_ATOMIC", "scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json"],
  ["PAGE_CLIENT_MENU_INVENTORY", "scripts/hr-cutover/contracts/legacy-client-menu-atomic-inventory-v1.json"],
  ["PAGE_GROUP_WEB_TRAINING", "scripts/hr-cutover/contracts/group-web-training-query-modern-runtime-task-v1.json"],
  ["PAGE_GROUP_WEB_EMPLOYEE_INFORMATION", "scripts/hr-cutover/contracts/group-web-employee-information-modern-runtime-task-v1.json"],
  ["PAGE_GROUP_WEB_ONBOARDING", "scripts/hr-cutover/contracts/group-web-employee-onboarding-modern-runtime-task-v1.json"],
  ["PAGE_GROUP_WEB_EMPLOYEE_CONTRACT", "scripts/hr-cutover/contracts/group-web-employee-contract-modern-runtime-task-v1.json"],
  ["PAGE_GROUP_WEB_JOB_CHANGE", "scripts/hr-cutover/contracts/group-web-job-change-modern-runtime-task-v1.json"],
  ["PAGE_GROUP_WEB_DEPARTURE_CHAIN", "scripts/hr-cutover/contracts/group-web-departure-chain-modern-runtime-task-v1.json"],
  ["PAGE_GROUP_WEB_REWARD_DISCIPLINE", "scripts/hr-cutover/contracts/group-web-reward-discipline-modern-runtime-task-v1.json"],
  ["PAGE_COMPATIBILITY_LEDGER", "scripts/hr-cutover/contracts/legacy-compatibility-ledger-v1.json"],
  ["PAGE_COVERAGE_CONTRACT", "scripts/hr-cutover/contracts/legacy-compatibility-coverage-v1.json"],
  ["PERMISSION_MAPPING", "scripts/hr-cutover/contracts/legacy-client-permission-capability-mapping-v1.json"],
  ["PERMISSION_SOURCE_EVIDENCE", "scripts/hr-cutover/contracts/legacy-client-permission-source-receipt-evidence-v1.json"],
  ["PRODUCTION_PREFLIGHT", "scripts/hr-cutover/contracts/production-import-preflight-v1.json"],
  ["PRODUCTION_EXECUTION", "scripts/hr-cutover/contracts/production-import-execution-v2.json"],
  ["MILESTONE_ROADMAP", "scripts/hr-cutover/contracts/hr-enterprise-rewrite-roadmap-v2.json"],
];
const EXPECTED_DENOMINATORS = {
  CLIENT_FIELDS: 2364,
  CLIENT_ROUTINES: 212,
  CLIENT_MENU_ENTRIES: 68,
  GROUP_WEB_TABLES: 438,
  GROUP_WEB_FIELDS: 5449,
  GROUP_WEB_VIEWS: 768,
  GROUP_WEB_ROUTINES: 428,
  GROUP_WEB_ASP_PAGES: 4026,
  GROUP_WEB_NAVIGABLE_ENTRIES: 186,
  PRODUCTION_GATES: 8,
};
const ROUTINE_FAMILY_IDS = [
  "ROUTINE_BS_READFROMLEAVE",
  "ROUTINE_U_ERRANDRECORDS",
  "ROUTINE_U_INPUTBASEPAY",
  "ROUTINE_U_INPUTJOBPAY",
  "ROUTINE_ATTENDANCE_SCHEMA_HOOKS",
  "ROUTINE_PROFESSIONAL_TITLE_LOOKUP",
  "ROUTINE_FAMILY_QUERY",
];
const GROUP_WEB_TASK_IDS = [
  "PAGE_GROUP_WEB_TRAINING",
  "PAGE_GROUP_WEB_EMPLOYEE_INFORMATION",
  "PAGE_GROUP_WEB_ONBOARDING",
  "PAGE_GROUP_WEB_EMPLOYEE_CONTRACT",
  "PAGE_GROUP_WEB_JOB_CHANGE",
  "PAGE_GROUP_WEB_DEPARTURE_CHAIN",
  "PAGE_GROUP_WEB_REWARD_DISCIPLINE",
];
const BODY_KEYS = [
  "formatVersion",
  "artifactKind",
  "contractSha256",
  "evidenceBindings",
  "denominators",
  "coverageCounts",
  "frozenItems",
  "milestoneGates",
  "admittedItems",
  "operationGates",
  "status",
  "productionImport",
];

export class FrozenCompatibilityMigrationManifestError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "FrozenCompatibilityMigrationManifestError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new FrozenCompatibilityMigrationManifestError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, code, detail) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(code, detail);
};
const count = (value, code, detail) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, detail);
};

function validateContract(contract) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_frozen_compatibility_migration_manifest"
    || contract.scope !== "M5_admits_only_frozen_M0_M4_compatibility_items"
    || !same(contract.expectedDenominators, EXPECTED_DENOMINATORS)
    || !same(contract.milestonePolicy?.requiredFrozenMilestones, REQUIRED_MILESTONES)
    || !Array.isArray(contract.milestonePolicy?.currentFrozenEvidence)
    || contract.denominatorPolicy?.includeEmptySourceObjects !== true
    || contract.denominatorPolicy?.includeEmptyTables !== true
    || contract.denominatorPolicy?.includeNullOnlyOrEmptyFields !== true
    || contract.denominatorPolicy?.includeUncalledRoutines !== true
    || contract.denominatorPolicy?.includeUnnavigatedPages !== true
    || contract.denominatorPolicy?.inventoryDoesNotEqualCompatibility !== true
    || contract.frozenItemPolicy?.fieldsRequireRowParity !== true
    || contract.frozenItemPolicy?.routinesRequireCompleteReviewedBehaviorParity !== true
    || contract.frozenItemPolicy?.pagesRequireLegacyRuntimeAndModernParity !== true
    || contract.frozenItemPolicy?.productionRequiresCurrentHashBoundEvidence !== true
    || contract.frozenItemPolicy?.staticEvidenceCompatibilityCredit !== 0
    || contract.frozenItemPolicy?.syntheticEvidenceCompatibilityCredit !== 0
    || contract.admissionPolicy?.allRequiredMilestonesMustBeFrozen !== true
    || contract.admissionPolicy?.progressMustBeComplete !== true
    || contract.admissionPolicy?.productionEvidenceMustBeComplete !== true
    || contract.admissionPolicy?.roadmapMustBeComplete !== true
    || contract.admissionPolicy?.admitNonFrozenItems !== false
    || contract.admissionPolicy?.loaderInvocation !== "FORBIDDEN"
    || contract.admissionPolicy?.abInvocation !== "FORBIDDEN"
    || contract.admissionPolicy?.productionWriterInvocation !== "FORBIDDEN"
    || contract.admissionPolicy?.currentStatus !== "NOT_READY"
    || contract.outputPolicy !== "stable_ids_statuses_hashes_and_counts_only"
    || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false
    || contract.containsPayrollDetails !== false
    || contract.productionImport !== "HOLD") {
    fail("FROZEN_MANIFEST_CONTRACT_INVALID", "identity or fail-closed policy");
  }
  if (!Array.isArray(contract.evidenceLedgers)
    || contract.evidenceLedgers.length !== EVIDENCE.length
    || !same(contract.evidenceLedgers.map(row => [row?.stableId, row?.path]), EVIDENCE)) {
    fail("FROZEN_MANIFEST_CONTRACT_INVALID", "exact evidence ledger set");
  }
  for (const row of contract.evidenceLedgers) {
    exactKeys(row, ["stableId", "path", "sha256"], "FROZEN_MANIFEST_CONTRACT_INVALID", `evidence:${row?.stableId}`);
    if (!SHA256.test(row.sha256 ?? "")) fail("FROZEN_MANIFEST_CONTRACT_INVALID", `evidence hash:${row.stableId}`);
  }
  const frozenEvidence = contract.milestonePolicy.currentFrozenEvidence;
  if (new Set(frozenEvidence.map(row => row?.stableId)).size !== frozenEvidence.length) {
    fail("FROZEN_MANIFEST_CONTRACT_INVALID", "duplicate milestone evidence");
  }
  for (const row of frozenEvidence) {
    exactKeys(row, ["stableId", "status", "evidenceSha256"], "FROZEN_MANIFEST_CONTRACT_INVALID", "milestone evidence shape");
    if (!REQUIRED_MILESTONES.includes(row.stableId) || row.status !== "FROZEN" || !SHA256.test(row.evidenceSha256 ?? "")) {
      fail("FROZEN_MANIFEST_CONTRACT_INVALID", `milestone evidence:${row.stableId}`);
    }
  }
}

function readEvidence(contract, repositoryRoot) {
  const parsed = new Map();
  const hashes = new Map();
  for (const row of contract.evidenceLedgers) {
    const bytes = readFileSync(resolve(repositoryRoot, row.path));
    const actual = digest(bytes);
    if (actual !== row.sha256) fail("FROZEN_MANIFEST_EVIDENCE_DRIFT", row.stableId);
    hashes.set(row.stableId, actual);
    if (row.path.endsWith(".json")) {
      try {
        parsed.set(row.stableId, JSON.parse(bytes));
      } catch {
        fail("FROZEN_MANIFEST_EVIDENCE_INVALID", row.stableId);
      }
    }
  }
  return { parsed, hashes };
}

function progressInputs(parsed) {
  return {
    routineLedger: parsed.get("ROUTINE_LEDGER"),
    tableMap: parsed.get("FIELD_TABLE_MAP"),
    coreMapping: parsed.get("FIELD_CORE_MAPPING"),
    organizationPosition: parsed.get("FIELD_ORGANIZATION_POSITION"),
    payroll: parsed.get("FIELD_PAYROLL"),
    employeeProfile: parsed.get("FIELD_EMPLOYEE_PROFILE"),
    knowhowFieldMap: parsed.get("FIELD_KNOWHOW"),
    rewardDiscipline: parsed.get("FIELD_REWARD_DISCIPLINE"),
    trainingHistory: parsed.get("FIELD_TRAINING_HISTORY"),
    insurancePolicy: parsed.get("FIELD_INSURANCE_POLICY"),
    performanceAssessment: parsed.get("FIELD_PERFORMANCE_ASSESSMENT"),
    customFieldPage: parsed.get("PAGE_CUSTOM_FIELD"),
    groupWeb: parsed.get("PAGE_GROUP_WEB"),
    clientAtomic: parsed.get("PAGE_CLIENT_ATOMIC"),
    clientMenuInventory: parsed.get("PAGE_CLIENT_MENU_INVENTORY"),
    permissionMapping: parsed.get("PERMISSION_MAPPING"),
    groupWebTasks: GROUP_WEB_TASK_IDS.map(id => parsed.get(id)),
    routineFamilies: ROUTINE_FAMILY_IDS.map(id => parsed.get(id)),
    productionEvidence: [],
  };
}

function validateCurrentLedgers(parsed, progress) {
  const pageLedger = parsed.get("PAGE_COMPATIBILITY_LEDGER");
  const coverage = parsed.get("PAGE_COVERAGE_CONTRACT");
  const groupWeb = parsed.get("PAGE_GROUP_WEB");
  const preflight = parsed.get("PRODUCTION_PREFLIGHT");
  const execution = parsed.get("PRODUCTION_EXECUTION");
  const roadmap = parsed.get("MILESTONE_ROADMAP");
  if (pageLedger?.ledgerKind !== "yuzhou_hr_legacy_compatibility_ledger"
    || !Array.isArray(pageLedger.items)
    || coverage?.contractKind !== "yuzhou_hr_legacy_compatibility_coverage"
    || groupWeb?.denominatorPolicy?.includeEmptyTables !== true
    || groupWeb.denominatorPolicy.includeNullOnlyOrEmptyFields !== true
    || groupWeb.denominatorPolicy.includeUncalledRoutines !== true
    || groupWeb.denominatorPolicy.includeUnnavigatedAspPages !== true) {
    fail("FROZEN_MANIFEST_PAGE_LEDGER_INVALID", "page and empty-object denominator identity");
  }
  if (preflight?.contractKind !== "yuzhou_hr_production_import_preflight"
    || preflight.productionImport !== "HOLD"
    || execution?.contractKind !== "yuzhou_hr_production_import_execution"
    || execution.productionImport !== "HOLD"
    || execution.activation?.status !== "HOLD"
    || !same(execution.activation.allowedTargets, [])) {
    fail("FROZEN_MANIFEST_PRODUCTION_LEDGER_INVALID", "production must remain unreachable and HOLD");
  }
  if (roadmap?.schemaVersion !== "2.0.0"
    || roadmap.status !== "IN_PROGRESS"
    || roadmap.scoringPolicy?.emptySourceObjectsRemainInDenominator !== true
    || roadmap.scoringPolicy?.productionImport !== "HOLD"
    || roadmap.executionModel?.productionWriterConcurrency !== 0
    || !same(roadmap.milestones?.map(row => row.id), [...REQUIRED_MILESTONES, "M5"])
    || !same(roadmap.milestones?.find(row => row.id === "M5")?.dependsOn, REQUIRED_MILESTONES)) {
    fail("FROZEN_MANIFEST_MILESTONE_LEDGER_INVALID", "roadmap identity or current HOLD state");
  }
  if (progress.status !== "IN_PROGRESS" || progress.productionImport !== "HOLD") {
    fail("FROZEN_MANIFEST_PROGRESS_INVALID", "current compatibility progress must remain in progress and HOLD");
  }
}

function denominatorRows(progress, progressSha256) {
  const values = {
    CLIENT_FIELDS: progress.inventory.clientDatabase.fields.denominator,
    CLIENT_ROUTINES: progress.inventory.clientDatabase.routines.denominator,
    CLIENT_MENU_ENTRIES: progress.inventory.clientUi.runtimeAuthorizedMenuEntries.denominator,
    GROUP_WEB_TABLES: progress.inventory.groupWeb.atomicTables.denominator,
    GROUP_WEB_FIELDS: progress.inventory.groupWeb.atomicFields.denominator,
    GROUP_WEB_VIEWS: progress.inventory.groupWeb.atomicViews.denominator,
    GROUP_WEB_ROUTINES: progress.inventory.groupWeb.atomicRoutines.denominator,
    GROUP_WEB_ASP_PAGES: progress.inventory.groupWeb.atomicAspPages.denominator,
    GROUP_WEB_NAVIGABLE_ENTRIES: progress.parity.groupWebNavigableEntries.denominator,
    PRODUCTION_GATES: progress.productionEvidence.verified.denominator,
  };
  if (!same(values, EXPECTED_DENOMINATORS)) fail("FROZEN_MANIFEST_DENOMINATOR_DRIFT", "compatibility denominator");
  return Object.entries(values).map(([stableId, value]) => ({
    stableId,
    status: "DENOMINATOR_LOCKED",
    evidenceSha256: progressSha256,
    count: value,
  }));
}

function frozenItems(parsed, hashes, progress) {
  if (progress.parity.clientFieldRowLevelParity.numerator !== 0) {
    fail("FROZEN_MANIFEST_FIELD_IDS_REQUIRED", "row parity count has no stable item ledger");
  }
  if (progress.inventory.clientUi.runtimeAuthorizedMenuEntries.numerator !== 0
    || progress.parity.customFieldLegacyInteractions.numerator !== 0
    || progress.parity.groupWebNavigableEntries.numerator !== 0) {
    fail("FROZEN_MANIFEST_PAGE_IDS_REQUIRED", "page parity count has no stable frozen item ledger");
  }
  const sourceByRoutineId = new Map();
  for (const sourceId of ROUTINE_FAMILY_IDS) {
    for (const row of parsed.get(sourceId)?.routines ?? []) sourceByRoutineId.set(row.routineId, sourceId);
  }
  const rows = progress.parity.clientRoutineBehaviorParity.verifiedRoutineIds.map(stableId => {
    const sourceId = sourceByRoutineId.get(stableId);
    if (!sourceId) fail("FROZEN_MANIFEST_ROUTINE_BINDING_MISSING", stableId);
    return { stableId, status: "FROZEN", evidenceSha256: hashes.get(sourceId), count: 1 };
  });
  const required = progress.productionEvidence.requiredGates;
  const missing = new Set(progress.productionEvidence.missingGates);
  for (const gate of required) {
    if (!missing.has(gate)) fail("FROZEN_MANIFEST_PRODUCTION_HASH_REQUIRED", gate);
  }
  return rows.sort((left, right) => left.stableId.localeCompare(right.stableId, "en"));
}

export function admitFrozenCompatibilityItems(items, ready) {
  if (!Array.isArray(items) || typeof ready !== "boolean") fail("FROZEN_MANIFEST_ADMISSION_INPUT_INVALID", "items or gate state");
  const ids = new Set();
  for (const row of items) {
    exactKeys(row, ["stableId", "status", "evidenceSha256", "count"], "FROZEN_MANIFEST_ADMISSION_INPUT_INVALID", "item shape");
    if (typeof row.stableId !== "string" || !row.stableId || ids.has(row.stableId)
      || row.status !== "FROZEN" || !SHA256.test(row.evidenceSha256 ?? "") || row.count !== 1) {
      fail("FROZEN_MANIFEST_ADMISSION_INPUT_INVALID", String(row.stableId));
    }
    ids.add(row.stableId);
  }
  return ready ? structuredClone(items) : [];
}

export function buildFrozenCompatibilityMigrationManifest({ contract, repositoryRoot = ROOT }) {
  validateContract(contract);
  const { parsed, hashes } = readEvidence(contract, repositoryRoot);
  const progress = buildLegacyCompatibilityProgress(progressInputs(parsed));
  validateCurrentLedgers(parsed, progress);
  const contractSha256 = digest(canonical(contract));
  const progressSha256 = digest(canonical(progress));
  const candidates = frozenItems(parsed, hashes, progress);
  const milestoneEvidence = new Map(contract.milestonePolicy.currentFrozenEvidence.map(row => [row.stableId, row]));
  const milestoneGates = REQUIRED_MILESTONES.map(stableId => {
    const evidence = milestoneEvidence.get(stableId);
    return {
      stableId,
      status: evidence ? "FROZEN" : "NOT_FROZEN",
      evidenceSha256: evidence?.evidenceSha256 ?? null,
      count: evidence ? 1 : 0,
    };
  });
  const milestonesFrozen = milestoneGates.every(row => row.status === "FROZEN");
  const productionComplete = progress.productionEvidence.verified.numerator === EXPECTED_DENOMINATORS.PRODUCTION_GATES;
  const roadmapComplete = parsed.get("MILESTONE_ROADMAP").status === "COMPLETE";
  const ready = milestonesFrozen && progress.status === "COMPLETE" && productionComplete && roadmapComplete;
  if (ready || contract.admissionPolicy.currentStatus !== "NOT_READY") {
    fail("FROZEN_MANIFEST_UNREVIEWED_PROMOTION", "current contract cannot open migration admission");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_frozen_compatibility_migration_manifest",
    contractSha256,
    evidenceBindings: contract.evidenceLedgers.map(row => ({
      stableId: row.stableId,
      status: "BOUND",
      evidenceSha256: hashes.get(row.stableId),
      count: 1,
    })),
    denominators: denominatorRows(progress, progressSha256),
    coverageCounts: [
      { stableId: "FIELD_FROZEN", status: "NOT_FROZEN", evidenceSha256: progressSha256, count: 0 },
      { stableId: "ROUTINE_FROZEN", status: candidates.length ? "PARTIAL" : "NOT_FROZEN", evidenceSha256: progressSha256, count: candidates.length },
      { stableId: "PAGE_FROZEN", status: "NOT_FROZEN", evidenceSha256: progressSha256, count: 0 },
      { stableId: "PRODUCTION_FROZEN", status: "NOT_FROZEN", evidenceSha256: progressSha256, count: 0 },
    ],
    frozenItems: candidates,
    milestoneGates,
    admittedItems: admitFrozenCompatibilityItems(candidates, ready),
    operationGates: [
      { stableId: "LOAD", status: "FORBIDDEN", evidenceSha256: null, count: 0 },
      { stableId: "A_B", status: "FORBIDDEN", evidenceSha256: null, count: 0 },
      { stableId: "PRODUCTION_WRITE", status: "FORBIDDEN", evidenceSha256: null, count: 0 },
    ],
    status: "NOT_READY",
    productionImport: "HOLD",
  };
  return { ...body, manifestSha256: digest(canonical(body)) };
}

export function validateFrozenCompatibilityMigrationManifest(manifest, { contract, repositoryRoot = ROOT }) {
  exactKeys(manifest, [...BODY_KEYS, "manifestSha256"], "FROZEN_MANIFEST_INVALID", "manifest shape");
  const { manifestSha256, ...body } = manifest;
  if (manifestSha256 !== digest(canonical(body))) fail("FROZEN_MANIFEST_HASH_MISMATCH", "canonical manifest hash");
  const expected = buildFrozenCompatibilityMigrationManifest({ contract, repositoryRoot });
  if (!same(manifest, expected)) fail("FROZEN_MANIFEST_INVALID", "derived statuses, hashes, or counts");
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const unknown = process.argv.slice(2).filter(arg => arg !== "--json");
    if (unknown.length) fail("FROZEN_MANIFEST_CLI_ARGUMENT_INVALID", unknown.join(","));
    const contract = JSON.parse(readFileSync(resolve(ROOT, DEFAULT_CONTRACT), "utf8"));
    const manifest = buildFrozenCompatibilityMigrationManifest({ contract });
    process.stdout.write(`${JSON.stringify(manifest, null, process.argv.includes("--json") ? 2 : 0)}\n`);
  } catch (error) {
    const code = error instanceof FrozenCompatibilityMigrationManifestError ? error.code : "FROZEN_MANIFEST_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
