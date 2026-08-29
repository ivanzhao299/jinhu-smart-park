#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const container=process.env.YUZHOU_POSTGRES_CONTAINER??"jinhu-smart-park-postgres";
const database=process.env.YUZHOU_TARGET_DATABASE??"";
const composeProject=process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT??"jinhu_hr_migration_lab";
assert.match(database,/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u,"isolated database is required");

const runDocker=(args,input)=>{
  const result=spawnSync("docker",args,{cwd:ROOT,encoding:"utf8",input});
  if(result.status!==0) throw new Error(`docker failed status=${result.status}\n${result.stderr||result.stdout}`);
  return result.stdout.trim();
};
const psql=sql=>runDocker(["exec","-i",container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","jinhu","-d",database],sql);
const psqlFailure=sql=>{
  const result=spawnSync("docker",["exec","-i",container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","jinhu","-d",database],{cwd:ROOT,encoding:"utf8",input:sql});
  assert.notEqual(result.status,0,"SQL unexpectedly succeeded");
  return `${result.stdout}\n${result.stderr}`;
};
assert.equal(runDocker(["inspect","--format",'{{index .Config.Labels "com.docker.compose.project"}}',container]),composeProject);

const runFixture=iteration=>{
const suffix=randomBytes(6).toString("hex");
const fixtureSalt=randomBytes(32);
const H=value=>createHash("sha256").update(fixtureSalt).update(String(value)).digest("hex");
const operation=`yzprod-import-20260829T030000Z-${suffix}`;
const ordinaryRole=`yzprod_receipt_reader_${suffix}`;
const targetId=randomUUID();
const employeeId=randomUUID();
const batchId=randomUUID();
const labBatchId=randomUUID();
const mapId=randomUUID();
const ownerMapId=randomUUID();
const quarantineMapId=randomUUID();
const rejectedTargetId=randomUUID();
const wrongMapTargetId=randomUUID();
const identity=H("identity");
const rowHash=H("row");
const codeSha=randomBytes(20).toString("hex");
const scopeSha=psql("SELECT hr_yuzhou_production_target_scope_sha256('tenant-a','park-a');");

try {

// Existing loaders keep the old lab target contract without any production
// operation binding.
psql(`
INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version)
VALUES('${labBatchId}','legacy-lab-${suffix}','yuzhou-v10','${H("lab-source")}','${database}','inventory','pending','legacy-loader');
`);
assert.equal(psql(`SELECT execution_context||'|'||coalesce(production_import_operation_id,'') FROM migration_batch WHERE id='${labBatchId}';`),"lab_rehearsal|");

psql(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hr_yuzhou_consume_import_authorization_v2(
 '${operation}','${codeSha}','${H("source")}','${H("mapping")}','${H("sealed")}','${H("target")}',
 'tenant-a','park-a','${scopeSha}','${H("6")}','${H("7")}',
 now()-interval '1 minute',now()+interval '10 minutes',now()-interval '2 minutes',now()+interval '15 minutes',
 '${H("8")}','${H("9")}','${H("a")}','${H("b")}','${H("c")}'
);
INSERT INTO hr_yuzhou_production_import_phase(
 operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,before_canonical_sha256,
 payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version
)
SELECT '${operation}',phase,ordinal,'planned',repeat((ordinal+1)::text,64)::char(64),planned,
 repeat((ordinal+2)::text,64)::char(64),repeat((ordinal+3)::text,64)::char(64),
 repeat((ordinal+4)::text,64)::char(64),'yuzhou-production-import-canonical-json-v1'
FROM (VALUES ('T0',0,2),('T1',1,0),('T2',2,0),('T3',3,0)) phases(phase,ordinal,planned);
SELECT hr_yuzhou_start_production_import('${operation}','${H("sealed")}');
UPDATE hr_yuzhou_production_import_operation SET current_phase='T0' WHERE operation_id='${operation}';
UPDATE hr_yuzhou_production_import_phase SET status='running',started_at=now()
WHERE operation_id='${operation}' AND phase='T0';
COMMIT;
`);

assert.match(psqlFailure(`
BEGIN;
INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
 execution_context,production_import_operation_id,production_import_phase)
VALUES('${operation}-t0','yuzhou-v10','${H("source")}','${database}','load','running','prod-import-v2@${codeSha}',
 'production_import','${operation}','T0');
COMMIT;
`),/HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE/u);

assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
 execution_context,production_import_operation_id,production_import_phase)
VALUES('${operation}-t0','yuzhou-v10','${H("source")}','wrong_database','load','running','prod-import-v2@${codeSha}',
 'production_import','${operation}','T0');
COMMIT;
`),/HR_PRODUCTION_IMPORT_TARGET_DATABASE_MISMATCH/u);

assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
 execution_context,production_import_operation_id,production_import_phase)
VALUES('${operation}-t1','yuzhou-v10','${H("source")}','${database}','load','running','prod-import-v2@${codeSha}',
 'production_import','${operation}','T1');
COMMIT;
`),/HR_PRODUCTION_IMPORT_PHASE_NOT_RUNNING/u);

assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE hr_yuzhou_production_import_operation SET current_phase='T1' WHERE operation_id='${operation}';
UPDATE hr_yuzhou_production_import_phase SET status='running',started_at=now() WHERE operation_id='${operation}' AND phase='T1';
INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
 execution_context,production_import_operation_id,production_import_phase)
VALUES('${operation}-t1','yuzhou-v10','${H("source")}','${database}','load','running','prod-import-v2@${codeSha}',
 'production_import','${operation}','T1');
COMMIT;
`),/HR_PRODUCTION_IMPORT_PHASE_ORDER_INVALID/u);

psql(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
 execution_context,production_import_operation_id,production_import_phase,started_at)
VALUES('${batchId}','${operation}-t0','yuzhou-v10','${H("source")}','${database}','load','running',
 'prod-import-v2@${codeSha}','production_import','${operation}','T0',now());
INSERT INTO hr_yuzhou_production_import_record(
 operation_id,phase,source_identity_sha256,source_row_sha256,disposition,planned_target_table,target_table,target_id,
 target_after_sha256,decision_attestation_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,
 expected_target_version_before,target_version_after
) VALUES(
 '${operation}','T0','${identity}','${rowHash}','insert','sys_org','sys_org','${targetId}','${H("f")}',NULL,
 'yuzhou-v10','dbo.department','sha256:${identity}','${H("a")}',NULL,1
),(
 '${operation}','T0','${H("9")}','${H("8")}','quarantine','sys_org',NULL,NULL,NULL,'${H("7")}',
 'yuzhou-v10','dbo.department','sha256:${H("9")}',NULL,NULL,NULL
);
INSERT INTO legacy_record_map(
 id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,
 target_table,target_id,mapping_status,is_active
) VALUES(
 '${mapId}','${batchId}','yuzhou-v10','dbo.department','sha256:${identity}','${identity}','${rowHash}',
 'sys_org','${targetId}','loaded',true),
 ('${quarantineMapId}','${batchId}','yuzhou-v10','dbo.department','sha256:${H("9")}','${H("9")}','${H("8")}',
 'sys_org',NULL,'quarantined',true
);
INSERT INTO hr_yuzhou_production_import_projection_receipt(
 operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id
) VALUES
 ('${operation}','T0','${identity}','${batchId}','${mapId}'),
 ('${operation}','T0','${H("9")}','${batchId}','${quarantineMapId}');
COMMIT;
`);
assert.equal(psql(`SELECT execution_context||'|'||production_import_phase FROM migration_batch WHERE id='${batchId}';`),"production_import|T0");
assert.equal(psql(`SELECT count(*) FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id='${operation}';`),"2");
assert.equal(psql(`SELECT mapping_status||'|'||is_active||'|'||coalesce(target_id::text,'') FROM legacy_record_map WHERE id='${quarantineMapId}';`),"quarantined|true|");

assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO hr_yuzhou_production_import_record(
 operation_id,phase,source_identity_sha256,source_row_sha256,disposition,planned_target_table,target_table,target_id,
 target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,
 expected_target_version_before,target_version_after
) VALUES('${operation}','T0','${H("negative-identity")}','${H("negative-row")}','insert','sys_org','sys_org',
 '${rejectedTargetId}','${H("negative-after")}','yuzhou-v10','dbo.department','identity_sha256=${H("negative-identity")}',
 '${H("3")}',NULL,1);
COMMIT;
`),/ck_hr_yuzhou_prod_record_source_receipt/u);
assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
INSERT INTO hr_yuzhou_production_import_record(
 operation_id,phase,source_identity_sha256,source_row_sha256,disposition,planned_target_table,target_table,target_id,
 target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,
 expected_target_version_before,target_version_after
) VALUES('${operation}','T0','${H("negative-identity")}','${H("negative-row")}','insert','sys_org','sys_org',
 '${rejectedTargetId}','${H("negative-after")}','yuzhou-v10','dbo.department','sha256:${H("negative-identity")}',
 NULL,NULL,1);
COMMIT;
`),/HR_PRODUCTION_IMPORT_BUSINESS_IDENTITY_RECEIPT_INVALID/u);

assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE legacy_record_map SET source_row_sha256='${H("0")}' WHERE id='${mapId}';
COMMIT;
`),/HR_PRODUCTION_IMPORT_PROJECTION_MAP_MISMATCH/u);
assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE legacy_record_map SET target_id='${wrongMapTargetId}' WHERE id='${mapId}';
COMMIT;
`),/HR_PRODUCTION_IMPORT_PROJECTION_MAP_MISMATCH/u);
assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE hr_yuzhou_production_import_record SET target_version_after=2
WHERE operation_id='${operation}' AND phase='T0' AND source_identity_sha256='${identity}';
COMMIT;
`),/HR_PRODUCTION_IMPORT_RECORD_RECEIPT_IMMUTABLE/u);

// The record and compatibility map must enter rollback state atomically.
assert.match(psqlFailure(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE hr_yuzhou_production_import_record SET rollback_status='deleted_insert',rolled_back_at=now()
WHERE operation_id='${operation}' AND phase='T0' AND source_identity_sha256='${identity}';
COMMIT;
`),/HR_PRODUCTION_IMPORT_PROJECTION_ROLLBACK_MISMATCH/u);
psql(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
UPDATE hr_yuzhou_production_import_record SET rollback_status='deleted_insert',rolled_back_at=now()
WHERE operation_id='${operation}' AND phase='T0' AND source_identity_sha256='${identity}';
UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now() WHERE id='${mapId}';
UPDATE hr_yuzhou_production_import_record SET rollback_status='quarantine_noop',rolled_back_at=now()
WHERE operation_id='${operation}' AND phase='T0' AND source_identity_sha256='${H("9")}';
UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now() WHERE id='${quarantineMapId}';
COMMIT;
`);
assert.equal(psql(`SELECT rollback_status||'|'||mapping_status||'|'||is_active FROM hr_yuzhou_production_import_record record JOIN hr_yuzhou_production_import_projection_receipt receipt USING(operation_id,phase,source_identity_sha256) JOIN legacy_record_map map ON map.id=receipt.legacy_record_map_id WHERE record.operation_id='${operation}' AND record.source_identity_sha256='${identity}';`),"deleted_insert|rolled_back|false");

// A mapped/resolved registry owner protects its exact T0 map in the reverse
// direction.  The fixture is rolled back so immutable archive rows do not leak.
assert.match(psqlFailure(`
BEGIN;
INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status)
VALUES('${employeeId}','tenant-a','park-a','WRITER-${suffix}','Fixture Employee ${iteration}','active');
INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
VALUES('${ownerMapId}','${labBatchId}','yuzhou-v10','dbo.person','sha256:${H("owner")}', '${H("owner")}','${H("owner-row")}','hr_employee','${employeeId}','verified',true);
INSERT INTO hr_legacy_identity_registry(
 tenant_id,park_id,source_system,source_table,source_identity_sha256,source_row_sha256,identity_kind,mapping_status,
 owner_employee_id,owner_record_map_id,owner_source_system,owner_source_table,owner_source_identity_sha256
) VALUES('tenant-a','park-a','yuzhou-v10','dbo.person.core_residue','${H("3")}','${H("4")}','archive_record','mapped',
 '${employeeId}','${ownerMapId}','yuzhou-v10','dbo.person','${H("owner")}');
UPDATE legacy_record_map SET is_active=false,mapping_status='rolled_back' WHERE id='${ownerMapId}';
COMMIT;
`),/HR_LEGACY_T0_OWNER_MAP_REFERENCED/u);

psql(`CREATE ROLE ${ordinaryRole} NOLOGIN;`);
assert.equal(psql(`SELECT has_table_privilege('${ordinaryRole}','hr_yuzhou_production_import_projection_receipt','SELECT');`),"f");
assert.match(psqlFailure(`SET ROLE ${ordinaryRole}; SELECT count(*) FROM hr_yuzhou_production_import_projection_receipt;`),/permission denied/u);

} finally {
psql(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
DELETE FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id='${operation}';
DELETE FROM legacy_record_map WHERE id IN ('${mapId}','${quarantineMapId}');
DELETE FROM migration_batch WHERE id IN ('${batchId}','${labBatchId}');
DELETE FROM hr_yuzhou_production_import_record_dependency WHERE operation_id='${operation}';
DELETE FROM hr_yuzhou_production_import_before_image WHERE operation_id='${operation}';
DELETE FROM hr_yuzhou_production_import_quarantine WHERE operation_id='${operation}';
DELETE FROM hr_yuzhou_production_import_record WHERE operation_id='${operation}';
DELETE FROM hr_yuzhou_production_import_phase WHERE operation_id='${operation}';
DELETE FROM hr_yuzhou_production_import_authorization_use WHERE import_operation_id='${operation}';
DELETE FROM hr_yuzhou_production_import_rollback_operation WHERE import_operation_id='${operation}';
DELETE FROM hr_yuzhou_production_import_operation WHERE operation_id='${operation}';
COMMIT;
DROP ROLE IF EXISTS ${ordinaryRole};
`);
}
assert.equal(psql(`SELECT
 (SELECT count(*) FROM hr_yuzhou_production_import_operation WHERE operation_id='${operation}')+
 (SELECT count(*) FROM hr_yuzhou_production_import_projection_receipt WHERE operation_id='${operation}')+
 (SELECT count(*) FROM migration_batch WHERE production_import_operation_id='${operation}')+
 (SELECT count(*) FROM pg_roles WHERE rolname='${ordinaryRole}');`),"0");

console.log(`Production import writer receipt PostgreSQL fixture iteration ${iteration} passed`);
};

runFixture(1);
runFixture(2);
console.log("Production import writer receipt PostgreSQL fixture passed twice: randomized identity, lab compatibility, explicit production context, exact projection/CAS, reverse owner, rollback, denial, cleanup, residual=0");
