#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLegacyRoutineParityContract } from "./legacy-routine-parity-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTINE_ID = "RULE-FBB5E43B28F27B57";
const SOURCE_ARTIFACT_SHA256 = "5e3e1525877e2d6810ad48d56b66a9e8fe21d829d788ca822581e75783e57751";
const EXPECTED_GAPS = Object.freeze([
  "STAFFING_ROW_LEVEL_PROJECTION_MISSING",
  "STAFFING_LEGACY_REALPERSONS_SEMANTICS_UNRESOLVED",
  "STAFFING_BRANCH_SCOPE_ASYMMETRY_UNRESOLVED",
  "STAFFING_PRODUCTION_HEADCOUNT_LIMIT_NOT_MATERIALIZED",
  "STAFFING_MISSING_DEPARTMENT_LABEL_PROJECTION_MISSING",
]);
const EXPECTED_EVIDENCE = Object.freeze({
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  t0Extractor: "scripts/extract-yuzhou-t0.sh",
  t0LabLoader: "scripts/load-yuzhou-t0.sh",
  productionT0CandidateMaterializer: "scripts/hr-cutover/materialize-production-t0-decision-candidates.mjs",
  modernService: "apps/api/src/modules/hr/hr.service.ts",
  modernController: "apps/api/src/modules/hr/hr.controller.ts",
  modernPage: "apps/web/app/hr/decision-center/HrDecisionCenterClient.tsx",
  permissionContract: "packages/shared/src/hr.ts",
  aggregateTest: "apps/api/src/modules/hr/hr-workforce-decision-snapshot.spec.ts",
  syntheticFixture: "scripts/hr-cutover/contracts/legacy-staffing-discrepancy-report-parity-fixture-v1.json",
});

export class LegacyStaffingDiscrepancyReportParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyStaffingDiscrepancyReportParityError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyStaffingDiscrepancyReportParityError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const stableRows = rows => [...rows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "en"));

function readBound(repositoryRoot, binding, expectedPath, label) {
  if (!object(binding) || binding.path !== expectedPath || !SHA256.test(binding.sha256 ?? "")) {
    fail("STAFFING_PARITY_EVIDENCE_BINDING_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, expectedPath));
  if (digest(bytes) !== binding.sha256) fail("STAFFING_PARITY_EVIDENCE_DRIFT", label);
  return bytes;
}

function sqlLike(value, pattern) {
  if (value === null || value === undefined || pattern === null || pattern === undefined) return false;
  const escaped = String(pattern)
    .replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&")
    .replaceAll("%", ".*")
    .replaceAll("_", ".");
  return new RegExp(`^${escaped}$`, "su").test(String(value));
}

export function projectLegacyStaffingDiscrepancyRows(rows, rightscope) {
  if (!Array.isArray(rows)) fail("STAFFING_PARITY_FIXTURE_INVALID", "sourceRows");
  const output = [];
  for (const row of rows) {
    if (!object(row)) fail("STAFFING_PARITY_FIXTURE_INVALID", "source row");
    const defined = row.definedPersons;
    const actual = row.realPersons;
    if (defined !== null && actual !== null && Number(defined) < Number(actual) && sqlLike(row.departmentCode, rightscope)) {
      output.push({
        positionName: row.positionName,
        departmentName: row.departmentName,
        definedPersons: Number(defined),
        realPersons: Number(actual),
        status: "overstaffed",
      });
    }
  }
  for (const row of rows) {
    const defined = row.definedPersons;
    const actual = row.realPersons;
    if (defined !== null && actual !== null && Number(defined) > Number(actual)) {
      output.push({
        positionName: row.positionName,
        departmentName: row.departmentName,
        definedPersons: Number(defined),
        realPersons: Number(actual),
        status: "understaffed",
      });
    }
  }
  return [...new Map(output.map(row => [JSON.stringify(row), row])).values()];
}

function assertLedgerRoutine(row) {
  if (!object(row)
    || row.routineId !== ROUTINE_ID
    || row.kind !== "procedure"
    || row.sourceName !== "u_job_r"
    || row.sourceArtifact !== "SQL_STORED_PROCEDURE_u_job_r_sql"
    || row.sourceArtifactSha256 !== SOURCE_ARTIFACT_SHA256
    || row.structuralHash !== "a1a15d7e28572e3682184a984a631a655b8dfc8456d5eef7f1f5a6857d01eb30"
    || row.canonicalFamily !== "u_job_r"
    || row.primaryDomain !== "organization_position"
    || row.businessCapability !== "query_or_report_projection"
    || !same(row.parameters, [{ name: "rightscope", sourceType: "varchar(30)" }])
    || !same(row.readTables, ["departmentcode", "job"])
    || !same(row.writeTables, [])
    || !same(row.dynamicWriteTables, [])
    || row.dynamicMutationStatus !== "none"
    || !same(row.joinPredicates, ["job.department=departmentcode.department"])
    || !same(row.statementProfile, { select: 2, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })
    || row.parityStatus !== "partial_domain_surface_rule_parity_pending") {
    fail("STAFFING_PARITY_SOURCE_LEDGER_DRIFT", "u_job_r");
  }
}

function assertContract(contract) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_routine_semantic_parity"
    || contract.contractVersion !== "staffing-discrepancy-report-gap-1.0.0"
    || contract.compatibilityScope !== "u_job_r_source_bound_gap_only"
    || contract.productionImport !== "HOLD"
    || contract.gapAnalysis?.status !== "GAP_CONFIRMED"
    || contract.gapAnalysis?.compatibilityCredit !== 0
    || !same(contract.gapAnalysis?.reasonCodes, EXPECTED_GAPS)
    || contract.nonClaims?.rowLevelSemanticParity !== "NOT_CLAIMED"
    || contract.nonClaims?.legacyRightscopeParity !== "NOT_CLAIMED"
    || contract.nonClaims?.legacyRealpersonsParity !== "NOT_CLAIMED"
    || contract.nonClaims?.productionImportReadiness !== "NOT_CLAIMED") {
    fail("STAFFING_PARITY_CONTRACT_INVALID", "identity, gap, or non-claim boundary");
  }
  if (!object(contract.evidenceBindings)
    || !same(Object.keys(contract.evidenceBindings).sort(), Object.keys(EXPECTED_EVIDENCE).sort())) {
    fail("STAFFING_PARITY_EVIDENCE_BINDING_INVALID", "coverage");
  }
  if (!Array.isArray(contract.routines) || contract.routines.length !== 1) {
    fail("STAFFING_PARITY_ROUTINE_COVERAGE_INVALID", "exactly one u_job_r row required");
  }
  const routine = contract.routines[0];
  if (routine.routineId !== ROUTINE_ID
    || routine.canonicalFamily !== "u_job_r"
    || routine.sourceSurface !== "yuzhou_v10_client_database"
    || routine.sourceKind !== "procedure"
    || routine.parityStatus !== "pending"
    || routine.review?.status !== "pending") {
    fail("STAFFING_PARITY_CONTRACT_INVALID", "routine must remain pending");
  }
  for (const name of ["parameterMappings", "outputFieldMappings", "readMappings", "nullSemantics"]) {
    if (routine.semantics?.[name]?.status !== "pending") fail("STAFFING_PARITY_GAP_PROMOTED", name);
  }
  for (const name of ["writeMappings", "roundingSemantics", "stateSideEffects"]) {
    if (routine.semantics?.[name]?.status !== "verified") fail("STAFFING_PARITY_CONTRACT_INVALID", name);
  }
  if (routine.semantics?.transaction?.status !== "verified"
    || routine.semantics?.dynamicSql?.status !== "none"
    || routine.semantics?.dormantPaths?.emptyInputCase?.status !== "covered"
    || routine.semantics?.dormantPaths?.untriggeredBranchCase?.status !== "covered"
    || routine.semantics?.dormantPaths?.triggerFiringCase?.status !== "not_applicable") {
    fail("STAFFING_PARITY_CONTRACT_INVALID", "transaction, dynamic SQL, or dormant paths");
  }
}

function assertFixture(fixture) {
  if (!object(fixture)
    || fixture.formatVersion !== 1
    || fixture.fixtureKind !== "yuzhou_hr_legacy_staffing_discrepancy_report_parity_fixture"
    || fixture.fixtureOnly !== true
    || fixture.containsSourceRows !== false
    || fixture.containsPersonalData !== false
    || fixture.productionImport !== "HOLD"
    || !same(fixture.expectedGapCodes, EXPECTED_GAPS)) {
    fail("STAFFING_PARITY_FIXTURE_INVALID", "identity or safety boundary");
  }
  const actual = projectLegacyStaffingDiscrepancyRows(fixture.sourceRows, fixture.scopePattern);
  if (!same(stableRows(actual), stableRows(fixture.expectedLegacyRows))) {
    fail("STAFFING_PARITY_FIXTURE_INVALID", "legacy row semantics");
  }
  const byId = new Map(fixture.cases?.map(row => [row.testId, row]) ?? []);
  for (const id of [
    "positive-overstaff-scope-match",
    "negative-overstaff-scope-mismatch",
    "positive-understaff-ignores-scope",
    "positive-left-join-keeps-missing-department-label",
    "negative-equal-counts-produce-no-row",
    "negative-null-defined-count-produces-no-row",
    "negative-null-real-count-produces-no-row",
    "permission-modern-report-requires-decision-center-page",
    "conservation-read-only-report",
    "negative-empty-source",
  ]) if (!byId.has(id)) fail("STAFFING_PARITY_FIXTURE_INVALID", id);

  const outputCodes = new Set(actual.map(row => row.positionName));
  for (const [id, expected] of [
    ["positive-overstaff-scope-match", true],
    ["negative-overstaff-scope-mismatch", false],
    ["positive-understaff-ignores-scope", true],
    ["positive-left-join-keeps-missing-department-label", true],
    ["negative-equal-counts-produce-no-row", false],
    ["negative-null-defined-count-produces-no-row", false],
    ["negative-null-real-count-produces-no-row", false],
  ]) {
    const testCase = byId.get(id);
    const source = fixture.sourceRows.find(row => row.positionCode === testCase.positionCode);
    if (!source || outputCodes.has(source.positionName) !== expected) fail("STAFFING_PARITY_FIXTURE_INVALID", id);
  }
  const missingLabel = actual.find(row => row.positionName === "Fixture Position D");
  if (!missingLabel || missingLabel.departmentName !== null) fail("STAFFING_PARITY_FIXTURE_INVALID", "left join null label");
  if (projectLegacyStaffingDiscrepancyRows([], fixture.scopePattern).length !== 0) fail("STAFFING_PARITY_FIXTURE_INVALID", "empty source");
  if (byId.get("permission-modern-report-requires-decision-center-page")?.expectedPermission !== "hr:decision_center") {
    fail("STAFFING_PARITY_FIXTURE_INVALID", "permission");
  }
  const conservation = byId.get("conservation-read-only-report");
  if (conservation?.expectedBusinessWrites !== 0 || conservation.expectedSourceRowDelta !== 0 || conservation.expectedModernRowDelta !== 0) {
    fail("STAFFING_PARITY_FIXTURE_INVALID", "conservation");
  }
  if (Array.isArray(fixture.modernAggregateOnly?.items) || "positionRows" in (fixture.modernAggregateOnly ?? {})) {
    fail("STAFFING_PARITY_FIXTURE_INVALID", "modern fixture must remain aggregate-only");
  }
}

export function verifyLegacyStaffingDiscrepancyReportParity({ contract, fixture, repositoryRoot }) {
  assertContract(contract);
  assertFixture(fixture);
  const evidence = Object.fromEntries(Object.entries(EXPECTED_EVIDENCE).map(([key, path]) => [key, readBound(repositoryRoot, contract.evidenceBindings[key], path, key)]));
  const ledger = JSON.parse(evidence.routineLedger.toString("utf8"));
  assertLedgerRoutine(ledger.routines?.find(row => row.routineId === ROUTINE_ID));

  const extractor = evidence.t0Extractor.toString("utf8");
  const labLoader = evidence.t0LabLoader.toString("utf8");
  const productionMaterializer = evidence.productionT0CandidateMaterializer.toString("utf8");
  const service = evidence.modernService.toString("utf8");
  const controller = evidence.modernController.toString("utf8");
  const page = evidence.modernPage.toString("utf8");
  const permission = evidence.permissionContract.toString("utf8");
  const aggregateTest = evidence.aggregateTest.toString("utf8");

  const positionExtraction = extractor.match(/query_json positions\.raw\.json[^\n]+/u)?.[0] ?? "";
  if (!/defpersons AS headcountLimit/u.test(positionExtraction) || /realpersons/u.test(positionExtraction)) {
    fail("STAFFING_PARITY_T0_SOURCE_BINDING_DRIFT", "position extraction");
  }
  if (!/INSERT INTO hr_position\([^)]*headcount_limit/su.test(labLoader)
    || !/source'->>'headcountLimit/u.test(labLoader)) {
    fail("STAFFING_PARITY_T0_SOURCE_BINDING_DRIFT", "lab headcount materialization");
  }
  if (!/headcount_limit:\s*null/u.test(productionMaterializer)) {
    fail("STAFFING_PARITY_GAP_CLOSED_OR_DRIFTED", "production headcount materialization changed; re-review required");
  }

  const methodStart = service.indexOf("async workforceDecisionSnapshot");
  const methodEnd = service.indexOf("async employeeProfile", methodStart);
  const workforceMethod = methodStart >= 0 && methodEnd > methodStart ? service.slice(methodStart, methodEnd) : "";
  if (!/SELECT id,headcount_limit FROM hr_position/u.test(workforceMethod)
    || !/assigned_headcount/u.test(workforceMethod)
    || !/over_capacity_position_count/u.test(workforceMethod)
    || !/staffing:\{/u.test(workforceMethod)
    || /position_name|org_name|departmentName|positionRows/u.test(workforceMethod)) {
    fail("STAFFING_PARITY_MODERN_SURFACE_DRIFT", "aggregate-only service");
  }
  if (!/@Get\("decision-center\/workforce"\)/u.test(controller)
    || !/HR_DECISION_CENTER_PAGE/u.test(controller)
    || !/workforceDecisionSnapshot/u.test(controller)
    || !/snapshot\.staffing\.vacancyCount/u.test(page)
    || !/snapshot\.staffing\.overCapacityPositionCount/u.test(page)
    || /positionRows|positionName/u.test(page)
    || !/HR_DECISION_CENTER_PAGE:\s*"hr:decision_center"/u.test(permission)
    || !/workforce decision snapshot is one scoped aggregate without employee or position identifiers/u.test(aggregateTest)
    || !/headcountLimit/u.test(aggregateTest)) {
    fail("STAFFING_PARITY_MODERN_SURFACE_DRIFT", "API, page, permission, or aggregate test");
  }

  const generic = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  if (generic.status !== "IN_PROGRESS"
    || generic.summary.sourceRoutines !== 1
    || generic.summary.verifiedRoutines !== 0
    || generic.summary.pendingRoutines !== 1
    || generic.summary.verifiedSemanticParityPercent !== 0
    || !same(generic.reasonCodes, ["ROUTINE_SEMANTIC_EVIDENCE_PENDING"])) {
    fail("STAFFING_PARITY_GAP_PROMOTED", JSON.stringify(generic.summary));
  }

  return {
    ok: true,
    status: "GAP_CONFIRMED",
    canonicalFamily: "u_job_r",
    sourceRoutinesReviewed: 1,
    verifiedRoutines: 0,
    compatibilityCredit: 0,
    reasonCodes: EXPECTED_GAPS,
    sourceBusinessWrites: 0,
    dynamicSqlExecutions: 0,
    fixtureCases: fixture.cases.length,
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-staffing-discrepancy-report-parity-v1.json"), "utf8"));
  const fixture = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-staffing-discrepancy-report-parity-fixture-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyLegacyStaffingDiscrepancyReportParity({ contract, fixture, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
