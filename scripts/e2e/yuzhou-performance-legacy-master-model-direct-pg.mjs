import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perfmaster_${process.pid}`;
const model = readFileSync(resolve(root, "database/migrations/000300_hr_performance_yuzhou_legacy_model.sql"), "utf8");
const master = readFileSync(resolve(root, "database/migrations/000302_hr_performance_yuzhou_legacy_master.sql"), "utf8");
const parity = readFileSync(resolve(root, "database/migrations/000304_hr_performance_yuzhou_legacy_master_parity.sql"), "utf8");

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
const levelMap = id("17");
const tiedLevelMap = id("18");
const roundingTemplateMap = id("31");
const roundingDimensionMap = id("32");
const positiveRoundingResultMap = id("33");
const negativeRoundingResultMap = id("34");
const unavailableMasterMap = id("35");
const positiveRoundingMasterMap = id("36");
const negativeRoundingMasterMap = id("37");
const template = id("21");
const dimension1 = id("22");
const dimension2 = id("23");
const result1 = id("24");
const result2 = id("25");
const masterFact = id("26");
const levelFact = id("27");
const tiedLevelFact = id("28");
const roundingTemplate = id("41");
const roundingDimension = id("42");
const positiveRoundingResult = id("43");
const negativeRoundingResult = id("44");
const unavailableMasterFact = id("45");
const positiveRoundingMasterFact = id("46");
const negativeRoundingMasterFact = id("47");

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
  psql(database, parity);

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
      ('${masterMap}','${batch}','yuzhou-v10','dbo.assessmentmaster','sha256:'||repeat('6',64),repeat('6',64),repeat('7',64),'hr_performance_legacy_master_result','${masterFact}','loaded',true),
      ('${levelMap}','${batch}','yuzhou-v10','dbo.assgradecode','sha256:'||repeat('7',64),repeat('7',64),repeat('8',64),'hr_performance_legacy_level_rule','${levelFact}','loaded',true),
      ('${roundingTemplateMap}','${batch}','yuzhou-v10','dbo.assessmentcode','sha256:'||repeat('9',64),repeat('9',64),repeat('a',64),'hr_performance_legacy_template_profile','${roundingTemplate}','loaded',true),
      ('${roundingDimensionMap}','${batch}','yuzhou-v10','dbo.assitem','sha256:'||repeat('a',64),repeat('a',64),repeat('b',64),'hr_performance_legacy_dimension_profile','${roundingDimension}','loaded',true),
      ('${positiveRoundingResultMap}','${batch}','yuzhou-v10','dbo.assessmentdetail','sha256:'||repeat('b',64),repeat('b',64),repeat('c',64),'hr_performance_legacy_dimension_result','${positiveRoundingResult}','loaded',true),
      ('${negativeRoundingResultMap}','${batch}','yuzhou-v10','dbo.assessmentdetail','sha256:'||repeat('c',64),repeat('c',64),repeat('d',64),'hr_performance_legacy_dimension_result','${negativeRoundingResult}','loaded',true),
      ('${unavailableMasterMap}','${batch}','yuzhou-v10','dbo.assessmentmaster','sha256:'||repeat('d',64),repeat('d',64),repeat('e',64),'hr_performance_legacy_master_result','${unavailableMasterFact}','loaded',true),
      ('${positiveRoundingMasterMap}','${batch}','yuzhou-v10','dbo.assessmentmaster','sha256:'||repeat('e',64),repeat('e',64),repeat('f',64),'hr_performance_legacy_master_result','${positiveRoundingMasterFact}','loaded',true),
      ('${negativeRoundingMasterMap}','${batch}','yuzhou-v10','dbo.assessmentmaster','sha256:'||repeat('f',64),repeat('f',64),repeat('0',64),'hr_performance_legacy_master_result','${negativeRoundingMasterFact}','loaded',true);

    INSERT INTO hr_performance_legacy_template_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_assessment,source_m_percent,source_t_percent,source_x_percent,
      source_c_percent,source_s_percent
    ) VALUES
      ('${template}','tenant-a','park-a','${batch}','${templateMap}',repeat('a',64),repeat('1',64),7,30,10,25,15,20),
      ('${roundingTemplate}','tenant-a','park-a','${batch}','${roundingTemplateMap}',repeat('9',64),repeat('a',64),8,100,NULL,NULL,NULL,NULL);

    INSERT INTO hr_performance_legacy_dimension_profile(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_item_id,source_assessment_id,legacy_template_profile_id
    ) VALUES
      ('${dimension1}','tenant-a','park-a','${batch}','${dimensionMap1}',repeat('b',64),repeat('2',64),70,7,'${template}'),
      ('${dimension2}','tenant-a','park-a','${batch}','${dimensionMap2}',repeat('c',64),repeat('3',64),71,7,'${template}'),
      ('${roundingDimension}','tenant-a','park-a','${batch}','${roundingDimensionMap}',repeat('a',64),repeat('b',64),72,8,'${roundingTemplate}');

    INSERT INTO hr_performance_legacy_level_rule(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_ass_grade,source_assessment_id,source_min_value,source_max_value
    ) VALUES(
      '${levelFact}','tenant-a','park-a','${batch}','${levelMap}',repeat('7',64),repeat('8',64),
      'A',999,70,100
    );

    INSERT INTO hr_performance_legacy_dimension_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_detail_id,source_session_id,source_person_code,source_item_id,
      source_self_value,source_m_item_value,source_item_value,source_x_item_value,source_c_item_value,
      legacy_dimension_profile_id
    ) VALUES
      ('${result1}','tenant-a','park-a','${batch}','${resultMap1}',repeat('d',64),repeat('4',64),7000,9,'P-SYNTH',70,80.00,70.40,60.00,90.40,50.40,'${dimension1}'),
      ('${result2}','tenant-a','park-a','${batch}','${resultMap2}',repeat('e',64),repeat('5',64),7001,9,'P-SYNTH',71,10.00,0.40,20.00,0.40,0.40,'${dimension2}'),
      ('${positiveRoundingResult}','tenant-a','park-a','${batch}','${positiveRoundingResultMap}',repeat('b',64),repeat('c',64),7002,10,'P-RND-P',72,NULL,1.50,NULL,NULL,NULL,'${roundingDimension}'),
      ('${negativeRoundingResult}','tenant-a','park-a','${batch}','${negativeRoundingResultMap}',repeat('c',64),repeat('d',64),7003,11,'P-RND-N',72,NULL,-1.50,NULL,NULL,NULL,'${roundingDimension}');

    INSERT INTO hr_performance_legacy_master_result(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_master_id,source_session_id,source_person_code,source_self_grade,
      source_ass_grade,source_self_value,source_item_value,source_m_item_value,source_x_item_value,
      source_c_item_value,source_master_value,source_timekeep_value,source_bonus_value,
      source_total_value,source_self_appraisal,source_appraisal,source_pay,source_assessment_person,
      source_recorded_at,source_operator_code,source_description,legacy_template_profile_id
    ) VALUES
      ('${masterFact}','tenant-a','park-a','${batch}','${masterMap}',repeat('6',64),repeat('7',64),
       9000,9,'P-SYNTH',NULL,'A',90.00,80.00,71,91,51,2.10,-1.00,0.20,79.00,
       NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${template}'),
      ('${unavailableMasterFact}','tenant-a','park-a','${batch}','${unavailableMasterMap}',repeat('d',64),repeat('e',64),
       9001,12,'P-NODTL',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
       NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${roundingTemplate}'),
      ('${positiveRoundingMasterFact}','tenant-a','park-a','${batch}','${positiveRoundingMasterMap}',repeat('e',64),repeat('f',64),
       9002,10,'P-RND-P',NULL,NULL,NULL,NULL,2,NULL,NULL,NULL,NULL,NULL,2.00,
       NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${roundingTemplate}'),
      ('${negativeRoundingMasterFact}','tenant-a','park-a','${batch}','${negativeRoundingMasterMap}',repeat('f',64),repeat('0',64),
       9003,11,'P-RND-N',NULL,NULL,NULL,NULL,-2,NULL,NULL,NULL,NULL,NULL,-2.00,
       NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${roundingTemplate}');
    SET CONSTRAINTS ALL IMMEDIATE;

    DO $test$
    DECLARE
      subtotal numeric;
      full_total numeric;
      grade_status text;
      expected_grade varchar;
      unavailable_total numeric;
      unavailable_status text;
      no_grade_total numeric;
      no_grade_status text;
      positive_rounding_total numeric;
      negative_rounding_total numeric;
    BEGIN
      SELECT hr_performance_yuzhou_weighted_detail_total(
        'tenant-a','park-a','${batch}','${template}',9,'P-SYNTH'
      ) INTO subtotal;
      SELECT hr_performance_yuzhou_legacy_full_total('${masterFact}') INTO full_total;
      SELECT parity_status,expected_ass_grade INTO grade_status,expected_grade
      FROM hr_performance_yuzhou_legacy_grade_parity('${masterFact}');
      IF subtotal<>77.70 THEN RAISE EXCEPTION 'weighted subtotal mismatch: %',subtotal; END IF;
      IF full_total<>79.00 THEN RAISE EXCEPTION 'full total mismatch: %',full_total; END IF;
      IF full_total<>(SELECT source_total_value FROM hr_performance_legacy_master_result WHERE id='${masterFact}') THEN
        RAISE EXCEPTION 'source total parity mismatch';
      END IF;
      IF grade_status<>'MATCH' OR expected_grade<>'A' THEN
        RAISE EXCEPTION 'grade parity mismatch: %, %',grade_status,expected_grade;
      END IF;
      SELECT calculated_total,parity_status INTO unavailable_total,unavailable_status
      FROM hr_performance_yuzhou_legacy_grade_parity('${unavailableMasterFact}');
      IF unavailable_total IS NOT NULL OR unavailable_status<>'TOTAL_UNAVAILABLE' THEN
        RAISE EXCEPTION 'missing-detail branch mismatch: %, %',unavailable_total,unavailable_status;
      END IF;
      SELECT hr_performance_yuzhou_legacy_full_total('${positiveRoundingMasterFact}') INTO positive_rounding_total;
      SELECT calculated_total,parity_status INTO no_grade_total,no_grade_status
      FROM hr_performance_yuzhou_legacy_grade_parity('${negativeRoundingMasterFact}');
      SELECT hr_performance_yuzhou_legacy_full_total('${negativeRoundingMasterFact}') INTO negative_rounding_total;
      IF positive_rounding_total<>2.00 OR negative_rounding_total<>-2.00 THEN
        RAISE EXCEPTION 'numeric(18,0) half rounding mismatch: %, %',positive_rounding_total,negative_rounding_total;
      END IF;
      IF no_grade_total<>-2.00 OR no_grade_status<>'NO_ELIGIBLE_GRADE' THEN
        RAISE EXCEPTION 'no-eligible-grade branch mismatch: %, %',no_grade_total,no_grade_status;
      END IF;
      IF (SELECT source_t_percent IS NOT NULL OR source_x_percent IS NOT NULL
                 OR source_c_percent IS NOT NULL OR source_s_percent IS NOT NULL
          FROM hr_performance_legacy_template_profile WHERE id='${roundingTemplate}') THEN
        RAISE EXCEPTION 'null weight fixture drifted';
      END IF;
      IF (SELECT source_master_value IS NOT NULL OR source_timekeep_value IS NOT NULL
                 OR source_bonus_value IS NOT NULL
          FROM hr_performance_legacy_master_result WHERE id='${positiveRoundingMasterFact}') THEN
        RAISE EXCEPTION 'null adjustment fixture drifted';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM hr_performance_legacy_master_result
          WHERE id='${masterFact}' AND source_self_appraisal IS NULL
            AND source_pay IS NULL AND source_operator_code IS NULL) THEN
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
    INSERT INTO legacy_record_map(
      id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
      source_row_sha256,target_table,target_id,mapping_status,is_active
    ) VALUES(
      '${tiedLevelMap}','${batch}','yuzhou-v10','dbo.assgradecode','sha256:'||repeat('8',64),
      repeat('8',64),repeat('9',64),'hr_performance_legacy_level_rule','${tiedLevelFact}','loaded',true
    );
    INSERT INTO hr_performance_legacy_level_rule(
      id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
      source_row_sha256,source_ass_grade,source_assessment_id,source_min_value,source_max_value
    ) VALUES(
      '${tiedLevelFact}','tenant-a','park-a','${batch}','${tiedLevelMap}',repeat('8',64),repeat('9',64),
      'A-TIE',123,70,100
    );
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
    DO $test$
    DECLARE grade_status text; expected_grade varchar; candidate_count bigint;
    BEGIN
      SELECT parity_status,expected_ass_grade,winning_candidate_count
      INTO grade_status,expected_grade,candidate_count
      FROM hr_performance_yuzhou_legacy_grade_parity('${masterFact}');
      IF grade_status<>'AMBIGUOUS_TOP_THRESHOLD' OR expected_grade IS NOT NULL OR candidate_count<>2 THEN
        RAISE EXCEPTION 'same-threshold ambiguity was hidden: %, %, %',grade_status,expected_grade,candidate_count;
      END IF;
    END
    $test$;
  `);

  psql(database, `
    BEGIN;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id='${batch}';
    SET LOCAL yuzhou.performance_legacy_rollback_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_master_result WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_level_rule WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_dimension_result WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_dimension_profile WHERE migration_batch_id='${batch}';
    DELETE FROM hr_performance_legacy_template_profile WHERE migration_batch_id='${batch}';
    UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false WHERE batch_id='${batch}';
    SET CONSTRAINTS ALL IMMEDIATE;
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_master_result)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_level_rule)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_result)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_profile)<>0
        OR (SELECT count(*) FROM hr_performance_legacy_template_profile)<>0
        OR (SELECT count(*) FROM legacy_record_map WHERE batch_id='${batch}' AND is_active)<>0 THEN
        RAISE EXCEPTION 'rollback left performance master residue';
      END IF;
    END
    $test$;
  `);

  console.log("Yuzhou performance master direct PostgreSQL checks passed (total, unavailable/no-grade branches, null defaults, positive/negative half rounding, ambiguity, guard, rollback).")
} finally {
  admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
