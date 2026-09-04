import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perflegacy_${process.pid}`;
const migration = readFileSync(
  resolve(root, "database/migrations/000300_hr_performance_yuzhou_legacy_model.sql"),
  "utf8",
);

function psql(targetDatabase, sql, expectSuccess = true) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", targetDatabase],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (expectSuccess) {
    assert.equal(result.status, 0, result.stderr);
  }
  return result;
}

function admin(sql) {
  return psql("postgres", sql);
}

const ids = Object.freeze({
  batch: "00000000-0000-4000-8000-000000000001",
  templateMap: "00000000-0000-4000-8000-000000000011",
  levelMap: "00000000-0000-4000-8000-000000000012",
  dimensionMap: "00000000-0000-4000-8000-000000000013",
  guideMap: "00000000-0000-4000-8000-000000000014",
  resultMap: "00000000-0000-4000-8000-000000000015",
  badMap: "00000000-0000-4000-8000-000000000016",
  template: "00000000-0000-4000-8000-000000000021",
  level: "00000000-0000-4000-8000-000000000022",
  dimension: "00000000-0000-4000-8000-000000000023",
  guide: "00000000-0000-4000-8000-000000000024",
  result: "00000000-0000-4000-8000-000000000025",
  badTemplate: "00000000-0000-4000-8000-000000000026",
});

try {
  admin(`CREATE DATABASE ${database} TEMPLATE template0;`);
  psql(database, `
    CREATE EXTENSION "uuid-ossp";
    CREATE TABLE migration_batch(
      id uuid PRIMARY KEY,
      run_id varchar(64) NOT NULL,
      source_system varchar(64) NOT NULL,
      source_snapshot_sha256 char(64) NOT NULL,
      target_database varchar(128) NOT NULL,
      phase varchar(32) NOT NULL,
      status varchar(32) NOT NULL,
      tool_version varchar(64) NOT NULL
    );
    CREATE TABLE legacy_record_map(
      id uuid PRIMARY KEY,
      batch_id uuid NOT NULL REFERENCES migration_batch(id),
      source_system varchar(64) NOT NULL,
      source_table varchar(256) NOT NULL,
      source_pk_canonical varchar(512) NOT NULL,
      source_identity_sha256 char(64) NOT NULL,
      source_row_sha256 char(64) NOT NULL,
      target_table varchar(256) NOT NULL,
      target_id uuid,
      mapping_status varchar(32) NOT NULL,
      is_active boolean NOT NULL,
      update_time timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE hr_performance_template(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_version(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_id uuid NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_dimension(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_version_id uuid NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_level(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_version_id uuid NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_cycle_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
  `);
  psql(database, migration);

  psql(database, `
    BEGIN;
    INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version)
    VALUES('${ids.batch}','perflegacy300','yuzhou-v10',repeat('f',64),current_database(),'load','running','contract-test');

    INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) VALUES
      ('${ids.templateMap}','${ids.batch}','yuzhou-v10','dbo.assessmentcode','sha256:'||repeat('a',64),repeat('a',64),repeat('1',64),'hr_performance_legacy_template_profile','${ids.template}','loaded',true),
      ('${ids.levelMap}','${ids.batch}','yuzhou-v10','dbo.assgradecode','sha256:'||repeat('b',64),repeat('b',64),repeat('2',64),'hr_performance_legacy_level_rule','${ids.level}','loaded',true),
      ('${ids.dimensionMap}','${ids.batch}','yuzhou-v10','dbo.assitem','sha256:'||repeat('c',64),repeat('c',64),repeat('3',64),'hr_performance_legacy_dimension_profile','${ids.dimension}','loaded',true),
      ('${ids.guideMap}','${ids.batch}','yuzhou-v10','dbo.assitemgradedes','sha256:'||repeat('d',64),repeat('d',64),repeat('4',64),'hr_performance_legacy_dimension_level_guide','${ids.guide}','loaded',true),
      ('${ids.resultMap}','${ids.batch}','yuzhou-v10','dbo.assessmentdetail','sha256:'||repeat('e',64),repeat('e',64),repeat('5',64),'hr_performance_legacy_dimension_result','${ids.result}','loaded',true);

    INSERT INTO hr_performance_legacy_template_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256,
      source_assessment,source_assessment_name,source_department,source_m_percent,source_t_percent,
      source_x_percent,source_c_percent,source_s_percent,source_timekeep,source_bonus,source_master
    ) VALUES(
      '${ids.template}','tenant-a','park-a','${ids.batch}','${ids.templateMap}',repeat('a',64),repeat('1',64),
      7,NULL,NULL,30,10,25,15,20,NULL,true,false
    );
    INSERT INTO hr_performance_legacy_level_rule(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256,
      source_ass_grade,source_description,source_my_order,source_assessment_id,source_min_value,source_max_value,
      legacy_template_profile_id
    ) VALUES(
      '${ids.level}','tenant-a','park-a','${ids.batch}','${ids.levelMap}',repeat('b',64),repeat('2',64),
      'A',NULL,'01',7,90,NULL,'${ids.template}'
    );
    INSERT INTO hr_performance_legacy_dimension_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256,
      source_item_id,source_assessment_id,source_item_name,source_full_value,source_my_order,legacy_template_profile_id
    ) VALUES(
      '${ids.dimension}','tenant-a','park-a','${ids.batch}','${ids.dimensionMap}',repeat('c',64),repeat('3',64),
      70,7,NULL,100.00,1,'${ids.template}'
    );
    INSERT INTO hr_performance_legacy_dimension_level_guide(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256,
      source_guide_id,source_item_id,source_grade,source_description,source_min_value,source_max_value,source_my_order,
      legacy_dimension_profile_id
    ) VALUES(
      '${ids.guide}','tenant-a','park-a','${ids.batch}','${ids.guideMap}',repeat('d',64),repeat('4',64),
      700,70,'A',NULL,90,100,1,'${ids.dimension}'
    );
    INSERT INTO hr_performance_legacy_dimension_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256,
      source_detail_id,source_session_id,source_person_code,source_item_id,source_self_value,source_m_item_value,
      source_item_value,source_x_item_value,source_c_item_value,source_self_grade,source_ass_grade,source_appraisal,
      legacy_dimension_profile_id
    ) VALUES(
      '${ids.result}','tenant-a','park-a','${ids.batch}','${ids.resultMap}',repeat('e',64),repeat('5',64),
      7000,9,'P-SYNTH',70,80.00,70.00,60.00,90.00,50.00,NULL,'A',NULL,'${ids.dimension}'
    );
    SET CONSTRAINTS ALL IMMEDIATE;

    DO $test$
    DECLARE subtotal numeric;
    BEGIN
      SELECT hr_performance_yuzhou_weighted_detail_total(
        'tenant-a','park-a','${ids.batch}','${ids.template}',9,'P-SYNTH'
      ) INTO subtotal;
      IF subtotal<>73.00 THEN RAISE EXCEPTION 'weighted subtotal mismatch'; END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_template_profile WHERE source_assessment_name IS NULL AND source_timekeep IS NULL)<>1 THEN
        RAISE EXCEPTION 'nullable source values were not preserved';
      END IF;
      BEGIN
        UPDATE hr_performance_legacy_template_profile SET source_assessment_name='changed' WHERE id='${ids.template}';
        RAISE EXCEPTION 'append-only update unexpectedly succeeded';
      EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
      END;
    END
    $test$;
    COMMIT;
  `);

  const mismatch = psql(database, `
    BEGIN;
    INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
    VALUES('${ids.badMap}','${ids.batch}','yuzhou-v10','dbo.wrong','sha256:'||repeat('6',64),repeat('6',64),repeat('6',64),'hr_performance_legacy_template_profile','${ids.badTemplate}','loaded',true);
    INSERT INTO hr_performance_legacy_template_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256,source_assessment
    ) VALUES('${ids.badTemplate}','tenant-a','park-a','${ids.batch}','${ids.badMap}',repeat('6',64),repeat('6',64),8);
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
  `, false);
  assert.notEqual(mismatch.status, 0, "mismatched record map unexpectedly committed");
  assert.match(mismatch.stderr, /HR_PERFORMANCE_LEGACY_RECORD_MAP_MISMATCH/);

  psql(database, `
    BEGIN;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id='${ids.batch}';
    SET LOCAL yuzhou.performance_legacy_rollback_batch_id='${ids.batch}';
    DELETE FROM hr_performance_legacy_dimension_result WHERE migration_batch_id='${ids.batch}';
    DELETE FROM hr_performance_legacy_dimension_level_guide WHERE migration_batch_id='${ids.batch}';
    DELETE FROM hr_performance_legacy_level_rule WHERE migration_batch_id='${ids.batch}';
    DELETE FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id='${ids.batch}';
    DELETE FROM hr_performance_legacy_template_profile WHERE migration_batch_id='${ids.batch}';
    UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false WHERE batch_id='${ids.batch}';
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_template_profile)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_level_rule)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_profile)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_level_guide)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_result)<>0
        OR (SELECT count(*) FROM legacy_record_map WHERE batch_id='${ids.batch}' AND is_active)<>0 THEN
        RAISE EXCEPTION 'rollback left performance compatibility residue';
      END IF;
    END
    $test$;
  `);

  console.log("Yuzhou performance legacy model direct PostgreSQL checks passed (load, 41-field shape, score, guard, rollback).");
} finally {
  admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
