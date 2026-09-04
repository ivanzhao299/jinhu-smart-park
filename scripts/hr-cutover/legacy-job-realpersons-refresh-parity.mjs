#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLegacyRoutineParityContract } from "./legacy-routine-parity-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTINE_ID = "RULE-4B21922F4B3320A2";
const SOURCE_ARTIFACT_SHA256 = "6750e2123eac92e15820c451427bdd2b4c7a0fbc78e764a3280a5d8db342c0f8";
const EXPECTED_GAPS = Object.freeze([
  "JOB_REALPERSONS_REFRESH_TARGET_NOT_PRESERVED",
  "JOBSTATE_DEFCOUNT_TO_EMPLOYMENT_STATUS_RULE_UNRESOLVED",
  "PERSISTED_REFRESH_REPLACED_BY_READ_TIME_AGGREGATE_UNAPPROVED",
  "POSITION_LEVEL_ASSIGNED_COUNT_NOT_EXPOSED",
  "SOURCE_EXECUTE_AUTHORIZATION_NOT_BOUND",
]);
const EXPECTED_EVIDENCE = Object.freeze({
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  organizationPositionFieldMap: "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json",
  t0Extractor: "scripts/extract-yuzhou-t0.sh",
  positionEntity: "apps/api/src/modules/hr/entities/hr.entities.ts",
  modernService: "apps/api/src/modules/hr/hr.service.ts",
  modernController: "apps/api/src/modules/hr/hr.controller.ts",
  modernPage: "apps/web/app/hr/decision-center/HrDecisionCenterClient.tsx",
  permissionContract: "packages/shared/src/hr.ts",
  aggregateTest: "apps/api/src/modules/hr/hr-workforce-decision-snapshot.spec.ts",
  syntheticFixture: "scripts/hr-cutover/contracts/legacy-job-realpersons-refresh-parity-fixture-v1.json",
});

export class LegacyJobRealpersonsRefreshParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyJobRealpersonsRefreshParityError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyJobRealpersonsRefreshParityError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function readBound(repositoryRoot, binding, expectedPath, label) {
  if (!object(binding) || binding.path !== expectedPath || !SHA256.test(binding.sha256 ?? "")) {
    fail("JOB_REFRESH_EVIDENCE_BINDING_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, expectedPath));
  if (digest(bytes) !== binding.sha256) fail("JOB_REFRESH_EVIDENCE_DRIFT", label);
  return bytes;
}

function sqlEquals(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
}

export function refreshLegacyJobRealpersons({ jobs, persons, jobStates }) {
  if (!Array.isArray(jobs) || !Array.isArray(persons) || !Array.isArray(jobStates)) {
    fail("JOB_REFRESH_FIXTURE_INVALID", "jobs, persons, and jobStates must be arrays");
  }
  return jobs.map(job => {
    if (!object(job)) fail("JOB_REFRESH_FIXTURE_INVALID", "job row");
    let realPersons = 0;
    for (const person of persons) {
      if (!object(person) || !sqlEquals(person.jobCode, job.jobCode)) continue;
      for (const state of jobStates) {
        if (object(state) && sqlEquals(person.jobState, state.jobState) && Number(state.defaultCount) === 1) realPersons += 1;
      }
    }
    return { ...job, realPersons };
  });
}

function assertLedgerRoutine(row) {
  if (!object(row)
    || row.routineId !== ROUTINE_ID
    || row.kind !== "procedure"
    || row.sourceName !== "u_getjobpersons"
    || row.sourceArtifact !== "SQL_STORED_PROCEDURE_u_getjobpersons_sql"
    || row.sourceArtifactSha256 !== SOURCE_ARTIFACT_SHA256
    || row.structuralHash !== "53af927e6fa4b8572edef9c213827e7ea405a0c6dced4bbab532eb3ad5f2da1a"
    || row.canonicalFamily !== "u_getjobpersons"
    || row.primaryDomain !== "organization_position"
    || row.businessCapability !== "business_state_mutation"
    || !same(row.parameters, [])
    || !same(row.readTables, ["job", "jobstatecode", "person"])
    || !same(row.writeTables, ["job"])
    || !same(row.dynamicWriteTables, [])
    || row.dynamicMutationStatus !== "none"
    || !same(row.joinPredicates, ["person.job=job.job", "person.jobstate=jobstatecode.jobstate"])
    || !same(row.logicSignals, ["aggregation_count"])
    || !same(row.statementProfile, { select: 1, insert: 0, update: 1, delete: 0, merge: 0, alter: 0 })
    || row.parityStatus !== "partial_domain_surface_rule_parity_pending") {
    fail("JOB_REFRESH_SOURCE_LEDGER_DRIFT", "u_getjobpersons");
  }
}

function assertContract(contract) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_routine_semantic_parity"
    || contract.contractVersion !== "job-realpersons-refresh-gap-1.0.0"
    || contract.compatibilityScope !== "u_getjobpersons_source_bound_gap_only"
    || contract.productionImport !== "HOLD"
    || contract.gapAnalysis?.status !== "GAP_CONFIRMED"
    || contract.gapAnalysis?.compatibilityCredit !== 0
    || !same(contract.gapAnalysis?.reasonCodes, EXPECTED_GAPS)
    || contract.nonClaims?.refreshMutationParity !== "NOT_CLAIMED"
    || contract.nonClaims?.jobStateCountingParity !== "NOT_CLAIMED"
    || contract.nonClaims?.positionLevelOutputParity !== "NOT_CLAIMED"
    || contract.nonClaims?.authorizationParity !== "NOT_CLAIMED"
    || contract.nonClaims?.productionImportReadiness !== "NOT_CLAIMED") {
    fail("JOB_REFRESH_CONTRACT_INVALID", "identity, gap, or non-claim boundary");
  }
  if (!object(contract.evidenceBindings)
    || !same(Object.keys(contract.evidenceBindings).sort(), Object.keys(EXPECTED_EVIDENCE).sort())) {
    fail("JOB_REFRESH_EVIDENCE_BINDING_INVALID", "coverage");
  }
  if (!Array.isArray(contract.routines) || contract.routines.length !== 1) {
    fail("JOB_REFRESH_ROUTINE_COVERAGE_INVALID", "exactly one u_getjobpersons row required");
  }
  const routine = contract.routines[0];
  if (routine.routineId !== ROUTINE_ID
    || routine.canonicalFamily !== "u_getjobpersons"
    || routine.sourceSurface !== "yuzhou_v10_client_database"
    || routine.sourceKind !== "procedure"
    || routine.parityStatus !== "pending"
    || routine.review?.status !== "pending"
    || routine.authorizationSemantics?.status !== "pending"
    || routine.authorizationSemantics?.modernPermission !== "hr:decision_center") {
    fail("JOB_REFRESH_CONTRACT_INVALID", "routine and authorization must remain pending");
  }
  for (const name of ["outputFieldMappings", "readMappings", "writeMappings", "nullSemantics", "stateSideEffects"]) {
    if (routine.semantics?.[name]?.status !== "pending") fail("JOB_REFRESH_GAP_PROMOTED", name);
  }
  for (const name of ["parameterMappings", "roundingSemantics"]) {
    if (routine.semantics?.[name]?.status !== "verified") fail("JOB_REFRESH_CONTRACT_INVALID", name);
  }
  if (routine.semantics?.transaction?.status !== "pending"
    || routine.semantics?.dynamicSql?.status !== "none"
    || routine.semantics?.dormantPaths?.emptyInputCase?.status !== "covered"
    || routine.semantics?.dormantPaths?.untriggeredBranchCase?.status !== "covered"
    || routine.semantics?.dormantPaths?.triggerFiringCase?.status !== "not_applicable") {
    fail("JOB_REFRESH_CONTRACT_INVALID", "transaction, dynamic SQL, or dormant paths");
  }
}

function assertFixture(fixture) {
  if (!object(fixture)
    || fixture.formatVersion !== 1
    || fixture.fixtureKind !== "yuzhou_hr_legacy_job_realpersons_refresh_parity_fixture"
    || fixture.fixtureOnly !== true
    || fixture.containsSourceRows !== false
    || fixture.containsPersonalData !== false
    || fixture.productionImport !== "HOLD"
    || !same(fixture.expectedGapCodes, EXPECTED_GAPS)) {
    fail("JOB_REFRESH_FIXTURE_INVALID", "identity or safety boundary");
  }
  const before = structuredClone({ jobs: fixture.jobs, persons: fixture.persons, jobStates: fixture.jobStates });
  const refreshed = refreshLegacyJobRealpersons(fixture);
  const after = refreshed.map(row => ({ jobCode: row.jobCode, realPersons: row.realPersons }));
  if (!same(after, fixture.expectedAfter)) fail("JOB_REFRESH_FIXTURE_INVALID", "refresh result");
  if (!same(before, { jobs: fixture.jobs, persons: fixture.persons, jobStates: fixture.jobStates })) {
    fail("JOB_REFRESH_FIXTURE_INVALID", "input mutation");
  }
  const cases = new Map(fixture.cases?.map(row => [row.testId, row]) ?? []);
  for (const id of [
    "positive-counts-only-persons-whose-state-defcount-is-one",
    "negative-defcount-zero-and-null-do-not-count",
    "negative-null-or-unmatched-state-does-not-count",
    "negative-null-job-key-does-not-match",
    "empty-person-table-zeroes-every-job",
    "empty-jobstate-table-zeroes-every-job",
    "empty-job-table-updates-no-rows",
    "conservation-job-identity-and-person-rows-unchanged",
    "permission-modern-report-requires-decision-center-page",
  ]) if (!cases.has(id)) fail("JOB_REFRESH_FIXTURE_INVALID", id);
  if (refreshLegacyJobRealpersons({ jobs: fixture.jobs, persons: [], jobStates: fixture.jobStates }).some(row => row.realPersons !== 0)
    || refreshLegacyJobRealpersons({ jobs: fixture.jobs, persons: fixture.persons, jobStates: [] }).some(row => row.realPersons !== 0)
    || refreshLegacyJobRealpersons({ jobs: [], persons: fixture.persons, jobStates: fixture.jobStates }).length !== 0) {
    fail("JOB_REFRESH_FIXTURE_INVALID", "empty table behavior");
  }
  if (cases.get("permission-modern-report-requires-decision-center-page")?.expectedPermission !== "hr:decision_center") {
    fail("JOB_REFRESH_FIXTURE_INVALID", "permission");
  }
  const conservation = cases.get("conservation-job-identity-and-person-rows-unchanged");
  if (conservation?.expectedJobIdentityDelta !== 0 || conservation.expectedPersonRowDelta !== 0) {
    fail("JOB_REFRESH_FIXTURE_INVALID", "conservation");
  }
  if (Array.isArray(fixture.modernAggregateOnly?.positionRows) || "assignedHeadcountByPosition" in (fixture.modernAggregateOnly ?? {})) {
    fail("JOB_REFRESH_FIXTURE_INVALID", "modern fixture must remain aggregate-only");
  }
}

export function verifyLegacyJobRealpersonsRefreshParity({ contract, fixture, repositoryRoot }) {
  assertContract(contract);
  assertFixture(fixture);
  const evidence = Object.fromEntries(Object.entries(EXPECTED_EVIDENCE).map(([key, path]) => [key, readBound(repositoryRoot, contract.evidenceBindings[key], path, key)]));
  const ledger = JSON.parse(evidence.routineLedger.toString("utf8"));
  assertLedgerRoutine(ledger.routines?.find(row => row.routineId === ROUTINE_ID));

  const fieldMap = JSON.parse(evidence.organizationPositionFieldMap.toString("utf8"));
  const realpersons = fieldMap.fields?.find(row => row.sourceTable === "job" && row.sourceColumn === "realpersons");
  if (!realpersons
    || realpersons.disposition !== "archive_only"
    || realpersons.reasonCode !== "DERIVED_HEADCOUNT_NOT_AUTHORITATIVE"
    || !realpersons.targetLocators?.includes("hr_legacy_archive_record.restricted_safe_projection.legacyFields.realpersons")) {
    fail("JOB_REFRESH_FIELD_MAP_DRIFT", "job.realpersons");
  }

  const extractor = evidence.t0Extractor.toString("utf8");
  const positionExtraction = extractor.match(/query_json positions\.raw\.json[^\n]+/u)?.[0] ?? "";
  if (!/defpersons AS headcountLimit/u.test(positionExtraction) || /realpersons/u.test(positionExtraction)) {
    fail("JOB_REFRESH_SOURCE_EXTRACTION_DRIFT", "position extraction");
  }

  const entity = evidence.positionEntity.toString("utf8");
  const positionStart = entity.indexOf("export class HrPositionEntity");
  const positionEnd = entity.indexOf("@Entity(\"hr_employee\")", positionStart);
  const positionEntity = positionStart >= 0 && positionEnd > positionStart ? entity.slice(positionStart, positionEnd) : "";
  if (!/headcountLimit/u.test(positionEntity) || /realPersons|realpersons|assignedHeadcount/u.test(positionEntity)) {
    fail("JOB_REFRESH_MODERN_SCHEMA_DRIFT", "position entity");
  }

  const service = evidence.modernService.toString("utf8");
  const methodStart = service.indexOf("async workforceDecisionSnapshot");
  const methodEnd = service.indexOf("async employeeProfile", methodStart);
  const method = methodStart >= 0 && methodEnd > methodStart ? service.slice(methodStart, methodEnd) : "";
  if (!/employment_status IN \('active','probation'\)/u.test(method)
    || !/count\(workforce\.position_id\)::int assigned_headcount/u.test(method)
    || !/active_assigned_headcount/u.test(method)
    || /UPDATE\s+hr_position|realpersons|defcount/u.test(method)) {
    fail("JOB_REFRESH_MODERN_AGGREGATE_DRIFT", "workforce decision snapshot");
  }

  const controller = evidence.modernController.toString("utf8");
  const page = evidence.modernPage.toString("utf8");
  const permission = evidence.permissionContract.toString("utf8");
  const aggregateTest = evidence.aggregateTest.toString("utf8");
  if (!/@Get\("decision-center\/workforce"\)/u.test(controller)
    || !/HR_DECISION_CENTER_PAGE/u.test(controller)
    || !/snapshot\.staffing\.activeAssignedHeadcount/u.test(page)
    || /assignedHeadcountByPosition|positionRows/u.test(page)
    || !/HR_DECISION_CENTER_PAGE:\s*"hr:decision_center"/u.test(permission)
    || !/without employee or position identifiers/u.test(aggregateTest)
    || !/HR_PERMISSIONS\.HR_DECISION_CENTER_PAGE/u.test(aggregateTest)) {
    fail("JOB_REFRESH_MODERN_SURFACE_DRIFT", "API, page, permission, or aggregate test");
  }

  const generic = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  if (generic.status !== "IN_PROGRESS"
    || generic.summary.sourceRoutines !== 1
    || generic.summary.verifiedRoutines !== 0
    || generic.summary.pendingRoutines !== 1
    || generic.summary.verifiedSemanticParityPercent !== 0
    || !same(generic.reasonCodes, ["ROUTINE_SEMANTIC_EVIDENCE_PENDING"])) {
    fail("JOB_REFRESH_GAP_PROMOTED", JSON.stringify(generic.summary));
  }

  return {
    ok: true,
    status: "GAP_CONFIRMED",
    canonicalFamily: "u_getjobpersons",
    sourceRoutinesReviewed: 1,
    verifiedRoutines: 0,
    compatibilityCredit: 0,
    reasonCodes: EXPECTED_GAPS,
    sourceBusinessWrites: 1,
    sourceRowsAffectedScope: "all_job_rows",
    dynamicSqlExecutions: 0,
    fixtureCases: fixture.cases.length,
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-job-realpersons-refresh-parity-v1.json"), "utf8"));
  const fixture = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-job-realpersons-refresh-parity-fixture-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyLegacyJobRealpersonsRefreshParity({ contract, fixture, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
