#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  capturePerformancePersonAssessmentSourceAdapter,
  PERFORMANCE_PERSON_ASSESSMENT_FIELD_CATALOG_SQL,
  PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL,
  PERFORMANCE_PERSON_ASSESSMENT_SAFE_AGGREGATE_SQL,
  PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_SQL,
  PerformancePersonAssessmentSourceAdapterError,
  validatePerformancePersonAssessmentPrivateLabPayload,
  validatePerformancePersonAssessmentSafeSourceReceipt,
} from "../hr-cutover/performance-person-assessment-source-adapter.mjs";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-assessment-source-adapter-v1.json");
const sha = value => createHash("sha256").update(value).digest("hex");
const fixedSha = character => character.repeat(64);
const databaseAlias = "YuzhouHR_Lab_adapter01";

function authority(overrides = {}) {
  return {
    loginSucceeded: true,
    sysadmin: false,
    dbDatareader: true,
    viewDefinition: true,
    insert: false,
    update: false,
    delete: false,
    execute: false,
    ...overrides,
  };
}

function catalog() {
  return [
    { table: "person", column: "person", sqlType: "varchar", maxLength: 10, precision: 0, scale: 0, nullable: false, computed: false },
    { table: "person", column: "assessment", sqlType: "int", maxLength: 4, precision: 10, scale: 0, nullable: true, computed: false },
    { table: "assessmentcode", column: "assessment", sqlType: "int", maxLength: 4, precision: 10, scale: 0, nullable: false, computed: false },
  ];
}

function aggregate(overrides = {}) {
  return {
    totalAssessmentCodeRows: 4,
    distinctAssessmentKeys: 3,
    duplicateAssessmentKeyGroups: 1,
    duplicateAssessmentRows: 2,
    totalPersonRows: 9,
    distinctSafeIdentityCount: 4,
    identityNormalizationCollisionGroups: 1,
    identityDuplicateGroups: 0,
    identityNullRows: 1,
    identityBlankRows: 1,
    identityNonAsciiRows: 1,
    identityNormalizationCollisionRows: 2,
    identityDuplicateRows: 0,
    assessmentNotApplicableRows: 1,
    assessmentUnmatchedRows: 1,
    assessmentResolvedRows: 1,
    assessmentAmbiguousRows: 1,
    loadableRows: 3,
    quarantinedRows: 6,
    ...overrides,
  };
}

function privateRows() {
  return [
    { sourcePersonIdentitySha256: fixedSha("1"), sourceAssessmentId: null },
    { sourcePersonIdentitySha256: fixedSha("2"), sourceAssessmentId: 7 },
    { sourcePersonIdentitySha256: fixedSha("3"), sourceAssessmentId: 99 },
  ];
}

function createCase({ aggregateFacts = aggregate(), sourceAuthority = authority(), rows = privateRows() } = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-person-assessment-adapter-"));
  chmodSync(sandbox, 0o700);
  const receiptPath = join(sandbox, "source-restore-receipt.json");
  const sourceReceipt = sealSourceRestoreReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_source_restore_receipt",
    sourceSnapshotSha256: fixedSha("a"),
    backup: { sha256: fixedSha("a"), bytes: 1, containerCopySha256: fixedSha("a"), containerCopyBytes: 1 },
    identities: {
      containerSha256: fixedSha("b"), imageSha256: fixedSha("c"),
      databaseSha256: sha(databaseAlias), restoreSha256: fixedSha("d"), catalogSha256: fixedSha("e"),
    },
    state: { online: true, readOnly: true },
    etlAuthority: authority(),
    productionImport: "HOLD",
  });
  writeFileSync(receiptPath, `${JSON.stringify(sourceReceipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(receiptPath, 0o600);
  const sourceRestoreReceiptSha256 = sha(readFileSync(receiptPath));
  const privatePayloadPath = join(sandbox, "private-lab-payload.json");
  const safeReceiptPath = join(sandbox, "safe-receipt.json");
  const input = {
    repositoryRoot: root,
    contractPath,
    sourceRestoreReceiptPath: receiptPath,
    sourceRestoreReceiptSha256,
    sourceContainer: "fixture-sqlserver",
    databaseAlias,
    privatePayloadPath,
    safeReceiptPath,
  };
  const probe = {
    inspect: () => ({
      state: {
        personTableExists: true,
        assessmentcodeTableExists: true,
        databaseReadOnly: true,
        databaseIdentity: databaseAlias,
        authority: sourceAuthority,
        containerIdentitySha256: fixedSha("b"),
        imageIdentitySha256: fixedSha("c"),
        healthy: true,
        project: "jinhu_yuzhou_migration_lab",
      },
      catalog: catalog(),
      aggregate: aggregateFacts,
      privateRows: rows,
    }),
  };
  return { sandbox, input, probe, privatePayloadPath, safeReceiptPath };
}

const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof PerformancePersonAssessmentSourceAdapterError && error.code === code,
);

test("fixed SQL Server probes are read-only and keep source row values out of the safe receipt surface", () => {
  for (const sql of [
    PERFORMANCE_PERSON_ASSESSMENT_SOURCE_STATE_SQL,
    PERFORMANCE_PERSON_ASSESSMENT_FIELD_CATALOG_SQL,
    PERFORMANCE_PERSON_ASSESSMENT_SAFE_AGGREGATE_SQL,
    PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL,
  ]) {
    assert.doesNotMatch(sql, /(?:^|[;\n]\s*)(?:INSERT|UPDATE|DELETE|MERGE|EXEC(?:UTE)?|ALTER|DROP|CREATE)\b/iu);
  }
  assert.match(PERFORMANCE_PERSON_ASSESSMENT_SAFE_AGGREGATE_SQL, /identity_normalization_collision/u);
  assert.match(PERFORMANCE_PERSON_ASSESSMENT_SAFE_AGGREGATE_SQL, /assessment_ambiguous/u);
  assert.match(PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL, /HASHBYTES\('SHA2_256'/u);
  assert.doesNotMatch(PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_SQL, /source_person\.person\s*(?:,|FROM)/iu);
});

test("capture binds restore, database and catalog identities while stdout result remains counts and hashes only", () => {
  const fixture = createCase();
  const result = capturePerformancePersonAssessmentSourceAdapter(fixture.input, { probe: fixture.probe });
  assert.equal(result.status, "SOURCE_NORMALIZATION_COLLISION_QUARANTINED");
  assert.equal(result.productionImport, "HOLD");
  assert.deepEqual(Object.keys(result).sort(), ["privatePayloadSha256", "productionImport", "safeCounts", "safeReceiptSha256", "status"]);
  assert.equal(statSync(fixture.privatePayloadPath).mode & 0o777, 0o600);
  assert.equal(statSync(fixture.safeReceiptPath).mode & 0o777, 0o600);

  const payload = JSON.parse(readFileSync(fixture.privatePayloadPath, "utf8"));
  const receipt = JSON.parse(readFileSync(fixture.safeReceiptPath, "utf8"));
  assert.equal(validatePerformancePersonAssessmentPrivateLabPayload(payload), payload);
  assert.equal(validatePerformancePersonAssessmentSafeSourceReceipt(receipt), receipt);
  assert.deepEqual(payload.payload, { personAssessments: privateRows() });
  assert.equal(payload.rowCount, 3);
  assert.equal(payload.mode, "lab_rehearsal_only");
  assert.equal(payload.targetProcedure, "materialize_yuzhou_performance_ass_compute_weight_relation_lab");
  assert.equal(receipt.sourceBinding.sourceRestoreReceiptSha256, fixture.input.sourceRestoreReceiptSha256);
  assert.equal(receipt.sourceBinding.databaseIdentitySha256, sha(databaseAlias));
  assert.equal(receipt.sourceBinding.sourceCatalogSha256, fixedSha("e"));
  assert.equal(receipt.sourceBinding.containerIdentitySha256, fixedSha("b"));
  assert.equal(receipt.sourceBinding.imageIdentitySha256, fixedSha("c"));
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  const safeSerialized = JSON.stringify({ result, receipt });
  assert.equal(safeSerialized.includes('"sourceAssessmentId"'), false);
  assert.equal(safeSerialized.includes('"personAssessments"'), false);
});

test("null, unmatched, multiple matches and normalization collisions are disjoint and conserved", () => {
  const fixture = createCase();
  capturePerformancePersonAssessmentSourceAdapter(fixture.input, { probe: fixture.probe });
  const receipt = JSON.parse(readFileSync(fixture.safeReceiptPath, "utf8"));
  assert.deepEqual(receipt.safeCounts, aggregate());
  assert.equal(receipt.safeCounts.totalPersonRows, receipt.safeCounts.loadableRows + receipt.safeCounts.quarantinedRows);
  assert.equal(receipt.safeCounts.assessmentNotApplicableRows, 1);
  assert.equal(receipt.safeCounts.assessmentUnmatchedRows, 1);
  assert.equal(receipt.safeCounts.assessmentAmbiguousRows, 1);
  assert.equal(receipt.safeCounts.identityNormalizationCollisionRows, 2);
  assert.equal(receipt.captureCompleteness, "partial");
});

test("all-resolved population is ready only for lab input and still earns no compatibility credit", () => {
  const facts = aggregate({
    totalAssessmentCodeRows: 2,
    distinctAssessmentKeys: 2,
    duplicateAssessmentKeyGroups: 0,
    duplicateAssessmentRows: 0,
    totalPersonRows: 2,
    distinctSafeIdentityCount: 2,
    identityNormalizationCollisionGroups: 0,
    identityNullRows: 0,
    identityBlankRows: 0,
    identityNonAsciiRows: 0,
    identityNormalizationCollisionRows: 0,
    assessmentNotApplicableRows: 0,
    assessmentUnmatchedRows: 0,
    assessmentResolvedRows: 2,
    assessmentAmbiguousRows: 0,
    loadableRows: 2,
    quarantinedRows: 0,
  });
  const rows = privateRows().slice(1).map((row, index) => ({ ...row, sourceAssessmentId: index + 7 }));
  const fixture = createCase({ aggregateFacts: facts, rows });
  const result = capturePerformancePersonAssessmentSourceAdapter(fixture.input, { probe: fixture.probe });
  const receipt = JSON.parse(readFileSync(fixture.safeReceiptPath, "utf8"));
  assert.equal(result.status, "SOURCE_POPULATION_READY_FOR_LAB_INPUT");
  assert.equal(receipt.captureCompleteness, "complete");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
});

test("writable or elevated source authority fails before creating either artifact", () => {
  for (const unsafeAuthority of [authority({ sysadmin: true }), authority({ update: true }), authority({ dbDatareader: false })]) {
    const fixture = createCase({ sourceAuthority: unsafeAuthority });
    rejects("PERFORMANCE_PERSON_ASSESSMENT_AUTHORITY_INVALID", () => capturePerformancePersonAssessmentSourceAdapter(fixture.input, { probe: fixture.probe }));
    assert.equal(existsSync(fixture.privatePayloadPath), false);
    assert.equal(existsSync(fixture.safeReceiptPath), false);
  }
});

test("receipt drift, count drift and duplicate private relations fail closed", () => {
  const wrongReceipt = createCase();
  wrongReceipt.input.sourceRestoreReceiptSha256 = fixedSha("f");
  rejects("PERFORMANCE_PERSON_ASSESSMENT_SOURCE_RECEIPT_DRIFT", () => capturePerformancePersonAssessmentSourceAdapter(wrongReceipt.input, { probe: wrongReceipt.probe }));

  const badCounts = aggregate({ quarantinedRows: 5 });
  const conservation = createCase({ aggregateFacts: badCounts });
  rejects("PERFORMANCE_PERSON_ASSESSMENT_AGGREGATE_INVALID", () => capturePerformancePersonAssessmentSourceAdapter(conservation.input, { probe: conservation.probe }));

  const duplicateRows = [...privateRows(), privateRows()[0]];
  const duplicate = createCase({ aggregateFacts: aggregate({
    totalPersonRows: 10,
    distinctSafeIdentityCount: 5,
    assessmentResolvedRows: 2,
    loadableRows: 4,
    quarantinedRows: 6,
  }), rows: duplicateRows });
  rejects("PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_ROWS_INVALID", () => capturePerformancePersonAssessmentSourceAdapter(duplicate.input, { probe: duplicate.probe }));
});
