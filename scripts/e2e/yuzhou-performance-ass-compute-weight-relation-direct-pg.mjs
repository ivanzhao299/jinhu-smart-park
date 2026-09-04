#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_asscompute307_${process.pid}`;
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

const admin = sql => psql("postgres", sql);
const batch = "00000000-0000-4000-8000-000000000307";
const h = character => character.repeat(64);
const personIdentity = code => createHash("sha256")
  .update(Buffer.concat([Buffer.from("dbo.person", "utf8"), Buffer.from([0]), Buffer.from(code.trim(), "utf8")]))
  .digest("hex");
const serialized = value => JSON.stringify(value).replaceAll("'", "''");

const performancePayload = {
  assessmentcode: [
    { sourceIdentitySha256: h("a"), sourceRowSha256: h("1"), assessment: 7, assessmentname: "Fixture A", department: null, mpercent: 30, tpercent: 10, xpercent: 25, cpercent: 15, spercent: 20, timekeep: true, bonus: true, master: true },
    { sourceIdentitySha256: h("b"), sourceRowSha256: h("2"), assessment: 8, assessmentname: "Fixture B", department: null, mpercent: 20, tpercent: 20, xpercent: 20, cpercent: 20, spercent: 20, timekeep: true, bonus: true, master: true },
  ],
  assgradecode: [],
  assitem: [
    { sourceIdentitySha256: h("c"), sourceRowSha256: h("3"), id: 101, assid: 7, assitem: "Fixture Item A", fullvalue: 100, myorder: 1 },
    { sourceIdentitySha256: h("d"), sourceRowSha256: h("4"), id: 102, assid: 8, assitem: "Fixture Item B", fullvalue: 100, myorder: 2 },
  ],
  assitemgradedes: [],
  assessmentdetail: [
    { sourceIdentitySha256: h("e"), sourceRowSha256: h("5"), id: 7001, asssessionid: 9, person: "P-MATCH", assitemid: 101, selfvalue: 80, mitemvalue: 80, itemvalue: 80, xitemvalue: 80, citemvalue: 80, selfgrade: null, assgrade: null, appraisal: null },
    { sourceIdentitySha256: h("f"), sourceRowSha256: h("6"), id: 7002, asssessionid: 9, person: "P-MISMAT", assitemid: 101, selfvalue: 70, mitemvalue: 70, itemvalue: 70, xitemvalue: 70, citemvalue: 70, selfgrade: null, assgrade: null, appraisal: null },
    { sourceIdentitySha256: h("1"), sourceRowSha256: h("7"), id: 7003, asssessionid: 9, person: "P-MULTI", assitemid: 101, selfvalue: 60, mitemvalue: 60, itemvalue: 60, xitemvalue: 60, citemvalue: 60, selfgrade: null, assgrade: null, appraisal: null },
    { sourceIdentitySha256: h("2"), sourceRowSha256: h("8"), id: 7004, asssessionid: 9, person: "P-MULTI", assitemid: 102, selfvalue: 60, mitemvalue: 60, itemvalue: 60, xitemvalue: 60, citemvalue: 60, selfgrade: null, assgrade: null, appraisal: null },
  ],
};

const masterRow = (id, person, identityCharacter, rowCharacter) => ({
  sourceIdentitySha256: h(identityCharacter), sourceRowSha256: h(rowCharacter), id,
  asssessionid: 9, person, selfgrade: null, assgrade: null, selfvalue: null,
  itemvalue: null, mitemvalue: null, xitemvalue: null, citemvalue: null,
  mastervalue: null, timekeepvalue: null, bonusvalue: null, totalvalue: null,
  selfappraisal: null, appraisal: null, pay: null, assessmentperson: null,
  recdate: null, operator: null, des: null,
});
const masterPayload = {
  assessmentmaster: [
    masterRow(9001, "P-MATCH", "3", "9"),
    masterRow(9002, "P-MISMAT", "4", "a"),
    masterRow(9003, "P-NODET", "5", "b"),
    masterRow(9004, "P-NOASS", "6", "c"),
    masterRow(9005, "P-NOTPL", "7", "d"),
    masterRow(9006, "P-MULTI", "8", "e"),
    masterRow(9007, "P-NOEV", "9", "f"),
    masterRow(9008, "P-EVAMB", "0", "1"),
    masterRow(9009, null, "a", "2"),
  ],
};
const weightPayload = {
  personAssessments: [
    { sourcePersonIdentitySha256: personIdentity("P-MATCH"), sourceAssessmentId: 7 },
    { sourcePersonIdentitySha256: personIdentity("P-MISMAT"), sourceAssessmentId: 8 },
    { sourcePersonIdentitySha256: personIdentity("P-NODET"), sourceAssessmentId: 7 },
    { sourcePersonIdentitySha256: personIdentity("P-NOASS"), sourceAssessmentId: null },
    { sourcePersonIdentitySha256: personIdentity("P-NOTPL"), sourceAssessmentId: 99 },
    { sourcePersonIdentitySha256: personIdentity("P-MULTI"), sourceAssessmentId: 7 },
    { sourcePersonIdentitySha256: personIdentity("P-EVAMB"), sourceAssessmentId: 7 },
    { sourcePersonIdentitySha256: personIdentity("P-EVAMB"), sourceAssessmentId: 8 },
  ],
};

try {
  admin(`CREATE DATABASE ${database} TEMPLATE template0;`);
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
      '${batch}','ass-compute-307','yuzhou-v10',repeat('0',64),current_database(),
      'load','running','contract-test','lab_rehearsal'
    );
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab(
      'tenant-a','park-a','${batch}','${serialized(performancePayload)}'::jsonb
    );
    CALL materialize_yuzhou_performance_legacy_master_lab(
      'tenant-a','park-a','${batch}','${serialized(masterPayload)}'::jsonb
    );
    CALL materialize_yuzhou_performance_ass_compute_weight_relation_lab(
      'tenant-a','park-a','${batch}','${serialized(weightPayload)}'::jsonb
    );
    COMMIT;
  `);

  psql(database, `
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_person_assessment_evidence)<>8
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution)<>9 THEN
        RAISE EXCEPTION 'weight relation conservation mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE person_resolution_status='resolved')<>4
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE person_resolution_status='assessment_missing')<>1
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE person_resolution_status='template_unmatched')<>1
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE person_resolution_status='evidence_unmatched')<>1
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE person_resolution_status='evidence_ambiguous')<>1
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE person_resolution_status='not_applicable')<>1 THEN
        RAISE EXCEPTION 'person weight status matrix mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE detail_resolution_status='resolved')<>2
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE detail_resolution_status='ambiguous' AND detail_template_candidate_count=2)<>1
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE detail_resolution_status='unmatched')<>6 THEN
        RAISE EXCEPTION 'detail weight status matrix mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE comparison_status='matched')<>1
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE comparison_status='mismatch')<>1
        OR (SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution
          WHERE comparison_status='not_comparable')<>7 THEN
        RAISE EXCEPTION 'parallel relation comparison mismatch';
      END IF;
      IF EXISTS(SELECT 1 FROM hr_performance_legacy_ass_compute_weight_resolution
        WHERE person_resolution_status<>'resolved' AND person_template_profile_id IS NOT NULL)
        OR EXISTS(SELECT 1 FROM hr_performance_legacy_ass_compute_weight_resolution
        WHERE detail_resolution_status<>'resolved' AND detail_template_profile_id IS NOT NULL) THEN
        RAISE EXCEPTION 'unresolved relation received silent template winner';
      END IF;
    END
    $test$;
  `);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_ass_compute_weight_relation_lab(
      'tenant-a','park-a','${batch}','${serialized(weightPayload)}'::jsonb
    );
    COMMIT;
  `);
  assert.equal(
    psql(database, "SELECT count(*) FROM hr_performance_legacy_ass_compute_weight_resolution;").stdout.trim(),
    "9",
    "exact replay created duplicate resolutions",
  );

  const driftPayload = structuredClone(weightPayload);
  driftPayload.personAssessments[0].sourceAssessmentId = 8;
  const drift = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_ass_compute_weight_relation_lab(
      'tenant-a','park-a','${batch}','${serialized(driftPayload)}'::jsonb
    );
    COMMIT;
  `, false);
  assert.notEqual(drift.status, 0, "changed person assessment evidence replayed");
  assert.match(drift.stderr, /HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_(?:PERSON_EVIDENCE_CONSERVATION_FAILED|REPLAY_DRIFT)/u);

  const immutable = psql(database, `
    UPDATE hr_performance_legacy_ass_compute_weight_resolution SET comparison_status='not_comparable';
  `, false);
  assert.match(immutable.stderr, /HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_RESOLUTION_IMMUTABLE/u);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id='${batch}';
    CALL rollback_yuzhou_performance_ass_compute_weight_relation_lab('${batch}');
    COMMIT;
    DO $test$
    BEGIN
      IF EXISTS(SELECT 1 FROM hr_performance_legacy_ass_compute_weight_resolution)
        OR EXISTS(SELECT 1 FROM hr_performance_legacy_person_assessment_evidence) THEN
        RAISE EXCEPTION 'weight relation rollback residual';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_master_result)<>9
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_result)<>4
        OR (SELECT count(*) FROM hr_performance_legacy_template_profile)<>2
        OR (SELECT count(*) FROM legacy_record_map)<>17 THEN
        RAISE EXCEPTION 'weight relation rollback mutated source owners';
      END IF;
    END
    $test$;
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL rollback_yuzhou_performance_ass_compute_weight_relation_lab('${batch}');
    COMMIT;
  `);

  console.log("Yuzhou bs_ass_compute weight-relation direct PostgreSQL checks passed (parallel person/detail resolution, explicit gaps, replay drift, append-only guard and zero-residual rollback).");
} finally {
  admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
