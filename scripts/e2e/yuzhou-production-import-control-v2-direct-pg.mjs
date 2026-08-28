#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const container=process.env.YUZHOU_POSTGRES_CONTAINER??"jinhu-smart-park-postgres";
const database=process.env.YUZHOU_TARGET_DATABASE??"";
const composeProject=process.env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT??"jinhu_hr_migration_lab";
assert.match(database,/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u,"isolated database is required");

const run=(args,input)=>{
  const result=spawnSync("docker",args,{cwd:ROOT,encoding:"utf8",input});
  if(result.status!==0) throw new Error(`docker failed status=${result.status}\n${result.stderr||result.stdout}`);
  return result.stdout.trim();
};
const psql=sql=>run(["exec","-i",container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","jinhu","-d",database],sql);
const psqlFailure=sql=>{
  const result=spawnSync("docker",["exec","-i",container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","jinhu","-d",database],{cwd:ROOT,encoding:"utf8",input:sql});
  assert.notEqual(result.status,0,"SQL unexpectedly succeeded");
  return `${result.stdout}\n${result.stderr}`;
};
const label=run(["inspect","--format",'{{index .Config.Labels "com.docker.compose.project"}}',container]);
assert.equal(label,composeProject,"unexpected PostgreSQL compose project");

const suffix=randomBytes(6).toString("hex");
const operation=`yzprod-import-20260829T010000Z-${suffix}`;
const v1Operation=`yzprod-import-20260828T010000Z-${suffix}`;
const ordinaryRole=`yzprod_v2_reader_${suffix}`;
const H=value=>value.repeat(64);
const ids={
  org:"11111111-1111-4111-8111-111111111111",
  position:"22222222-2222-4222-8222-222222222222",
  employee:"33333333-3333-4333-8333-333333333333",
  contractType:"44444444-4444-4444-8444-444444444444",
  contract:"55555555-5555-4555-8555-555555555555",
};

const scopeSha=psql("SELECT hr_yuzhou_production_target_scope_sha256('tenant-a','park-a');");
assert.match(scopeSha,/^[0-9a-f]{64}$/u);

assert.match(psqlFailure(`BEGIN ISOLATION LEVEL READ COMMITTED; SELECT hr_yuzhou_consume_import_authorization_v2('${operation}','${"1".repeat(40)}','${H("2")}','${H("3")}','${H("4")}','${H("5")}','tenant-a','park-a','${scopeSha}','${H("6")}','${H("7")}',now()-interval '1 minute',now()+interval '5 minutes',now()-interval '2 minutes',now()+interval '10 minutes','${H("8")}','${H("9")}','${H("a")}','${H("b")}','${H("c")}'); COMMIT;`),/HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE/u);
assert.match(psqlFailure(`BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT hr_yuzhou_consume_import_authorization_v2('${operation}','${"1".repeat(40)}','${H("2")}','${H("3")}','${H("4")}','${H("5")}','tenant-a','park-a','${H("0")}','${H("6")}','${H("7")}',now()-interval '1 minute',now()+interval '5 minutes',now()-interval '2 minutes',now()+interval '10 minutes','${H("8")}','${H("9")}','${H("a")}','${H("b")}','${H("c")}'); COMMIT;`),/HR_PRODUCTION_IMPORT_TARGET_SCOPE_MISMATCH/u);

psql(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hr_yuzhou_consume_import_authorization_v2(
 '${operation}','${"1".repeat(40)}','${H("2")}','${H("3")}','${H("4")}','${H("5")}',
 'tenant-a','park-a','${scopeSha}','${H("6")}','${H("7")}',
 now()-interval '1 minute',now()+interval '5 minutes',now()-interval '2 minutes',now()+interval '10 minutes',
 '${H("8")}','${H("9")}','${H("a")}','${H("b")}','${H("c")}'
);
INSERT INTO hr_yuzhou_production_import_phase(
 operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,before_canonical_sha256,
 payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version
)
SELECT '${operation}',phase,ordinal,'planned',repeat((ordinal+1)::text,64)::char(64),planned,repeat((ordinal+2)::text,64)::char(64),
       repeat((ordinal+3)::text,64)::char(64),repeat((ordinal+4)::text,64)::char(64),'yuzhou-production-import-canonical-json-v1'
FROM (VALUES ('T0',0,3),('T1',1,0),('T2',2,2),('T3',3,0)) AS phases(phase,ordinal,planned);

INSERT INTO hr_yuzhou_production_import_record(
 operation_id,phase,source_identity_sha256,source_row_sha256,disposition,planned_target_table,target_table,target_id,target_after_sha256
) VALUES
 ('${operation}','T0','${H("d")}','${H("1")}','insert','sys_org','sys_org','${ids.org}','${H("2")}'),
 ('${operation}','T0','${H("e")}','${H("2")}','insert','hr_position','hr_position','${ids.position}','${H("3")}'),
 ('${operation}','T0','${H("f")}','${H("3")}','insert','hr_employee','hr_employee','${ids.employee}','${H("4")}'),
 ('${operation}','T2','${H("a")}','${H("4")}','insert','hr_contract_type','hr_contract_type','${ids.contractType}','${H("5")}'),
 ('${operation}','T2','${H("b")}','${H("5")}','insert','hr_contract','hr_contract','${ids.contract}','${H("6")}');
INSERT INTO hr_yuzhou_production_import_record_dependency(
 operation_id,phase,source_identity_sha256,dependency_role,depends_on_phase,depends_on_source_identity_sha256,expected_target_table
) VALUES
 ('${operation}','T0','${H("e")}','org','T0','${H("d")}','sys_org'),
 ('${operation}','T0','${H("f")}','primary_org','T0','${H("d")}','sys_org'),
 ('${operation}','T0','${H("f")}','position','T0','${H("e")}','hr_position'),
 ('${operation}','T2','${H("b")}','employee','T0','${H("f")}','hr_employee'),
 ('${operation}','T2','${H("b")}','contract_type','T2','${H("a")}','hr_contract_type');
COMMIT;
`);

assert.equal(psql(`SELECT execution_contract_version||'|'||target_tenant_id||'|'||target_park_id FROM hr_yuzhou_production_import_operation WHERE operation_id='${operation}';`),"2|tenant-a|park-a");
assert.equal(psql(`SELECT count(*) FROM hr_yuzhou_production_import_record_dependency WHERE operation_id='${operation}';`),"5");

assert.match(psqlFailure(`
BEGIN;
UPDATE hr_yuzhou_production_import_operation
SET target_park_id='park-b',target_scope_sha256=hr_yuzhou_production_target_scope_sha256('tenant-a','park-b')
WHERE operation_id='${operation}';
COMMIT;
`),/HR_PRODUCTION_IMPORT_TARGET_SCOPE_IMMUTABLE/u);

assert.match(psqlFailure(`
BEGIN;
UPDATE hr_yuzhou_production_import_record
SET disposition='quarantine',target_table=NULL,target_id=NULL,target_after_sha256=NULL,decision_attestation_sha256='${H("c")}'
WHERE operation_id='${operation}' AND phase='T0' AND source_identity_sha256='${H("d")}';
COMMIT;
`),/HR_PRODUCTION_IMPORT_V2_DEPENDENCY_TARGET_INVALID/u);

assert.match(psqlFailure(`
BEGIN;
INSERT INTO hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256,source_row_sha256,disposition,planned_target_table,target_table,target_id,target_after_sha256)
VALUES('${operation}','T3','${H("0")}','${H("9")}','insert','hr_employee_insurance_item','hr_employee_insurance_item','66666666-6666-4666-8666-666666666666','${H("8")}');
COMMIT;
`),/HR_PRODUCTION_IMPORT_V2_DEPENDENCY_(SET_INVALID|REQUIRED)/u);

psql(`
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT hr_yuzhou_consume_import_authorization(
 '${v1Operation}','${"2".repeat(40)}','${H("d")}','${H("e")}','${H("f")}','${H("0")}',
 '${H("d")}','${H("e")}',now()-interval '1 minute',now()+interval '5 minutes',
 now()-interval '2 minutes',now()+interval '10 minutes','${H("f")}','${H("0")}','${H("1")}','${H("2")}','${H("3")}'
);
INSERT INTO hr_yuzhou_production_import_phase(
 operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,before_canonical_sha256
)
SELECT '${v1Operation}',phase,ordinal,'planned',repeat((ordinal+4)::text,64)::char(64),planned,repeat((ordinal+5)::text,64)::char(64)
FROM (VALUES ('T0',0,1),('T1',1,1),('T2',2,0),('T3',3,0)) AS phases(phase,ordinal,planned);
INSERT INTO hr_yuzhou_production_import_record(
 operation_id,phase,source_identity_sha256,source_row_sha256,owner_source_identity_sha256,disposition,target_table,target_id,target_after_sha256
) VALUES
 ('${v1Operation}','T0','${H("4")}','${H("5")}',NULL,'insert','hr_employee','77777777-7777-4777-8777-777777777777','${H("6")}'),
 ('${v1Operation}','T1','${H("7")}','${H("8")}','${H("4")}','insert','hr_employment_event','88888888-8888-4888-8888-888888888888','${H("9")}');
COMMIT;
`);
assert.equal(psql(`SELECT execution_contract_version||'|'||count(*) FROM hr_yuzhou_production_import_operation o JOIN hr_yuzhou_production_import_record r USING(operation_id) WHERE o.operation_id='${v1Operation}' GROUP BY execution_contract_version;`),"1|2");

psql(`CREATE ROLE ${ordinaryRole} NOLOGIN;`);
assert.equal(psql(`SELECT has_function_privilege('${ordinaryRole}','hr_yuzhou_consume_import_authorization_v2(character varying,character,character,character,character,character,character varying,character varying,character,character,character,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,character,character,character,character,character)','EXECUTE');`),"f");
assert.match(psqlFailure(`SET ROLE ${ordinaryRole}; SELECT count(*) FROM hr_yuzhou_production_import_operation;`),/permission denied/u);
psql(`
BEGIN;
DELETE FROM hr_yuzhou_production_import_record_dependency WHERE operation_id IN ('${operation}','${v1Operation}');
DELETE FROM hr_yuzhou_production_import_before_image WHERE operation_id IN ('${operation}','${v1Operation}');
DELETE FROM hr_yuzhou_production_import_quarantine WHERE operation_id IN ('${operation}','${v1Operation}');
DELETE FROM hr_yuzhou_production_import_record WHERE operation_id IN ('${operation}','${v1Operation}');
DELETE FROM hr_yuzhou_production_import_phase WHERE operation_id IN ('${operation}','${v1Operation}');
DELETE FROM hr_yuzhou_production_import_authorization_use WHERE import_operation_id IN ('${operation}','${v1Operation}');
DELETE FROM hr_yuzhou_production_import_rollback_operation WHERE import_operation_id IN ('${operation}','${v1Operation}');
DELETE FROM hr_yuzhou_production_import_operation WHERE operation_id IN ('${operation}','${v1Operation}');
COMMIT;
DROP ROLE ${ordinaryRole};
`);
assert.equal(psql(`SELECT count(*) FROM hr_yuzhou_production_import_operation WHERE operation_id IN ('${operation}','${v1Operation}');`),"0");
assert.equal(psql(`SELECT count(*) FROM pg_roles WHERE rolname='${ordinaryRole}';`),"0");

console.log("Production import v2 direct PostgreSQL fixture passed: exact scope, payload binding, dependency graph, denial, residual=0");
