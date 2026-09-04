import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perfmaster_${process.pid}`;
const model = readFileSync(resolve(root, "database/migrations/000300_hr_performance_yuzhou_legacy_model.sql"), "utf8");
const master = readFileSync(resolve(root, "database/migrations/000302_hr_performance_yuzhou_legacy_master.sql"), "utf8");

function psql(targetDatabase, sql, expectSuccess = true) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", targetDatabase],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return result;
}

const admin = sql => psql("postgres", sql);
const id = suffix => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const batch = id("1");
const templateMap = id("11");
const dimensionMap1 = id("12");
const dimensionMap2 = id("13");
const resultMap1 = id("14");
const resultMap2 = id("15");
const masterMap = id("16");
const template = id("21");
const dimension1 = id("22");
const dimension2 = id("23");
const result1 = id("24");
const result2 = id("25");
const masterFact = id("26");

try {
  admin(`CREATE DATABASE ${database} TEMPLATE template0;`);
  psql(database, `
    CREATE EXTENSION "uuid-ossp";
    CREATE TABLE migration_batch(
      id uuid PRIMARY KEY,run_id varchar(64) NOT NULL,source_system varchar(64) NOT NULL,
      source_snapshot_sha256 char(64) NOT NULL,target_database varchar(128) NOT NULL,
      phase varchar(32) NOT NULL,status varchar(32) NOT NULL,tool_version varchar(64) NOT NULL
    );
    CREATE TABLE legacy_record_map(
      id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES migration_batch(id),
      source_system varchar(64) NOT NULL,source_table varchar(256) NOT NULL,
      source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,
      source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,
      mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL,
      update_time timestamptz NOT NULL DEFAULT now()
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
    CREATE TABLE hr_performance_cycle_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
  `);
  psql(database, model);
  psql(database, master);

  psql(database, `
    BEGIN;
    INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version)
    VALUES('${batch}','perfmaster302','yuzhou-v10',repeat('f',64),current_database(),'load','running','contract-test');

    INSERT INTO legacy_record_map(
      id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
      source_row_sha256,target_table,target_id,mapping_status,is_active
    ) VALUES
      ('${templateMap}','${batch}','yuzhou-v10','dbo.assessmentcode','sha256:'||repeat('a',64),repeat('a',64),repeat('1',64),'hr_performance_legacy_template_profile','${template}','loaded',true),
      ('${dimensionMap1}','${batch}','yuzhou-v10','dbo.assitem','sha256:'||repeat('b',64),repeat('b',64),repeat('2',64),'hr_performance_legacy_dimension_profile','${dimension1}','loaded',true),
      ('${dimensionMap2}','${batch}','yuzhou-v10','dbo.assitem','sha256:'||repeat('c',64),repeat('c',64),repeat('3',64),'hr_performance_legacy_dimension_profile','${dimension2}','loaded',true),
      ('${resultMap1}','${batch}','yuzhou-v10','dbo.assessmentdetail','sha256:'||repeat('d',64),repeat('d',64),repeat('4',64),'hr_performance_legacy_dimension_result','${result1}','loaded',true),
      ('${resultMap2}','${batch}','yuzhou-v10','dbo.assessmentdetail','sha256:'||repeat('e',64),repeat('e',64),repeat('5',64),'hr_performance_legacy_dimension_result','${result2}','loaded',true),
      ('${masterMap}','${batch}','yuzhou-v10','dbo.assessmentmaster','sha256:'||repeat('6',64),repeat('6',64),repeat('7',64),'hr_performance_legacy_master_result','${masterFact}','loaded',true);

    INSERT INTO hr_performance_legacy_template_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_assessment,source_m_percent,source_t_percent,source_x_percent,
      source_c_percent,source_s_percent
    ) VALUES('${template}','tenant-a','park-a','${batch}','${templateMap}',repeat('a',64),repeat('1',64),7,30,10,25,15,20);

    INSERT INTO hr_performance_legacy_dimension_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_item_id,source_assessment_id,legacy_template_profile_id
    ) VALUES
      ('${dimension1}','tenant-a','park-a','${batch}','${dimensionMap1}',repeat('b',64),repeat('2',64),70,7,'${template}'),
      ('${dimension2}','tenant-a','park-a','${batch}','${dimensionMap2}',repeat('c',64),repeat('3',64),71,7,'${template}');

    INSERT INTO hr_performance_legacy_dimension_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_detail_id,source_session_id,source_person_code,source_item_id,
      source_self_value,source_m_item_value,source_item_value,source_x_item_value,source_c_item_value,
      legacy_dimension_profile_id
    ) VALUES
      ('${result1}','tenant-a','park-a','${batch}','${resultMap1}',repeat('d',64),repeat('4',64),7000,9,'P-SYNTH',70,80.00,70.40,60.00,90.40,50.40,'${dimension1}'),
      ('${result2}','tenant-a','park-a','${batch}','${resultMap2}',repeat('e',64),repeat('5',64),7001,9,'P-SYNTH',71,10.00,0.40,20.00,0.40,0.40,'${dimension2}');

    INSERT INTO hr_performance_legacy_master_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_master_id,source_session_id,source_person_code,source_self_grade,
      source_ass_grade,source_self_value,source_item_value,source_m_item_value,source_x_item_value,
      source_c_item_value,source_master_value,source_timekeep_value,source_bonus_value,
      source_total_value,source_self_appraisal,source_appraisal,source_pay,source_assessment_person,
      source_recorded_at,source_operator_code,source_description,legacy_template_profile_id
    ) VALUES(
      '${masterFact}','tenant-a','park-a','${batch}','${masterMap}',repeat('6',64),repeat('7',64),
      9000,9,'P-SYNTH',NULL,'A',90.00,80.00,71,91,51,2.10,-1.00,0.20,79.00,
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${template}'
    );
    SET CONSTRAINTS ALL IMMEDIATE;

    DO $test$
    DECLARE subtotal numeric; full_total numeric;
    BEGIN
      SELECT hr_performance_yuzhou_weighted_detail_total(
        'tenant-a','park-a','${batch}','${template}',9,'P-SYNTH'
      ) INTO subtotal;
      SELECT hr_performance_yuzhou_legacy_full_total('${masterFact}') INTO full_total;
      IF subtotal<>77.70 THEN RAISE EXCEPTION 'weighted subtotal mismatch: %',subtotal; END IF;
      IF full_total<>79.00 THEN RAISE EXCEPTION 'full total mismatch: %',full_total; END IF;
      IF full_total<>(SELECT source_total_value FROM hr_performance_legacy_master_result WHERE id='${masterFact}') THEN
        RAISE EXCEPTION 'source total parity mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_master_result
          WHERE source_self_appraisal IS NULL AND source_pay IS NULL AND source_operator_code IS NULL)<>1 THEN
        RAISE EXCEPTION 'nullable master values were not preserved';
      END IF;
      BEGIN
        UPDATE hr_performance_legacy_master_result SET source_total_value=0 WHERE id='${masterFact}';
        RAISE EXCEPTION 'append-only update unexpectedly succeeded';
      EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
      END;
    END
    $test$;
    COMMIT;
  `);

  psql(database, `
    BEGIN;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id='${batch}';
    SET LOCAL yuzhou.performance_legacy_rollback_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_master_result WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_dimension_result WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_template_profile WHERE migration_batch_id='${batch}';
    UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false WHERE batch_id='${batch}';
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_master_result)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_result)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_profile)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_template_profile)<>0
        OR (SELECT count(*) FROM legacy_record_map WHERE batch_id='${batch}' AND is_active)<>0 THEN
        RAISE EXCEPTION 'rollback left performance master residue';
      END IF;
    END
    $test$;
  `);

  console.log("Yuzhou performance master direct PostgreSQL checks passed (rounding, full total, guard, rollback).")
} finally {
  admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
