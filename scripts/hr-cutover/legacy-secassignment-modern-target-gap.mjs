#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_BINDINGS = {
  sourceProbeContract: "scripts/hr-cutover/contracts/legacy-secassignment-source-probe-v1.json",
  sourceProbeImplementation: "scripts/hr-cutover/legacy-secassignment-source-probe.mjs",
  organizationPositionMap: "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json",
  productionTargetModel: "scripts/hr-cutover/contracts/production-import-target-model-v1.json",
  employeeFoundationMigration: "database/migrations/000230_hr_employee_foundation.sql",
  employmentHistoryMigration: "database/migrations/000237_hr_employment_event_legacy_compatibility.sql",
};
const EXPECTED_TARGETS = [
  {
    targetId: "employee_position_reference",
    targetTable: "hr_employee",
    targetLocators: ["hr_employee.position_id"],
    sourceAllowlist: ["dbo.person"],
    structuralCapacity: "single_nullable_position_reference",
    decision: "REJECT_UNPROVEN_MAPPING",
    reasonCode: "SINGULAR_POSITION_REFERENCE_CANNOT_ENCODE_UNPROVEN_SECONDARY_RELATION",
  },
  {
    targetId: "position_master",
    targetTable: "hr_position",
    targetLocators: ["hr_position.position_code", "hr_position.position_name", "hr_position.org_id"],
    sourceAllowlist: ["dbo.job"],
    structuralCapacity: "organization_bound_position_master",
    decision: "REJECT_UNPROVEN_MAPPING",
    reasonCode: "SOURCE_TABLE_NOT_ALLOWLISTED_AND_ORG_BINDING_MISSING",
  },
  {
    targetId: "employment_event_history",
    targetTable: "hr_employment_event",
    targetLocators: ["hr_employment_event.event_type", "hr_employment_event.effective_date", "hr_employment_event.before_snapshot", "hr_employment_event.after_snapshot"],
    sourceAllowlist: ["dbo.readjust"],
    structuralCapacity: "dated_before_after_employment_event",
    decision: "REJECT_UNPROVEN_MAPPING",
    reasonCode: "PRESENT_STATE_LABEL_HAS_NO_EVENT_IDENTITY_OR_EFFECTIVE_TIME",
  },
];
const EXPECTED_REQUIRED_DECISION = [
  "source_semantic_classification",
  "modern_target_relation_and_cardinality",
  "effective_time_and_history_policy",
];
const EXPECTED_FORBIDDEN_ASSUMPTIONS = [
  "secassignment_is_a_position",
  "secassignment_is_an_organization",
  "secassignment_is_single_valued_for_modern_use",
  "person_secassignment_is_a_dated_employment_event",
];
const EXPECTED_CONTRACT_KEYS = [
  "formatVersion", "contractKind", "contractVersion", "sourceSystem", "scope", "sourceRelation", "evidenceBindings",
  "candidateTargets", "explicitModernRelationTableStatus", "uniqueGap", "forbiddenAssumptions", "decision", "materialization",
  "compatibilityCredit", "receiptPolicy", "containsSourceValues", "containsPersonalData", "productionImport",
];
const EXPLICIT_RELATION_TABLE = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+hr_(?:employee_(?:secondary_)?assignment|employee_position|position_assignment|secondary_assignment)\b/iu;

export class LegacySecassignmentModernTargetGapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacySecassignmentModernTargetGapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacySecassignmentModernTargetGapError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sorted = values => [...values].sort((left, right) => left.localeCompare(right, "en"));

function readBinding(repositoryRoot, binding, key) {
  if (!object(binding)
    || !same(sorted(Object.keys(binding)), ["path", "sha256"])
    || binding.path !== EXPECTED_BINDINGS[key]
    || !SHA256.test(binding.sha256 ?? "")) {
    fail("SECASSIGNMENT_TARGET_BINDING_INVALID", key);
  }
  const bytes = readFileSync(resolve(repositoryRoot, binding.path));
  if (digest(bytes) !== binding.sha256) fail("SECASSIGNMENT_TARGET_EVIDENCE_DRIFT", key);
  return bytes;
}

function assertTokens(source, tokens, label) {
  if (tokens.some(token => !source.includes(token))) fail("SECASSIGNMENT_TARGET_SCHEMA_DRIFT", label);
}

function validateSourceBoundary(sourceProbeContract, sourceProbeImplementation, organizationPositionMap) {
  if (sourceProbeContract.contractKind !== "yuzhou_hr_legacy_secassignment_source_probe"
    || sourceProbeContract.scope !== "person_secassignment_to_secassignmentcode_business_key_integrity"
    || sourceProbeContract.readinessBoundary?.modernOrganizationOrPositionTargetBinding !== "UNBOUND"
    || sourceProbeContract.readinessBoundary?.semanticCompatibility !== "NOT_CLAIMED"
    || sourceProbeContract.readinessBoundary?.integrationStatus !== "REBIND_REQUIRED"
    || sourceProbeContract.materialization !== "BLOCKED"
    || sourceProbeContract.compatibilityCredit !== 0
    || sourceProbeContract.productionImport !== "HOLD") {
    fail("SECASSIGNMENT_SOURCE_BOUNDARY_DRIFT", "source probe contract");
  }
  assertTokens(sourceProbeImplementation, [
    "const relationReady = decision ===",
    "compatibilityCredit: 0",
    "materialization: \"BLOCKED\"",
    "productionImport: \"HOLD\"",
  ], "source probe implementation");
  const dictionaryFields = organizationPositionMap.fields?.filter(row => row.sourceTable === "secassignmentcode");
  const personRelation = organizationPositionMap.relations?.find(row => row.source === "person.secassignment");
  if (!same(dictionaryFields, [
    { sourceTable: "secassignmentcode", sourceColumn: "secassignment", disposition: "pending", targetLocators: ["hr_position"], reasonCode: "NO_DIRECT_JOB_RELATION" },
    { sourceTable: "secassignmentcode", sourceColumn: "myorder", disposition: "pending", targetLocators: ["hr_position.sort_order"], reasonCode: "NO_DIRECT_JOB_RELATION" },
  ]) || !same(personRelation, {
    source: "person.secassignment", target: "secassignmentcode.secassignment", kind: "inferred_business_key", status: "pending_fk_and_length_reconciliation",
  })) {
    fail("SECASSIGNMENT_SOURCE_MAPPING_DRIFT", "organization and position map");
  }
}

function validateTargetModel(targetModel, foundationSql, historySql) {
  const position = targetModel.targetTables?.hr_position;
  const employee = targetModel.targetTables?.hr_employee;
  const event = targetModel.targetTables?.hr_employment_event;
  if (!same(position?.allowedSourceTables, ["dbo.job"])
    || !position?.requiredFields?.includes("position_code")
    || !position?.requiredFields?.includes("position_name")
    || !position?.derivedFields?.includes("org_id")
    || !position?.foreignKeys?.some(row => row.column === "org_id" && row.targetTable === "sys_org" && row.required === true)
    || !same(employee?.allowedSourceTables, ["dbo.person"])
    || !employee?.derivedFields?.includes("position_id")
    || !employee?.foreignKeys?.some(row => row.column === "position_id" && row.targetTable === "hr_position" && row.required === false)
    || !same(event?.allowedSourceTables, ["dbo.readjust"])
    || !["event_type", "effective_date", "before_snapshot", "after_snapshot"].every(field => event?.requiredFields?.includes(field))) {
    fail("SECASSIGNMENT_TARGET_MODEL_DRIFT", "candidate target constraints");
  }
  assertTokens(foundationSql, [
    "CREATE TABLE IF NOT EXISTS hr_position",
    "org_id uuid NOT NULL REFERENCES sys_org(id)",
    "position_id uuid REFERENCES hr_position(id)",
    "CREATE TABLE IF NOT EXISTS hr_employment_event",
    "event_type varchar(32) NOT NULL",
    "effective_date date NOT NULL",
    "before_snapshot jsonb NOT NULL",
    "after_snapshot jsonb NOT NULL",
  ], "employee foundation");
  assertTokens(historySql, [
    "legacy_event_no varchar(64)",
    "legacy_event_type varchar(32)",
    "source_effective_at timestamp",
    "is_historical_import boolean",
  ], "employment history");
}

function inventoryTargetMigrations(repositoryRoot) {
  const migrationRoot = resolve(repositoryRoot, "database/migrations");
  const files = readdirSync(migrationRoot).filter(name => name.endsWith(".sql")).sort((left, right) => left.localeCompare(right, "en"));
  const inventory = files.map(name => {
    const bytes = readFileSync(resolve(migrationRoot, name));
    if (EXPLICIT_RELATION_TABLE.test(bytes.toString("utf8"))) {
      fail("SECASSIGNMENT_EXPLICIT_TARGET_RELATION_REVIEW_REQUIRED", "target schema changed");
    }
    return `${name}:${digest(bytes)}`;
  });
  return { migrationFileCount: inventory.length, migrationInventorySha256: digest(`${inventory.join("\n")}\n`) };
}

export function buildLegacySecassignmentModernTargetGapReceipt({ contract, repositoryRoot }) {
  if (!object(contract)
    || !same(sorted(Object.keys(contract)), sorted(EXPECTED_CONTRACT_KEYS))
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_secassignment_modern_target_gap"
    || contract.contractVersion !== "2026-09-04.1"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.scope !== "person_secassignment_to_modern_employee_relationship"
    || !same(contract.sourceRelation, {
      personSource: "person.secassignment",
      dictionarySource: "secassignmentcode.secassignment",
      structuralStatus: "business_key_integrity_probe_available",
      semanticStatus: "unproven",
    })
    || !same(contract.candidateTargets, EXPECTED_TARGETS)
    || contract.explicitModernRelationTableStatus !== "ABSENT_REVIEW_REQUIRED_IF_SCHEMA_CHANGES"
    || !same(sorted(Object.keys(contract.uniqueGap ?? {})), ["code", "requiredReviewedDecision", "resolution"])
    || contract.uniqueGap?.code !== "SECASSIGNMENT_MODERN_RELATION_CONTRACT_UNAPPROVED"
    || !same(contract.uniqueGap?.requiredReviewedDecision, EXPECTED_REQUIRED_DECISION)
    || contract.uniqueGap?.resolution !== "approve_one_versioned_relation_contract_before_any_target_materialization"
    || !same(contract.forbiddenAssumptions, EXPECTED_FORBIDDEN_ASSUMPTIONS)
    || contract.decision !== "KEEP_PENDING"
    || contract.materialization !== "BLOCKED"
    || contract.compatibilityCredit !== 0
    || contract.receiptPolicy !== "source_and_target_hashes_schema_aggregates_statuses_and_gap_code_only"
    || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false
    || contract.productionImport !== "HOLD") {
    fail("SECASSIGNMENT_TARGET_GAP_CONTRACT_INVALID", "identity or safety boundary");
  }
  if (!object(contract.evidenceBindings)
    || !same(sorted(Object.keys(contract.evidenceBindings)), sorted(Object.keys(EXPECTED_BINDINGS)))) {
    fail("SECASSIGNMENT_TARGET_BINDING_INVALID", "binding coverage");
  }
  const evidence = Object.fromEntries(Object.entries(contract.evidenceBindings).map(([key, binding]) => [key, readBinding(repositoryRoot, binding, key)]));
  validateSourceBoundary(
    JSON.parse(evidence.sourceProbeContract.toString("utf8")),
    evidence.sourceProbeImplementation.toString("utf8"),
    JSON.parse(evidence.organizationPositionMap.toString("utf8")),
  );
  validateTargetModel(
    JSON.parse(evidence.productionTargetModel.toString("utf8")),
    evidence.employeeFoundationMigration.toString("utf8"),
    evidence.employmentHistoryMigration.toString("utf8"),
  );
  const targetInventory = inventoryTargetMigrations(repositoryRoot);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_secassignment_modern_target_gap_receipt",
    scope: contract.scope,
    sourceRelation: { ...contract.sourceRelation },
    sourceProbeBound: true,
    sourceSemanticCompatibilityVerified: false,
    candidateTargetCount: contract.candidateTargets.length,
    candidateDecisions: contract.candidateTargets.map(({ targetId, targetTable, decision, reasonCode }) => ({ targetId, targetTable, decision, reasonCode })),
    explicitModernRelationTablePresent: false,
    targetInventory,
    decision: "KEEP_PENDING",
    uniqueGapCode: contract.uniqueGap.code,
    requiredReviewedDecision: [...contract.uniqueGap.requiredReviewedDecision],
    materialization: "BLOCKED",
    compatibilityCredit: { numerator: 0, denominator: 1 },
    containsSourceValues: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(`${JSON.stringify(body)}\n`) };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-secassignment-modern-target-gap-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(buildLegacySecassignmentModernTargetGapReceipt({ contract, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
