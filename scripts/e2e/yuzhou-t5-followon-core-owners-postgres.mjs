// Disposable local PostgreSQL, synthetic records; no URL or production input.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import console from "node:console";
import { Client } from "pg";
import { T5_CORE_OWNER_SQL, validateT5CoreOwnerRows } from "../hr-cutover/t5-followon-core-owners.mjs";
assert.equal(process.argv.length, 2, "no external database arguments");
const scratch = mkdtempSync(join(tmpdir(), "jinhu-t5-owner-fixture-"));
const data = join(scratch, "pg");
const bin = process.env.YUZHOU_T5_POSTGRES_BIN ?? "";
const call = (name, args) => {
  const result = spawnSync(bin ? join(bin, name) : name, args, { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
};
let started = false, client;
try {
  call("initdb", ["-D", data, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  call("pg_ctl", ["-D", data, "-l", join(scratch, "server.log"), "-o", `-F -k ${scratch} -c listen_addresses='' -p 55493`, "-w", "start"]);
  started = true;
  client = new Client({ host: scratch, port: 55493, user: "fixture", database: "postgres" });
  await client.connect();
  await client.query(`CREATE EXTENSION pgcrypto;
    CREATE TABLE hr_employee(id uuid PRIMARY KEY,employee_code text,tenant_id text,park_id text,employment_status text,is_deleted boolean);
    CREATE TABLE hr_yuzhou_production_import_record(operation_id text,phase text,source_identity_sha256 text,source_row_sha256 text,disposition text,rollback_status text,target_table text,target_id uuid);
    CREATE TABLE hr_yuzhou_production_import_projection_receipt(operation_id text,phase text,source_identity_sha256 text,legacy_record_map_id uuid,migration_batch_id uuid);
    CREATE TABLE legacy_record_map(id uuid, batch_id uuid,source_system text,source_table text,target_table text,target_id uuid,source_identity_sha256 text,source_row_sha256 text,source_pk_canonical text,is_active boolean,mapping_status text);
    CREATE TEMP TABLE source AS SELECT n::text code,gen_random_uuid() employee,gen_random_uuid() map,gen_random_uuid() batch,encode(digest(n::text,'sha256'),'hex') identity,encode(digest('row-'||n::text,'sha256'),'hex') row_hash FROM generate_series(1,2938) n;
    INSERT INTO hr_employee SELECT employee,code,'tenant','park',CASE WHEN code::int%2=0 THEN 'departed' ELSE 'active' END,false FROM source;
    INSERT INTO hr_yuzhou_production_import_record SELECT 'core','T0',identity,row_hash,'insert','not_started','hr_employee',employee FROM source;
    INSERT INTO legacy_record_map SELECT map,batch,'yuzhou-v10','dbo.person','hr_employee',employee,identity,row_hash,'sha256:'||identity,true,'loaded' FROM source;
    INSERT INTO hr_yuzhou_production_import_projection_receipt SELECT 'core','T0',identity,map,batch FROM source;`);
  const observe = async () => validateT5CoreOwnerRows((await client.query(T5_CORE_OWNER_SQL, ["core", "tenant", "park"])).rows);
  const map = await observe();
  assert.equal(map.size, 2938);
  assert.ok(map.has("2"), "departed employee retained");
  for (const mutation of [
    "UPDATE legacy_record_map SET is_active=false WHERE target_id=(SELECT employee FROM source WHERE code='1')",
    "UPDATE legacy_record_map SET source_pk_canonical='person=1' WHERE target_id=(SELECT employee FROM source WHERE code='1')",
    "UPDATE hr_employee SET park_id='other' WHERE employee_code='1'",
    "UPDATE hr_employee SET is_deleted=true WHERE employee_code='1'",
    "UPDATE hr_yuzhou_production_import_projection_receipt SET migration_batch_id=gen_random_uuid() WHERE source_identity_sha256=(SELECT identity FROM source WHERE code='1')",
    "UPDATE hr_yuzhou_production_import_record SET rollback_status='succeeded' WHERE target_id=(SELECT employee FROM source WHERE code='1')",
    "UPDATE hr_employee SET employee_code='2' WHERE employee_code='1'",
  ]) {
    await client.query("BEGIN");
    await client.query(mutation);
    await assert.rejects(observe(), /T5_CORE_OWNER_MAP_DRIFT/u);
    await client.query("ROLLBACK");
  }
  assert.equal((await observe()).size, 2938);
  console.log("PASS real PostgreSQL: 2938 exact SHA-keyed core owners, departed retention, inactive/map/scope/delete/receipt/rollback/duplicate rejection");
} finally {
  if (client) await client.end();
  if (started) call("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(scratch, { recursive: true });
}
