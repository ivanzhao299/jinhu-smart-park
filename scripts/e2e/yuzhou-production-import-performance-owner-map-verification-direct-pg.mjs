#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_perf_owner_map_${process.pid}`;
const migration = readFileSync(resolve(
  root,
  "database/migrations/000310_hr_yuzhou_performance_fact_identity_production.sql",
), "utf8");
const helperStart = migration.indexOf(
  "CREATE OR REPLACE FUNCTION hr_yuzhou_performance_owner_map_projection_v1(",
);
const helperEnd = migration.indexOf(
  "CREATE OR REPLACE FUNCTION hr_yuzhou_performance_fact_identity_context_allowed_v1(",
);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "000310 owner-map helper block missing");
const helpers = migration.slice(helperStart, helperEnd);

function psql(targetDatabase, sql, expectSuccess = true) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", targetDatabase],
    { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return result;
}

const admin = sql => psql("postgres", sql);
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const hash = value => String(value).repeat(64).slice(0, 64);
const tableBindings = [
  ["hr_performance_legacy_template_profile", "dbo.assessmentcode"],
  ["hr_performance_legacy_level_rule", "dbo.assgradecode"],
  ["hr_performance_legacy_dimension_profile", "dbo.assitem"],
  ["hr_performance_legacy_dimension_level_guide", "dbo.assitemgradedes"],
  ["hr_performance_legacy_dimension_result", "dbo.assessmentdetail"],
  ["hr_performance_legacy_master_result", "dbo.assessmentmaster"],
  ["hr_performance_legacy_session", "dbo.asssession"],
  ["hr_performance_legacy_score_source", "dbo.asssour"],
  ["hr_performance_legacy_source_person_assignment", "dbo.asssourperson"],
];

function fixtureSql(batch, offset, { extraMap = false, firstVerified = false } = {}) {
  const rows = tableBindings.map(([targetTable, sourceTable], index) => {
    const targetId = id(offset + index + 1);
    const mapId = id(offset + 100 + index + 1);
    const identity = hash((index + 1).toString(16));
    const rowHash = hash((index + 7).toString(16));
    const status = firstVerified && index === 0 ? "verified" : "loaded";
    return `
      INSERT INTO legacy_record_map(
        id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
        source_row_sha256,target_table,target_id,mapping_status,is_active
      ) VALUES(
        '${mapId}','${batch}','yuzhou-v10','${sourceTable}','sha256:${identity}',
        '${identity}','${rowHash}','${targetTable}','${targetId}','${status}',true
      );
      INSERT INTO ${targetTable}(
        id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,
        source_identity_sha256,source_row_sha256
      ) VALUES('${targetId}','tenant-a','park-a','${batch}','${mapId}','${identity}','${rowHash}');`;
  }).join("\n");
  const extra = extraMap ? `
    INSERT INTO legacy_record_map(
      id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
      source_row_sha256,target_table,target_id,mapping_status,is_active
    ) VALUES(
      '${id(offset + 999)}','${batch}','yuzhou-v10','dbo.assitem','sha256:${hash("e")}',
      '${hash("e")}','${hash("f")}',
      'hr_performance_legacy_dimension_profile','${id(offset + 998)}','loaded',true
    );` : "";
  return rows + extra;
}

const batchOk = id(1);
const batchExtra = id(2);
const batchMixed = id(3);
const batchDeferredFailure = id(4);

try {
  admin(`CREATE DATABASE ${database} TEMPLATE template0;`);
  psql(database, `
    CREATE EXTENSION pgcrypto;
    CREATE TABLE migration_batch(id uuid PRIMARY KEY);
    CREATE TABLE legacy_record_map(
      id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES migration_batch(id),
      source_system varchar NOT NULL,source_table varchar(256) NOT NULL,
      source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,
      source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,
      mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL,update_time timestamptz NOT NULL DEFAULT now()
    );
    ${tableBindings.map(([table]) => `CREATE TABLE ${table}(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,legacy_record_map_id uuid NOT NULL,
      source_identity_sha256 char(64) NOT NULL,source_row_sha256 char(64) NOT NULL
    );`).join("\n")}
    ${helpers}
    INSERT INTO migration_batch(id) VALUES
      ('${batchOk}'),('${batchExtra}'),('${batchMixed}'),('${batchDeferredFailure}');
    ${fixtureSql(batchOk, 1000)}
    ${fixtureSql(batchExtra, 2000, { extraMap: true })}
    ${fixtureSql(batchMixed, 3000, { firstVerified: true })}
    ${fixtureSql(batchDeferredFailure, 4000)}
    CREATE FUNCTION reject_deferred_fixture_promotion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.batch_id='${batchDeferredFailure}' AND OLD.mapping_status='loaded'
        AND NEW.mapping_status='verified' THEN
        RAISE EXCEPTION 'SYNTHETIC_DEFERRED_EXACT_GUARD_FAILURE';
      END IF;
      RETURN NEW;
    END$$;
    CREATE CONSTRAINT TRIGGER reject_deferred_fixture_promotion
      AFTER UPDATE OF mapping_status ON legacy_record_map
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION reject_deferred_fixture_promotion();
  `);

  const first = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT fact_owner_maps,relation_owner_maps,verified_owner_maps,
      length(owner_map_state_sha256)
    FROM hr_yuzhou_verify_performance_owner_maps_v1(
      'tenant-a','park-a','${batchOk}',3,false);
    COMMIT;
  `).stdout.trim().split("\n").find(line => line.includes("|"));
  assert.equal(first, "6|3|9|64", "loaded owner maps were not promoted exactly");
  assert.equal(
    psql(database, `SELECT mapping_status||':'||count(*) FROM legacy_record_map
      WHERE batch_id='${batchOk}' GROUP BY mapping_status;`).stdout.trim(),
    "verified:9",
    "successful promotion did not leave exactly nine verified maps",
  );

  const replay = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT fact_owner_maps,relation_owner_maps,verified_owner_maps
    FROM hr_yuzhou_verify_performance_owner_maps_v1(
      'tenant-a','park-a','${batchOk}',3,true);
    COMMIT;
  `).stdout.trim().split("\n").find(line => line.includes("|"));
  assert.equal(replay, "6|3|9", "verified replay was not exact and idempotent");

  const extraFailure = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT * FROM hr_yuzhou_verify_performance_owner_maps_v1(
      'tenant-a','park-a','${batchExtra}',3,false);
    COMMIT;
  `, false);
  assert.notEqual(extraFailure.status, 0, "unowned active map was accepted");
  assert.match(extraFailure.stderr, /HR_PERFORMANCE_OWNER_MAP_CONSERVATION_FAILED/u);
  assert.equal(
    psql(database, `SELECT count(*) FROM legacy_record_map
      WHERE batch_id='${batchExtra}' AND mapping_status='verified';`).stdout.trim(),
    "0",
    "failed conservation committed a partial status promotion",
  );

  const mixedFailure = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT * FROM hr_yuzhou_verify_performance_owner_maps_v1(
      'tenant-a','park-a','${batchMixed}',3,false);
    COMMIT;
  `, false);
  assert.notEqual(mixedFailure.status, 0, "mixed loaded/verified first apply was accepted");
  assert.match(mixedFailure.stderr, /HR_PERFORMANCE_OWNER_MAP_PRECONDITION_FAILED/u);
  assert.equal(
    psql(database, `SELECT mapping_status||':'||count(*) FROM legacy_record_map
      WHERE batch_id='${batchMixed}' GROUP BY mapping_status ORDER BY mapping_status;`).stdout.trim(),
    "loaded:8\nverified:1",
    "failed mixed-state apply changed owner-map state",
  );

  const deferredFailure = psql(database, `
    BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    SELECT * FROM hr_yuzhou_verify_performance_owner_maps_v1(
      'tenant-a','park-a','${batchDeferredFailure}',3,false);
    COMMIT;
  `, false);
  assert.notEqual(deferredFailure.status, 0, "deferred exact guard failure was ignored");
  assert.match(deferredFailure.stderr, /SYNTHETIC_DEFERRED_EXACT_GUARD_FAILURE/u);
  assert.equal(
    psql(database, `SELECT count(*) FROM legacy_record_map
      WHERE batch_id='${batchDeferredFailure}' AND mapping_status='verified';`).stdout.trim(),
    "0",
    "failure after the status updates committed a partial promotion",
  );

  console.log("YUZHOU_PERFORMANCE_OWNER_MAP_VERIFICATION_DIRECT_PG_PASS");
} finally {
  admin(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database}'; DROP DATABASE IF EXISTS ${database};`);
}
