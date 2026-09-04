import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perfidentity_${process.pid}`;
const migration = readFileSync(
  resolve(root, "database/migrations/000306_hr_performance_yuzhou_identity_resolution.sql"),
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
const labBatch = "00000000-0000-4000-8000-000000000306";
const employeeExact = "10000000-0000-4000-8000-000000000001";
const employeeAmbiguous1 = "10000000-0000-4000-8000-000000000002";
const employeeAmbiguous2 = "10000000-0000-4000-8000-000000000003";
const employeeOtherScope = "10000000-0000-4000-8000-000000000004";
const cycle = "20000000-0000-4000-8000-000000000001";
const cycleEmployee = "30000000-0000-4000-8000-000000000001";
const sessionResolved = "40000000-0000-4000-8000-000000000001";
const sessionUnmatched = "40000000-0000-4000-8000-000000000002";
const h = character => character.repeat(64);

const payload = {
  sessions: [
    {
      sourceSessionIdentitySha256: h("a"),
      status: "resolved",
      reasonCode: "EXPLICIT_SESSION_CYCLE_ATTESTATION",
      targetReviewCycleId: cycle,
      decisionAttestationSha256: h("b"),
    },
    {
      sourceSessionIdentitySha256: h("c"),
      status: "semantics_unverified",
      reasonCode: "SESSION_SEMANTICS_UNVERIFIED",
      targetReviewCycleId: null,
      decisionAttestationSha256: h("d"),
    },
  ],
};
const serialized = JSON.stringify(payload).replaceAll("'", "''");
const sourcePersonAssignmentsSql = Array.from({ length: 117 }, (_, index) => {
  const id = `73000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  const sourcePersonCode = index < 9
    ? "P-EXACT"
    : `P-MISS-${String(index - 8).padStart(3, "0")}`;
  return `('${id}','tenant-a','park-a','${labBatch}','${sourcePersonCode}','',9)`;
}).join(",\n      ");

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
      mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL,update_time timestamptz DEFAULT now()
    );
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
    CREATE TABLE hr_performance_review_cycle(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_cycle_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      cycle_id uuid NOT NULL,employee_id uuid NOT NULL,
      UNIQUE(id,tenant_id,park_id),UNIQUE(tenant_id,park_id,cycle_id,employee_id)
    );
    CREATE TABLE hr_performance_legacy_session(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,source_identity_sha256 char(64) NOT NULL,
      source_session_id integer NOT NULL,target_review_cycle_id uuid,
      UNIQUE(id,tenant_id,park_id,migration_batch_id)
    );
    CREATE TABLE hr_performance_legacy_dimension_result(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,source_person_code varchar(10),source_session_id integer,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_legacy_master_result(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,source_person_code varchar(10),source_session_id integer,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_legacy_score_source(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,source_person_code varchar(10),source_session_id integer,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_legacy_source_person_assignment(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,source_person_code varchar(10),source_assessor_code varchar(50),
      source_session_id integer,UNIQUE(id,tenant_id,park_id)
    );
    CREATE FUNCTION hr_performance_yuzhou_jsonb_exact_keys(p_value jsonb,p_keys text[])
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT jsonb_typeof(p_value)='object'
        AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_value) key)
          = (SELECT array_agg(key ORDER BY key) FROM unnest(p_keys) key)
    $$;
  `);
  psql(database, migration);

  psql(database, `
    INSERT INTO migration_batch VALUES
      ('${labBatch}','identity-resolution-306','yuzhou-v10',repeat('0',64),current_database(),'load','running','contract-test','lab_rehearsal',NULL,NULL),
      ('50000000-0000-4000-8000-000000000001','production-t0-a','yuzhou-v10',repeat('1',64),current_database(),'verify','succeeded','prod','production_import','op-a','T0'),
      ('50000000-0000-4000-8000-000000000002','production-t0-b','yuzhou-v10',repeat('2',64),current_database(),'verify','succeeded','prod','production_import','op-b','T0'),
      ('50000000-0000-4000-8000-000000000003','production-t0-c','yuzhou-v10',repeat('3',64),current_database(),'verify','succeeded','prod','production_import','op-c','T0'),
      ('50000000-0000-4000-8000-000000000004','production-t0-scope','yuzhou-v10',repeat('4',64),current_database(),'verify','succeeded','prod','production_import','op-scope','T0'),
      ('50000000-0000-4000-8000-000000000005','production-t0-failed','yuzhou-v10',repeat('5',64),current_database(),'verify','succeeded','prod','production_import','op-failed','T0');
    INSERT INTO hr_employee VALUES
      ('${employeeExact}','tenant-a','park-a',false),
      ('${employeeAmbiguous1}','tenant-a','park-a',false),
      ('${employeeAmbiguous2}','tenant-a','park-a',false),
      ('${employeeOtherScope}','tenant-a','park-b',false);
    INSERT INTO hr_performance_review_cycle VALUES('${cycle}','tenant-a','park-a');
    INSERT INTO hr_performance_cycle_employee VALUES(
      '${cycleEmployee}','tenant-a','park-a','${cycle}','${employeeExact}'
    );
    INSERT INTO hr_performance_legacy_session VALUES
      ('${sessionResolved}','tenant-a','park-a','${labBatch}',repeat('a',64),9,NULL),
      ('${sessionUnmatched}','tenant-a','park-a','${labBatch}',repeat('c',64),10,NULL);

    INSERT INTO hr_yuzhou_production_import_operation VALUES
      ('op-a','succeeded',2,'tenant-a','park-a'),
      ('op-b','succeeded',2,'tenant-a','park-a'),
      ('op-c','succeeded',2,'tenant-a','park-a'),
      ('op-scope','succeeded',2,'tenant-a','park-b'),
      ('op-failed','failed',2,'tenant-a','park-a');
    INSERT INTO hr_yuzhou_production_import_phase VALUES
      ('op-a','T0','succeeded'),('op-b','T0','succeeded'),
      ('op-c','T0','succeeded'),('op-scope','T0','succeeded'),
      ('op-failed','T0','succeeded');

    WITH identities AS (
      SELECT
        hr_performance_yuzhou_person_identity_sha256('P-EXACT') exact_hash,
        hr_performance_yuzhou_person_identity_sha256('P-AMBIG') ambiguous_hash,
        hr_performance_yuzhou_person_identity_sha256('P-SCOPE') scope_hash,
        hr_performance_yuzhou_person_identity_sha256('P-INACTIVE') inactive_hash,
        hr_performance_yuzhou_person_identity_sha256('P-FAILED') failed_hash
    )
    INSERT INTO legacy_record_map(
      id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
      source_row_sha256,target_table,target_id,mapping_status,is_active
    )
    SELECT * FROM (
      SELECT '60000000-0000-4000-8000-000000000001'::uuid,'50000000-0000-4000-8000-000000000001'::uuid,
        'yuzhou-v10','dbo.person','sha256:'||exact_hash,exact_hash,repeat('5',64)::char(64),'hr_employee','${employeeExact}'::uuid,'verified',true FROM identities
      UNION ALL SELECT '60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',
        'yuzhou-v10','dbo.person','sha256:'||ambiguous_hash,ambiguous_hash,repeat('6',64)::char(64),'hr_employee','${employeeAmbiguous1}','loaded',true FROM identities
      UNION ALL SELECT '60000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003',
        'yuzhou-v10','dbo.person','sha256:'||ambiguous_hash,ambiguous_hash,repeat('7',64)::char(64),'hr_employee','${employeeAmbiguous2}','verified',true FROM identities
      UNION ALL SELECT '60000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000004',
        'yuzhou-v10','dbo.person','sha256:'||scope_hash,scope_hash,repeat('8',64)::char(64),'hr_employee','${employeeOtherScope}','verified',true FROM identities
      UNION ALL SELECT '60000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000001',
        'yuzhou-v10','dbo.person','sha256:'||inactive_hash,inactive_hash,repeat('9',64)::char(64),'hr_employee','${employeeExact}','verified',false FROM identities
      UNION ALL SELECT '60000000-0000-4000-8000-000000000006','50000000-0000-4000-8000-000000000005',
        'yuzhou-v10','dbo.person','sha256:'||failed_hash,failed_hash,repeat('0',64)::char(64),'hr_employee','${employeeExact}','verified',true FROM identities
    ) fixture;

    INSERT INTO hr_yuzhou_production_import_record
      (operation_id,phase,source_identity_sha256,source_system,source_table,source_pk_canonical,
       disposition,target_table,target_id,rollback_status)
    SELECT operation_id,'T0',source_identity_sha256,'yuzhou-v10','dbo.person',
      'sha256:'||source_identity_sha256,'insert','hr_employee',target_id,'not_started'
    FROM (VALUES
      ('op-a'::varchar,(SELECT source_identity_sha256 FROM legacy_record_map WHERE id='60000000-0000-4000-8000-000000000001'),'${employeeExact}'::uuid),
      ('op-b',(SELECT source_identity_sha256 FROM legacy_record_map WHERE id='60000000-0000-4000-8000-000000000002'),'${employeeAmbiguous1}'::uuid),
      ('op-c',(SELECT source_identity_sha256 FROM legacy_record_map WHERE id='60000000-0000-4000-8000-000000000003'),'${employeeAmbiguous2}'::uuid),
      ('op-scope',(SELECT source_identity_sha256 FROM legacy_record_map WHERE id='60000000-0000-4000-8000-000000000004'),'${employeeOtherScope}'::uuid),
      ('op-a',(SELECT source_identity_sha256 FROM legacy_record_map WHERE id='60000000-0000-4000-8000-000000000005'),'${employeeExact}'::uuid),
      ('op-failed',(SELECT source_identity_sha256 FROM legacy_record_map WHERE id='60000000-0000-4000-8000-000000000006'),'${employeeExact}'::uuid)
    ) records(operation_id,source_identity_sha256,target_id);
    INSERT INTO hr_yuzhou_production_import_projection_receipt
      (operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id)
    SELECT migration_batch.production_import_operation_id,'T0',
      legacy_record_map.source_identity_sha256,legacy_record_map.batch_id,legacy_record_map.id
    FROM legacy_record_map JOIN migration_batch ON migration_batch.id=legacy_record_map.batch_id;

    INSERT INTO hr_performance_legacy_dimension_result VALUES
      ('70000000-0000-4000-8000-000000000001','tenant-a','park-a','${labBatch}','P-EXACT',9);
    INSERT INTO hr_performance_legacy_master_result VALUES
      ('71000000-0000-4000-8000-000000000001','tenant-a','park-a','${labBatch}','P-MISSING',9);
    INSERT INTO hr_performance_legacy_score_source VALUES
      ('72000000-0000-4000-8000-000000000001','tenant-a','park-a','${labBatch}','P-AMBIG',9),
      ('72000000-0000-4000-8000-000000000002','tenant-a','park-a','${labBatch}','p-exact',9),
      ('72000000-0000-4000-8000-000000000003','tenant-a','park-a','${labBatch}','P-SCOPE',9),
      ('72000000-0000-4000-8000-000000000004','tenant-a','park-a','${labBatch}','P-EXACT',10);
    INSERT INTO hr_performance_legacy_source_person_assignment VALUES
      ${sourcePersonAssignmentsSql};
  `);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_identity_resolution_lab(
      'tenant-a','park-a','${labBatch}','${serialized}'::jsonb
    );
    COMMIT;
    DO $test$
    BEGIN
      IF (SELECT count(*) FROM hr_performance_legacy_session_binding)<>2
        OR (SELECT count(*) FROM hr_performance_legacy_identity_resolution)<>240 THEN
        RAISE EXCEPTION 'identity resolution conservation mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_identity_resolution
          WHERE person_resolution_status='resolved')<>11
        OR (SELECT count(*) FROM hr_performance_legacy_identity_resolution
          WHERE person_resolution_status='unmatched')<>111
        OR (SELECT count(*) FROM hr_performance_legacy_identity_resolution
          WHERE person_resolution_status='ambiguous')<>1
        OR (SELECT count(*) FROM hr_performance_legacy_identity_resolution
          WHERE person_resolution_status='not_applicable')<>117
        OR (SELECT count(*) FROM hr_performance_legacy_identity_resolution
          WHERE person_resolution_status='semantics_unverified')<>0 THEN
        RAISE EXCEPTION 'identity status matrix mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_legacy_identity_resolution
          WHERE cycle_resolution_status='resolved' AND target_cycle_employee_id='${cycleEmployee}')<>10
        OR (SELECT count(*) FROM hr_performance_legacy_identity_resolution
          WHERE cycle_resolution_status='unmatched')<>1 THEN
        RAISE EXCEPTION 'cycle binding matrix mismatch';
      END IF;
      IF (SELECT count(*) FROM hr_performance_yuzhou_t0_person_candidate(
          'tenant-a','park-a',hr_performance_yuzhou_person_identity_sha256('P-INACTIVE')))<>0
        OR (SELECT count(*) FROM hr_performance_yuzhou_t0_person_candidate(
          'tenant-a','park-a',hr_performance_yuzhou_person_identity_sha256('P-FAILED')))<>0 THEN
        RAISE EXCEPTION 'inactive or failed T0 evidence was accepted';
      END IF;
      IF EXISTS(SELECT 1 FROM hr_performance_legacy_identity_resolution
        WHERE person_resolution_status<>'resolved'
          AND (owner_t0_record_map_id IS NOT NULL OR target_employee_id IS NOT NULL)) THEN
        RAISE EXCEPTION 'unresolved identity received a modern target';
      END IF;
    END
    $test$;
  `);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_identity_resolution_lab(
      'tenant-a','park-a','${labBatch}','${serialized}'::jsonb
    );
    COMMIT;
  `);
  assert.equal(
    psql(database, "SELECT count(*) FROM hr_performance_legacy_identity_resolution;").stdout.trim(),
    "240",
    "exact replay created duplicate identity facts",
  );

  const driftPayload = structuredClone(payload);
  driftPayload.sessions[0].decisionAttestationSha256 = h("e");
  const drift = JSON.stringify(driftPayload).replaceAll("'", "''");
  const driftResult = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL materialize_yuzhou_performance_legacy_identity_resolution_lab(
      'tenant-a','park-a','${labBatch}','${drift}'::jsonb
    );
    COMMIT;
  `, false);
  assert.notEqual(driftResult.status, 0, "session decision drift unexpectedly replayed");
  assert.match(driftResult.stderr, /HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_REPLAY_DRIFT/u);

  const immutable = psql(database, `
    UPDATE hr_performance_legacy_identity_resolution
    SET person_resolution_reason_code='T0_PERSON_MAP_NOT_FOUND';
  `, false);
  assert.match(immutable.stderr, /HR_PERFORMANCE_LEGACY_IDENTITY_RESOLUTION_IMMUTABLE/u);

  const reverseMap = psql(database, `
    UPDATE legacy_record_map SET is_active=false
    WHERE id='60000000-0000-4000-8000-000000000001';
  `, false);
  assert.match(reverseMap.stderr, /HR_PERFORMANCE_LEGACY_T0_MAP_REFERENCED/u);

  const reverseEmployee = psql(database, `
    UPDATE hr_employee SET is_deleted=true WHERE id='${employeeExact}';
  `, false);
  assert.match(reverseEmployee.stderr, /HR_PERFORMANCE_LEGACY_EMPLOYEE_RESOLUTION_REFERENCED/u);

  psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    UPDATE migration_batch SET phase='rollback',status='running' WHERE id='${labBatch}';
    CALL rollback_yuzhou_performance_legacy_identity_resolution_lab('${labBatch}');
    COMMIT;
    DO $test$
    BEGIN
      IF EXISTS(SELECT 1 FROM hr_performance_legacy_identity_resolution)
        OR EXISTS(SELECT 1 FROM hr_performance_legacy_session_binding) THEN
        RAISE EXCEPTION 'identity rollback left ledger residue';
      END IF;
      IF (SELECT count(*) FROM hr_employee)<>4
        OR (SELECT count(*) FROM hr_performance_review_cycle)<>1
        OR (SELECT count(*) FROM hr_performance_cycle_employee)<>1
        OR (SELECT count(*) FROM legacy_record_map)<>6
        OR (SELECT count(*) FROM hr_performance_legacy_dimension_result)<>1
        OR (SELECT count(*) FROM hr_performance_legacy_master_result)<>1
        OR (SELECT count(*) FROM hr_performance_legacy_score_source)<>4
        OR (SELECT count(*) FROM hr_performance_legacy_source_person_assignment)<>117 THEN
        RAISE EXCEPTION 'identity rollback mutated owner or source facts';
      END IF;
    END
    $test$;
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    CALL rollback_yuzhou_performance_legacy_identity_resolution_lab('${labBatch}');
    COMMIT;
  `);

  console.log(
    "Yuzhou performance identity-resolution direct PostgreSQL checks passed (117 synthetic assignments, 108 unmatched subjects, 117 blank assessors, replay, reverse guards, zero-residual rollback).",
  );
} finally {
  admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}
