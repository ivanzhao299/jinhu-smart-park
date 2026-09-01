#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { deriveYuzhouPhotoFileId } from "../hr-cutover/yuzhou-photo-file-rehearsal-persistence.mjs";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_POSTGRES_CONTAINER ?? "jinhu-smart-park-postgres";
const composeProject = process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT ?? "jinhu_hr_migration_lab";
const database = `jinhu_hr_migration_lab_t5photo${process.pid}${Date.now()}`;
const hash = value => createHash("sha256").update(value).digest("hex");
const md5 = value => createHash("md5").update(value).digest("hex");
const command = (program, args, { input, expect = 0 } = {}) => {
  const result = spawnSync(program, args, { cwd: root, input, encoding: "utf8" });
  if (result.status !== expect) throw new Error(`${program} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
const psql = sql => command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], { input: sql });
const psqlFailure = sql => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], { cwd: root, input: sql, encoding: "utf8" });
  if (result.status === 0) throw new Error("expected PostgreSQL failure");
  return `${result.stdout}${result.stderr}`;
};
const literal = value => JSON.stringify(value).replaceAll("'", "''");

let created = false;
try {
  assert.equal(command("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', container]), composeProject, "unexpected PostgreSQL compose project");
  assert.match(database, /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u);
  command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres"], { input: `CREATE DATABASE ${database} TEMPLATE template0;\n` });
  created = true;
  psql(`
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE sys_file (
  id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,file_code varchar(32) NOT NULL,
  original_name varchar(255) NOT NULL,stored_name varchar(255) NOT NULL,file_url varchar(500) NOT NULL,file_size bigint NOT NULL,
  mime_type varchar(128) NOT NULL,md5 varchar(32) NOT NULL,content_sha256 varchar(64),biz_type varchar(64) NOT NULL,biz_id uuid,
  storage_type varchar(32) NOT NULL,storage_bucket varchar(128),storage_path varchar(500) NOT NULL,is_encrypted boolean NOT NULL DEFAULT false,
  status smallint NOT NULL DEFAULT 1,create_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_by uuid,update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_sys_file_scope_code UNIQUE(tenant_id,park_id,file_code)
);
${readFileSync(resolve(root, "database/migrations/000235_hr_legacy_migration_control.sql"), "utf8")}
`);
  const batchId = "00000000-0000-4000-8000-000000000001";
  psql(`INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,started_at,finished_at) VALUES('${batchId}','t5-photo-fixture','yuzhou-v10','${hash("snapshot")}',current_database(),'load','succeeded','fixture',now(),now());`);
  const sourceRows = [1, 2].map(index => {
    const identity = hash(`identity:${index}`), normalized = hash(`normalized:${index}`), id = deriveYuzhouPhotoFileId(identity);
    return { id, tenant_id: "fixture-tenant", park_id: "fixture-park", file_code: `YHP${identity.slice(0, 24)}`, original_name: `${normalized}.jpg`, stored_name: `${normalized}.jpg`, file_url: `/api/v1/files/${id}/download`, file_size: String(index + 10), mime_type: "image/jpeg", md5: md5(`jpeg:${index}`), content_sha256: normalized, biz_type: "hr_employee_photo", biz_id: "00000000-0000-4000-8000-000000000010", storage_type: "local", storage_path: `yuzhou-hr/t5-photo/fixture-photo/${normalized}.jpg`, source_identity_sha256: identity, source_row_sha256: hash(`row:${index}`) };
  });
  const payload = literal(sourceRows);
  const result = psql(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
SHOW transaction_isolation;
SELECT pg_advisory_xact_lock(hashtext(identity)) FROM unnest(ARRAY[${sourceRows.map(row => `'${row.source_identity_sha256}'`).join(",")}]) identity;
INSERT INTO sys_file(id,tenant_id,park_id,file_code,original_name,stored_name,file_url,file_size,mime_type,md5,content_sha256,biz_type,biz_id,storage_type,storage_bucket,storage_path,is_encrypted,status,is_deleted,version)
SELECT id,tenant_id,park_id,file_code,original_name,stored_name,file_url,file_size::bigint,mime_type,md5,content_sha256,biz_type,biz_id,storage_type,NULL,storage_path,false,1,false,1
FROM jsonb_to_recordset('${payload}'::jsonb) AS row(id uuid,tenant_id varchar,park_id varchar,file_code varchar,original_name varchar,stored_name varchar,file_url varchar,file_size varchar,mime_type varchar,md5 varchar,content_sha256 varchar,biz_type varchar,biz_id uuid,storage_type varchar,storage_path varchar,source_identity_sha256 varchar,source_row_sha256 varchar);
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
SELECT '${batchId}'::uuid,'yuzhou-v10','dbo.person.photo','sha256:'||source_identity_sha256,source_identity_sha256,source_row_sha256,'sys_file',id,'loaded',true
FROM jsonb_to_recordset('${payload}'::jsonb) AS row(id uuid,tenant_id varchar,park_id varchar,file_code varchar,original_name varchar,stored_name varchar,file_url varchar,file_size varchar,mime_type varchar,md5 varchar,content_sha256 varchar,biz_type varchar,biz_id uuid,storage_type varchar,storage_path varchar,source_identity_sha256 varchar,source_row_sha256 varchar);
COMMIT;
SELECT (SELECT count(*) FROM sys_file WHERE biz_type='hr_employee_photo')||'|'||(SELECT count(*) FROM legacy_record_map WHERE batch_id='${batchId}'::uuid AND is_active);
`);
  assert.match(result, /serializable/u);
  assert.match(result, /2\|2$/u);
  const conflict = psqlFailure(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) VALUES('${batchId}'::uuid,'yuzhou-v10','dbo.person.photo','sha256:${sourceRows[0].source_identity_sha256}','${sourceRows[0].source_identity_sha256}','${sourceRows[0].source_row_sha256}','sys_file','${sourceRows[0].id}'::uuid,'loaded',true);`);
  assert.match(conflict, /uq_legacy_record_map_active_source/u);
  assert.equal(psql(`BEGIN ISOLATION LEVEL SERIALIZABLE; DELETE FROM sys_file WHERE tenant_id='fixture-tenant' AND park_id='fixture-park' AND id=ANY(ARRAY[${sourceRows.map(row => `'${row.id}'::uuid`).join(",")}]) AND biz_type='hr_employee_photo'; UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false WHERE batch_id='${batchId}'::uuid AND source_table='dbo.person.photo' AND is_active; COMMIT; SELECT (SELECT count(*) FROM sys_file)||'|'||(SELECT count(*) FROM legacy_record_map WHERE batch_id='${batchId}'::uuid AND is_active)||'|'||(SELECT count(*) FROM legacy_record_map WHERE batch_id='${batchId}'::uuid AND mapping_status='rolled_back');`), "0|0|2");
  process.stdout.write("Yuzhou photo file rehearsal direct PostgreSQL fixture passed: serializable synthetic sys_file + exact map write, replay conflict, metadata rollback and zero active residual.\n");
} finally {
  if (created) command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres"], { input: `DROP DATABASE IF EXISTS ${database} WITH (FORCE);\n` });
}
