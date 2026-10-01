#!/usr/bin/env node
// Own disposable cluster and synthetic data only. Never accepts a database URL.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { Client } from "pg";
import { executeT4Followon, observeT4Parent } from "../hr-cutover/production-import-t4-followon-writer.mjs";
import { T4_SUFFIX_STEPS } from "../hr-cutover/production-import-t4-followon-sql.mjs";
import { T4_TABLES } from "../hr-cutover/production-import-t4-followon-binding.mjs";
import { H, fixtureBinding, fixtureAuthorization, fixtureParentReceipt, fixtureStage } from "./yuzhou-t4-followon-fixture.mjs";

const schemaOnly = process.argv.length === 3 && process.argv[2] === "--schema-only";
assert.ok(process.argv.length === 2 || schemaOnly, "supported option: --schema-only");
const root = resolve(import.meta.dirname, "../..");
const scratch = mkdtempSync(join(tmpdir(), "jinhu-t4-followon-fixture-"));
const data = join(scratch, "pg");
const bin = process.env.YUZHOU_T4_POSTGRES_BIN ?? "";
const call = (name, args) => {
  const r = spawnSync(bin ? join(bin, name) : name, args, { encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 0, `${name}: ${r.stderr}`);
};
let started = false, client;
try {
  call("initdb", ["-D", data, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  call("pg_ctl", ["-D", data, "-l", join(scratch, "server.log"), "-o", `-F -k ${scratch} -c listen_addresses='' -p 55491`, "-w", "start"]);
  started = true;
  client = new Client({ host: scratch, port: 55491, user: "fixture", database: "postgres" });
  await client.connect();
  // Real T4 and production-control migrations, with minimal unrelated HR shells.
  await client.query(`CREATE EXTENSION pgcrypto; CREATE EXTENSION "uuid-ossp";
    CREATE TABLE hr_employee(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64),park_id varchar(64),employee_code text,employment_status text,is_deleted boolean DEFAULT false);
    CREATE TABLE hr_employee_insurance_period(id uuid,legacy_id text);
    CREATE TABLE hr_legacy_identity_registry(owner_record_map_id uuid,mapping_status text);
    CREATE TABLE hr_payroll_run(id uuid,status text);
    CREATE TABLE hr_payslip(id uuid,status text);`);
  const migrations = readdirSync(join(root, "database/migrations"));
  for (const number of [235, 248, 264, 278, 281, 282, 287, 296, 316]) {
    const file = migrations.find(name => name.startsWith(String(number).padStart(6, "0") + "_"));
    await client.query(readFileSync(join(root, "database/migrations", file), "utf8"));
  }
  await assert.rejects(client.query("INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,tool_version) VALUES('fixture-invalid-lab','yuzhou-v10',$1,current_database(),'fixture')", [H("source")]), /ck_migration_batch_execution_context/);
  await client.query("CREATE ROLE t4_unprivileged; SET ROLE t4_unprivileged");
  await assert.rejects(client.query("CALL hr_yuzhou_t4_followon_rollback('none',$1,$1,$1)", [H("none")]), /permission denied/);
  await client.query("RESET ROLE");
  // Check the shared control trigger against the authorization table before
  // doing the expensive full-size insert; that table has no status column.
  await client.query("BEGIN");
  await client.query("INSERT INTO hr_yuzhou_t4_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES($1,$2,'fixture-immutable','append')", [H("immutable-nonce"), H("immutable-auth")]);
  await assert.rejects(client.query("DELETE FROM hr_yuzhou_t4_followon_authorization_use"), /T4_CONTROL_IMMUTABLE/);
  await client.query("ROLLBACK");
  if (schemaOnly) {
    console.log("PASS clean PostgreSQL migrations and authorization immutability guard");
  } else {
    const rawQuery = client.query.bind(client);
    client.query = async (...args) => {
      const step = T4_SUFFIX_STEPS.indexOf(args[0]);
      if (step >= 0) console.log(`T4 synthetic reconciliation step ${step + 1}/${T4_SUFFIX_STEPS.length}`);
      return rawQuery(...args);
    };
    const binding = fixtureBinding();
    const stage = fixtureStage(binding);
    const parentReceipt = fixtureParentReceipt(binding);
    const [tenant, park] = [binding.targetScope.tenantId, binding.targetScope.parkId];
    const employee = (await client.query("INSERT INTO hr_employee(tenant_id,park_id,employee_code,employment_status) VALUES($1,$2,'fixture-employee','departed') RETURNING id", [tenant, park])).rows[0].id;
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query(`INSERT INTO hr_yuzhou_production_import_operation(operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order,current_phase,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256)
      VALUES($1,'production_import','running',$2,$3,$4,$5,$6,$7,$8,now()-interval '1 hour',now()+interval '1 day',now()-interval '2 hour',now()+interval '2 day',$9,$10,$11,$12,$13,'["T0","T1","T2","T3"]','T0',2,$14,$15,$16)`, [binding.parent.operationId, binding.triple.codeSha, binding.triple.sourceSnapshotHash, binding.triple.mappingContractHash, binding.parent.sealedPlanSha256, binding.targetIdentitySha256, H("auth"), H("nonce"), H("approval"), H("manifest"), binding.finalRehearsalPairSha256, H("A"), H("B"), tenant, park, binding.targetScopeSha256]);
    for (const [i, phase] of ["T0", "T1", "T2", "T3"].entries()) await client.query(`INSERT INTO hr_yuzhou_production_import_phase(operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,before_canonical_sha256,planned_record_count,applied_record_count,payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version) VALUES($1,$2,$3,$4,$5,$5,$6,0,$5,$7,'yuzhou-production-import-canonical-json-v1')`, [binding.parent.operationId, phase, i, i === 0 ? "running" : "planned", H(`manifest-${phase}`), i === 0 ? 2 : 0, binding.parent.payloadBundleSha256[phase]]);
    const batchId = (await client.query(`INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,execution_context,production_import_operation_id,production_import_phase) VALUES($1,'yuzhou-v10',$2,current_database(),'load','running',$3,'production_import',$4,'T0') RETURNING id`, [binding.parent.operationId + "-t0", binding.triple.sourceSnapshotHash, "prod-import-v2@" + binding.triple.codeSha, binding.parent.operationId])).rows[0].id;
    await client.query("INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,target_id,target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,target_version_after,planned_target_table) VALUES($1,'T0',$2::text,$3,'insert','hr_employee',$4,$5,'yuzhou-v10','dbo.person','sha256:'||$2,$5,1,'hr_employee')", [binding.parent.operationId, H("employee-identity"), H("employee-row"), employee, H("after")]);
    const mapId = (await client.query("INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) VALUES($1,'yuzhou-v10','dbo.person',$2,$3,$4,'hr_employee',$5,'loaded') RETURNING id", [batchId, "sha256:" + H("employee-identity"), H("employee-identity"), H("employee-row"), employee])).rows[0].id;
    await client.query("INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id) VALUES($1,'T0',$2,$3,$4)", [binding.parent.operationId, H("employee-identity"), batchId, mapId]);
    const org = "00000000-0000-4000-8000-000000000002";
    await client.query("INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,target_id,target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,target_version_after,planned_target_table) VALUES($1,'T0',$2::text,$3,'insert','sys_org',$4,$5,'yuzhou-v10','dbo.department','sha256:'||$2,$5,1,'sys_org')", [binding.parent.operationId,H("org"),H("org-row"),org,H("org-after")]);
    const orgMap = (await client.query("INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) VALUES($1,'yuzhou-v10','dbo.department',$2,$3,$4,'sys_org',$5,'loaded') RETURNING id", [batchId,"sha256:"+H("org"),H("org"),H("org-row"),org])).rows[0].id;
    await client.query("INSERT INTO hr_yuzhou_production_import_projection_receipt(operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id) VALUES($1,'T0',$2,$3,$4)", [binding.parent.operationId,H("org"),batchId,orgMap]);
    await client.query("INSERT INTO hr_yuzhou_production_import_record_dependency(operation_id,phase,source_identity_sha256,dependency_role,depends_on_phase,depends_on_source_identity_sha256,expected_target_table) VALUES($1,'T0',$2,'primary_org','T0',$3,'sys_org')", [binding.parent.operationId,H("employee-identity"),H("org")]);
    await client.query("UPDATE migration_batch SET status='succeeded' WHERE id=$1", [batchId]);
    await client.query("UPDATE hr_yuzhou_production_import_phase SET status='succeeded',applied_record_count=planned_record_count WHERE operation_id=$1", [binding.parent.operationId]);
    await client.query("UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now(),current_phase=NULL WHERE operation_id=$1", [binding.parent.operationId]);
    await client.query("COMMIT");
    binding.parent.recordSetSha256 = (await observeT4Parent(client, binding, parentReceipt)).recordSetSha256;
    const authorization = fixtureAuthorization(binding);
    const input = { client, binding, authorization, parentReceipt, stage };
    await assert.rejects(executeT4Followon({ ...input, parentReceipt: { ...parentReceipt, status: "HOLD" } }), /T4_PARENT_SUCCESS_RECEIPT_INVALID/);
    await assert.rejects(executeT4Followon({ ...input, authorization: fixtureAuthorization(binding, "append", "nonce") }), /T4_FRESH_OPERATION_AND_NONCE_REQUIRED/);
    await client.query("UPDATE hr_employee SET employee_code='changed' WHERE id=$1", [employee]);
    await assert.rejects(executeT4Followon(input), /T4_PARENT_RECORD_HASH_MISMATCH/);
    await client.query("UPDATE hr_employee SET employee_code='fixture-employee' WHERE id=$1", [employee]);
    const badAmount = JSON.parse(JSON.stringify(binding));
    badAmount.amountTotals.full.gross_total = "102194056.8001";
    await assert.rejects(executeT4Followon({ ...input, binding: badAmount, authorization: fixtureAuthorization(badAmount) }), /T4_WEIGHTED_AMOUNT_CONSERVATION_FAILED/);
    assert.equal((await client.query("SELECT count(*)::int n FROM hr_yuzhou_t4_followon_authorization_use")).rows[0].n, 0);
    // Late real database failure after catalog/snapshot inserts must undo all rows.
    await client.query("CREATE FUNCTION fixture_fail_item() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FIXTURE_LATE_FAILURE'; END$$; CREATE TRIGGER fixture_fail_item BEFORE INSERT ON hr_payroll_legacy_snapshot_item FOR EACH STATEMENT EXECUTE FUNCTION fixture_fail_item()");
    await assert.rejects(executeT4Followon(input), /FIXTURE_LATE_FAILURE/);
    for (const table of T4_TABLES) assert.equal((await client.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0, table);
    assert.equal((await client.query("SELECT count(*)::int n FROM hr_yuzhou_t4_followon_authorization_use")).rows[0].n, 0);
    await client.query("DROP TRIGGER fixture_fail_item ON hr_payroll_legacy_snapshot_item");
    console.log("PASS late statement failure: zero T4 rows and zero consumed nonce");
    const result = await executeT4Followon(input);
    assert.equal(result.status, "SUCCEEDED");
    assert.equal((await client.query("SELECT count(*)::int n FROM hr_payroll_legacy_snapshot_item")).rows[0].n, 1078020);
    assert.deepEqual((await client.query("SELECT count(*)::int n,sum(source_multiplicity)::text weighted,sum(net_amount*source_multiplicity)::text net FROM hr_payroll_legacy_snapshot")).rows[0], { n: 46092, weighted: "46092", net: "102194056.8000" });
    assert.equal((await client.query("SELECT count(*)::int n FROM hr_payroll_legacy_snapshot WHERE mapping_status='employee_unmapped'")).rows[0].n, 1);
    assert.equal((await client.query("SELECT count(*)::int n FROM hr_payroll_legacy_snapshot WHERE employee_id=$1", [employee])).rows[0].n, 46091, "departed employees retain history");
    await assert.rejects(executeT4Followon(input), /duplicate key/);
    await assert.rejects(client.query("DELETE FROM hr_payroll_legacy_snapshot"), /dedicated rollback/);
    await assert.rejects(client.query("UPDATE hr_payroll_legacy_snapshot SET net_amount=0"), /append-only/);
    await assert.rejects(client.query("CALL hr_yuzhou_t4_followon_rollback($1,$2,$3,$4)", [binding.operationId, result.bindingSha256, H("forged"), H("forged")]), /T4_ROLLBACK_AUTHORIZATION_REQUIRED/);
    console.log("PASS full-size append and immutable/replay guards; checking rollback");
    const rollback = { ...input, rollback: true, authorization: fixtureAuthorization(binding, "rollback") };
    // Batch drift is legal before publication, but must forbid precise rollback.
    await client.query("UPDATE hr_payroll_legacy_batch SET remark='changed' WHERE batch_code=$1", [binding.operationId]);
    await assert.rejects(executeT4Followon(rollback), /T4_ROLLBACK_STATE_DRIFT/);
    await client.query("UPDATE hr_payroll_legacy_batch SET remark='T4 full_archive run='||$1 WHERE batch_code=$1", [binding.operationId]);
    assert.equal((await executeT4Followon(rollback)).status, "ROLLED_BACK");
    for (const table of T4_TABLES) assert.equal((await client.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0, table);
    assert.equal((await client.query("SELECT count(*)::int n FROM hr_employee")).rows[0].n, 1);
    assert.equal((await client.query("SELECT status FROM hr_yuzhou_production_import_operation")).rows[0].status, "succeeded");
    assert.equal((await client.query("SELECT count(*)::int n FROM hr_yuzhou_t4_followon_authorization_use")).rows[0].n, 2);
    await assert.rejects(client.query("DELETE FROM hr_yuzhou_t4_followon_authorization_use"), /T4_CONTROL_IMMUTABLE/);
    console.log("PASS T4 real PostgreSQL: 46092 snapshots / 1078020 items, numeric conservation, departed/unmapped retention, late atomic failure, replay rejection, immutable guards, authorized rollback, protected state and zero owned residual");
  }
} finally {
  if (client) await client.end();
  if (started) call("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(scratch, { recursive: true });
}
