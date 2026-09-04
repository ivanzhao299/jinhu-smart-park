#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { capturePerformancePersonAssessmentSourceAdapter } from "../hr-cutover/performance-person-assessment-source-adapter.mjs";
import {
  PerformancePersonAssessmentLabLoaderError,
  runPerformancePersonAssessmentLabLoad,
} from "../hr-cutover/performance-person-assessment-lab-loader.mjs";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_personassessment_${process.pid}`;
const batch = "00000000-0000-4000-8000-000000003077";
const tenant = "tenant-a";
const park = "park-a";
const sourceDatabase = "YuzhouHR_Lab_adapterpg01";
const h = character => character.repeat(64);
const sha = value => createHash("sha256").update(value).digest("hex");
const personIdentity = code => createHash("sha256")
  .update(Buffer.concat([Buffer.from("dbo.person", "utf8"), Buffer.from([0]), Buffer.from(code.trim(), "utf8")]))
  .digest("hex");
const serialized = value => JSON.stringify(value).replaceAll("'", "''");
const migrations = [
  "000300_hr_performance_yuzhou_legacy_model.sql",
  "000301_hr_performance_yuzhou_legacy_writer.sql",
  "000302_hr_performance_yuzhou_legacy_master.sql",
  "000303_hr_performance_yuzhou_legacy_master_writer.sql",
  "000304_hr_performance_yuzhou_legacy_master_parity.sql",
  "000305_hr_performance_yuzhou_legacy_relations.sql",
  "000306_hr_performance_yuzhou_identity_resolution.sql",
  "000307_hr_performance_yuzhou_ass_compute_weight_relation.sql",
].map(name => readFileSync(resolve(root, "database/migrations", name), "utf8"));

function psql(targetDatabase, sql, expectSuccess = true) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", targetDatabase],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return result;
}

function authority() {
  return {
    loginSucceeded: true,
    sysadmin: false,
    dbDatareader: true,
    viewDefinition: true,
    insert: false,
    update: false,
    delete: false,
    execute: false,
  };
}

function createSourceArtifacts(sandbox, sourceAssessmentId = null) {
  const receiptPath = join(sandbox, "source-restore-receipt.json");
  const sourceReceipt = sealSourceRestoreReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_source_restore_receipt",
    sourceSnapshotSha256: h("a"),
    backup: { sha256: h("a"), bytes: 1, containerCopySha256: h("a"), containerCopyBytes: 1 },
    identities: {
      containerSha256: h("b"), imageSha256: h("c"), databaseSha256: sha(sourceDatabase),
      restoreSha256: h("d"), catalogSha256: h("e"),
    },
    state: { online: true, readOnly: true },
    etlAuthority: authority(),
    productionImport: "HOLD",
  });
  writeFileSync(receiptPath, `${JSON.stringify(sourceReceipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(receiptPath, 0o600);
  const privatePayloadPath = join(sandbox, "person-assessment.private.json");
  const safeReceiptPath = join(sandbox, "person-assessment.safe.json");
  capturePerformancePersonAssessmentSourceAdapter({
    repositoryRoot: root,
    contractPath: resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-assessment-source-adapter-v1.json"),
    sourceRestoreReceiptPath: receiptPath,
    sourceRestoreReceiptSha256: sha(readFileSync(receiptPath)),
    sourceContainer: "fixture-sqlserver",
    databaseAlias: sourceDatabase,
    privatePayloadPath,
    safeReceiptPath,
  }, {
    probe: {
      inspect: () => ({
        state: {
          personTableExists: true, assessmentcodeTableExists: true, databaseReadOnly: true,
          databaseIdentity: sourceDatabase, authority: authority(), containerIdentitySha256: h("b"),
          imageIdentitySha256: h("c"), healthy: true, project: "jinhu_yuzhou_migration_lab",
        },
        catalog: [
          { table: "person", column: "person", sqlType: "varchar", maxLength: 10, precision: 0, scale: 0, nullable: false, computed: false },
          { table: "person", column: "assessment", sqlType: "int", maxLength: 4, precision: 10, scale: 0, nullable: true, computed: false },
          { table: "assessmentcode", column: "assessment", sqlType: "int", maxLength: 4, precision: 10, scale: 0, nullable: false, computed: false },
        ],
        aggregate: {
          totalAssessmentCodeRows: sourceAssessmentId === null ? 0 : 1,
          distinctAssessmentKeys: sourceAssessmentId === null ? 0 : 1,
          duplicateAssessmentKeyGroups: 0,
          duplicateAssessmentRows: 0, totalPersonRows: 1, distinctSafeIdentityCount: 1,
          identityNormalizationCollisionGroups: 0, identityDuplicateGroups: 0,
          identityNullRows: 0, identityBlankRows: 0, identityNonAsciiRows: 0,
          identityNormalizationCollisionRows: 0, identityDuplicateRows: 0,
          assessmentNotApplicableRows: sourceAssessmentId === null ? 1 : 0,
          assessmentUnmatchedRows: 0,
          assessmentResolvedRows: sourceAssessmentId === null ? 0 : 1,
          assessmentAmbiguousRows: 0, loadableRows: 1, quarantinedRows: 0,
        },
        privateRows: [{ sourcePersonIdentitySha256: personIdentity("SYNTH-A"), sourceAssessmentId }],
      }),
    },
  });
  return { privatePayloadPath, safeReceiptPath };
}

const syntheticPerformancePayload = {
  assessmentcode: [
    { sourceIdentitySha256: h("1"), sourceRowSha256: h("2"), assessment: 7, assessmentname: "Fixture A", department: null, mpercent: 30, tpercent: 10, xpercent: 25, cpercent: 15, spercent: 20, timekeep: true, bonus: true, master: true },
  ],
  assgradecode: [],
  assitem: [
    { sourceIdentitySha256: h("3"), sourceRowSha256: h("4"), id: 101, assid: 7, assitem: "Fixture Item", fullvalue: 100, myorder: 1 },
  ],
  assitemgradedes: [],
  assessmentdetail: [
    { sourceIdentitySha256: h("5"), sourceRowSha256: h("6"), id: 7001, asssessionid: 9, person: "SYNTH-A", assitemid: 101, selfvalue: 80, mitemvalue: 80, itemvalue: 80, xitemvalue: 80, citemvalue: 80, selfgrade: null, assgrade: null, appraisal: null },
  ],
};

const syntheticMasterPayload = {
  assessmentmaster: [{
    sourceIdentitySha256: h("7"), sourceRowSha256: h("8"), id: 9001,
    asssessionid: 9, person: "SYNTH-A", selfgrade: null, assgrade: null,
    selfvalue: null, itemvalue: null, mitemvalue: null, xitemvalue: null, citemvalue: null,
    mastervalue: null, timekeepvalue: null, bonusvalue: null, totalvalue: null,
    selfappraisal: null, appraisal: null, pay: null, assessmentperson: null,
    recdate: null, operator: null, des: null,
  }],
};

const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-person-assessment-loader-"));
chmodSync(sandbox, 0o700);
const externalPaths = {
  privatePayloadPath: process.env.YUZHOU_PERFORMANCE_PERSON_ASSESSMENT_PRIVATE_PAYLOAD,
  safeReceiptPath: process.env.YUZHOU_PERFORMANCE_PERSON_ASSESSMENT_SAFE_RECEIPT,
  performancePayloadPath: process.env.YUZHOU_PERFORMANCE_LEGACY_CORE_PAYLOAD,
  masterPayloadPath: process.env.YUZHOU_PERFORMANCE_LEGACY_MASTER_PAYLOAD,
};
const external = Object.values(externalPaths).some(Boolean);
if (external && Object.values(externalPaths).some(value => !value)) {
  throw new Error("PERFORMANCE_PERSON_ASSESSMENT_LAB_EXTERNAL_INPUT_INCOMPLETE");
}
const artifacts = external ? {
  privatePayloadPath: resolve(externalPaths.privatePayloadPath),
  safeReceiptPath: resolve(externalPaths.safeReceiptPath),
} : createSourceArtifacts(sandbox);
const performancePayload = external
  ? JSON.parse(readFileSync(resolve(externalPaths.performancePayloadPath), "utf8"))
  : syntheticPerformancePayload;
const masterPayload = external
  ? JSON.parse(readFileSync(resolve(externalPaths.masterPayloadPath), "utf8"))
  : syntheticMasterPayload;
const expectedSourceEvidenceRows = JSON.parse(readFileSync(artifacts.privatePayloadPath, "utf8")).rowCount;
const expectedMasterRows = masterPayload.assessmentmaster.length;

try {
  psql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  psql(database, `
    CREATE EXTENSION "uuid-ossp";
    CREATE EXTENSION pgcrypto;
    CREATE TABLE migration_batch(
      id uuid PRIMARY KEY,run_id varchar(64) NOT NULL,source_system varchar(64) NOT NULL,
      source_snapshot_sha256 char(64) NOT NULL,target_database varchar(128) NOT NULL,
      phase varchar(32) NOT NULL,status varchar(32) NOT NULL,tool_version varchar(64) NOT NULL,
      execution_context varchar(32) NOT NULL DEFAULT 'lab_rehearsal',
      production_import_operation_id varchar(64),production_import_phase varchar(8)
    );
    CREATE TABLE legacy_record_map(
      id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES migration_batch(id),
      source_system varchar(64) NOT NULL,source_table varchar(256) NOT NULL,
      source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,
      source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,
      mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL,
      update_time timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX uq_legacy_record_map_active_source
      ON legacy_record_map(source_system,source_table,source_identity_sha256) WHERE is_active;
    CREATE TABLE hr_yuzhou_production_import_operation(
      operation_id varchar(64) PRIMARY KEY,status varchar(32) NOT NULL,
      execution_contract_version smallint NOT NULL,target_tenant_id varchar(64),target_park_id varchar(64)
    );
    CREATE TABLE hr_yuzhou_production_import_phase(
      operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,status varchar(24) NOT NULL,
      PRIMARY KEY(operation_id,phase)
    );
    CREATE TABLE hr_yuzhou_production_import_record(
      operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,
      source_identity_sha256 char(64) NOT NULL,source_system varchar(64),source_table varchar(256),
      source_pk_canonical varchar(512),disposition varchar(24) NOT NULL,target_table varchar(96),
      target_id uuid,rollback_status varchar(24) NOT NULL,
      PRIMARY KEY(operation_id,phase,source_identity_sha256)
    );
    CREATE TABLE hr_yuzhou_production_import_projection_receipt(
      operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,
      source_identity_sha256 char(64) NOT NULL,migration_batch_id uuid NOT NULL,
      legacy_record_map_id uuid NOT NULL UNIQUE,
      PRIMARY KEY(operation_id,phase,source_identity_sha256)
    );
    CREATE TABLE hr_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      is_deleted boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,park_id,id)
    );
    CREATE TABLE hr_performance_template(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_version(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_dimension(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_version_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_level(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_version_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_review_cycle(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_cycle_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      cycle_id uuid,employee_id uuid,UNIQUE(id,tenant_id,park_id),
      UNIQUE(tenant_id,park_id,cycle_id,employee_id)
    );
  `);
  for (const migration of migrations) psql(database, migration);
  psql(database, `
    INSERT INTO migration_batch(
      id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,
      tool_version,execution_context
    ) VALUES(
      '${batch}','person-assessment-loader','yuzhou-v10',repeat('0',64),current_database(),
      'load','running','contract-test','lab_rehearsal'
    );
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab(
      '${tenant}','${park}','${batch}','${serialized(performancePayload)}'::jsonb
    );
    CALL materialize_yuzhou_performance_legacy_master_lab(
      '${tenant}','${park}','${batch}','${serialized(masterPayload)}'::jsonb
    );
    COMMIT;
  `);

  const input = {
    repositoryRoot: root,
    contractPath: resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-assessment-source-adapter-v1.json"),
    privatePayloadPath: artifacts.privatePayloadPath,
    safeReceiptPath: artifacts.safeReceiptPath,
    postgresContainer: container,
    database,
    tenantId: tenant,
    parkId: park,
    batchId: batch,
  };
  const result = runPerformancePersonAssessmentLabLoad(input);
  assert.deepEqual(result, {
    status: "PERFORMANCE_PERSON_ASSESSMENT_LAB_VERIFIED",
    sourceEvidenceRows: expectedSourceEvidenceRows,
    masterRows: expectedMasterRows,
    comparableMasterRows: result.comparableMasterRows,
    assessmentMissingRows: result.comparableMasterRows,
    notComparableRows: result.notComparableRows,
    exactReplay: "verified",
    driftRejection: "verified",
    rollbackResidualRows: 0,
    ownerStatePreserved: true,
    stateSha256: result.stateSha256,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  });
  assert.match(result.stateSha256, /^[0-9a-f]{64}$/u);
  assert.ok(result.notComparableRows >= result.comparableMasterRows);
  assert.equal(
    psql(database, "SELECT count(*) FROM hr_performance_legacy_master_result;").stdout.trim(),
    String(expectedMasterRows),
  );
  assert.throws(
    () => runPerformancePersonAssessmentLabLoad({ ...input, database: "production" }),
    error => error instanceof PerformancePersonAssessmentLabLoaderError
      && error.code === "PERFORMANCE_PERSON_ASSESSMENT_LAB_INPUT_INVALID",
  );
  const nonNullSandbox = mkdtempSync(join(tmpdir(), "yuzhou-person-assessment-non-null-"));
  chmodSync(nonNullSandbox, 0o700);
  const nonNullArtifacts = createSourceArtifacts(nonNullSandbox, 7);
  assert.throws(
    () => runPerformancePersonAssessmentLabLoad({
      ...input,
      privatePayloadPath: nonNullArtifacts.privatePayloadPath,
      safeReceiptPath: nonNullArtifacts.safeReceiptPath,
    }),
    error => error instanceof PerformancePersonAssessmentLabLoaderError
      && error.code === "PERFORMANCE_PERSON_ASSESSMENT_LAB_ARTIFACT_INVALID",
  );
  console.log(JSON.stringify(result));
  console.log("Yuzhou performance person-assessment lab loader direct PostgreSQL checks passed (all-null assessment_missing/not_comparable, replay, drift refusal and reverse zero-residual rollback). Production import remains HOLD.");
} finally {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
