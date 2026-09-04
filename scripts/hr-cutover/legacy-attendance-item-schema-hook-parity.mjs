#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLegacyRoutineParityContract } from "./legacy-routine-parity-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_ROUTINES = Object.freeze({
  "RULE-EEE0816A27D9E126": Object.freeze({
    canonicalFamily: "tr_addtimekeepitem",
    sourceName: "tr_addtimekeepitem",
    sourceArtifact: "SQL_TRIGGER_tr_addtimekeepitem_sql",
    sourceArtifactSha256: "47154eb6942627847f604120d3fd67bb6d29502b1e3ec352fcfa52154b61c66e",
    operation: "insert",
  }),
  "RULE-69093173CCAE1126": Object.freeze({
    canonicalFamily: "tr_droptimekeepitem",
    sourceName: "tr_droptimekeepitem",
    sourceArtifact: "SQL_TRIGGER_tr_droptimekeepitem_sql",
    sourceArtifactSha256: "66b2f7b00c15226a3af41246cd4e6bc6fc33b80f4f0e929106c6f4449de31664",
    operation: "delete",
  }),
});
const EXPECTED_EVIDENCE = Object.freeze({
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  tableDomainMap: "scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json",
  historicalAttendanceSchema: "database/migrations/000239_hr_attendance_insurance_history.sql",
  attendanceSymbolRuleSchema: "database/migrations/000240_hr_attendance_symbol_rules.sql",
  onlineAttendanceSchema: "database/migrations/000246_hr_attendance_calculation_core.sql",
  modernService: "apps/api/src/modules/hr/hr.service.ts",
  modernController: "apps/api/src/modules/hr/hr.controller.ts",
  modernPage: "apps/web/app/hr/attendance/HrAttendanceClient.tsx",
  permissionEvidence: "apps/api/src/modules/hr/hr-attendance-request.spec.ts",
  conservationEvidence: "apps/api/src/modules/hr/hr-attendance-calculation.pg.spec.ts",
});

export class LegacyAttendanceItemSchemaHookParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyAttendanceItemSchemaHookParityError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyAttendanceItemSchemaHookParityError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function readBound(repositoryRoot, binding, expectedPath, label) {
  if (!object(binding) || binding.path !== expectedPath || !SHA256.test(binding.sha256 ?? "")) {
    fail("ATTENDANCE_ITEM_HOOK_EVIDENCE_BINDING_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, expectedPath));
  if (digest(bytes) !== binding.sha256) fail("ATTENDANCE_ITEM_HOOK_EVIDENCE_DRIFT", label);
  return bytes;
}

function assertSourceRoutine(row, expected) {
  if (!object(row)
    || row.canonicalFamily !== expected.canonicalFamily
    || row.sourceName !== expected.sourceName
    || row.sourceArtifact !== expected.sourceArtifact
    || row.sourceArtifactSha256 !== expected.sourceArtifactSha256
    || row.kind !== "trigger"
    || row.primaryDomain !== "attendance_leave"
    || row.businessCapability !== "attendance_item_schema_hook"
    || !same(row.parameters, [])
    || !same(row.readTables, ["timekeepitemcode"])
    || !same(row.writeTables, [])
    || !same(row.dynamicWriteTables, [])
    || row.dynamicMutationStatus !== "none"
    || !same(row.calledRoutines, [])
    || !same(row.logicSignals, [])
    || !same(row.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })
    || row.parityStatus !== "legacy_noop_replace_by_normalized_model"
    || row.reviewStatus !== "source_active_body_verified_noop") {
    fail("ATTENDANCE_ITEM_HOOK_SOURCE_LEDGER_DRIFT", expected.canonicalFamily);
  }
}

function assertContractRoutine(row, routineId, expected) {
  if (!object(row)
    || row.routineId !== routineId
    || row.canonicalFamily !== expected.canonicalFamily
    || row.sourceSurface !== "yuzhou_v10_client_database"
    || row.sourceKind !== "trigger"
    || row.parityStatus !== "verified"
    || row.activeBehaviorScope !== "active_trigger_body_only"
    || row.retiredCommentedIntent !== "dynamic_timekeeprecord_column_ddl_replaced_by_normalized_rows"
    || row.review?.status !== "approved") {
    fail("ATTENDANCE_ITEM_HOOK_CONTRACT_ROUTINE_INVALID", expected.canonicalFamily);
  }
  if (row.semantics?.dynamicSql?.status !== "none"
    || row.semantics?.dormantPaths?.triggerFiringCase?.status !== "covered"
    || row.semantics?.writeMappings?.applicability !== "not_applicable"
    || row.semantics?.nullSemantics?.applicability !== "not_applicable"
    || row.semantics?.roundingSemantics?.applicability !== "not_applicable") {
    fail("ATTENDANCE_ITEM_HOOK_SEMANTICS_INVALID", expected.canonicalFamily);
  }
  for (const evidenceKind of ["positive", "negative", "permission", "conservation"]) {
    if (!Array.isArray(row.testEvidence?.[evidenceKind]) || row.testEvidence[evidenceKind].length === 0) {
      fail("ATTENDANCE_ITEM_HOOK_TEST_EVIDENCE_INCOMPLETE", `${expected.canonicalFamily}:${evidenceKind}`);
    }
  }
}

export function verifyLegacyAttendanceItemSchemaHookParity({ contract, fixture, repositoryRoot }) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_routine_semantic_parity"
    || contract.contractVersion !== "attendance-item-schema-hook-1.0.0"
    || contract.productionImport !== "HOLD"
    || contract.compatibilityScope !== "two_active_noop_triggers_only"
    || contract.nonClaims?.legacyItemConfigurationCrud !== "NOT_CLAIMED"
    || contract.nonClaims?.legacyPageRuntimeParity !== "NOT_CLAIMED"
    || contract.nonClaims?.productionImport !== "NOT_CLAIMED") {
    fail("ATTENDANCE_ITEM_HOOK_CONTRACT_INVALID", "identity or non-claim boundary");
  }
  if (!object(fixture)
    || fixture.fixtureKind !== "yuzhou_hr_legacy_attendance_item_schema_hook_fixture"
    || fixture.fixtureOnly !== true
    || fixture.containsSourceRows !== false
    || fixture.containsPersonalData !== false
    || fixture.productionImport !== "HOLD") {
    fail("ATTENDANCE_ITEM_HOOK_FIXTURE_INVALID", "identity or safety boundary");
  }
  if (!object(contract.evidenceBindings)
    || !same(Object.keys(contract.evidenceBindings).sort(), Object.keys(EXPECTED_EVIDENCE).sort())) {
    fail("ATTENDANCE_ITEM_HOOK_EVIDENCE_BINDING_INVALID", "coverage");
  }
  const evidence = Object.fromEntries(Object.entries(EXPECTED_EVIDENCE).map(([key, path]) => [key, readBound(repositoryRoot, contract.evidenceBindings[key], path, key)]));
  const ledger = JSON.parse(evidence.routineLedger.toString("utf8"));
  for (const [routineId, expected] of Object.entries(EXPECTED_ROUTINES)) {
    assertSourceRoutine(ledger.routines?.find(row => row.routineId === routineId), expected);
    assertContractRoutine(contract.routines?.find(row => row.routineId === routineId), routineId, expected);
  }
  if (!Array.isArray(contract.routines)
    || contract.routines.length !== 2
    || new Set(contract.routines.map(row => row.routineId)).size !== 2) {
    fail("ATTENDANCE_ITEM_HOOK_ROUTINE_COVERAGE_INVALID", "exact insert/delete trigger pair required");
  }

  const historicalSchema = evidence.historicalAttendanceSchema.toString("utf8");
  const symbolRuleSchema = evidence.attendanceSymbolRuleSchema.toString("utf8");
  const onlineSchema = evidence.onlineAttendanceSchema.toString("utf8");
  const modernService = evidence.modernService.toString("utf8");
  const modernController = evidence.modernController.toString("utf8");
  const modernPage = evidence.modernPage.toString("utf8");
  if (!/CREATE TABLE IF NOT EXISTS hr_attendance_day/u.test(historicalSchema)
    || !/legacy_symbol varchar\(64\)/u.test(historicalSchema)
    || !/normalized_kind varchar\(32\)/u.test(historicalSchema)
    || !/CREATE TABLE IF NOT EXISTS hr_attendance_symbol_rule/u.test(symbolRuleSchema)
    || !/ON hr_attendance_symbol_rule\(tenant_id,park_id,rule_version,legacy_symbol\)/u.test(symbolRuleSchema)
    || !/CREATE TABLE IF NOT EXISTS hr_employee_attendance_daily_result/u.test(onlineSchema)) {
    fail("ATTENDANCE_ITEM_HOOK_NORMALIZED_MODEL_DRIFT", "required row model");
  }
  const combinedSchema = `${historicalSchema}\n${symbolRuleSchema}\n${onlineSchema}`;
  if (/ALTER\s+TABLE\s+(?:dbo\.)?timekeeprecord\s+(?:ADD|DROP)/iu.test(combinedSchema)) {
    fail("ATTENDANCE_ITEM_HOOK_DYNAMIC_DDL_REINTRODUCED", "timekeeprecord");
  }
  if (!/async recalculateAttendanceDay/u.test(modernService)
    || !/async listAttendanceDaily/u.test(modernService)
    || /ALTER\s+TABLE\s+(?:dbo\.)?timekeeprecord/iu.test(modernService)
    || !/@Get\("attendance\/daily-results"\)/u.test(modernController)
    || !/@Post\("attendance\/daily-results\/recalculate"\)/u.test(modernController)
    || !/HR_ATTENDANCE_OPERATE/u.test(modernController)
    || !/ds-mobile-record-list/u.test(modernPage)
    || !/row\.leaveMinutes/u.test(modernPage)) {
    fail("ATTENDANCE_ITEM_HOOK_MODERN_SURFACE_DRIFT", "service, API, permission, or responsive page");
  }

  const generic = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  if (generic.status !== "COMPLETE" || generic.summary.verifiedRoutines !== 2 || generic.summary.pendingRoutines !== 0) {
    fail("ATTENDANCE_ITEM_HOOK_PARITY_INCOMPLETE", JSON.stringify(generic.summary));
  }
  const requiredCases = [
    "positive-insert-trigger-active-body",
    "positive-delete-trigger-active-body",
    "negative-empty-transition-set",
    "permission-no-direct-trigger-execution",
    "conservation-normalized-fact-schema",
  ];
  if (!same(fixture.cases?.map(row => row.testId), requiredCases)) {
    fail("ATTENDANCE_ITEM_HOOK_FIXTURE_INVALID", "case coverage");
  }

  return {
    ok: true,
    status: "COMPLETE",
    canonicalCapability: "attendance_item_schema_hook",
    verifiedRoutines: 2,
    activeBusinessWrites: 0,
    dynamicSqlExecutions: 0,
    normalizedFactColumnDelta: 0,
    retiredCommentedIntent: "captured_and_replaced_by_normalized_rows",
    nonClaims: contract.nonClaims,
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-attendance-item-schema-hook-parity-v1.json"), "utf8"));
  const fixture = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-attendance-item-schema-hook-fixture-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyLegacyAttendanceItemSchemaHookParity({ contract, fixture, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
