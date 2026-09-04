#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTINE_ID = "RULE-BD491199DA9913BE";
const PARAMETERS = [["year", "integer"], ["month", "integer"], ["person", "varchar(30)"]];
const READ_TABLES = ["person", "timekeeptable"];
const JOINS = ["person.tablename=timekeeptable.tablename"];
const STATEMENTS = { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 };
const IMPLEMENTATION_ROLES = [
  "modern_leave_projection_helper",
  "modern_leave_projection_tests",
  "attendance_request_and_daily_calculation_service",
  "historical_calendar_day_schema",
  "online_attendance_request_schema",
  "online_schedule_and_daily_result_schema",
  "monthly_close_schema",
];
const GAPS = [
  "FULL_DAYS_SOURCE_BODY_NOT_COMMITTED",
  "FULL_DAYS_RETURN_TYPE_UNIT_AND_PRECISION_UNAVAILABLE",
  "FULL_DAYS_NULL_AND_NO_DATA_SEMANTICS_UNPROVEN",
  "FULL_DAYS_PERSON_IDENTITY_AND_TABLE_RESOLUTION_UNPROVEN",
  "FULL_DAYS_TIMEKEEPTABLE_COLUMNS_PREDICATES_AND_AGGREGATION_UNAVAILABLE",
  "FULL_DAYS_CROSS_MONTH_BOUNDARY_SEMANTICS_UNPROVEN",
  "FULL_DAYS_MODERN_FIXED_WORK_WINDOW_NOT_SCHEDULE_DRIVEN",
  "FULL_DAYS_BOUNDED_SYNTHETIC_PARITY_ORACLE_UNAVAILABLE",
];
const ASSUMPTIONS = [
  "infer_calendar_day_count_from_function_name",
  "invent_scalar_return_type_unit_or_rounding",
  "treat_legacy_person_token_as_employee_uuid_or_employee_code",
  "treat_tablename_join_as_modern_employee_relationship",
  "assume_null_or_no_rows_returns_zero",
  "assume_cross_month_clipping_or_splitting",
  "treat_fixed_09_00_to_17_00_projection_as_historical_schedule",
  "treat_schema_mapping_as_behavior_parity",
];
const MAPPING = [
  {
    legacyInput: "year + month",
    modernSurface: "hr_attendance_period.period_month and date-bounded daily facts",
    disposition: "shape_correspondence_only",
    gap: "legacy month validation boundary and return-period semantics unavailable",
  },
  {
    legacyInput: "person varchar(30)",
    modernSurface: "tenant/park-scoped hr_employee.id UUID",
    disposition: "requires_controlled_identity_map",
    gap: "legacy person token meaning and duplicate or missing-person behavior unavailable",
  },
  {
    legacyDependency: "person.tablename=timekeeptable.tablename",
    modernSurface: "historical hr_attendance_calendar_source/hr_attendance_day plus online employee schedule/request/daily result",
    disposition: "normalized_dependency_split_not_behavior_equivalence",
    gap: "legacy selected columns predicates aggregation and table-resolution behavior unavailable",
  },
  {
    legacyOutput: "scalar return signature hash only",
    modernSurface: "leave minutes leave work-window count daily results and monthly summaries",
    disposition: "no_direct_adapter",
    gap: "return type unit precision and meaning unavailable",
  },
  {
    legacyEdge: "null input or no matching person/timekeeptable rows",
    modernSurface: "leave helper returns empty segments and zero projected minutes for null or invalid instants",
    disposition: "explicit_non_equivalence_gap",
    gap: "legacy null and empty-set result unavailable",
  },
  {
    legacyEdge: "cross-month request against one year/month call",
    modernSurface: "request projection may cross dates for at most 31 elapsed days while month close remains period-bounded",
    disposition: "explicit_non_equivalence_gap",
    gap: "legacy clipping splitting and boundary inclusion unavailable",
  },
];


export class LegacyFullDaysModernGapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyFullDaysModernGapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyFullDaysModernGapError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function readBound(repositoryRoot, evidence, label) {
  if (!object(evidence) || typeof evidence.path !== "string" || !evidence.path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("FULL_DAYS_MODERN_EVIDENCE_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("FULL_DAYS_MODERN_EVIDENCE_DRIFT", label);
  return { bytes, json: evidence.path.endsWith(".json") ? JSON.parse(bytes.toString("utf8")) : null };
}

function validateSource(contract, repositoryRoot) {
  const receiptEvidence = contract.sourceReceipt;
  if (receiptEvidence?.expectedDecision !== "KEEP_PENDING"
    || receiptEvidence.expectedCompatibilityCredit !== 0
    || receiptEvidence.expectedProductionImport !== "HOLD") {
    fail("FULL_DAYS_MODERN_SOURCE_CONTRACT_INVALID", "source receipt policy");
  }
  const receipt = readBound(repositoryRoot, receiptEvidence, "source receipt").json;
  const routine = receipt?.sourceEvidence?.routine;
  if (receipt?.contractKind !== "yuzhou_hr_legacy_full_days_source_receipt"
    || receipt.decision !== receiptEvidence.expectedDecision
    || receipt.compatibilityCredit !== receiptEvidence.expectedCompatibilityCredit
    || receipt.productionImport !== receiptEvidence.expectedProductionImport
    || routine?.routineId !== ROUTINE_ID
    || routine.sourceName !== "FullDays"
    || routine.kind !== "function"
    || routine.inputParameterCount !== 3
    || routine.readDependencyCount !== 2
    || routine.calledRoutineCount !== 0
    || routine.writeDependencyCount !== 0
    || routine.dynamicWriteDependencyCount !== 0
    || routine.dynamicMutationStatus !== "none") {
    fail("FULL_DAYS_MODERN_SOURCE_RECEIPT_DRIFT", "identity or zero-credit boundary");
  }
  const ledgerEvidence = receipt.sourceEvidence.routineLedger;
  const ledger = readBound(repositoryRoot, ledgerEvidence, "routine ledger").json;
  if (ledger?.summary?.sourceRoutines !== 212) fail("FULL_DAYS_MODERN_LEDGER_DRIFT", "routine count");
  const row = ledger.routines?.find(item => item.routineId === ROUTINE_ID);
  const observed = {
    parameters: row?.parameters?.map(item => [item.name, item.sourceType]),
    readTables: row?.readTables,
    joinPredicates: row?.joinPredicates,
    calledRoutines: row?.calledRoutines,
    logicSignals: row?.logicSignals,
    statementProfile: row?.statementProfile,
    returnEvidence: "anonymous_return_signature_hash_only",
  };
  if (!row
    || row.sourceName !== "FullDays"
    || row.canonicalFamily !== "FullDays"
    || row.primaryDomain !== "attendance_leave"
    || !row.secondaryDomains?.includes("employee_profile")
    || !same(observed, contract.legacyStructuralEvidence)
    || !same(observed.parameters, PARAMETERS)
    || !same(observed.readTables, READ_TABLES)
    || !same(observed.joinPredicates, JOINS)
    || !same(observed.calledRoutines, [])
    || !same(observed.logicSignals, ["conditional_branch"])
    || !same(observed.statementProfile, STATEMENTS)) {
    fail("FULL_DAYS_MODERN_LEDGER_DRIFT", "routine structure");
  }
  return { receipt, row };
}

function validateSourceBodyGap(contract, repositoryRoot, routine) {
  const evidence = contract.sourceManifest;
  if (evidence?.sourceArtifactPath !== "玉舟人力资源管理系统分析产出/存储过程源码/SQL_SCALAR_FUNCTION_FullDays_sql"
    || evidence.sourceArtifactBytes !== 2143
    || evidence.sourceArtifactLines !== 55
    || evidence.sourceBodyStatus !== "hash_and_shape_only_body_not_committed") {
    fail("FULL_DAYS_MODERN_SOURCE_CONTRACT_INVALID", "source manifest shape");
  }
  const manifest = readBound(repositoryRoot, evidence, "source manifest").json;
  const artifact = manifest?.files?.find(item => item.path === evidence.sourceArtifactPath);
  if (!artifact
    || artifact.kind !== "function-source"
    || artifact.bytes !== evidence.sourceArtifactBytes
    || artifact.text?.encoding !== "utf-8"
    || artifact.text?.lines !== evidence.sourceArtifactLines
    || artifact.sha256 !== routine.sourceArtifactSha256) {
    fail("FULL_DAYS_MODERN_SOURCE_MANIFEST_DRIFT", evidence.sourceArtifactPath);
  }
  if (existsSync(resolve(repositoryRoot, evidence.sourceArtifactPath))) {
    fail("FULL_DAYS_MODERN_SOURCE_BODY_STATUS_DRIFT", "body became available and requires separate review");
  }
  return { artifactSha256: artifact.sha256, bytes: artifact.bytes, lines: artifact.text.lines, sourceBodyAvailable: false };
}

function validateDomainMaps(contract, repositoryRoot) {
  const tableMap = readBound(repositoryRoot, contract.modernEvidence?.tableDomainMap, "table domain map").json;
  const capabilityMap = readBound(repositoryRoot, contract.modernEvidence?.routineCapabilityMap, "routine capability map").json;
  const employee = tableMap?.groups?.find(item => item.domain === "employee_profile");
  const attendance = tableMap?.groups?.find(item => item.domain === "attendance_leave");
  const dayRule = tableMap?.decompositionRules?.find(item => item.id === "attendance-days");
  const implemented = tableMap?.implementedNormalizationRules?.find(item => item.id === "t3-attendance-calendar");
  const capability = capabilityMap?.domainEvidence?.attendance_leave;
  if (!employee?.sourceTables?.includes("person")
    || !employee.targetTables?.includes("hr_employee")
    || !attendance?.sourceTables?.includes("timekeeptable")
    || !attendance.targetTables?.includes("hr_attendance_day")
    || attendance.functionalStatus !== "partial_target_requires_field_review"
    || dayRule?.sourceTable !== "timekeeptable"
    || !dayRule.targetLocators?.includes("hr_attendance_day.attendance_date")
    || implemented?.sourceTable !== "timekeeptable"
    || !implemented.targetLocators?.includes("hr_attendance_calendar_source")
    || !same(capability?.targetServices, ["apps/api/src/modules/hr/hr.service.ts"])
    || !capability?.targetApis?.includes("GET /hr/attendance/daily-results")
    || !capability.targetApis?.includes("POST /hr/attendance/daily-results/recalculate")) {
    fail("FULL_DAYS_MODERN_DOMAIN_MAP_DRIFT", "person/timekeeptable modern surface");
  }
  return {
    employeeProfileStatus: employee.functionalStatus,
    attendanceStatus: attendance.functionalStatus,
    attendanceStrategy: attendance.strategy,
  };
}

function requireSignals(text, signals, label) {
  for (const signal of signals) if (!text.includes(signal)) fail("FULL_DAYS_MODERN_IMPLEMENTATION_DRIFT", `${label}:${signal}`);
}

function validateModernImplementation(contract, repositoryRoot) {
  const files = contract.modernEvidence?.implementationFiles;
  if (!Array.isArray(files) || !same(files.map(item => item.role), IMPLEMENTATION_ROLES)) {
    fail("FULL_DAYS_MODERN_CONTRACT_INVALID", "implementation roles");
  }
  const sources = new Map(files.map(item => [item.role, readBound(repositoryRoot, item, item.role).bytes.toString("utf8")]));
  requireSignals(sources.get("modern_leave_projection_helper"), [
    "projectLeaveRoutineSegments", "projectLeaveRoutineImpact", "approvedLeaveMinutesForWorkDate",
    "shanghaiInstant(workDate, 9)", "shanghaiInstant(workDate, 17)", "31 * DAY_MS",
    "request.status === \"approved\" ? plannedMinutes : 0",
  ], "leave helper");
  requireSignals(sources.get("modern_leave_projection_tests"), [
    "single-day, outside-work-window and null inputs", "only approved leave contributes effective attendance minutes",
  ], "leave helper tests");
  requireSignals(sources.get("attendance_request_and_daily_calculation_service"), [
    "projectLeaveRoutineImpact", "approvedLeaveMinutesForWorkDate", "Attendance request cannot exceed 31 days",
    "approvedRequestSources", "createAttendanceMonthSummaries",
  ], "attendance service");
  requireSignals(sources.get("historical_calendar_day_schema"), [
    "hr_attendance_calendar_source", "hr_attendance_day", "calendar_year", "calendar_month", "attendance_date",
  ], "historical calendar schema");
  requireSignals(sources.get("online_attendance_request_schema"), [
    "hr_attendance_request", "duration_minutes", "start_at", "end_at", "44640",
  ], "request schema");
  requireSignals(sources.get("online_schedule_and_daily_result_schema"), [
    "hr_employee_schedule", "hr_employee_attendance_daily_result", "calculation_version_id", "source_trace",
  ], "daily calculation schema");
  requireSignals(sources.get("monthly_close_schema"), [
    "hr_attendance_period", "period_month", "hr_attendance_month_summary", "scheduled_days",
  ], "monthly close schema");
  const expected = {
    identity: "tenant_park_scoped_employee_uuid",
    requestDuration: "positive_whole_minutes_max_31_elapsed_days",
    leaveProjection: "asia_shanghai_fixed_09_00_to_17_00_overlap_by_calendar_date",
    effectiveLeave: "approved_leave_only",
    dailyCalculation: "schedule_punch_and_approved_request_sources_append_immutable_version",
    monthlyCalculation: "latest_daily_results_grouped_by_employee_inside_one_period_month",
    historicalCalendar: "timekeeptable_month_day_columns_normalized_to_calendar_source_and_day_rows",
  };
  if (!same(contract.modernEvidence.observedModernBehavior, expected)) {
    fail("FULL_DAYS_MODERN_CONTRACT_INVALID", "observed modern behavior");
  }
  return { ...expected, evidenceFileCount: files.length };
}

function validateGapPolicy(contract) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_full_days_modern_behavior_gap"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.routineFamily !== "FullDays"
    || contract.routineId !== ROUTINE_ID
    || contract.behaviorEvidenceStatus !== "unverified_source_body_unavailable"
    || contract.adapterDisposition !== "not_created_no_legacy_oracle"
    || contract.modernHelperDisposition !== "existing_helper_documented_not_promoted_to_full_days_equivalent"
    || !same(contract.blockingGaps, GAPS)
    || !same(contract.forbiddenAssumptions, ASSUMPTIONS)
    || !same(contract.mapping, MAPPING)
    || contract.requiredDecision !== "KEEP_GAP"
    || contract.compatibilityCredit !== 0
    || contract.legacyRoutineExecuted !== false
    || contract.legacyDynamicSqlExecuted !== false
    || contract.containsPersonalData !== false
    || contract.productionImport !== "HOLD") {
    fail("FULL_DAYS_MODERN_CONTRACT_INVALID", "identity or safety boundary");
  }
}

export function buildLegacyFullDaysModernGapReceipt({ contract, repositoryRoot }) {
  validateGapPolicy(contract);
  const { receipt, row } = validateSource(contract, repositoryRoot);
  const sourceArtifact = validateSourceBodyGap(contract, repositoryRoot, row);
  const domainMap = validateDomainMaps(contract, repositoryRoot);
  const modernBehavior = validateModernImplementation(contract, repositoryRoot);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_full_days_modern_behavior_gap_receipt",
    routineId: contract.routineId,
    routineFamily: contract.routineFamily,
    sourceReceiptDecision: receipt.decision,
    sourceArtifact,
    legacyInputs: PARAMETERS,
    legacyReadDependencies: READ_TABLES,
    legacyJoinPredicates: JOINS,
    legacyCalledRoutineCount: 0,
    legacyWriteDependencyCount: 0,
    domainMap,
    modernBehavior,
    mapping: structuredClone(contract.mapping),
    behaviorVerified: false,
    adapterCreated: false,
    modernHelperPromotedToLegacyEquivalent: false,
    blockingGaps: [...contract.blockingGaps],
    decision: "KEEP_GAP",
    status: "STRUCTURAL_MAPPING_DOCUMENTED_LEGACY_BEHAVIOR_UNAVAILABLE",
    compatibilityCredit: { numerator: 0, denominator: 1 },
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(`${JSON.stringify(body)}\n`) };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const path = resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-full-days-modern-gap-v1.json");
  const contract = JSON.parse(readFileSync(path, "utf8"));
  process.stdout.write(`${JSON.stringify(buildLegacyFullDaysModernGapReceipt({ contract, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
