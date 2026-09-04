import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perfmasterwriter_${process.pid}`;
const migrations = ["000300_hr_performance_yuzhou_legacy_model.sql", "000301_hr_performance_yuzhou_legacy_writer.sql", "000302_hr_performance_yuzhou_legacy_master.sql", "000303_hr_performance_yuzhou_legacy_master_writer.sql", "000304_hr_performance_yuzhou_legacy_master_parity.sql", "000305_hr_performance_yuzhou_legacy_relations.sql"]
  .map(name => readFileSync(resolve(root, "database/migrations", name), "utf8"));

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
const batch = "00000000-0000-4000-8000-000000000301";
const h = character => character.repeat(64);
const payload = {
  assessmentmaster: [{
    sourceIdentitySha256: h("a"), sourceRowSha256: h("1"), id: 9000,
    asssessionid: 9, person: "P-SYNTH", selfgrade: null, assgrade: "A",
    selfvalue: 90, itemvalue: 80, mitemvalue: 71, xitemvalue: 91, citemvalue: 51,
    mastervalue: 2.1, timekeepvalue: -1, bonusvalue: 0.2, totalvalue: 79,
    selfappraisal: null, appraisal: null, pay: null, assessmentperson: null,
    recdate: null, operator: null, des: null,
  }],
};
const performancePayload = {
  assessmentcode: [{
    sourceIdentitySha256: h("b"), sourceRowSha256: h("2"), assessment: 7,
    assessmentname: "Synthetic", department: null, mpercent: 30, tpercent: 10,
    xpercent: 25, cpercent: 15, spercent: 20, timekeep: true, bonus: true, master: true,
  }],
  assgradecode: [{
    sourceIdentitySha256: h("c"), sourceRowSha256: h("3"), assgrade: "A",
    description: null, myorder: "01", assessmentid: 999, minvalue: 70, maxvalue: 100,
  }],
  assitem: [{
    sourceIdentitySha256: h("d"), sourceRowSha256: h("4"), id: 101,
    assid: 7, assitem: "Synthetic", fullvalue: 100, myorder: 1,
  }],
  assitemgradedes: [],
  assessmentdetail: [{
    sourceIdentitySha256: h("e"), sourceRowSha256: h("5"), id: 7000,
    asssessionid: 9, person: "P-SYNTH", assitemid: 101, selfvalue: 90,
    mitemvalue: 71, itemvalue: 80, xitemvalue: 91, citemvalue: 51,
    selfgrade: null, assgrade: "A", appraisal: null,
  }],
};
const relationPayload = {
  asssession: [{
    sourceIdentitySha256: h("f"), sourceRowSha256: h("6"), id: 9,
    asssession: "Synthetic", description: null, assessmenttype: "MONTH",
    year: 2026, month: 8, quarter: 3, myorder: 1,
  }],
  asssour: [{
    sourceIdentitySha256: h("7"), sourceRowSha256: h("8"), id: 8000,
    asssessionid: 9, person: "P-SYNTH", assitemid: 101, lb: 1,
    itemvalue: 80, assgrade: "A", appraisal: null,
  }],
  asssourperson: [{
    sourceIdentitySha256: h("9"), sourceRowSha256: h("0"), id: 8100,
    asssessionid: 9, person: "P-SYNTH", assperson: "A-SYNTH", lb: 1,
  }],
};
const serialized = JSON.stringify(payload).replaceAll("'", "''");
const performanceSerialized = JSON.stringify(performancePayload).replaceAll("'", "''");
const relationSerialized = JSON.stringify(relationPayload).replaceAll("'", "''");

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
    CREATE TABLE hr_performance_review_cycle(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
  `);
  for (const migration of migrations) psql(database, migration);
  psql(database, `
    INSERT INTO migration_batch(
      id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,execution_context
    ) VALUES('${batch}','perfmasterwriter303','yuzhou-v10',repeat('9',64),current_database(),'load','running','contract-test','lab_rehearsal');
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_lab('tenant-a','park-a','${batch}','${performanceSerialized}'::jsonb);
    CALL materialize_yuzhou_performance_legacy_master_lab('tenant-a','park-a','${batch}','${serialized}'::jsonb);
    CALL materialize_yuzhou_performance_legacy_relations_lab('tenant-a','park-a','${batch}','${relationSerialized}'::jsonb);
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_master_result)<>1
        OR (SELECT count(*) FROM hr_performance_legacy_session)<>1
        OR (SELECT count(*) FROM hr_performance_legacy_score_source)<>1
        OR (SELECT count(*) FROM hr_performance_legacy_source_person_assignment)<>1
        OR (SELECT count(*) FROM legacy_record_map WHERE batch_id='${batch}' AND is_active)<>8 THEN
        RAISE EXCEPTION 'master writer conservation mismatch';
      END IF;
      IF NOT EXISTS(
        SELECT 1 FROM hr_performance_legacy_master_result
        WHERE source_master_id=9000 AND source_session_id=9 AND source_person_code='P-SYNTH'
          AND source_m_item_value=71 AND source_master_value=2.10 AND source_timekeep_value=-1.00
          AND source_bonus_value=0.20 AND source_total_value=79.00
          AND legacy_template_profile_id IS NOT NULL AND source_self_appraisal IS NULL
      ) THEN RAISE EXCEPTION 'master writer field preservation mismatch'; END IF;
      IF NOT EXISTS(
        SELECT 1 FROM hr_performance_legacy_score_source
        WHERE source_score_id=8000 AND legacy_session_id IS NOT NULL
          AND legacy_dimension_profile_id IS NOT NULL AND source_relation_type=1
      ) OR NOT EXISTS(
        SELECT 1 FROM hr_performance_legacy_source_person_assignment
        WHERE source_assignment_id=8100 AND legacy_session_id IS NOT NULL
          AND source_assessor_code='A-SYNTH'
      ) THEN RAISE EXCEPTION 'performance relation projection mismatch'; END IF;
      IF NOT EXISTS(
        SELECT 1 FROM hr_performance_yuzhou_legacy_grade_parity(
          (SELECT id FROM hr_performance_legacy_master_result LIMIT 1)
        ) WHERE parity_status='MATCH' AND calculated_total=79.00 AND expected_ass_grade='A'
      ) THEN RAISE EXCEPTION 'master total and grade parity mismatch'; END IF;
    END
    $test$;
  `);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_master_lab('tenant-a','park-a','${batch}','${serialized}'::jsonb);
    COMMIT;
  `);
  assert.equal(
    psql(database, `SELECT count(*) FROM hr_performance_legacy_master_result;`).stdout.trim(),
    "1",
    "exact replay created a duplicate master row",
  );

  const driftPayload = structuredClone(payload);
  driftPayload.assessmentmaster[0].sourceRowSha256 = h("2");
  const drift = JSON.stringify(driftPayload).replaceAll("'", "''");
  const driftResult = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_master_lab('tenant-a','park-a','${batch}','${drift}'::jsonb);
    COMMIT;
  `, false);
  assert.notEqual(driftResult.status, 0, "master row drift unexpectedly loaded");
  assert.match(driftResult.stderr, /HR_PERFORMANCE_LEGACY_MASTER_WRITER_REPLAY_DRIFT/u);

  psql(database, `
    BEGIN;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id='${batch}';
    SET LOCAL yuzhou.performance_legacy_rollback_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_score_source WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_source_person_assignment WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_master_result WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_dimension_result WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_level_rule WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_template_profile WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_session WHERE migration_batch_id='${batch}';
    UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false WHERE batch_id='${batch}';
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_master_result)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_session)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_score_source)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_source_person_assignment)<>0
        OR (SELECT count(*) FROM legacy_record_map WHERE batch_id='${batch}' AND is_active)<>0 THEN
        RAISE EXCEPTION 'master writer rollback left residue';
      END IF;
    END
    $test$;
  `);

  console.log("Yuzhou performance relation direct PostgreSQL checks passed (8 rows, totals, grades, relations, replay, drift, rollback).")
} finally {
  admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
