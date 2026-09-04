/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  computeUErrandrecordsTargetScopeSha256,
  createUErrandrecordsPrivateStage,
  planUErrandrecordsPrewrite,
  UErrandrecordsPrivateStageError,
  validateUErrandrecordsPrivateStage,
  validateUErrandrecordsPrewritePlan,
  writeUErrandrecordsPrivateStageFile,
} from "../hr-cutover/u-errandrecords-private-stage.mjs";
import { sealUErrandrecordsSourceReceipt } from "../hr-cutover/u-errandrecords-source-receipt.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonicalFile = (value) => `${JSON.stringify(value, null, 2)}\n`;
const h = (label) => hash(`synthetic:${label}`);
const codeSha = "1".repeat(40);
const targetEmployeeId = "10000000-0000-4000-8000-000000000001";
const targetOrgId = "20000000-0000-4000-8000-000000000001";
const targetId = "30000000-0000-4000-8000-000000000001";

function sourceReceipt(overrides = {}) {
  return sealUErrandrecordsSourceReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_u_errandrecords_safe_source_receipt",
    sourceRestoreReceiptSha256: h("restore"),
    sourceCatalogSha256: h("catalog"),
    mappingContractSha256: h("mapping"),
    databaseIdentitySha256: h("database"),
    queryIdentitySha256: h("query"),
    operationMode: "read_only_aggregate",
    sourceObject: {
      schema: "dbo",
      table: "errand",
      totalRows: 3,
      matchedInnerJoinRows: 1,
      missingPersonRows: 1,
      missingDepartmentRows: 1,
      omittedInnerJoinRows: 2,
      ...overrides,
    },
    columns: {
      startdate: { sqlType: "smalldatetime", nullable: false },
      enddate: { sqlType: "smalldatetime", nullable: false },
      days: { sqlType: "int", nullable: true },
    },
    serverTimezone: {
      currentUtcOffsetMinutes: 480,
      metadataSource: "SYSDATETIMEOFFSET",
      interpretationStatus: "current_offset_only_requires_business_review",
    },
    sourceState: { readOnly: true },
    etlAuthority: {
      loginSucceeded: true,
      sysadmin: false,
      dbDatareader: true,
      viewDefinition: true,
      insert: false,
      update: false,
      delete: false,
      execute: false,
    },
    productionImport: "HOLD",
  });
}

function scopeBinding() {
  const identities = {
    tenantIdentitySha256: h("tenant"),
    parkIdentitySha256: h("park"),
  };
  return {
    ...identities,
    targetScopeSha256: computeUErrandrecordsTargetScopeSha256(identities),
  };
}

function timePolicy() {
  return {
    sourceSqlType: "smalldatetime",
    sourceTimezone: "Asia/Shanghai",
    sourceUtcOffsetMinutes: 480,
    minutePrecision: true,
    reviewStatus: "reviewed",
    reviewedDecisionSha256: h("time-decision"),
  };
}

function sourceRows() {
  return [
    {
      legacySourceId: 101,
      sourceRowSha256: h("row-101"),
      joinStatus: "matched",
      employeeSourceIdentitySha256: h("employee-source"),
      departmentSourceIdentitySha256: h("department-source"),
      startLocal: "2026-01-02T08:00:00",
      endLocal: "2026-01-02T17:00:00",
      legacyDeclaredDays: null,
    },
    {
      legacySourceId: 102,
      sourceRowSha256: h("row-102"),
      joinStatus: "missing_person",
      employeeSourceIdentitySha256: null,
      departmentSourceIdentitySha256: null,
      startLocal: null,
      endLocal: null,
      legacyDeclaredDays: null,
    },
    {
      legacySourceId: 103,
      sourceRowSha256: h("row-103"),
      joinStatus: "missing_department",
      employeeSourceIdentitySha256: null,
      departmentSourceIdentitySha256: null,
      startLocal: null,
      endLocal: null,
      legacyDeclaredDays: null,
    },
  ];
}

function adapterInput(overrides = {}) {
  const receipt = overrides.sourceReceipt ?? sourceReceipt();
  const scope = overrides.scopeBinding ?? scopeBinding();
  return {
    codeSha,
    sourceReceipt: receipt,
    sourceReceiptSha256: hash(canonicalFile(receipt)),
    mappingContractSha256: receipt.mappingContractSha256,
    scopeBinding: scope,
    timePolicy: timePolicy(),
    employeeBindings: [
      {
        sourceIdentitySha256: h("employee-source"),
        targetEmployeeId,
        targetPrimaryOrgId: targetOrgId,
        targetScopeSha256: scope.targetScopeSha256,
      },
    ],
    organizationBindings: [
      {
        sourceIdentitySha256: h("department-source"),
        targetOrgId,
        targetScopeSha256: scope.targetScopeSha256,
      },
    ],
    records: sourceRows(),
    ...overrides,
  };
}

test("private stage transforms one matched row, quarantines omissions, and conserves receipt counts", () => {
  const first = createUErrandrecordsPrivateStage(adapterInput());
  const second = createUErrandrecordsPrivateStage(adapterInput());
  assert.deepEqual(first, second);
  assert.equal(first.privateStage.productionImport, "HOLD");
  assert.deepEqual(first.privateStage.counts, {
    sourceTotalRows: 3,
    insertRows: 1,
    quarantineRows: 2,
    missingPersonRows: 1,
    missingDepartmentRows: 1,
  });
  const inserted = first.privateStage.records.find((record) => record.disposition === "insert");
  assert.equal(inserted.payload.start_at, "2026-01-02T00:00:00.000Z");
  assert.equal(inserted.payload.end_at, "2026-01-02T09:00:00.000Z");
  assert.equal(inserted.payload.duration_minutes, 540);
  assert.equal(inserted.payload.legacy_declared_days, null);
  assert.equal(inserted.payload.employee_id, targetEmployeeId);
  assert.equal(inserted.dependencyRefs[1].targetId, targetOrgId);
  assert.equal(inserted.payload.approval_request_id, null);
  assert.equal(inserted.payload.status, "approved");
  assert.deepEqual(validateUErrandrecordsPrivateStage(first.privateStage), first.privateStage);

  const serialized = JSON.stringify(first);
  for (const forbidden of [
    "employeeCode",
    "employeeName",
    "departmentName",
    "credential",
    "password",
    "rawSource",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "iu"));
  }
});

test("private stage file is exclusive 0600 and cannot be overwritten", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "u-errand-private-stage-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const stage = createUErrandrecordsPrivateStage(adapterInput()).privateStage;
  const path = resolve(directory, "stage.json");
  writeUErrandrecordsPrivateStageFile(path, stage);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).canonicalSha256, stage.canonicalSha256);
  assert.throws(
    () => writeUErrandrecordsPrivateStageFile(path, stage),
    /U_ERRANDRECORDS_PRIVATE_STAGE_FILE_EXISTS/u,
  );
});

test("adapter fails closed on count drift, duplicate source IDs, raw fields, and mapping drift", () => {
  const countDrift = adapterInput();
  countDrift.records = countDrift.records.slice(0, 2);
  assert.throws(
    () => createUErrandrecordsPrivateStage(countDrift),
    /U_ERRANDRECORDS_CONSERVATION_INVALID/u,
  );

  const duplicate = adapterInput();
  duplicate.records[2].legacySourceId = duplicate.records[1].legacySourceId;
  assert.throws(
    () => createUErrandrecordsPrivateStage(duplicate),
    /U_ERRANDRECORDS_SOURCE_ID_CONFLICT/u,
  );

  const rawField = adapterInput();
  rawField.records[0].employeeCode = "forbidden-synthetic";
  assert.throws(
    () => createUErrandrecordsPrivateStage(rawField),
    /U_ERRANDRECORDS_SOURCE_ROW_INVALID/u,
  );

  const mappingDrift = adapterInput();
  mappingDrift.mappingContractSha256 = h("other-mapping");
  assert.throws(
    () => createUErrandrecordsPrivateStage(mappingDrift),
    /U_ERRANDRECORDS_SOURCE_BINDING_INVALID/u,
  );
});

test("adapter rejects unreviewed timezone, invalid calendar minutes, and target duration overflow", () => {
  const unreviewed = adapterInput();
  unreviewed.timePolicy.reviewStatus = "pending";
  assert.throws(
    () => createUErrandrecordsPrivateStage(unreviewed),
    /U_ERRANDRECORDS_TIME_POLICY_INVALID/u,
  );

  const invalidCalendar = adapterInput();
  invalidCalendar.records[0].startLocal = "2026-02-30T08:00:00";
  assert.throws(
    () => createUErrandrecordsPrivateStage(invalidCalendar),
    /U_ERRANDRECORDS_SOURCE_ROW_INVALID/u,
  );

  const overflow = adapterInput();
  overflow.records[0].endLocal = "2026-03-02T08:01:00";
  assert.throws(
    () => createUErrandrecordsPrivateStage(overflow),
    /U_ERRANDRECORDS_DURATION_UNSUPPORTED/u,
  );
});

test("scope and organization mappings are exact and ambiguous bindings fail closed", () => {
  const wrongScope = adapterInput();
  wrongScope.employeeBindings[0].targetScopeSha256 = h("other-scope");
  assert.throws(
    () => createUErrandrecordsPrivateStage(wrongScope),
    /U_ERRANDRECORDS_BINDING_INVALID/u,
  );

  const orgConflict = adapterInput();
  orgConflict.organizationBindings[0].targetOrgId = "20000000-0000-4000-8000-000000000002";
  assert.throws(
    () => createUErrandrecordsPrivateStage(orgConflict),
    /U_ERRANDRECORDS_ORGANIZATION_CONFLICT/u,
  );

  const duplicateEmployee = adapterInput();
  duplicateEmployee.employeeBindings.push(structuredClone(duplicateEmployee.employeeBindings[0]));
  assert.throws(
    () => createUErrandrecordsPrivateStage(duplicateEmployee),
    /U_ERRANDRECORDS_BINDING_INVALID/u,
  );
});

test("prewrite plan is deterministic, replays exact rows, and never counts replay as a write", () => {
  const stage = createUErrandrecordsPrivateStage(adapterInput()).privateStage;
  const inserted = stage.records.find((record) => record.disposition === "insert");
  const emptyPlan = planUErrandrecordsPrewrite(stage, []);
  assert.deepEqual(emptyPlan.counts, {
    sourceTotalRows: 3,
    insertCount: 1,
    replayCount: 0,
    quarantineCount: 2,
    writeCount: 1,
  });
  const existing = [
    {
      targetId,
      targetScopeSha256: stage.scopeBinding.targetScopeSha256,
      sourceTable: "dbo.errand",
      legacySourceId: inserted.legacySourceId,
      sourceIdentitySha256: inserted.sourceIdentitySha256,
      sourceRowSha256: inserted.sourceRowSha256,
      isDeleted: false,
    },
  ];
  const replay = planUErrandrecordsPrewrite(stage, existing);
  assert.deepEqual(replay, planUErrandrecordsPrewrite(stage, existing));
  assert.equal(replay.counts.insertCount, 0);
  assert.equal(replay.counts.replayCount, 1);
  assert.equal(replay.counts.writeCount, 0);
  assert.equal(replay.actions.find((action) => action.action === "replay").targetId, targetId);
  assert.deepEqual(validateUErrandrecordsPrewritePlan(replay), replay);

  const forged = structuredClone(replay);
  forged.counts.writeCount = 1;
  assert.throws(
    () => validateUErrandrecordsPrewritePlan(forged),
    /U_ERRANDRECORDS_PREWRITE_CONSERVATION_INVALID/u,
  );
});

test("prewrite rejects row-hash drift, identity conflict, soft-deleted matches, and duplicate targets", () => {
  const stage = createUErrandrecordsPrivateStage(adapterInput()).privateStage;
  const inserted = stage.records.find((record) => record.disposition === "insert");
  const existing = {
    targetId,
    targetScopeSha256: stage.scopeBinding.targetScopeSha256,
    sourceTable: "dbo.errand",
    legacySourceId: inserted.legacySourceId,
    sourceIdentitySha256: inserted.sourceIdentitySha256,
    sourceRowSha256: inserted.sourceRowSha256,
    isDeleted: false,
  };
  for (const mutate of [
    (row) => { row.sourceRowSha256 = h("drifted-row"); },
    (row) => { row.sourceIdentitySha256 = h("conflicting-identity"); },
    (row) => { row.isDeleted = true; },
  ]) {
    const row = structuredClone(existing);
    mutate(row);
    assert.throws(
      () => planUErrandrecordsPrewrite(stage, [row]),
      UErrandrecordsPrivateStageError,
    );
  }
  assert.throws(
    () => planUErrandrecordsPrewrite(stage, [existing, { ...existing, targetId: "30000000-0000-4000-8000-000000000002" }]),
    /U_ERRANDRECORDS_PREWRITE_CONFLICT/u,
  );
});

test("checked-in contract keeps real extraction, rehearsal, and production on HOLD", () => {
  const root = resolve(import.meta.dirname, "../..");
  const contract = JSON.parse(
    readFileSync(
      resolve(root, "scripts/hr-cutover/contracts/legacy-u-errandrecords-private-stage-v1.json"),
      "utf8",
    ),
  );
  assert.equal(contract.canonicalFamily, "u_errandrecords");
  assert.equal(contract.privacyBoundary.rawSourceRowForbidden, true);
  assert.equal(contract.timePolicy.sourceReceiptCurrentOffsetIsNotHistoricalInterpretationProof, true);
  assert.equal(contract.idempotency.sameIdentityAndDifferentRowHash, "conflict");
  assert.equal(contract.conservation.insertPlusReplayPlusQuarantineMustEqualSourceTotalRows, true);
  assert.equal(contract.execution.realSourceExtraction, "pending");
  assert.equal(contract.execution.scopedRehearsal, "pending");
  assert.equal(contract.execution.productionImport, "HOLD");

  const adapter = readFileSync(
    resolve(root, "scripts/hr-cutover/u-errandrecords-private-stage.mjs"),
    "utf8",
  );
  assert.doesNotMatch(adapter, /node:child_process|\bpg\b|\bpsql\b|\bdocker\b/iu);
});
