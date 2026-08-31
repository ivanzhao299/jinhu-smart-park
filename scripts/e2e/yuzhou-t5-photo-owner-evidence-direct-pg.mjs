#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const container = process.env.YUZHOU_POSTGRES_CONTAINER ?? "jinhu_hr_migration_lab_core_curr098-postgres-1";
const composeProject = process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT ?? "jinhu_hr_migration_lab_core_curr098";
const database = `jinhu_hr_migration_lab_t5file${process.pid}${Date.now()}`;
const runId = `t5-file-fixture-${process.pid}`;
const t0RunId = `t0-file-fixture-${process.pid}`;
const stageRoot = mkdtempSync(join(tmpdir(), "yuzhou-t5-file-evidence-"));
const sha = value => createHash("sha256").update(value).digest("hex");

const command = (program, args, { input, expect = 0, env = {} } = {}) => {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", input, env: { ...process.env, ...env }, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== expect) throw new Error(`${program} failed status=${result.status ?? "signal"}: ${(result.stderr ?? result.stdout ?? result.error?.message ?? "no command output").trim()}`);
  return (result.stdout ?? "").trim();
};
const psql = (target, sql) => command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", target], { input: sql });
const psqlFailure = (target, sql) => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", target], { cwd: root, encoding: "utf8", input: sql, maxBuffer: 4 * 1024 * 1024 });
  assert.notEqual(result.status, 0, "unsafe direct write unexpectedly succeeded");
  return `${result.stdout}${result.stderr}`;
};

function createSyntheticStage(name, missingOwnerIndex = -1) {
  const stage = join(stageRoot, name);
  chmodSync(stageRoot, 0o700);
  mkdirSync(stage, { mode: 0o700 });
  chmodSync(stage, 0o700);
  const rows = Array.from({ length: 2155 }, (_, index) => ({
    sourceTable: "dbo.person.photo",
    sourceIdentitySha256: sha(`photo:${index}`),
    sourceRowSha256: sha(`row:${index}`),
    ownerSourceTable: "dbo.person",
    ownerSourceIdentitySha256: sha(`dbo.person\0${index === missingOwnerIndex ? `missing-owner-${index}` : `owner-${index}`}`),
    fileRole: "employee_photo",
    contentSha256: sha(`content:${index}`),
    actualSize: index + 1,
    detectedMime: "image/bmp",
    readabilityStatus: "readable"
  }));
  const evidence = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const fileSha256 = sha(evidence);
  writeFileSync(join(stage, "photo-owner-evidence.jsonl"), evidence, { mode: 0o600 });
  chmodSync(join(stage, "photo-owner-evidence.jsonl"), 0o600);
  const snapshot = sha("fixture-snapshot");
  const manifest = {
    artifactKind: "yuzhou_t5_photo_owner_stage", productionImport: "HOLD", sourceRows: 2155, excludedEmptyRows: 794,
    ownerLookupAlgorithm: "sha256(dbo.person\\0+trim(person))", sourceSnapshotSha256: snapshot,
    sourceRestoreReceiptSha256: sha("fixture-receipt"), sourceBusinessSha256: sha("fixture-business"), sourceCatalogSha256: sha("fixture-catalog"),
    sourcePhotoFileSha256: fileSha256, stageSha256: sha("fixture-stage"), domains: { photo: { sourceObject: "dbo.person.photo", rows: 2155, file: "photo-owner-evidence.jsonl", fileSha256 } }
  };
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  chmodSync(join(stage, "manifest.json"), 0o600);
  return { snapshot, stage };
}

let created = false;
try {
  assert.equal(command("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', container]), composeProject, "unexpected PostgreSQL compose project");
  assert.match(database, /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u);
  const { snapshot, stage } = createSyntheticStage("all-mapped");
  command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres"], { input: `CREATE DATABASE ${database} TEMPLATE template0;\n` });
  created = true;
  psql(database, `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE hr_employee (id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,is_deleted boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,park_id,id));
CREATE TABLE sys_file (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
CREATE TABLE hr_employee_document (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
CREATE TABLE hr_employee_compensation (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
CREATE TABLE hr_payroll_run (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
CREATE TABLE hr_payslip (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
CREATE TABLE biz_user_message (id uuid PRIMARY KEY DEFAULT uuid_generate_v4());
`);
  const migrationControl = readFileSync(join(root, "database/migrations/000235_hr_legacy_migration_control.sql"), "utf8");
  const migrationT5 = readFileSync(join(root, "database/migrations/000256_hr_legacy_t5_history.sql"), "utf8");
  psql(database, `${migrationControl}\n${migrationT5}`);
  psql(database, `
INSERT INTO hr_employee(id,tenant_id,park_id) VALUES('11111111-1111-4111-8111-111111111111','fixture-tenant','fixture-park');
INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,started_at,finished_at)
VALUES('${t0RunId}','yuzhou-v10','${snapshot}','${database}','verify','succeeded','fixture',now(),now());
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10','dbo.person','fixture-owner',encode(digest(convert_to('dbo.person','utf8')||decode('00','hex')||convert_to('owner-'||g::text,'utf8'),'sha256'),'hex'),encode(digest('fixture-row-'||g::text,'sha256'),'hex'),'hr_employee','11111111-1111-4111-8111-111111111111','verified'
FROM migration_batch b CROSS JOIN generate_series(0,2154) g WHERE b.run_id='${t0RunId}';
`);
  const environment = {
    YUZHOU_POSTGRES_CONTAINER: container, YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT: composeProject, YUZHOU_TARGET_DATABASE: database,
    YUZHOU_T5_FILE_STAGING_DIR: stage, YUZHOU_T5_FILE_RUN_ID: runId, YUZHOU_T0_RUN_ID: t0RunId,
    YUZHOU_TARGET_TENANT_ID: "fixture-tenant", YUZHOU_TARGET_PARK_ID: "fixture-park",
    ALLOW_YUZHOU_MIGRATION: "yes", YUZHOU_T5_FILE_MODE: "isolated_rehearsal"
  };
  assert.equal(command("sh", ["scripts/load-yuzhou-t5-photo-owner-evidence.sh"], { env: environment }), "succeeded|2155|2155|0");
  assert.equal(psql(database, `SELECT (SELECT count(*) FROM hr_legacy_t5_file_evidence)||'|'||(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${runId}') AND is_active)||'|'||(SELECT count(*) FROM migration_check WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${runId}') AND passed)||'|'||(SELECT count(*) FROM jsonb_object_keys((SELECT expected_value FROM migration_check WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${runId}') AND check_code='T5_FILE_NO_BINARY_OR_LINK_WRITE')));`), "2155|2155|2|7");
  const immutable = psqlFailure(database, `DELETE FROM hr_legacy_t5_file_evidence WHERE import_batch_id=(SELECT id FROM hr_legacy_t5_import_batch WHERE batch_code='${runId}');`);
  assert.match(immutable, /immutable outside exact unpublished legacy rollback/u);
  assert.equal(command("sh", ["scripts/rollback-yuzhou-t5-photo-owner-evidence.sh"], { env: { ...environment, ALLOW_YUZHOU_ROLLBACK: "yes" } }), "rolled_back");
  assert.equal(psql(database, `SELECT (SELECT status FROM migration_batch WHERE run_id='${runId}')||'|'||(SELECT count(*) FROM hr_legacy_t5_file_evidence)||'|'||(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${runId}') AND is_active)||'|'||(SELECT count(*) FROM sys_file)||'|'||(SELECT count(*) FROM hr_employee_document)||'|'||(SELECT count(*) FROM hr_employee_compensation)||'|'||(SELECT count(*) FROM hr_payroll_run)||'|'||(SELECT count(*) FROM hr_payslip);`), "rolled_back|0|0|0|0|0|0|0");
  const quarantinedRunId = `${runId}-quarantine`;
  const quarantinedStage = createSyntheticStage("one-unmapped", 0).stage;
  const quarantinedEnvironment = { ...environment, YUZHOU_T5_FILE_RUN_ID: quarantinedRunId, YUZHOU_T5_FILE_STAGING_DIR: quarantinedStage };
  assert.equal(command("sh", ["scripts/load-yuzhou-t5-photo-owner-evidence.sh"], { env: quarantinedEnvironment }), "succeeded|2155|2154|1");
  assert.equal(psql(database, `SELECT (SELECT count(*) FROM hr_legacy_t5_file_evidence)||'|'||(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${quarantinedRunId}') AND mapping_status='quarantined' AND is_active)||'|'||(SELECT count(*) FROM migration_error WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${quarantinedRunId}') AND error_code='PHOTO_OWNER_UNMAPPED');`), "2154|1|1");
  assert.equal(command("sh", ["scripts/rollback-yuzhou-t5-photo-owner-evidence.sh"], { env: { ...quarantinedEnvironment, ALLOW_YUZHOU_ROLLBACK: "yes" } }), "rolled_back");
  assert.equal(psql(database, `SELECT (SELECT count(*) FROM hr_legacy_t5_file_evidence)||'|'||(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${quarantinedRunId}') AND is_active)||'|'||(SELECT count(*) FROM migration_error WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id='${quarantinedRunId}'))||'|'||(SELECT count(*) FROM sys_file)||'|'||(SELECT count(*) FROM hr_employee_document)||'|'||(SELECT count(*) FROM hr_employee_compensation)||'|'||(SELECT count(*) FROM hr_payroll_run)||'|'||(SELECT count(*) FROM hr_payslip);`), "0|0|1|0|0|0|0|0");
  process.stdout.write("Yuzhou T5_FILE photo-owner evidence direct PostgreSQL fixture passed: synthetic 2155-row load, immutability denial, mapped and quarantined rollback, protected-write residual=0.\n");
} finally {
  if (created) command("docker", ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres"], { input: `DROP DATABASE IF EXISTS ${database} WITH (FORCE);\n`, expect: 0 });
  rmSync(stageRoot, { recursive: true, force: true });
}
