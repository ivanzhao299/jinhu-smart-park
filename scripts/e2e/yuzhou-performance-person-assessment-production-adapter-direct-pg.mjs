#!/usr/bin/env node
/* global Buffer, console, process, structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  computePerformancePersonAssessmentProductionBindingHash,
  executePerformancePersonAssessmentProductionPayload,
  performancePersonAssessmentProductionHash,
  rollbackPerformancePersonAssessmentProductionPayload,
} from "../hr-cutover/performance-person-assessment-production-adapter.mjs";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perfrelprod_${process.pid}`;
const batch = "00000000-0000-4000-8000-000000003078";
const operationId = "yzprod-perfrel-20260905T010000Z-123456abcdef";
const parentImportOperationId = "yzprod-import-20260905T000000Z-abcdef123456";
const rollbackOperationId = "yzprod-perfrel-rollback-20260905T013000Z-abcdef123456";
const tenant = "tenant-a";
const park = "park-a";
const h = value => createHash("sha256").update(`fixture:${value}`).digest("hex");
const sqlLiteral = value => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const interpolate = (sql, parameters) => parameters.reduceRight((text, value, index) => text.replaceAll(new RegExp(`\\$${index + 1}(?![0-9])`, "gu"), sqlLiteral(value)), sql);

function psql(targetDatabase, sql, expectSuccess = true) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", targetDatabase], { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return result;
}

const migrationNames = [
  "000300_hr_performance_yuzhou_legacy_model.sql",
  "000301_hr_performance_yuzhou_legacy_writer.sql",
  "000302_hr_performance_yuzhou_legacy_master.sql",
  "000303_hr_performance_yuzhou_legacy_master_writer.sql",
  "000304_hr_performance_yuzhou_legacy_master_parity.sql",
  "000305_hr_performance_yuzhou_legacy_relations.sql",
  "000306_hr_performance_yuzhou_identity_resolution.sql",
];
const migrations = migrationNames.map(name => readFileSync(resolve(root, "database/migrations", name), "utf8"));
const migration307Raw = readFileSync(resolve(root, "database/migrations/000307_hr_performance_yuzhou_ass_compute_weight_relation.sql"), "utf8");
const migration307SyntheticProduction = migration307Raw
  .replaceAll("materialize_yuzhou_performance_ass_compute_weight_relation_lab", "materialize_yuzhou_performance_ass_compute_weight_relation_production_impl")
  .replaceAll("rollback_yuzhou_performance_ass_compute_weight_relation_lab", "rollback_yuzhou_performance_ass_compute_weight_relation_production_impl")
  .replaceAll("'lab_rehearsal'", "'production_import'");

const performancePayload = {
  assessmentcode: [{ sourceIdentitySha256: h("assessment"), sourceRowSha256: h("assessment-row"), assessment: 7, assessmentname: "Synthetic", department: null, mpercent: 30, tpercent: 10, xpercent: 25, cpercent: 15, spercent: 20, timekeep: true, bonus: true, master: true }],
  assgradecode: [],
  assitem: [{ sourceIdentitySha256: h("item"), sourceRowSha256: h("item-row"), id: 101, assid: 7, assitem: "Synthetic", fullvalue: 100, myorder: 1 }],
  assitemgradedes: [],
  assessmentdetail: [{ sourceIdentitySha256: h("detail"), sourceRowSha256: h("detail-row"), id: 7001, asssessionid: 9, person: "SYNTH-A", assitemid: 101, selfvalue: 80, mitemvalue: 80, itemvalue: 80, xitemvalue: 80, citemvalue: 80, selfgrade: null, assgrade: null, appraisal: null }],
};
const masterPayload = { assessmentmaster: [{
  sourceIdentitySha256: h("master"), sourceRowSha256: h("master-row"), id: 9001, asssessionid: 9, person: "SYNTH-A",
  selfgrade: null, assgrade: null, selfvalue: null, itemvalue: null, mitemvalue: null, xitemvalue: null, citemvalue: null,
  mastervalue: null, timekeepvalue: null, bonusvalue: null, totalvalue: null, selfappraisal: null, appraisal: null, pay: null,
  assessmentperson: null, recdate: null, operator: null, des: null,
}] };

const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-assessment-production-adapter-v1.json");
const contractArtifactSha256 = performancePersonAssessmentProductionHash(readFileSync(contractPath));
const payloadBody = {
  formatVersion: 1, artifactKind: "yuzhou_hr_performance_person_assessment_production_payload", status: "SEALED",
  operationId, parentImportOperationId,
  triple: { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") },
  target: { identitySha256: h("target"), scope: { tenantId: tenant, parkId: park, scopeSha256: h("scope") } },
  bindings: {
    t0ArtifactSha256: h("t0"), sourceRestoreReceiptSha256: h("restore-receipt"), contractArtifactSha256,
    sourcePayloadArtifactSha256: h("source-payload-artifact"), sourcePayloadSha256: h("source-payload"),
    safeReceiptArtifactSha256: h("safe-receipt-artifact"), safeReceiptSha256: h("safe-receipt"),
    migrationArtifactSha256: createHash("sha256").update(migration307Raw).digest("hex"),
  },
  rowCount: 1, payload: { personAssessments: [{ sourcePersonIdentitySha256: createHash("sha256").update(Buffer.concat([Buffer.from("dbo.person"), Buffer.from([0]), Buffer.from("SYNTH-A")])).digest("hex"), sourceAssessmentId: 7 }] },
  payloadSha256: "", window: { startsAt: "2026-09-05T00:00:00.000Z", endsAt: "2026-09-05T02:00:00.000Z" },
  containsPersonCodes: false, compatibilityCredit: 0, productionImport: "HOLD",
};
payloadBody.payloadSha256 = performancePersonAssessmentProductionHash(payloadBody.payload);
const payload = { ...payloadBody, sealing: { algorithm: "canonical-json-sha256-v1", sealedArtifactSha256: performancePersonAssessmentProductionHash(payloadBody) } };

function authorization(rollback = false) {
  const intent = rollback ? "production_performance_person_assessment_rollback" : "production_performance_person_assessment_import";
  return {
    formatVersion: 1,
    artifactKind: rollback ? "yuzhou_hr_performance_person_assessment_rollback_authorization" : "yuzhou_hr_performance_person_assessment_import_authorization",
    intent, ...(rollback ? { rollbackOperationId } : { operationId }), artifactSha256: h(rollback ? "rollback-auth" : "import-auth"),
    nonceSha256: h(rollback ? "rollback-nonce" : "import-nonce"), issuedAt: "2026-09-05T00:30:00.000Z", expiresAt: "2026-09-05T01:30:00.000Z",
    bindingSha256: performancePersonAssessmentProductionHash({
      intent, operationId, ...(rollback ? { rollbackOperationId } : {}), sealedArtifactSha256: payload.sealing.sealedArtifactSha256,
      targetIdentitySha256: payload.target.identitySha256, targetScopeSha256: payload.target.scope.scopeSha256,
      productionBindingSha256: computePerformancePersonAssessmentProductionBindingHash(payload),
    }),
  };
}

function parseReceipt(output) {
  const values = output.trim().split("|");
  assert.equal(values.length, 9, output);
  return { operationId: values[0], status: values[1], sealedArtifactSha256: values[2], bindingSha256: values[3], targetScopeSha256: values[4], evidenceRows: Number(values[5]), masterRows: Number(values[6]), resolutionRows: Number(values[7]), stateSha256: values[8] };
}

function productionDatabase() {
  return {
    async probeTarget(expected) { return { targetIdentitySha256: expected.targetIdentitySha256, targetScope: structuredClone(expected.targetScope) }; },
    async probePerformancePersonAssessmentCapability(artifact) {
      const row = psql(database, `SELECT count(*) FROM migration_batch WHERE id='${batch}'::uuid AND execution_context='production_import' AND production_import_operation_id='${parentImportOperationId}' AND production_import_phase='PERFREL';`).stdout.trim();
      assert.equal(row, "1");
      return { executionContext: "production_import", phase: "PERFREL", migrationArtifactSha256: artifact.bindings.migrationArtifactSha256, parentImportOperationId, t0ArtifactSha256: artifact.bindings.t0ArtifactSha256, contractArtifactSha256: artifact.bindings.contractArtifactSha256, applyProcedure: "materialize_yuzhou_performance_ass_compute_weight_relation_production", rollbackProcedure: "rollback_yuzhou_performance_ass_compute_weight_relation_production" };
    },
    async probePerformancePersonAssessmentOperation(targetOperationId) {
      const result = psql(database, `SELECT operation_id,status,sealed_artifact_sha256,binding_sha256,target_scope_sha256,evidence_rows,master_rows,resolution_rows,state_sha256 FROM fixture_perfrel_receipt('${targetOperationId}');`, false);
      if (result.status !== 0 || !result.stdout.trim()) return null;
      return parseReceipt(result.stdout);
    },
    async transaction(options, callback) {
      assert.equal(options.isolationLevel, "SERIALIZABLE");
      return callback({ query: async (sql, parameters = []) => {
        const executed = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n${interpolate(sql, parameters)};\nCOMMIT;`);
        return { rows: [], stdout: executed.stdout };
      } });
    },
    async readPerformancePersonAssessmentReceipt(_tx, targetOperationId) {
      return parseReceipt(psql(database, `SELECT operation_id,status,sealed_artifact_sha256,binding_sha256,target_scope_sha256,evidence_rows,master_rows,resolution_rows,state_sha256 FROM fixture_perfrel_receipt('${targetOperationId}');`).stdout);
    },
  };
}

try {
  psql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  psql(database, `
    CREATE EXTENSION "uuid-ossp"; CREATE EXTENSION pgcrypto;
    CREATE TABLE migration_batch(id uuid PRIMARY KEY,run_id varchar(64) NOT NULL,source_system varchar(64) NOT NULL,source_snapshot_sha256 char(64) NOT NULL,target_database varchar(128) NOT NULL,phase varchar(32) NOT NULL,status varchar(32) NOT NULL,tool_version varchar(64) NOT NULL,execution_context varchar(32) NOT NULL DEFAULT 'lab_rehearsal',production_import_operation_id varchar(64),production_import_phase varchar(8));
    CREATE TABLE legacy_record_map(id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES migration_batch(id),source_system varchar(64) NOT NULL,source_table varchar(256) NOT NULL,source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL,update_time timestamptz NOT NULL DEFAULT now());
    CREATE UNIQUE INDEX uq_legacy_record_map_active_source ON legacy_record_map(source_system,source_table,source_identity_sha256) WHERE is_active;
    CREATE TABLE hr_yuzhou_production_import_operation(operation_id varchar(64) PRIMARY KEY,status varchar(32) NOT NULL,execution_contract_version smallint NOT NULL,target_tenant_id varchar(64),target_park_id varchar(64));
    CREATE TABLE hr_yuzhou_production_import_phase(operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,status varchar(24) NOT NULL,PRIMARY KEY(operation_id,phase));
    CREATE TABLE hr_yuzhou_production_import_record(operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,source_identity_sha256 char(64) NOT NULL,source_system varchar(64),source_table varchar(256),source_pk_canonical varchar(512),disposition varchar(24) NOT NULL,target_table varchar(96),target_id uuid,rollback_status varchar(24) NOT NULL,PRIMARY KEY(operation_id,phase,source_identity_sha256));
    CREATE TABLE hr_yuzhou_production_import_projection_receipt(operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,source_identity_sha256 char(64) NOT NULL,migration_batch_id uuid NOT NULL,legacy_record_map_id uuid NOT NULL UNIQUE,PRIMARY KEY(operation_id,phase,source_identity_sha256));
    CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,is_deleted boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,park_id,id));
    CREATE TABLE hr_performance_template(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,UNIQUE(id,tenant_id,park_id));
    CREATE TABLE hr_performance_template_version(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,template_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id));
    CREATE TABLE hr_performance_template_dimension(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,template_version_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id));
    CREATE TABLE hr_performance_template_level(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,template_version_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id));
    CREATE TABLE hr_performance_review_cycle(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,UNIQUE(id,tenant_id,park_id));
    CREATE TABLE hr_performance_cycle_employee(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,cycle_id uuid,employee_id uuid,UNIQUE(id,tenant_id,park_id),UNIQUE(tenant_id,park_id,cycle_id,employee_id));
  `);
  for (const migration of migrations) psql(database, migration);
  psql(database, `
    INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,execution_context)
    VALUES('${batch}','synthetic-production-owner','yuzhou-v10','${h("source")}',current_database(),'load','running','contract-test','lab_rehearsal');
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab('${tenant}','${park}','${batch}','${JSON.stringify(performancePayload).replaceAll("'", "''")}'::jsonb);
    CALL materialize_yuzhou_performance_legacy_master_lab('${tenant}','${park}','${batch}','${JSON.stringify(masterPayload).replaceAll("'", "''")}'::jsonb);
    COMMIT;
    UPDATE migration_batch SET execution_context='production_import',production_import_operation_id='${parentImportOperationId}',production_import_phase='PERFREL' WHERE id='${batch}';
  `);
  psql(database, migration307SyntheticProduction);
  psql(database, `
    CREATE TABLE fixture_perfrel_operation(operation_id varchar(64) PRIMARY KEY,parent_operation_id varchar(64) NOT NULL,batch_id uuid NOT NULL UNIQUE,sealed_artifact_sha256 char(64) NOT NULL,binding_sha256 char(64) NOT NULL,target_scope_sha256 char(64) NOT NULL,status varchar(16) NOT NULL,authorization_artifact_sha256 char(64) NOT NULL UNIQUE,authorization_nonce_sha256 char(64) NOT NULL UNIQUE);
    CREATE TABLE fixture_perfrel_rollback_use(rollback_operation_id varchar(80) PRIMARY KEY,operation_id varchar(64) NOT NULL UNIQUE,authorization_artifact_sha256 char(64) NOT NULL UNIQUE,authorization_nonce_sha256 char(64) NOT NULL UNIQUE);
    CREATE FUNCTION hr_yuzhou_consume_performance_person_assessment_authorization(p_operation varchar,p_parent varchar,p_code char,p_source char,p_mapping char,p_t0 char,p_contract char,p_source_payload char,p_safe_receipt char,p_migration char,p_sealed char,p_binding char,p_auth char,p_nonce char,p_expires timestamptz) RETURNS void LANGUAGE plpgsql AS $$
    DECLARE v_batch uuid; BEGIN IF current_setting('transaction_isolation')<>'serializable' OR now()>=p_expires THEN RAISE EXCEPTION 'PERFREL_AUTH_INVALID'; END IF;
      SELECT id INTO STRICT v_batch FROM migration_batch WHERE production_import_operation_id=p_parent AND production_import_phase='PERFREL' AND execution_context='production_import';
      INSERT INTO fixture_perfrel_operation VALUES(p_operation,p_parent,v_batch,p_sealed,p_binding,'${h("scope")}','authorized',p_auth,p_nonce);
    END$$;
    CREATE FUNCTION hr_yuzhou_consume_performance_person_assessment_rollback_authorization(p_rollback varchar,p_operation varchar,p_sealed char,p_auth char,p_nonce char,p_expires timestamptz) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('transaction_isolation')<>'serializable' OR now()>=p_expires OR NOT EXISTS(SELECT 1 FROM fixture_perfrel_operation WHERE operation_id=p_operation AND sealed_artifact_sha256=p_sealed AND status='succeeded') THEN RAISE EXCEPTION 'PERFREL_ROLLBACK_AUTH_INVALID'; END IF;
      INSERT INTO fixture_perfrel_rollback_use VALUES(p_rollback,p_operation,p_auth,p_nonce);
    END$$;
    CREATE PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_production(p_operation varchar,p_tenant varchar,p_park varchar,p_migration char,p_payload_sha char,p_payload jsonb) LANGUAGE plpgsql AS $$ DECLARE v_batch uuid; BEGIN
      SELECT batch_id INTO STRICT v_batch FROM fixture_perfrel_operation WHERE operation_id=p_operation AND status='authorized' FOR UPDATE;
      CALL materialize_yuzhou_performance_ass_compute_weight_relation_production_impl(p_tenant,p_park,v_batch,p_payload);
      UPDATE fixture_perfrel_operation SET status='succeeded' WHERE operation_id=p_operation;
    END$$;
    CREATE PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_production(p_rollback varchar,p_operation varchar) LANGUAGE plpgsql AS $$ DECLARE v_batch uuid; BEGIN
      SELECT batch_id INTO STRICT v_batch FROM fixture_perfrel_operation WHERE operation_id=p_operation AND status='succeeded' FOR UPDATE;
      IF NOT EXISTS(SELECT 1 FROM fixture_perfrel_rollback_use WHERE rollback_operation_id=p_rollback AND operation_id=p_operation) THEN RAISE EXCEPTION 'PERFREL_ROLLBACK_AUTH_REQUIRED'; END IF;
      UPDATE migration_batch SET phase='rollback' WHERE id=v_batch;
      CALL rollback_yuzhou_performance_ass_compute_weight_relation_production_impl(v_batch);
      UPDATE fixture_perfrel_operation SET status='rolled_back' WHERE operation_id=p_operation;
    END$$;
    CREATE FUNCTION fixture_perfrel_receipt(p_operation varchar) RETURNS TABLE(operation_id varchar,status varchar,sealed_artifact_sha256 char,binding_sha256 char,target_scope_sha256 char,evidence_rows bigint,master_rows bigint,resolution_rows bigint,state_sha256 text) LANGUAGE sql AS $$
      SELECT operation.operation_id,operation.status,operation.sealed_artifact_sha256,operation.binding_sha256,operation.target_scope_sha256,
        count(DISTINCT evidence.id),CASE WHEN operation.status='rolled_back' THEN 0 ELSE count(DISTINCT master.id) END,count(DISTINCT resolution.id),
        encode(digest(convert_to(jsonb_build_array(count(DISTINCT evidence.id),CASE WHEN operation.status='rolled_back' THEN 0 ELSE count(DISTINCT master.id) END,count(DISTINCT resolution.id))::text,'UTF8'),'sha256'),'hex')
      FROM fixture_perfrel_operation operation
      LEFT JOIN hr_performance_legacy_person_assessment_evidence evidence ON evidence.migration_batch_id=operation.batch_id
      LEFT JOIN hr_performance_legacy_master_result master ON master.migration_batch_id=operation.batch_id
      LEFT JOIN hr_performance_legacy_ass_compute_weight_resolution resolution ON resolution.migration_batch_id=operation.batch_id
      WHERE operation.operation_id=p_operation GROUP BY operation.operation_id;
    $$;
  `);

  const db = productionDatabase();
  const runtime = { contractPath, now: new Date("2026-09-05T01:00:00.000Z"), currentCodeSha: payload.triple.codeSha, mergedCodeSha: payload.triple.codeSha, database: db };
  const imported = await executePerformancePersonAssessmentProductionPayload(payload, authorization(), runtime);
  assert.equal(imported.evidenceRows, 1);
  assert.equal(imported.masterRows, 1);
  assert.equal(imported.resolutionRows, 1);
  assert.equal(psql(database, "SELECT person_resolution_status||'|'||detail_resolution_status||'|'||comparison_status FROM hr_performance_legacy_ass_compute_weight_resolution;").stdout.trim(), "resolved|resolved|matched");
  const replay = await executePerformancePersonAssessmentProductionPayload(payload, authorization(), runtime);
  assert.equal(replay.stateSha256, imported.stateSha256);
  const rolledBack = await rollbackPerformancePersonAssessmentProductionPayload(payload, authorization(true), runtime);
  assert.equal(rolledBack.evidenceRows, 0);
  assert.equal(rolledBack.resolutionRows, 0);
  assert.equal(psql(database, "SELECT count(*) FROM hr_performance_legacy_master_result;").stdout.trim(), "1");
  console.log("Yuzhou performance person-assessment production adapter synthetic PostgreSQL checks passed (non-empty master, one-time authority, replay, reverse zero residual). No production connection was used.");
} finally {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
