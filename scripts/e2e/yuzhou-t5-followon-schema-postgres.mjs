// Real migration 317 against minimal synthetic predecessor contracts. This is
// not full-schema Release Smoke and never accepts external database input.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { Client } from "pg";
assert.equal(process.argv.length, 2);
const scratch = mkdtempSync(join(tmpdir(), "jinhu-t5-schema-fixture-")), data = join(scratch, "pg");
const bin = process.env.YUZHOU_T5_POSTGRES_BIN ?? "";
const call = (name, args) => {
  const result = spawnSync(bin ? join(bin, name) : name, args, { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
};
let started = false, client;
const H = "a".repeat(64), C = "c".repeat(40), own = "yzprod-import-20261001T000000Z-aaaaaaaaaaaa";
const core = "yzprod-import-20261001T000000Z-bbbbbbbbbbbb", payroll = "yzprod-import-20261001T000000Z-cccccccccccc";
const binding = { operationId: own, intent: "APPEND_T5_FULL_HISTORY_ONCE", executionCodeSha: C,
  parent: { operationId: core, sealedPlanSha256: H }, payrollParent: { operationId: payroll, bindingSha256: H },
  triple: { codeSha: C, sourceSnapshotHash: H, mappingContractHash: H }, targetIdentitySha256: H,
  targetScopeSha256: H, targetScope: { tenantId: "tenant", parkId: "park" } };
try {
  call("initdb", ["-D", data, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  call("pg_ctl", ["-D", data, "-l", join(scratch, "server.log"), "-o", `-F -k ${scratch} -c listen_addresses='' -p 55494`, "-w", "start"]);
  started = true;
  client = new Client({ host: scratch, port: 55494, user: "fixture", database: "postgres" }); await client.connect();
  await client.query(`CREATE EXTENSION "uuid-ossp";
   CREATE TABLE hr_yuzhou_production_import_operation(operation_id varchar(64) PRIMARY KEY, status text,authorization_nonce_sha256 text,code_sha text,source_snapshot_sha256 text,mapping_contract_sha256 text,sealed_plan_sha256 text,target_identity_sha256 text,target_scope_sha256 text,target_tenant_id text,target_park_id text);
   CREATE TABLE hr_yuzhou_production_import_authorization_use(authorization_nonce_sha256 text);
   CREATE TABLE hr_yuzhou_t4_followon_operation(operation_id varchar(64) PRIMARY KEY,parent_operation_id text,status text,binding_sha256 text);
   CREATE TABLE hr_yuzhou_t4_followon_authorization_use(operation_id text,nonce_sha256 text);
   CREATE TABLE migration_batch(id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,run_id text,execution_context text,target_database text,production_import_operation_id text,production_import_phase text,t4_followon_operation_id text,source_system text,source_snapshot_sha256 text,tool_version text,phase text,status text,counts jsonb,finished_at timestamptz,update_time timestamptz,CONSTRAINT ck_migration_batch_execution_context CHECK(execution_context IN ('lab_rehearsal','production_import','t4_production_followon')));
   CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),is_deleted boolean,UNIQUE(tenant_id,park_id,id));
   CREATE TABLE legacy_record_map(id uuid PRIMARY KEY,batch_id uuid,target_id uuid,target_table text,source_system text,source_table text,is_active boolean,mapping_status text,source_identity_sha256 text,source_row_sha256 text,source_pk_canonical text);
   CREATE TABLE hr_yuzhou_production_import_record(operation_id text,phase text,source_identity_sha256 text,source_row_sha256 text,target_table text,target_id uuid,disposition text,rollback_status text);
   CREATE TABLE hr_yuzhou_production_import_projection_receipt(operation_id text,phase text,source_identity_sha256 text,legacy_record_map_id uuid,migration_batch_id uuid);`);
  await client.query(readFileSync(resolve(import.meta.dirname, "../../database/migrations/000317_hr_yuzhou_t5_followon.sql"), "utf8"));
  await client.query(`INSERT INTO hr_yuzhou_production_import_operation VALUES($1,'succeeded',$2,$3,$2,$2,$2,$2,$2,'tenant','park');
   `, [core, H, C]);
  await client.query("INSERT INTO hr_yuzhou_t4_followon_operation VALUES($1,$2,'succeeded',$3)", [payroll, core, H]);
  const start = async () => {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("INSERT INTO hr_yuzhou_t5_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES($1,$2,$3,'append')", ["b".repeat(64), "d".repeat(64), own]);
    await client.query("INSERT INTO hr_yuzhou_t5_followon_operation(operation_id,parent_operation_id,payroll_operation_id,binding_sha256,binding,status) VALUES($1,$2,$3,$4,$5,'running')", [own, core, payroll, H, binding]);
  };
  await start();
  assert.equal((await client.query("SELECT hr_yuzhou_t5_followon_context($1,$2) valid", [own, H])).rows[0].valid, true);
  await assert.rejects(client.query("DELETE FROM hr_yuzhou_t5_followon_authorization_use"), /T5_CONTROL_IMMUTABLE/u);
  await client.query("ROLLBACK");
  await start();
  await assert.rejects(client.query("COMMIT"), /T5_APPEND_NOT_TERMINAL/u);
  await client.query("ROLLBACK");
  assert.equal((await client.query("SELECT count(*)::int n FROM hr_yuzhou_t5_followon_operation")).rows[0].n, 0);
  await start();
  await client.query("UPDATE hr_yuzhou_t5_followon_operation SET status='succeeded',finished_at=now() WHERE operation_id=$1", [own]);
  await assert.rejects(client.query("COMMIT"), /T5_SOURCE_DOMAIN_CONSERVATION_FAILED/u);
  await client.query("ROLLBACK");
  await client.query("BEGIN");
  await assert.rejects(client.query("INSERT INTO hr_yuzhou_t5_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES($1,$2,$3,'append')", [H, "d".repeat(64), own]), /T5_FRESH_OPERATION_AND_NONCE_REQUIRED/u);
  await client.query("ROLLBACK");
  await start();
  await client.query("UPDATE hr_yuzhou_t4_followon_operation SET status='rolled_back' WHERE operation_id=$1", [payroll]);
  await assert.rejects(client.query("SELECT hr_yuzhou_t5_followon_context($1,$2)", [own, H]), /T5_FOLLOWON_CONTEXT_INVALID/u);
  await client.query("ROLLBACK");
  console.log("PASS real migration 317: exact succeeded parents, current-transaction context, immutable authorization, fresh nonce, incomplete-commit rejection and zero committed fixture appends");
} finally {
  if (client) await client.end();
  if (started) call("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(scratch, { recursive: true });
}
