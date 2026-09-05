#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = process.env.YUZHOU_PERFORMANCE_SCHEMA_DATABASE ?? "";
assert.match(database, /^jinhu_hr_migration_contract_[A-Za-z0-9_]{6,64}$/u,
  "an explicit disposable schema contract database is required");

const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const operation = "yzprod-import-20260905T010203Z-123456abcdef";
const rollback = "yzprod-rollback-20260905T020304Z-fedcba654321";
const migration305 = "d3784218fc8272bd28b93e44b19a02d5c8124466b6b3c218294920603909dfc0";
const migration306 = "cd49f294f4c9e4105b9f7fd4c678b7b2d29c5433d0348f6e6632d6e7c135a56d";
const values = {
  plan: h("plan"), auth: h("authorization"), nonce: h("nonce"),
  rollbackAuth: h("rollback-authorization"), rollbackNonce: h("rollback-nonce"),
  code: "1".repeat(40), source: h("source"), mapping: h("mapping"), target: h("target"),
  t0: h("after"), relation: "", identity: "",
};
const relations = {
  asssession: Array.from({ length: 7 }, (_, index) => ({
    sourceIdentitySha256: h(`session-${index + 1}`), sourceRowSha256: h(`session-row-${index + 1}`),
    id: index + 1, asssession: `Synthetic ${index + 1}`, description: null,
    assessmenttype: null, year: 2026, month: index + 1, quarter: null, myorder: index + 1,
  })),
  asssour: [],
  asssourperson: Array.from({ length: 117 }, (_, index) => ({
    sourceIdentitySha256: h(`assignment-${index + 1}`), sourceRowSha256: h(`assignment-row-${index + 1}`),
    id: index + 1, asssessionid: 1, person: index < 9 ? "P1" : `X${String(index).padStart(3, "0")}`,
    assperson: "", lb: 1,
  })),
};
const identity = { sessions: relations.asssession.map(session => ({
  sourceSessionIdentitySha256: session.sourceIdentitySha256,
  status: "unmatched", reasonCode: "NO_MODERN_CYCLE",
  targetReviewCycleId: null, decisionAttestationSha256: h(`decision-${session.id}`),
})) };
const relationBytes = Buffer.from(JSON.stringify(relations));
const identityBytes = Buffer.from(JSON.stringify(identity));
values.relation = createHash("sha256").update(relationBytes).digest("hex");
values.identity = createHash("sha256").update(identityBytes).digest("hex");

function psql(sql, expectSuccess = true) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A",
    "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database],
  { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return result;
}

values.scope = psql("SELECT hr_yuzhou_production_target_scope_sha256('tenant-a','park-a');").stdout.trim();
assert.match(values.scope, /^[0-9a-f]{64}$/u);
const scopeSql = q(values.scope);
const t0IdentitySql = "hr_performance_yuzhou_person_identity_sha256('P1')";
const labShortCircuit = psql(`BEGIN; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_probe;
  SELECT true OR public.hr_yuzhou_performance_relations_production_context_allowed(
    '30000000-0000-0000-0000-000000000001','apply'); COMMIT;`).stdout.trim();
assert.equal(labShortCircuit, "t");
const directContextProbe = psql(`BEGIN; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_probe;
  SELECT false OR public.hr_yuzhou_performance_relations_production_context_allowed(
    '30000000-0000-0000-0000-000000000001','apply'); COMMIT;`, false);
assert.notEqual(directContextProbe.status, 0);
assert.match(directContextProbe.stderr, /permission denied for function/u);
psql(`
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name) VALUES('tenant-a','TENANT-A','Synthetic Tenant');
INSERT INTO biz_park(tenant_id,park_id,park_code,park_name) VALUES('tenant-a','park-a','PARK-A','Synthetic Park');
INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type)
VALUES('10000000-0000-0000-0000-000000000001','tenant-a','park-a','ORG-A','Synthetic Org','department');
INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id)
VALUES('20000000-0000-0000-0000-000000000001','tenant-a','park-a','P1','Synthetic Employee',
  '10000000-0000-0000-0000-000000000001');
INSERT INTO hr_yuzhou_production_import_operation(
  operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,
  sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,
  authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,
  window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,
  final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,
  phase_order,current_phase,started_at,execution_contract_version,target_tenant_id,target_park_id,
  target_scope_sha256
) VALUES(${q(operation)},'production_import','running',${q(values.code)},${q(values.source)},${q(values.mapping)},
  ${q(values.plan)},${q(values.target)},${q(values.auth)},${q(values.nonce)},now()-interval '1 minute',
  now()+interval '1 hour',now()-interval '2 minutes',now()+interval '2 hours',${q(h("approvals"))},
  ${q(h("manifest"))},${q(h("pair"))},${q(h("a"))},${q(h("b"))},
  '["T0","T1","T2","T3"]'::jsonb,'T0',now(),2,'tenant-a','park-a',${scopeSql});
INSERT INTO hr_yuzhou_production_import_authorization_use(
  intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256)
VALUES('production_import',${q(operation)},${q(operation)},${q(values.auth)},${q(values.nonce)});
INSERT INTO hr_yuzhou_production_import_phase(
  operation_id,phase,phase_ordinal,status,source_batch_manifest_sha256,planned_record_count,
  applied_record_count,before_canonical_sha256,after_canonical_sha256,started_at,finished_at,
  payload_bundle_artifact_sha256,payload_bundle_sha256,canonicalization_version
) VALUES(${q(operation)},'T0',0,'running',${q(h("t0-manifest"))},2,0,${q(h("before"))},
  NULL,now(),NULL,${q(h("bundle-artifact"))},${q(h("bundle"))},
  'yuzhou-production-import-canonical-json-v1');
INSERT INTO migration_batch(
  id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,
  started_at,finished_at,execution_context,production_import_operation_id,production_import_phase
) VALUES('30000000-0000-0000-0000-000000000001',${q(`${operation}-t0`)},'yuzhou-v10',${q(values.source)},
  current_database(),'load','running',${q(`prod-import-v2@${values.code}`)},now(),NULL,
  'production_import',${q(operation)},'T0');
INSERT INTO hr_yuzhou_production_import_record(
  operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,target_id,
  target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,
  target_version_after,planned_target_table
) VALUES(${q(operation)},'T0',${t0IdentitySql},${q(h("t0-row"))},'insert','hr_employee',
  '20000000-0000-0000-0000-000000000001',${q(h("employee-after"))},'yuzhou-v10','dbo.person',
  'sha256:'||${t0IdentitySql},${q(h("employee-business"))},1,'hr_employee');
INSERT INTO hr_yuzhou_production_import_record(
  operation_id,phase,source_identity_sha256,source_row_sha256,disposition,target_table,target_id,
  target_after_sha256,source_system,source_table,source_pk_canonical,business_identity_sha256,
  target_version_after,planned_target_table
) VALUES(${q(operation)},'T0',${q(h("org-identity"))},${q(h("org-row"))},'insert','sys_org',
  '10000000-0000-0000-0000-000000000001',${q(h("org-after"))},'yuzhou-v10','dbo.department',
  ${q(`sha256:${h("org-identity")}`)},${q(h("org-business"))},1,'sys_org');
INSERT INTO hr_yuzhou_production_import_record_dependency(
  operation_id,phase,source_identity_sha256,dependency_role,depends_on_phase,
  depends_on_source_identity_sha256,expected_target_table
) VALUES(${q(operation)},'T0',${t0IdentitySql},'primary_org','T0',${q(h("org-identity"))},'sys_org');
INSERT INTO legacy_record_map(
  id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
  source_row_sha256,target_table,target_id,mapping_status,is_active
) VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
  'yuzhou-v10','dbo.person','sha256:'||${t0IdentitySql},${t0IdentitySql},${q(h("t0-row"))},
  'hr_employee','20000000-0000-0000-0000-000000000001','loaded',true);
INSERT INTO legacy_record_map(
  id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
  source_row_sha256,target_table,target_id,mapping_status,is_active
) VALUES('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',
  'yuzhou-v10','dbo.department',${q(`sha256:${h("org-identity")}`)},${q(h("org-identity"))},
  ${q(h("org-row"))},'sys_org','10000000-0000-0000-0000-000000000001','loaded',true);
INSERT INTO hr_yuzhou_production_import_projection_receipt(
  operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id
) VALUES(${q(operation)},'T0',${t0IdentitySql},'30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001');
INSERT INTO hr_yuzhou_production_import_projection_receipt(
  operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id
) VALUES(${q(operation)},'T0',${q(h("org-identity"))},'30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002');
UPDATE migration_batch SET status='succeeded',finished_at=now()
  WHERE id='30000000-0000-0000-0000-000000000001';
UPDATE hr_yuzhou_production_import_phase SET status='succeeded',applied_record_count=2,
  after_canonical_sha256=${q(h("after"))},finished_at=now()
  WHERE operation_id=${q(operation)} AND phase='T0';
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
`);

const applySql = `SELECT status,replayed,session_rows,score_source_rows,assignment_rows,
  active_relation_maps,identity_resolution_rows,session_binding_rows,subject_unmatched_rows,
  blank_assessor_rows FROM hr_yuzhou_apply_performance_relations_production_v1(
    ${q(operation)},${q(values.plan)},${q(values.auth)},${q(values.nonce)},${q(values.code)},
    ${q(values.source)},${q(values.mapping)},${q(values.target)},'tenant-a','park-a',${scopeSql},
    ${q(values.t0)},${q(values.relation)},${q(values.identity)},decode(${q(relationBytes.toString("hex"))},'hex'),
    decode(${q(identityBytes.toString("hex"))},'hex'),${q(migration305)},${q(migration306)});`;
const wrongT0 = psql(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_writer; ${applySql.replace(values.t0, h("wrong-t0-receipt"))} COMMIT;`, false);
assert.notEqual(wrongT0.status, 0);
assert.match(wrongT0.stderr, /T0_RECEIPT_INVALID/u);
assert.equal(psql(`SELECT
  (SELECT count(*) FROM hr_performance_legacy_session WHERE migration_batch_id='30000000-0000-0000-0000-000000000001')+
  (SELECT count(*) FROM hr_performance_legacy_score_source WHERE migration_batch_id='30000000-0000-0000-0000-000000000001')+
  (SELECT count(*) FROM hr_performance_legacy_source_person_assignment WHERE migration_batch_id='30000000-0000-0000-0000-000000000001')+
  (SELECT count(*) FROM hr_performance_legacy_identity_resolution WHERE migration_batch_id='30000000-0000-0000-0000-000000000001')+
  (SELECT count(*) FROM hr_performance_legacy_session_binding WHERE migration_batch_id='30000000-0000-0000-0000-000000000001')+
  (SELECT count(*) FROM legacy_record_map WHERE batch_id='30000000-0000-0000-0000-000000000001'
    AND target_table LIKE 'hr_performance_legacy_%');`).stdout.trim(), "0");
const first = psql(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_writer; ${applySql} COMMIT;`).stdout.trim();
assert.equal(first, "succeeded|f|7|0|117|124|234|7|108|117");
const replay = psql(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_writer; ${applySql} COMMIT;`).stdout.trim();
assert.equal(replay, "succeeded|t|7|0|117|124|234|7|108|117");
const drift = psql(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_writer; ${applySql.replace(migration306, h("drift"))} COMMIT;`, false);
assert.notEqual(drift.status, 0);
assert.match(drift.stderr, /MIGRATION_DRIFT/u);

psql(`BEGIN;
UPDATE hr_yuzhou_production_import_operation SET status='succeeded',finished_at=now() WHERE operation_id=${q(operation)};
INSERT INTO hr_yuzhou_production_import_rollback_operation(
  rollback_operation_id,import_operation_id,status,sealed_plan_sha256,target_identity_sha256,
  authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,
  authorization_expires_at,started_at
) VALUES(${q(rollback)},${q(operation)},'running',${q(values.plan)},${q(values.target)},
  ${q(values.rollbackAuth)},${q(values.rollbackNonce)},now()-interval '1 minute',now()+interval '1 hour',now());
INSERT INTO hr_yuzhou_production_import_authorization_use(
  intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256)
VALUES('production_import_rollback',${q(rollback)},${q(operation)},${q(values.rollbackAuth)},${q(values.rollbackNonce)});
COMMIT;`);
const rollbackSql = `SELECT status,rollback_order,residual_count,replayed
  FROM hr_yuzhou_rollback_performance_relations_production_v1(
    ${q(rollback)},${q(operation)},${q(values.plan)},${q(values.rollbackAuth)},${q(values.rollbackNonce)},
    ${q(values.code)},${q(values.source)},${q(values.mapping)},${q(values.target)},'tenant-a','park-a',
    ${scopeSql},${q(values.t0)},${q(migration305)},${q(migration306)});`;
const reversed = psql(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_writer; ${rollbackSql} COMMIT;`).stdout.trim();
assert.equal(reversed, "rolled_back|identity_resolution>source_person_assignments|0|f");
const rollbackReplay = psql(`BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; SET LOCAL ROLE jinhu_hr_yuzhou_performance_relations_writer; ${rollbackSql} COMMIT;`).stdout.trim();
assert.equal(rollbackReplay, "rolled_back|identity_resolution>source_person_assignments|0|t");
assert.equal(psql(`SELECT count(*) FROM hr_performance_legacy_identity_resolution
  WHERE migration_batch_id='30000000-0000-0000-0000-000000000001';`).stdout.trim(), "0");
assert.equal(psql(`SELECT count(*) FROM legacy_record_map WHERE batch_id='30000000-0000-0000-0000-000000000001'
  AND is_active AND target_table LIKE 'hr_performance_legacy_%';`).stdout.trim(), "0");
const privileges = psql(`SELECT
  has_function_privilege('public', 'hr_yuzhou_apply_performance_relations_production_v1(varchar,bpchar,bpchar,bpchar,bpchar,bpchar,bpchar,bpchar,varchar,varchar,bpchar,bpchar,bpchar,bpchar,bytea,bytea,bpchar,bpchar)', 'EXECUTE'),
  (SELECT rolcanlogin FROM pg_roles WHERE rolname='jinhu_hr_yuzhou_performance_relations_writer');`).stdout.trim();
assert.equal(privileges, "f|f");
console.log(JSON.stringify({ status: "PASS", migration: "000308", t0ReceiptRejected: true, wrongT0ResidualCount: 0, labGuardShortCircuit: true, directContextExecuteDenied: true, forward: [7, 0, 117, 124, 234, 7, 108, 117], replay: true, driftRejected: true, rollbackOrder: ["identity_resolution", "source_person_assignments"], residualCount: 0, publicExecute: false, writerLogin: false, productionWrite: false }));
