import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perfwriter_${process.pid}`;
const modelMigration = readFileSync(
  resolve(root, "database/migrations/000300_hr_performance_yuzhou_legacy_model.sql"),
  "utf8",
);
const writerMigration = readFileSync(
  resolve(root, "database/migrations/000301_hr_performance_yuzhou_legacy_writer.sql"),
  "utf8",
);

function psql(targetDatabase, sql, expectSuccess = true) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", targetDatabase],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return result;
}

const admin = sql => psql("postgres", sql);
const batchId = "00000000-0000-4000-8000-000000000101";
const h = character => character.repeat(64);
const syntheticPayload = {
  assessmentcode: [],
  assgradecode: [
    { sourceIdentitySha256: h("a"), sourceRowSha256: h("1"), assgrade: "G1", description: null, myorder: "01", assessmentid: null, minvalue: 0, maxvalue: 59 },
    { sourceIdentitySha256: h("b"), sourceRowSha256: h("2"), assgrade: "G2", description: null, myorder: "02", assessmentid: null, minvalue: 60, maxvalue: 89 },
    { sourceIdentitySha256: h("c"), sourceRowSha256: h("3"), assgrade: "G3", description: null, myorder: "03", assessmentid: null, minvalue: 90, maxvalue: 100 },
  ],
  assitem: [
    { sourceIdentitySha256: h("d"), sourceRowSha256: h("4"), id: 101, assid: 700, assitem: null, fullvalue: null, myorder: null },
    { sourceIdentitySha256: h("e"), sourceRowSha256: h("5"), id: 102, assid: null, assitem: "Synthetic", fullvalue: 100, myorder: 1 },
  ],
  assitemgradedes: [
    { sourceIdentitySha256: h("f"), sourceRowSha256: h("6"), id: 201, assitemid: 101, grade: "UNMATCHED", description: null, minvalue: null, maxvalue: null, myorder: null },
  ],
  assessmentdetail: [],
};
const privatePayloadPath = process.env.YUZHOU_PERFORMANCE_PRIVATE_PAYLOAD;
if (privatePayloadPath) {
  assert.equal(statSync(privatePayloadPath).mode & 0o777, 0o600, "private payload must use mode 0600");
}
const payload = privatePayloadPath
  ? JSON.parse(readFileSync(privatePayloadPath, "utf8"))
  : syntheticPayload;
const expectedCounts = {
  template: payload.assessmentcode.length,
  level: payload.assgradecode.length,
  dimension: payload.assitem.length,
  guide: payload.assitemgradedes.length,
  result: payload.assessmentdetail.length,
};
const expectedMapCount = Object.values(expectedCounts).reduce((sum, count) => sum + count, 0);
const assessmentIds = new Set(payload.assessmentcode.map(row => row.assessment));
const gradeCodes = new Set(payload.assgradecode.map(row => row.assgrade));
const itemIds = new Set(payload.assitem.map(row => row.id));
const expectedUnresolved = {
  itemAssessment: payload.assitem.filter(row => row.assid !== null && !assessmentIds.has(row.assid)).length,
  guideItem: payload.assitemgradedes.filter(row => row.assitemid !== null && !itemIds.has(row.assitemid)).length,
  guideGrade: payload.assitemgradedes.filter(row => row.grade !== null && !gradeCodes.has(row.grade)).length,
  detailItem: payload.assessmentdetail.filter(row => row.assitemid !== null && !itemIds.has(row.assitemid)).length,
};

try {
  admin(`CREATE DATABASE ${database} TEMPLATE template0;`);
  psql(database, `
    CREATE EXTENSION "uuid-ossp";
    CREATE TABLE migration_batch(
      id uuid PRIMARY KEY,run_id varchar(64) NOT NULL,source_system varchar(64) NOT NULL,
      source_snapshot_sha256 char(64) NOT NULL,target_database varchar(128) NOT NULL,
      phase varchar(32) NOT NULL,status varchar(32) NOT NULL,tool_version varchar(64) NOT NULL,
      execution_context varchar(32) NOT NULL DEFAULT 'lab_rehearsal'
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
    CREATE TABLE hr_performance_cycle_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
  `);
  psql(database, modelMigration);
  psql(database, writerMigration);
  psql(database, `
    INSERT INTO migration_batch(
      id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,execution_context
    ) VALUES(
      '${batchId}','perfwriter101','yuzhou-v10',repeat('9',64),current_database(),
      'load','running','contract-test','lab_rehearsal'
    );
  `);

  const serialized = JSON.stringify(payload).replaceAll("'", "''");
  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab('tenant-a','park-a','${batchId}','${serialized}'::jsonb);
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_template_profile)<>${expectedCounts.template}
        OR (SELECT count(*) FROM hr_performance_legacy_level_rule)<>${expectedCounts.level}
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_profile)<>${expectedCounts.dimension}
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_level_guide)<>${expectedCounts.guide}
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_result)<>${expectedCounts.result}
        OR (SELECT count(*) FROM legacy_record_map WHERE batch_id='${batchId}' AND is_active)<>${expectedMapCount} THEN
        RAISE EXCEPTION 'writer conservation mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_dimension_profile
          WHERE source_assessment_id IS NOT NULL AND legacy_template_profile_id IS NULL)<>${expectedUnresolved.itemAssessment} THEN
        RAISE EXCEPTION 'unresolved template relation was not preserved';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_dimension_level_guide
          WHERE source_item_id IS NOT NULL AND legacy_dimension_profile_id IS NULL)<>${expectedUnresolved.guideItem}
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_level_guide
          WHERE source_grade IS NOT NULL AND legacy_level_rule_id IS NULL)<>${expectedUnresolved.guideGrade}
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_result
          WHERE source_item_id IS NOT NULL AND legacy_dimension_profile_id IS NULL)<>${expectedUnresolved.detailItem} THEN
        RAISE EXCEPTION 'unresolved child relations were not preserved';
      END IF;
    END
    $test$;
  `);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab('tenant-a','park-a','${batchId}','${serialized}'::jsonb);
    COMMIT;
  `);
  const afterReplay = psql(database, `
    SELECT count(*) FROM legacy_record_map WHERE batch_id='${batchId}' AND is_active;
  `);
  assert.equal(afterReplay.stdout.trim(), String(expectedMapCount), "exact replay created duplicate maps");

  const driftPayload = structuredClone(payload);
  const driftRecord = [
    ...driftPayload.assessmentcode,
    ...driftPayload.assgradecode,
    ...driftPayload.assitem,
    ...driftPayload.assitemgradedes,
    ...driftPayload.assessmentdetail,
  ][0];
  assert.ok(driftRecord, "writer fixture must contain at least one row");
  driftRecord.sourceRowSha256 = driftRecord.sourceRowSha256 === h("0") ? h("9") : h("0");
  const drift = JSON.stringify(driftPayload).replaceAll("'", "''");
  const driftResult = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab('tenant-a','park-a','${batchId}','${drift}'::jsonb);
    COMMIT;
  `, false);
  assert.notEqual(driftResult.status, 0, "row-hash drift unexpectedly loaded");
  assert.match(driftResult.stderr, /HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT/u);

  psql(database, `
    BEGIN;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id='${batchId}';
    SET LOCAL yuzhou.performance_legacy_rollback_batch_id='${batchId}';
    DELETE FROM hr_performance_legacy_dimension_result WHERE migration_batch_id='${batchId}';
    DELETE FROM hr_performance_legacy_dimension_level_guide WHERE migration_batch_id='${batchId}';
    DELETE FROM hr_performance_legacy_level_rule WHERE migration_batch_id='${batchId}';
    DELETE FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id='${batchId}';
    DELETE FROM hr_performance_legacy_template_profile WHERE migration_batch_id='${batchId}';
    UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false
      WHERE batch_id='${batchId}' AND is_active;
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_level_rule)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_profile)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_level_guide)<>0
        OR (SELECT count(*) FROM legacy_record_map WHERE batch_id='${batchId}' AND is_active)<>0 THEN
        RAISE EXCEPTION 'writer rollback left residue';
      END IF;
    END
    $test$;
  `);

  console.log(`Yuzhou performance legacy writer direct PostgreSQL checks passed (${expectedMapCount} rows, idempotency, drift guard, rollback).`);
} finally {
  admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
