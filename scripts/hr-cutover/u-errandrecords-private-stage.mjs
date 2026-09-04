/* global structuredClone */
import { createHash } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { validateUErrandrecordsSourceReceipt } from "./u-errandrecords-source-receipt.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_TABLE = "dbo.errand";
const TARGET_TABLE = "hr_attendance_request";
const SOURCE_SYSTEM = "yuzhou-v10";
const JOIN_STATUSES = new Set(["matched", "missing_person", "missing_department"]);
const SQL_INTEGER_MIN = -2147483648;
const SQL_INTEGER_MAX = 2147483647;
const STAGE_BODY_KEYS = [
  "formatVersion",
  "artifactKind",
  "phase",
  "codeSha",
  "sourceReceiptSha256",
  "sourceCatalogSha256",
  "mappingContractSha256",
  "scopeBinding",
  "timePolicy",
  "operationMode",
  "counts",
  "records",
  "productionImport",
];

export class UErrandrecordsPrivateStageError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "UErrandrecordsPrivateStageError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new UErrandrecordsPrivateStageError(code, detail);
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
const canonicalFile = (value) => `${JSON.stringify(value, null, 2)}\n`;
const object = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys, code, label) => {
  if (
    !object(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())
  ) {
    fail(code, `${label} keys differ`);
  }
};
const requireSha = (value, code, label) => {
  if (!SHA256.test(value ?? "")) fail(code, `${label} hash invalid`);
};
const requireUuid = (value, code, label) => {
  if (!UUID.test(value ?? "")) fail(code, `${label} UUID invalid`);
};
const requireSqlInteger = (value, code, label) => {
  if (
    !Number.isSafeInteger(value) ||
    value < SQL_INTEGER_MIN ||
    value > SQL_INTEGER_MAX
  ) {
    fail(code, `${label} SQL integer invalid`);
  }
};

export function computeUErrandrecordsTargetScopeSha256(binding) {
  exactKeys(
    binding,
    ["tenantIdentitySha256", "parkIdentitySha256"],
    "U_ERRANDRECORDS_SCOPE_INVALID",
    "scope identity",
  );
  requireSha(binding.tenantIdentitySha256, "U_ERRANDRECORDS_SCOPE_INVALID", "tenant identity");
  requireSha(binding.parkIdentitySha256, "U_ERRANDRECORDS_SCOPE_INVALID", "park identity");
  return hash(
    canonicalJson({
      family: "u_errandrecords",
      tenantIdentitySha256: binding.tenantIdentitySha256,
      parkIdentitySha256: binding.parkIdentitySha256,
    }),
  );
}

function validateScopeBinding(binding) {
  exactKeys(
    binding,
    ["tenantIdentitySha256", "parkIdentitySha256", "targetScopeSha256"],
    "U_ERRANDRECORDS_SCOPE_INVALID",
    "scope binding",
  );
  const expected = computeUErrandrecordsTargetScopeSha256({
    tenantIdentitySha256: binding.tenantIdentitySha256,
    parkIdentitySha256: binding.parkIdentitySha256,
  });
  requireSha(binding.targetScopeSha256, "U_ERRANDRECORDS_SCOPE_INVALID", "target scope");
  if (binding.targetScopeSha256 !== expected) {
    fail("U_ERRANDRECORDS_SCOPE_INVALID", "target scope identity differs");
  }
  return structuredClone(binding);
}

function validateTimePolicy(policy) {
  exactKeys(
    policy,
    [
      "sourceSqlType",
      "sourceTimezone",
      "sourceUtcOffsetMinutes",
      "minutePrecision",
      "reviewStatus",
      "reviewedDecisionSha256",
    ],
    "U_ERRANDRECORDS_TIME_POLICY_INVALID",
    "time policy",
  );
  if (
    policy.sourceSqlType !== "smalldatetime" ||
    policy.sourceTimezone !== "Asia/Shanghai" ||
    policy.sourceUtcOffsetMinutes !== 480 ||
    policy.minutePrecision !== true ||
    policy.reviewStatus !== "reviewed"
  ) {
    fail("U_ERRANDRECORDS_TIME_POLICY_INVALID", "reviewed Asia/Shanghai minute policy required");
  }
  requireSha(
    policy.reviewedDecisionSha256,
    "U_ERRANDRECORDS_TIME_POLICY_INVALID",
    "reviewed time decision",
  );
  return structuredClone(policy);
}

function bindingIndex(rows, kind, targetScopeSha256) {
  if (!Array.isArray(rows)) fail("U_ERRANDRECORDS_BINDING_INVALID", `${kind} bindings must be an array`);
  const index = new Map();
  for (const [position, row] of rows.entries()) {
    if (kind === "employee") {
      exactKeys(
        row,
        ["sourceIdentitySha256", "targetEmployeeId", "targetPrimaryOrgId", "targetScopeSha256"],
        "U_ERRANDRECORDS_BINDING_INVALID",
        `employee binding[${position}]`,
      );
      requireUuid(row.targetEmployeeId, "U_ERRANDRECORDS_BINDING_INVALID", "target employee");
      requireUuid(row.targetPrimaryOrgId, "U_ERRANDRECORDS_BINDING_INVALID", "employee primary organization");
    } else {
      exactKeys(
        row,
        ["sourceIdentitySha256", "targetOrgId", "targetScopeSha256"],
        "U_ERRANDRECORDS_BINDING_INVALID",
        `organization binding[${position}]`,
      );
      requireUuid(row.targetOrgId, "U_ERRANDRECORDS_BINDING_INVALID", "target organization");
    }
    requireSha(row.sourceIdentitySha256, "U_ERRANDRECORDS_BINDING_INVALID", `${kind} source identity`);
    if (row.targetScopeSha256 !== targetScopeSha256 || index.has(row.sourceIdentitySha256)) {
      fail("U_ERRANDRECORDS_BINDING_INVALID", `${kind} scope or uniqueness differs`);
    }
    index.set(row.sourceIdentitySha256, structuredClone(row));
  }
  return index;
}

function sourceIdentity(sourceCatalogSha256, legacySourceId) {
  return hash(
    canonicalJson({
      sourceCatalogSha256,
      sourceTable: SOURCE_TABLE,
      legacySourceId,
    }),
  );
}

function businessIdentity(scopeBinding, sourceIdentitySha256) {
  return hash(
    canonicalJson({
      tenantIdentitySha256: scopeBinding.tenantIdentitySha256,
      parkIdentitySha256: scopeBinding.parkIdentitySha256,
      sourceIdentitySha256,
    }),
  );
}

function localMinuteToInstant(value, offsetMinutes) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/u.test(value ?? "")) {
    fail("U_ERRANDRECORDS_SOURCE_ROW_INVALID", "local smalldatetime minute invalid");
  }
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  const instant = new Date(`${value}${offset}`);
  if (!Number.isFinite(instant.getTime())) {
    fail("U_ERRANDRECORDS_SOURCE_ROW_INVALID", "local smalldatetime instant invalid");
  }
  const roundTrip = new Date(instant.getTime() + offsetMinutes * 60_000)
    .toISOString()
    .slice(0, 19);
  if (roundTrip !== value) {
    fail("U_ERRANDRECORDS_SOURCE_ROW_INVALID", "local smalldatetime calendar value invalid");
  }
  return instant;
}

function validateSourceRow(row, position) {
  exactKeys(
    row,
    [
      "legacySourceId",
      "sourceRowSha256",
      "joinStatus",
      "employeeSourceIdentitySha256",
      "departmentSourceIdentitySha256",
      "startLocal",
      "endLocal",
      "legacyDeclaredDays",
    ],
    "U_ERRANDRECORDS_SOURCE_ROW_INVALID",
    `source row[${position}]`,
  );
  requireSqlInteger(
    row.legacySourceId,
    "U_ERRANDRECORDS_SOURCE_ROW_INVALID",
    `source row[${position}].legacySourceId`,
  );
  requireSha(
    row.sourceRowSha256,
    "U_ERRANDRECORDS_SOURCE_ROW_INVALID",
    `source row[${position}].sourceRowSha256`,
  );
  if (!JOIN_STATUSES.has(row.joinStatus)) {
    fail("U_ERRANDRECORDS_SOURCE_ROW_INVALID", `source row[${position}].joinStatus`);
  }
  if (row.joinStatus !== "matched") {
    for (const field of [
      "employeeSourceIdentitySha256",
      "departmentSourceIdentitySha256",
      "startLocal",
      "endLocal",
      "legacyDeclaredDays",
    ]) {
      if (row[field] !== null) {
        fail("U_ERRANDRECORDS_PRIVACY_BOUNDARY_INVALID", `quarantine ${field} must be omitted`);
      }
    }
    return structuredClone(row);
  }
  requireSha(
    row.employeeSourceIdentitySha256,
    "U_ERRANDRECORDS_SOURCE_ROW_INVALID",
    `source row[${position}].employee identity`,
  );
  requireSha(
    row.departmentSourceIdentitySha256,
    "U_ERRANDRECORDS_SOURCE_ROW_INVALID",
    `source row[${position}].department identity`,
  );
  if (typeof row.startLocal !== "string" || typeof row.endLocal !== "string") {
    fail("U_ERRANDRECORDS_SOURCE_ROW_INVALID", `source row[${position}] time values`);
  }
  if (row.legacyDeclaredDays !== null) {
    requireSqlInteger(
      row.legacyDeclaredDays,
      "U_ERRANDRECORDS_SOURCE_ROW_INVALID",
      `source row[${position}].legacyDeclaredDays`,
    );
  }
  return structuredClone(row);
}

function targetRecord({ row, sourceReceipt, scopeBinding, timePolicy, employees, organizations }) {
  const sourceIdentitySha256 = sourceIdentity(
    sourceReceipt.sourceCatalogSha256,
    row.legacySourceId,
  );
  const base = {
    sourceSystem: SOURCE_SYSTEM,
    sourceTable: SOURCE_TABLE,
    sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
    legacySourceId: row.legacySourceId,
    sourceIdentitySha256,
    sourceRowSha256: row.sourceRowSha256,
    businessIdentitySha256: businessIdentity(scopeBinding, sourceIdentitySha256),
    targetTable: TARGET_TABLE,
  };
  if (row.joinStatus !== "matched") {
    return {
      ...base,
      dependencyMode: "none",
      dependencyRefs: [],
      disposition: "quarantine",
      quarantineReason:
        row.joinStatus === "missing_person"
          ? "SOURCE_PERSON_INNER_JOIN_MISSING"
          : "SOURCE_DEPARTMENT_INNER_JOIN_MISSING",
    };
  }
  const employee = employees.get(row.employeeSourceIdentitySha256);
  const organization = organizations.get(row.departmentSourceIdentitySha256);
  if (!employee || !organization) {
    fail("U_ERRANDRECORDS_BINDING_MISSING", "matched source dependency is not mapped");
  }
  if (employee.targetPrimaryOrgId !== organization.targetOrgId) {
    fail("U_ERRANDRECORDS_ORGANIZATION_CONFLICT", "employee primary organization differs from source department mapping");
  }
  const startAt = localMinuteToInstant(row.startLocal, timePolicy.sourceUtcOffsetMinutes);
  const endAt = localMinuteToInstant(row.endLocal, timePolicy.sourceUtcOffsetMinutes);
  const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
  if (
    !Number.isSafeInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > 44_640
  ) {
    fail("U_ERRANDRECORDS_DURATION_UNSUPPORTED", "target duration constraint would reject source row");
  }
  return {
    ...base,
    dependencyMode: "employee_and_primary_organization",
    dependencyRefs: [
      {
        role: "employee",
        phase: "T0",
        expectedTargetTable: "hr_employee",
        sourceIdentitySha256: row.employeeSourceIdentitySha256,
        targetId: employee.targetEmployeeId,
      },
      {
        role: "organization",
        phase: "T0",
        expectedTargetTable: "sys_org",
        sourceIdentitySha256: row.departmentSourceIdentitySha256,
        targetId: organization.targetOrgId,
      },
    ],
    disposition: "insert",
    payload: {
      request_no: `YUZ-BT-${sourceIdentitySha256.slice(0, 24).toUpperCase()}`,
      employee_id: employee.targetEmployeeId,
      request_type: "business_trip",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      attendance_date: null,
      duration_minutes: durationMinutes,
      reason: "Yuzhou V10 historical business trip",
      status: "approved",
      approval_request_id: null,
      is_historical_import: true,
      legacy_source_table: SOURCE_TABLE,
      legacy_source_id: row.legacySourceId,
      legacy_declared_days: row.legacyDeclaredDays,
      legacy_source_identity_sha256: sourceIdentitySha256,
      legacy_source_row_sha256: row.sourceRowSha256,
    },
  };
}

function stageCounts(records) {
  return {
    sourceTotalRows: records.length,
    insertRows: records.filter((record) => record.disposition === "insert").length,
    quarantineRows: records.filter((record) => record.disposition === "quarantine").length,
    missingPersonRows: records.filter(
      (record) => record.quarantineReason === "SOURCE_PERSON_INNER_JOIN_MISSING",
    ).length,
    missingDepartmentRows: records.filter(
      (record) => record.quarantineReason === "SOURCE_DEPARTMENT_INNER_JOIN_MISSING",
    ).length,
  };
}

function validateCounts(counts, sourceReceipt) {
  exactKeys(
    counts,
    [
      "sourceTotalRows",
      "insertRows",
      "quarantineRows",
      "missingPersonRows",
      "missingDepartmentRows",
    ],
    "U_ERRANDRECORDS_CONSERVATION_INVALID",
    "stage counts",
  );
  const expected = sourceReceipt.sourceObject;
  if (
    counts.sourceTotalRows !== expected.totalRows ||
    counts.insertRows !== expected.matchedInnerJoinRows ||
    counts.quarantineRows !== expected.omittedInnerJoinRows ||
    counts.missingPersonRows !== expected.missingPersonRows ||
    counts.missingDepartmentRows !== expected.missingDepartmentRows ||
    counts.insertRows + counts.quarantineRows !== counts.sourceTotalRows
  ) {
    fail("U_ERRANDRECORDS_CONSERVATION_INVALID", "source receipt and stage counts differ");
  }
}

export function validateUErrandrecordsPrivateStage(stage) {
  exactKeys(
    stage,
    [...STAGE_BODY_KEYS, "canonicalSha256"],
    "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID",
    "private stage",
  );
  const { canonicalSha256, ...body } = stage;
  exactKeys(body, STAGE_BODY_KEYS, "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", "private stage body");
  if (
    body.formatVersion !== 1 ||
    body.artifactKind !== "yuzhou_hr_u_errandrecords_private_stage" ||
    body.phase !== "T3" ||
    !CODE_SHA.test(body.codeSha ?? "") ||
    body.operationMode !== "private_stage_only_no_write" ||
    body.productionImport !== "HOLD" ||
    !Array.isArray(body.records)
  ) {
    fail("U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", "stage identity or HOLD boundary");
  }
  for (const field of [
    "sourceReceiptSha256",
    "sourceCatalogSha256",
    "mappingContractSha256",
  ]) {
    requireSha(body[field], "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", field);
  }
  validateScopeBinding(body.scopeBinding);
  validateTimePolicy(body.timePolicy);
  const stageSourceIds = new Set();
  const stageSourceIdentities = new Set();
  for (const [position, record] of body.records.entries()) {
    if (!object(record) || !["insert", "quarantine"].includes(record.disposition)) {
      fail("U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}] invalid`);
    }
    const recordKeys = record.disposition === "insert"
      ? ["sourceSystem", "sourceTable", "sourcePkCanonical", "legacySourceId", "sourceIdentitySha256", "sourceRowSha256", "businessIdentitySha256", "targetTable", "dependencyMode", "dependencyRefs", "disposition", "payload"]
      : ["sourceSystem", "sourceTable", "sourcePkCanonical", "legacySourceId", "sourceIdentitySha256", "sourceRowSha256", "businessIdentitySha256", "targetTable", "dependencyMode", "dependencyRefs", "disposition", "quarantineReason"];
    exactKeys(record, recordKeys, "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}]`);
    requireSqlInteger(record.legacySourceId, "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}].legacySourceId`);
    for (const field of ["sourceIdentitySha256", "sourceRowSha256", "businessIdentitySha256"]) {
      requireSha(record[field], "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}].${field}`);
    }
    const expectedSourceIdentity = sourceIdentity(body.sourceCatalogSha256, record.legacySourceId);
    const expectedBusinessIdentity = businessIdentity(body.scopeBinding, expectedSourceIdentity);
    if (stageSourceIds.has(record.legacySourceId) || stageSourceIdentities.has(record.sourceIdentitySha256)) {
      fail("U_ERRANDRECORDS_SOURCE_ID_CONFLICT", `record[${position}] source identity duplicate`);
    }
    stageSourceIds.add(record.legacySourceId);
    stageSourceIdentities.add(record.sourceIdentitySha256);
    if (
      record.sourceSystem !== SOURCE_SYSTEM ||
      record.sourceTable !== SOURCE_TABLE ||
      record.sourceIdentitySha256 !== expectedSourceIdentity ||
      record.sourcePkCanonical !== `sha256:${expectedSourceIdentity}` ||
      record.businessIdentitySha256 !== expectedBusinessIdentity ||
      record.targetTable !== TARGET_TABLE
    ) {
      fail("U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}] identity differs`);
    }
    if (record.disposition === "insert") {
      const payload = record.payload;
      exactKeys(
        payload,
        ["request_no", "employee_id", "request_type", "start_at", "end_at", "attendance_date", "duration_minutes", "reason", "status", "approval_request_id", "is_historical_import", "legacy_source_table", "legacy_source_id", "legacy_declared_days", "legacy_source_identity_sha256", "legacy_source_row_sha256"],
        "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID",
        `record[${position}].payload`,
      );
      requireUuid(payload.employee_id, "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}].employee_id`);
      if (
        record.dependencyMode !== "employee_and_primary_organization" ||
        !Array.isArray(record.dependencyRefs) ||
        record.dependencyRefs.length !== 2
      ) {
        fail("U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}] dependency shape differs`);
      }
      for (const [dependencyPosition, dependency] of record.dependencyRefs.entries()) {
        exactKeys(
          dependency,
          ["role", "phase", "expectedTargetTable", "sourceIdentitySha256", "targetId"],
          "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID",
          `record[${position}].dependencyRefs[${dependencyPosition}]`,
        );
        requireSha(dependency.sourceIdentitySha256, "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}] dependency source`);
        requireUuid(dependency.targetId, "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}] dependency target`);
      }
      const startAt = new Date(payload.start_at);
      const endAt = new Date(payload.end_at);
      const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
      if (
        record.dependencyRefs[0]?.role !== "employee" ||
        record.dependencyRefs[0]?.phase !== "T0" ||
        record.dependencyRefs[0]?.expectedTargetTable !== "hr_employee" ||
        record.dependencyRefs[0]?.targetId !== payload.employee_id ||
        record.dependencyRefs[1]?.role !== "organization" ||
        record.dependencyRefs[1]?.phase !== "T0" ||
        record.dependencyRefs[1]?.expectedTargetTable !== "sys_org" ||
        !UUID.test(record.dependencyRefs[1]?.targetId ?? "") ||
        payload.request_no !== `YUZ-BT-${record.sourceIdentitySha256.slice(0, 24).toUpperCase()}` ||
        payload.request_type !== "business_trip" ||
        typeof payload.start_at !== "string" ||
        typeof payload.end_at !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/u.test(payload.start_at) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/u.test(payload.end_at) ||
        !Number.isSafeInteger(durationMinutes) ||
        durationMinutes <= 0 ||
        durationMinutes > 44_640 ||
        payload.duration_minutes !== durationMinutes ||
        payload.attendance_date !== null ||
        payload.reason !== "Yuzhou V10 historical business trip" ||
        payload.status !== "approved" ||
        payload.approval_request_id !== null ||
        payload.is_historical_import !== true ||
        payload.legacy_source_table !== SOURCE_TABLE ||
        payload.legacy_source_id !== record.legacySourceId ||
        (payload.legacy_declared_days !== null && (!Number.isSafeInteger(payload.legacy_declared_days) || payload.legacy_declared_days < SQL_INTEGER_MIN || payload.legacy_declared_days > SQL_INTEGER_MAX)) ||
        payload.legacy_source_identity_sha256 !== record.sourceIdentitySha256 ||
        payload.legacy_source_row_sha256 !== record.sourceRowSha256
      ) {
        fail("U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}] payload binding differs`);
      }
    } else if (
      record.dependencyMode !== "none" ||
      !Array.isArray(record.dependencyRefs) ||
      record.dependencyRefs.length !== 0 ||
      Object.hasOwn(record, "payload") ||
      !["SOURCE_PERSON_INNER_JOIN_MISSING", "SOURCE_DEPARTMENT_INNER_JOIN_MISSING"].includes(record.quarantineReason)
    ) {
      fail("U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", `record[${position}] quarantine shape differs`);
    }
  }
  const calculatedCounts = stageCounts(body.records);
  if (canonicalJson(calculatedCounts) !== canonicalJson(body.counts)) {
    fail("U_ERRANDRECORDS_CONSERVATION_INVALID", "stage record counts differ");
  }
  if (canonicalSha256 !== hash(canonicalJson(body))) {
    fail("U_ERRANDRECORDS_PRIVATE_STAGE_HASH_MISMATCH", "canonical stage hash");
  }
  return stage;
}

export function createUErrandrecordsPrivateStage(input) {
  exactKeys(
    input,
    [
      "codeSha",
      "sourceReceipt",
      "sourceReceiptSha256",
      "mappingContractSha256",
      "scopeBinding",
      "timePolicy",
      "employeeBindings",
      "organizationBindings",
      "records",
    ],
    "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID",
    "adapter input",
  );
  if (!CODE_SHA.test(input.codeSha ?? "")) {
    fail("U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", "code SHA invalid");
  }
  const sourceReceipt = validateUErrandrecordsSourceReceipt(input.sourceReceipt);
  requireSha(input.sourceReceiptSha256, "U_ERRANDRECORDS_PRIVATE_STAGE_INVALID", "source receipt file");
  if (
    hash(canonicalFile(sourceReceipt)) !== input.sourceReceiptSha256 ||
    input.mappingContractSha256 !== sourceReceipt.mappingContractSha256
  ) {
    fail("U_ERRANDRECORDS_SOURCE_BINDING_INVALID", "source receipt or mapping binding differs");
  }
  const scopeBinding = validateScopeBinding(input.scopeBinding);
  const timePolicy = validateTimePolicy(input.timePolicy);
  if (!Array.isArray(input.records)) {
    fail("U_ERRANDRECORDS_SOURCE_ROW_INVALID", "records must be an array");
  }
  const employees = bindingIndex(
    input.employeeBindings,
    "employee",
    scopeBinding.targetScopeSha256,
  );
  const organizations = bindingIndex(
    input.organizationBindings,
    "organization",
    scopeBinding.targetScopeSha256,
  );
  const sourceIds = new Set();
  const records = input.records.map((candidate, position) => {
    const row = validateSourceRow(candidate, position);
    if (sourceIds.has(row.legacySourceId)) {
      fail("U_ERRANDRECORDS_SOURCE_ID_CONFLICT", "legacy source ID is not unique");
    }
    sourceIds.add(row.legacySourceId);
    return targetRecord({
      row,
      sourceReceipt,
      scopeBinding,
      timePolicy,
      employees,
      organizations,
    });
  });
  records.sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const counts = stageCounts(records);
  validateCounts(counts, sourceReceipt);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_u_errandrecords_private_stage",
    phase: "T3",
    codeSha: input.codeSha,
    sourceReceiptSha256: input.sourceReceiptSha256,
    sourceCatalogSha256: sourceReceipt.sourceCatalogSha256,
    mappingContractSha256: input.mappingContractSha256,
    scopeBinding,
    timePolicy,
    operationMode: "private_stage_only_no_write",
    counts,
    records,
    productionImport: "HOLD",
  };
  const privateStage = Object.freeze({ ...body, canonicalSha256: hash(canonicalJson(body)) });
  validateUErrandrecordsPrivateStage(privateStage);
  const receipt = Object.freeze({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_u_errandrecords_private_stage_receipt",
    phase: "T3",
    codeSha: input.codeSha,
    sourceReceiptSha256: input.sourceReceiptSha256,
    mappingContractSha256: input.mappingContractSha256,
    targetScopeSha256: scopeBinding.targetScopeSha256,
    privateStageSha256: privateStage.canonicalSha256,
    counts: structuredClone(counts),
    productionImport: "HOLD",
  });
  return Object.freeze({ privateStage, receipt });
}

export function writeUErrandrecordsPrivateStageFile(path, stage) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) {
    fail("U_ERRANDRECORDS_PRIVATE_STAGE_FILE_UNSAFE", "absolute private stage path required");
  }
  validateUErrandrecordsPrivateStage(stage);
  try {
    writeFileSync(path, canonicalFile(stage), { flag: "wx", mode: 0o600 });
  } catch (error) {
    fail(
      error?.code === "EEXIST"
        ? "U_ERRANDRECORDS_PRIVATE_STAGE_FILE_EXISTS"
        : "U_ERRANDRECORDS_PRIVATE_STAGE_FILE_UNSAFE",
      "private stage file was not created",
    );
  }
  chmodSync(path, 0o600);
  return { privateStageSha256: stage.canonicalSha256, productionImport: "HOLD" };
}

function validateExistingTarget(row, position) {
  exactKeys(
    row,
    [
      "targetId",
      "targetScopeSha256",
      "sourceTable",
      "legacySourceId",
      "sourceIdentitySha256",
      "sourceRowSha256",
      "isDeleted",
    ],
    "U_ERRANDRECORDS_PREWRITE_TARGET_INVALID",
    `existing target[${position}]`,
  );
  requireUuid(row.targetId, "U_ERRANDRECORDS_PREWRITE_TARGET_INVALID", "target ID");
  requireSha(row.targetScopeSha256, "U_ERRANDRECORDS_PREWRITE_TARGET_INVALID", "target scope");
  requireSqlInteger(row.legacySourceId, "U_ERRANDRECORDS_PREWRITE_TARGET_INVALID", "legacy source ID");
  requireSha(row.sourceIdentitySha256, "U_ERRANDRECORDS_PREWRITE_TARGET_INVALID", "source identity");
  requireSha(row.sourceRowSha256, "U_ERRANDRECORDS_PREWRITE_TARGET_INVALID", "source row");
  if (row.sourceTable !== SOURCE_TABLE || typeof row.isDeleted !== "boolean") {
    fail("U_ERRANDRECORDS_PREWRITE_TARGET_INVALID", `existing target[${position}] identity`);
  }
  return structuredClone(row);
}

export function validateUErrandrecordsPrewritePlan(plan) {
  exactKeys(
    plan,
    ["formatVersion", "artifactKind", "phase", "privateStageSha256", "targetScopeSha256", "operationMode", "counts", "actions", "productionImport", "canonicalSha256"],
    "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID",
    "prewrite plan",
  );
  if (
    plan.formatVersion !== 1 ||
    plan.artifactKind !== "yuzhou_hr_u_errandrecords_prewrite_plan" ||
    plan.phase !== "T3" ||
    plan.operationMode !== "prewrite_plan_only_no_database_connection" ||
    plan.productionImport !== "HOLD" ||
    !Array.isArray(plan.actions)
  ) {
    fail("U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", "plan identity or HOLD boundary");
  }
  requireSha(plan.privateStageSha256, "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", "private stage");
  requireSha(plan.targetScopeSha256, "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", "target scope");
  exactKeys(
    plan.counts,
    ["sourceTotalRows", "insertCount", "replayCount", "quarantineCount", "writeCount"],
    "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID",
    "prewrite counts",
  );
  for (const [key, value] of Object.entries(plan.counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail("U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `${key} count invalid`);
    }
  }
  const observed = { insert: 0, replay: 0, quarantine: 0 };
  const identities = new Set();
  for (const [position, action] of plan.actions.entries()) {
    if (!object(action) || !["insert", "replay", "quarantine"].includes(action.action)) {
      fail("U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `action[${position}] invalid`);
    }
    const keys = action.action === "insert"
      ? ["action", "sourceIdentitySha256", "sourceRowSha256", "businessIdentitySha256"]
      : action.action === "replay"
        ? ["action", "sourceIdentitySha256", "sourceRowSha256", "targetId"]
        : ["action", "sourceIdentitySha256", "sourceRowSha256", "reasonCode"];
    exactKeys(action, keys, "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `action[${position}]`);
    requireSha(action.sourceIdentitySha256, "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `action[${position}] source identity`);
    requireSha(action.sourceRowSha256, "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `action[${position}] source row`);
    if (identities.has(action.sourceIdentitySha256)) {
      fail("U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", "action source identity duplicate");
    }
    identities.add(action.sourceIdentitySha256);
    if (action.action === "insert") {
      requireSha(action.businessIdentitySha256, "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `action[${position}] business identity`);
    } else if (action.action === "replay") {
      requireUuid(action.targetId, "U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `action[${position}] replay target`);
    } else if (!["SOURCE_PERSON_INNER_JOIN_MISSING", "SOURCE_DEPARTMENT_INNER_JOIN_MISSING"].includes(action.reasonCode)) {
      fail("U_ERRANDRECORDS_PREWRITE_PLAN_INVALID", `action[${position}] quarantine reason`);
    }
    observed[action.action] += 1;
  }
  if (
    plan.actions.length !== plan.counts.sourceTotalRows ||
    observed.insert !== plan.counts.insertCount ||
    observed.replay !== plan.counts.replayCount ||
    observed.quarantine !== plan.counts.quarantineCount ||
    plan.counts.writeCount !== plan.counts.insertCount ||
    plan.counts.insertCount + plan.counts.replayCount + plan.counts.quarantineCount !== plan.counts.sourceTotalRows
  ) {
    fail("U_ERRANDRECORDS_PREWRITE_CONSERVATION_INVALID", "prewrite plan counts differ");
  }
  const { canonicalSha256, ...body } = plan;
  if (canonicalSha256 !== hash(canonicalJson(body))) {
    fail("U_ERRANDRECORDS_PREWRITE_PLAN_HASH_MISMATCH", "canonical prewrite plan hash");
  }
  return plan;
}

export function planUErrandrecordsPrewrite(stage, existingTargets) {
  validateUErrandrecordsPrivateStage(stage);
  if (!Array.isArray(existingTargets)) {
    fail("U_ERRANDRECORDS_PREWRITE_TARGET_INVALID", "existing targets must be an array");
  }
  const existing = existingTargets.map(validateExistingTarget);
  const actions = [];
  let insertCount = 0;
  let replayCount = 0;
  for (const record of stage.records) {
    if (record.disposition === "quarantine") {
      actions.push({
        action: "quarantine",
        sourceIdentitySha256: record.sourceIdentitySha256,
        sourceRowSha256: record.sourceRowSha256,
        reasonCode: record.quarantineReason,
      });
      continue;
    }
    const candidates = existing.filter(
      (target) =>
        target.sourceTable === SOURCE_TABLE &&
        (target.legacySourceId === record.legacySourceId ||
          target.sourceIdentitySha256 === record.sourceIdentitySha256),
    );
    if (candidates.length === 0) {
      insertCount += 1;
      actions.push({
        action: "insert",
        sourceIdentitySha256: record.sourceIdentitySha256,
        sourceRowSha256: record.sourceRowSha256,
        businessIdentitySha256: record.businessIdentitySha256,
      });
      continue;
    }
    if (candidates.length !== 1) {
      fail("U_ERRANDRECORDS_PREWRITE_CONFLICT", "source identity resolves to multiple targets");
    }
    const target = candidates[0];
    if (
      target.isDeleted ||
      target.targetScopeSha256 !== stage.scopeBinding.targetScopeSha256 ||
      target.legacySourceId !== record.legacySourceId ||
      target.sourceIdentitySha256 !== record.sourceIdentitySha256 ||
      target.sourceRowSha256 !== record.sourceRowSha256
    ) {
      fail("U_ERRANDRECORDS_PREWRITE_CONFLICT", "existing source ID, scope, identity, or row hash differs");
    }
    replayCount += 1;
    actions.push({
      action: "replay",
      sourceIdentitySha256: record.sourceIdentitySha256,
      sourceRowSha256: record.sourceRowSha256,
      targetId: target.targetId,
    });
  }
  const quarantineCount = actions.filter((action) => action.action === "quarantine").length;
  if (
    insertCount + replayCount !== stage.counts.insertRows ||
    insertCount + replayCount + quarantineCount !== stage.counts.sourceTotalRows
  ) {
    fail("U_ERRANDRECORDS_PREWRITE_CONSERVATION_INVALID", "prewrite decisions do not conserve source rows");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_u_errandrecords_prewrite_plan",
    phase: "T3",
    privateStageSha256: stage.canonicalSha256,
    targetScopeSha256: stage.scopeBinding.targetScopeSha256,
    operationMode: "prewrite_plan_only_no_database_connection",
    counts: {
      sourceTotalRows: stage.counts.sourceTotalRows,
      insertCount,
      replayCount,
      quarantineCount,
      writeCount: insertCount,
    },
    actions,
    productionImport: "HOLD",
  };
  const plan = Object.freeze({ ...body, canonicalSha256: hash(canonicalJson(body)) });
  validateUErrandrecordsPrewritePlan(plan);
  return plan;
}
