#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const container=process.env.YUZHOU_POSTGRES_CONTAINER??"jinhu-smart-park-postgres";
const database=process.env.YUZHOU_TARGET_DATABASE??"";
const composeProject=process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT??"jinhu_hr_migration_lab";
assert.match(database,/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u,"isolated database is required");

const run=(command,args,{input,expect=0,env={}}={})=>{
  const result=spawnSync(command,args,{cwd:ROOT,encoding:"utf8",input,env:{...process.env,...env}});
  if(result.status!==expect){
    throw new Error(`${command} failed status=${result.status}\n${result.stderr||result.stdout}`);
  }
  return result.stdout.trim();
};
const runFailure=(command,args,{input,env={}}={})=>{
  const result=spawnSync(command,args,{cwd:ROOT,encoding:"utf8",input,env:{...process.env,...env}});
  assert.notEqual(result.status,0,`${command} unexpectedly succeeded`);
  return result;
};
const psql=(sql)=>run("docker",["exec","-i",container,"psql","-X","-A","-t","-v","ON_ERROR_STOP=1","-U","jinhu","-d",database],{input:sql});
const label=run("docker",["inspect","--format",'{{index .Config.Labels "com.docker.compose.project"}}',container]);
assert.equal(label,composeProject,"unexpected PostgreSQL compose project");

const employeeId="11111111-1111-4111-8111-111111111111";
const sourceBatchId="22222222-2222-4222-8222-222222222222";
const otherSourceBatchId="33333333-3333-4333-8333-333333333333";
const hash=value=>value.repeat(64);

psql(`
BEGIN;
INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,started_at,finished_at)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-t5a-source-a','yuzhou-v10','${hash("a")}','${database}','verify','succeeded','fixture',now(),now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-t5a-source-b','yuzhou-v10','${hash("b")}','${database}','verify','succeeded','fixture',now(),now());
INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status)
VALUES('${employeeId}','tenant-a','park-a','FIXTURE-001','Fixture User','active');
INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','yuzhou-v10','dbo.person','person=FIXTURE-001','${hash("1")}','${hash("2")}','hr_employee','${employeeId}','verified',true);

INSERT INTO hr_legacy_t5_import_batch(id,tenant_id,park_id,migration_batch_id,batch_code,source_snapshot_sha256,catalog_sha256,manifest_sha256,source_row_count,loaded_row_count,quarantined_row_count,status)
VALUES
 ('${sourceBatchId}','tenant-a','park-a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-source','${hash("a")}','${hash("c")}','${hash("d")}',5,4,1,'unpublished'),
 ('${otherSourceBatchId}','tenant-b','park-b','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-source','${hash("b")}','${hash("e")}','${hash("f")}',1,1,0,'unpublished');
INSERT INTO hr_legacy_t5_record(tenant_id,park_id,import_batch_id,employee_id,domain,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,mapping_status,record_payload)
VALUES
 ('tenant-a','park-a','${sourceBatchId}','${employeeId}','candidate','dbo.person.core_residue','fixture-profile','${hash("3")}','${hash("4")}','employee_mapped','{}'),
 ('tenant-a','park-a','${sourceBatchId}',NULL,'reward_category','dbo.bonuscode','fixture-dictionary','${hash("5")}','${hash("6")}','not_applicable','{}'),
 ('tenant-a','park-a','${sourceBatchId}',NULL,'experience','dbo.his','fixture-unowned-history','${hash("a")}','${hash("b")}','not_applicable','{}'),
 ('tenant-b','park-b','${otherSourceBatchId}',NULL,'reward_category','dbo.bonuscode','fixture-other','${hash("7")}','${hash("8")}','not_applicable','{}');
INSERT INTO hr_legacy_t5_file_evidence(tenant_id,park_id,import_batch_id,employee_id,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,file_role,content_sha256,actual_size,detected_mime,readability_status)
VALUES('tenant-a','park-a','${sourceBatchId}','${employeeId}','dbo.person.photo','fixture-photo','${hash("9")}','${hash("0")}','employee_photo','${hash("a")}',12,'image/bmp','readable');
INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,highest_education,legacy_source_identity_sha256,legacy_source_row_sha256)
VALUES('tenant-a','park-a','${employeeId}','fixture-level','${hash("3")}','${hash("4")}');
UPDATE hr_legacy_t5_import_batch SET status='staged' WHERE id IN ('${sourceBatchId}','${otherSourceBatchId}');
COMMIT;
`);

const baseEnv={
  YUZHOU_POSTGRES_CONTAINER:container,
  YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:composeProject,
  YUZHOU_TARGET_DATABASE:database,
  YUZHOU_TENANT_ID:"tenant-a",
  YUZHOU_PARK_ID:"park-a",
  YUZHOU_T5_SOURCE_BATCH_ID:sourceBatchId,
  ALLOW_YUZHOU_MIGRATION:"yes"
};

// A UUID from another tenant/park must fail before writing anything.
runFailure("./scripts/materialize-yuzhou-t5-archive-visibility.sh",[],{
  env:{...baseEnv,YUZHOU_T5_SOURCE_BATCH_ID:otherSourceBatchId,YUZHOU_ARCHIVE_MATERIALIZATION_RUN_ID:"fixture-cross-scope"}
});
assert.equal(psql("SELECT count(*) FROM hr_legacy_archive_materialization_batch;"),"0");

const applyOutput=run("./scripts/materialize-yuzhou-t5-archive-visibility.sh",[],{
  env:{...baseEnv,YUZHOU_ARCHIVE_MATERIALIZATION_RUN_ID:"fixture-t5a-run1"}
});
const [materializationId,status,sourceCount,deferredCount,archiveCount]=applyOutput.split("|");
assert.match(materializationId,/^[0-9a-f-]{36}$/u);
assert.deepEqual([status,sourceCount,deferredCount,archiveCount],["staged","3","1","3"]);
assert.equal(psql(`SELECT count(*)||'|'||(SELECT count(*) FROM hr_legacy_archive_record WHERE materialization_batch_id='${materializationId}')||'|'||(SELECT count(*) FROM hr_legacy_file_logical_record) FROM hr_legacy_identity_registry WHERE materialization_batch_id='${materializationId}';`),"3|3|0");
assert.equal(psql(`SELECT count(*) FROM hr_legacy_archive_record WHERE display_safe_projection ? 'sourceTable';`),"0");
assert.equal(psql(`SELECT count(*) FROM hr_legacy_archive_record archive JOIN hr_legacy_identity_registry identity ON identity.id=archive.identity_registry_id WHERE identity.source_table='dbo.his' AND identity.owner_employee_id IS NULL;`),"1");
assert.equal(psql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 'yuzhou_t5a_apply_%' OR rolname LIKE 'yuzhou_t5a_rollback_%';"),"0");

// Ordinary callers cannot invoke the procedure or mutate immutable archive rows.
const directCall=spawnSync("docker",["exec","-i",container,"psql","-X","-v","ON_ERROR_STOP=1","-U","jinhu","-d",database],{
  encoding:"utf8",input:`CALL materialize_yuzhou_t5_archive_visibility('tenant-a','park-a','${sourceBatchId}'::uuid,'fixture-direct','${database}');\n`
});
assert.notEqual(directCall.status,0);
const directDelete=spawnSync("docker",["exec","-i",container,"psql","-X","-v","ON_ERROR_STOP=1","-U","jinhu","-d",database],{
  encoding:"utf8",input:`DELETE FROM hr_legacy_archive_record WHERE materialization_batch_id='${materializationId}';\n`
});
assert.notEqual(directDelete.status,0);

const rollbackOutput=run("./scripts/rollback-yuzhou-t5-archive-visibility.sh",[],{
  env:{...baseEnv,
    YUZHOU_ARCHIVE_MATERIALIZATION_RUN_ID:"fixture-t5a-run1",
    YUZHOU_ARCHIVE_MATERIALIZATION_BATCH_ID:materializationId,
    ALLOW_YUZHOU_ROLLBACK:"yes"
  }
});
assert.equal(rollbackOutput,"rolled_back|0");
assert.equal(psql(`SELECT count(*) FROM hr_employee WHERE id='${employeeId}' AND employment_status='active';`),"1");
assert.equal(psql(`SELECT count(*) FROM hr_employee_profile WHERE employee_id='${employeeId}' AND legacy_source_row_sha256='${hash("4")}';`),"1");
assert.equal(psql("SELECT count(*) FROM pg_roles WHERE rolname LIKE 'yuzhou_t5a_apply_%' OR rolname LIKE 'yuzhou_t5a_rollback_%';"),"0");

console.log("T5A direct PostgreSQL fixture passed: scoped apply, deferred files, immutable denial, controlled rollback, residual=0");
