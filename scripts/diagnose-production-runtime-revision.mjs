#!/usr/bin/env node
/** Standalone stdin-capable, local Docker read-only observation. No receipt authority. */
import process from "node:process";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[0-9a-f]{40}$/u, ID = /^[0-9a-f]{64}$/u, IMAGE = /^sha256:[0-9a-f]{64}$/u;
const services = ["api", "web"];
const containerFormat = '[{{json .Id}},{{json .Image}},{{json .State.Running}},{{json .State.Paused}},{{json .State.Restarting}},{{json .State.StartedAt}},{{json .RestartCount}},{{json .Name}}]';
const imageFormat = '[{{json .Id}},{{json (index .Config.Labels "org.opencontainers.image.revision")}},{{json (index .Config.Labels "cn.jinhu.runtime.component")}}]';
export class ProductionRuntimeObservationError extends Error {
  constructor(code) { super(code); this.name = "ProductionRuntimeObservationError"; this.code = code; }
}
const fail = suffix => { throw new ProductionRuntimeObservationError(`PRODUCTION_RUNTIME_${suffix}`); };
const docker = args => execFileSync("docker", ["--host", "unix:///var/run/docker.sock", ...args], { encoding: "utf8", timeout: 10000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] });
export function observeProductionRuntimeRevision(expectedCommit, { expectedApiCommit = expectedCommit, expectedWebCommit = expectedCommit, observerCodeCommit = expectedCommit, runDocker = docker, now = () => new Date() } = {}) {
  try {
    if (typeof expectedCommit !== "string" || !SHA.test(expectedCommit)) fail("EXPECTED_COMMIT_INVALID");
    if (typeof expectedApiCommit !== "string" || !SHA.test(expectedApiCommit)) fail("EXPECTED_API_COMMIT_INVALID");
    if (typeof expectedWebCommit !== "string" || !SHA.test(expectedWebCommit)) fail("EXPECTED_WEB_COMMIT_INVALID");
    if (typeof observerCodeCommit !== "string" || !SHA.test(observerCodeCommit)) fail("OBSERVER_CODE_COMMIT_INVALID");
    const call = args => {
      let result;
      try { result = runDocker(args); } catch { fail("COMMAND_FAILED"); }
      if (typeof result !== "string" || Buffer.byteLength(result) > 65536) fail("METADATA_INVALID");
      return result.trim();
    };
    const json = args => { try { return JSON.parse(call(args)); } catch (error) { if (error instanceof ProductionRuntimeObservationError) throw error; fail("METADATA_INVALID"); } };
    const inspect = (identity, service) => {
      const value = json(["container", "inspect", "--format", containerFormat, identity]);
      if (!Array.isArray(value) || value.length !== 8 || typeof value[0] !== "string" || typeof value[1] !== "string" || !ID.test(value[0]) || !IMAGE.test(value[1])
        || ![value[2], value[3], value[4]].every(item => typeof item === "boolean") || typeof value[5] !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value[5]) || !Number.isFinite(Date.parse(value[5]))
        || !Number.isSafeInteger(value[6]) || value[6] < 0 || value[7] !== `/jinhu-smart-park-prod-${service}`) fail("METADATA_INVALID");
      if (!value[2] || value[3] || value[4]) fail("CONTAINER_NOT_RUNNING");
      return { containerId: value[0], imageId: value[1], startedAt: value[5], restartCount: value[6] };
    };
    const before = services.map(service => ({ service, ...inspect(`jinhu-smart-park-prod-${service}`, service) }));
    const observations = before.map(item => {
      const identity = inspect(item.containerId, item.service);
      if (JSON.stringify(identity) !== JSON.stringify({ containerId: item.containerId, imageId: item.imageId, startedAt: item.startedAt, restartCount: item.restartCount })) fail("CONTAINER_CHANGED");
      // Read the immutable IMAGE object, never overrideable container labels/tags.
      const image = json(["image", "inspect", "--format", imageFormat, item.imageId]);
      if (!Array.isArray(image) || image.length !== 3 || image[0] !== item.imageId || image[2] !== item.service) fail("IMAGE_METADATA_INVALID");
      if (typeof image[1] !== "string" || !SHA.test(image[1])) fail("REVISION_UNAVAILABLE");
      const expectedRevision = item.service === "api" ? expectedApiCommit : expectedWebCommit;
      if (image[1] !== expectedRevision) fail("REVISION_MISMATCH");
      const destinations = call(["container", "inspect", "--format", "{{range .Mounts}}{{json .Destination}}{{println}}{{end}}", item.containerId]);
      for (const line of destinations ? destinations.split("\n") : []) {
        let path; try { path = JSON.parse(line); } catch { fail("MOUNT_METADATA_INVALID"); }
        if (typeof path !== "string" || !path.startsWith("/") || path !== posix.normalize(path) || path.includes("\0") || path.split("/").some(part => part === "." || part === "..")) fail("MOUNT_METADATA_INVALID");
        // Only destinations are requested; never inspect or expose host Source.
        if (path === "/" || path === "/app" || path.startsWith("/app/")) fail("APPLICATION_MOUNT_OVERRIDE");
      }
      return { ...item, revision: image[1] };
    });
    for (const item of before) {
      const after = inspect(`jinhu-smart-park-prod-${item.service}`, item.service);
      if (after.containerId !== item.containerId || after.imageId !== item.imageId || after.startedAt !== item.startedAt || after.restartCount !== item.restartCount) fail("CONTAINER_CHANGED");
    }
    const observedAt = now().toISOString();
    return { formatVersion: 2, artifactKind: "jinhu_production_runtime_image_observation", status: "PASS", expectedApiCommit, expectedWebCommit, observerCodeCommit,
      observedAt, observations, evidenceScope: "running_container_image_revisions", productionImport: "HOLD", authorizationGranted: false };
  } catch (error) {
    if (error instanceof ProductionRuntimeObservationError) throw error;
    fail("OBSERVATION_FAILED");
  }
}

// Temporary observer-only expectation from the retained sealed successful plan.
const ORIGINAL_EXPECTATION = {
  "operationId": "yzprod-import-20261001T204140Z-c19af6def55c",
  "sealedPlanSha256": "23ee07ce095573c9c0d129afb4b7bb4d9447ad93f86ab574c410871685ff2f44",
  "targetScope": {
    "parkId": "20000001",
    "scopeSha256": "dd115030dbdf977460bf3224598f0c15c1e92aec2aca18eb5bbeb656efecb9ab",
    "tenantId": "10000001"
  },
  "triple": {
    "codeSha": "dafe8b54510dada1c7bf90663557c54debc89b16",
    "mappingContractHash": "ca5d836f059335d4733bc32771adcd6a280e1f343e8a39c7aad820527b30f5d9",
    "sourceSnapshotHash": "3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e"
  },
  "domains": [
    {
      "phase": "T0",
      "targetTable": "hr_employee",
      "records": 2938,
      "recordSetSha256": "0b47aeaa92b9e02dca380dd3541d33da21a218672b567ff23688f73092e270ca",
      "dependencies": 5707,
      "dependencySetSha256": "25c0dce2b9b7825caf10c9230fdabe74c10a57ef8277c8f8d3b1519cb81688b7"
    },
    {
      "phase": "T2",
      "targetTable": "hr_contract",
      "records": 798,
      "recordSetSha256": "83ab57ba66f44d050dbc772ccabdd5d336c58603b7dcc654a025c77576b7a2e4",
      "dependencies": 1596,
      "dependencySetSha256": "99f9bd3efa35c348bf8d9e7b2640d4bd737332c5f3d7a70356507cc99950714b"
    }
  ]
};
const recordFields = ['phase','source_system','source_table','source_pk_canonical','source_identity_sha256','source_row_sha256','target_table','target_id','target_after_sha256','target_version_after','disposition'];
const dependencyFields = ['phase','source_identity_sha256','dependency_role','depends_on_phase','depends_on_source_identity_sha256','expected_target_table'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const invalidExpectation = () => fail('ORIGINAL_EXPECTATION_INVALID');
function validateOriginalExpectation(e) {
  if (!exactKeys(e,['operationId','sealedPlanSha256','targetScope','triple','domains'])
    || typeof e.operationId !== 'string' || !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u.test(e.operationId)
    || typeof e.sealedPlanSha256 !== 'string' || !ID.test(e.sealedPlanSha256)
    || !exactKeys(e.targetScope,['tenantId','parkId','scopeSha256'])
    || !['tenantId','parkId'].every(k => typeof e.targetScope[k] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(e.targetScope[k]))
    || typeof e.targetScope.scopeSha256 !== 'string' || !ID.test(e.targetScope.scopeSha256)
    || !exactKeys(e.triple,['codeSha','mappingContractHash','sourceSnapshotHash'])
    || typeof e.triple.codeSha !== 'string' || !SHA.test(e.triple.codeSha)
    || !['mappingContractHash','sourceSnapshotHash'].every(k => typeof e.triple[k] === 'string' && ID.test(e.triple[k]))
    || !Array.isArray(e.domains) || e.domains.length !== 2) invalidExpectation();
  for (const [i,d] of e.domains.entries()) {
    if (!exactKeys(d,['phase','targetTable','records','recordSetSha256','dependencies','dependencySetSha256'])
      || d.phase !== ['T0','T2'][i] || d.targetTable !== ['hr_employee','hr_contract'][i]
      || !['records','dependencies'].every(k => Number.isSafeInteger(d[k]) && d[k]>=0 && d[k]<=100000)
      || !['recordSetSha256','dependencySetSha256'].every(k => typeof d[k] === 'string' && ID.test(d[k]))) invalidExpectation();
  }
  return e;
}
/** Only this typed, allowlisted builder varies for synthetic tests; the CLI uses the embedded expectation. */
export function buildOriginalBaselineReadonlySql(expectation = ORIGINAL_EXPECTATION) {
  const e = validateOriginalExpectation(expectation), q = s => `'${s}'`;
  const recordLine = recordFields.map(k=>`r.${k}::text`).join(' || chr(31) || ');
  const depLine = dependencyFields.map(k=>`d.${k}::text`).join(' || chr(31) || ');
  return `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=public,pg_catalog;
WITH bound_operation AS (
 SELECT operation_id FROM hr_yuzhou_production_import_operation
 WHERE operation_id=${q(e.operationId)} AND status='succeeded' AND execution_contract_version=2
 AND code_sha=${q(e.triple.codeSha)} AND source_snapshot_sha256=${q(e.triple.sourceSnapshotHash)}
 AND mapping_contract_sha256=${q(e.triple.mappingContractHash)} AND sealed_plan_sha256=${q(e.sealedPlanSha256)}
 AND target_tenant_id=${q(e.targetScope.tenantId)} AND target_park_id=${q(e.targetScope.parkId)}
 AND target_scope_sha256=${q(e.targetScope.scopeSha256)}
 AND target_scope_sha256=hr_yuzhou_production_target_scope_sha256(target_tenant_id,target_park_id)
), eligible AS MATERIALIZED (
 SELECT r.phase,r.source_identity_sha256,r.target_table,r.target_id
 FROM hr_yuzhou_production_import_record r
 JOIN bound_operation bo ON bo.operation_id=r.operation_id
 JOIN hr_yuzhou_production_import_operation o ON o.operation_id=r.operation_id
 JOIN hr_yuzhou_production_import_phase p ON (p.operation_id,p.phase)=(r.operation_id,r.phase)
 JOIN hr_yuzhou_production_import_projection_receipt pr ON (pr.operation_id,pr.phase,pr.source_identity_sha256)=(r.operation_id,r.phase,r.source_identity_sha256)
 JOIN migration_batch b ON b.id=pr.migration_batch_id
 JOIN legacy_record_map m ON m.id=pr.legacy_record_map_id AND m.batch_id=b.id
 WHERE r.phase IN ('T0','T2') AND r.planned_target_table IN ('sys_org','hr_position','hr_employee','hr_contract_type','hr_contract')
 AND p.status='succeeded' AND p.canonicalization_version='yuzhou-production-import-canonical-json-v1'
 AND p.payload_bundle_artifact_sha256 IS NOT NULL AND p.payload_bundle_sha256 IS NOT NULL
 AND r.rollback_status='not_started' AND r.rolled_back_at IS NULL
 AND r.disposition IN ('insert','merge','skip_approved') AND r.target_version_after>=1
 AND r.target_after_sha256 IS NOT NULL AND r.target_table=r.planned_target_table
 AND r.source_system='yuzhou-v10' AND r.source_pk_canonical='sha256:'||r.source_identity_sha256
 AND b.execution_context='production_import' AND b.status='succeeded'
 AND b.production_import_operation_id=r.operation_id AND b.production_import_phase=r.phase
 AND b.source_system=r.source_system AND b.source_snapshot_sha256=o.source_snapshot_sha256
 AND b.target_database=current_database() AND b.run_id=r.operation_id||'-'||lower(r.phase)
 AND b.tool_version='prod-import-v2@'||o.code_sha
 AND m.source_system=r.source_system AND m.source_table=r.source_table
 AND m.source_pk_canonical=r.source_pk_canonical AND m.source_identity_sha256=r.source_identity_sha256
 AND m.source_row_sha256=r.source_row_sha256 AND m.target_table=r.target_table AND m.target_id=r.target_id
 AND m.is_active=true AND m.mapping_status IN ('loaded','verified')
 AND (SELECT count(*) FROM legacy_record_map am WHERE am.source_system='yuzhou-v10'
      AND am.source_table=r.source_table AND am.source_identity_sha256=r.source_identity_sha256 AND am.is_active)=1
), domains(phase,target_table) AS (VALUES ('T0','hr_employee'),('T2','hr_contract')),
original AS MATERIALIZED (
 SELECT r.phase,r.source_identity_sha256,r.target_table,r.target_id,${recordLine} AS line
 FROM hr_yuzhou_production_import_record r JOIN domains d ON d.phase=r.phase AND d.target_table=r.planned_target_table AND d.target_table=r.target_table
 WHERE r.operation_id=${q(e.operationId)} AND r.disposition='insert'
), dependencies AS MATERIALIZED (
 SELECT d.phase,d.source_identity_sha256,d.dependency_role,d.depends_on_phase,d.depends_on_source_identity_sha256,d.expected_target_table,
 ${depLine} AS line,
 (EXISTS(SELECT 1 FROM eligible er WHERE er.phase=d.depends_on_phase AND er.source_identity_sha256=d.depends_on_source_identity_sha256
 AND er.target_table=d.expected_target_table)
 AND ((d.phase='T0' AND (d.dependency_role,d.depends_on_phase,d.expected_target_table) IN (('primary_org','T0','sys_org'),('position','T0','hr_position')))
 OR (d.phase='T2' AND (d.dependency_role,d.depends_on_phase,d.expected_target_table) IN (('employee','T0','hr_employee'),('contract_type','T2','hr_contract_type'))))) AS valid
 FROM hr_yuzhou_production_import_record_dependency d JOIN original r ON r.phase=d.phase AND r.source_identity_sha256=d.source_identity_sha256
 WHERE d.operation_id=${q(e.operationId)}
), current_targets AS MATERIALIZED (
 SELECT r.phase,t.id::text AS target_id,to_jsonb(t)::text AS row_json
 FROM original r JOIN hr_employee t ON r.target_table='hr_employee' AND t.id=r.target_id
 WHERE t.tenant_id=${q(e.targetScope.tenantId)} AND t.park_id=${q(e.targetScope.parkId)}
 UNION ALL
 SELECT r.phase,t.id::text AS target_id,to_jsonb(t)::text AS row_json
 FROM original r JOIN hr_contract t ON r.target_table='hr_contract' AND t.id=r.target_id
 WHERE t.tenant_id=${q(e.targetScope.tenantId)} AND t.park_id=${q(e.targetScope.parkId)}
), domain_counts AS (
 SELECT ds.phase,ds.target_table,
 (SELECT count(*) FROM original r WHERE r.phase=ds.phase) AS records,
 (SELECT encode(digest(coalesce(string_agg(r.line||chr(10),'' ORDER BY r.line COLLATE "C"),''),'sha256'),'hex') FROM original r WHERE r.phase=ds.phase) AS record_hash,
 (SELECT count(*) FROM dependencies d WHERE d.phase=ds.phase) AS dependencies,
 (SELECT encode(digest(coalesce(string_agg(d.line||chr(10),'' ORDER BY d.line COLLATE "C"),''),'sha256'),'hex') FROM dependencies d WHERE d.phase=ds.phase) AS dependency_hash,
 (SELECT encode(digest(coalesce(string_agg(t.row_json||chr(10),'' ORDER BY t.target_id COLLATE "C"),''),'sha256'),'hex') FROM current_targets t WHERE t.phase=ds.phase) AS current_target_rows_hash,
 (SELECT count(*) FROM dependencies d WHERE d.phase=ds.phase AND d.valid) AS eligible_dependencies,
 (SELECT count(*) FROM original r JOIN eligible er ON (er.phase,er.source_identity_sha256,er.target_table)=(r.phase,r.source_identity_sha256,r.target_table)
 WHERE r.phase=ds.phase
 AND NOT EXISTS(SELECT 1 FROM dependencies d WHERE (d.phase,d.source_identity_sha256)=(r.phase,r.source_identity_sha256) AND NOT d.valid)
 AND (SELECT count(*) FROM dependencies d WHERE (d.phase,d.source_identity_sha256)=(r.phase,r.source_identity_sha256) AND d.dependency_role=CASE WHEN r.phase='T0' THEN 'primary_org' ELSE 'employee' END)=1
 AND (r.phase='T0' OR (SELECT count(*) FROM dependencies d WHERE (d.phase,d.source_identity_sha256)=(r.phase,r.source_identity_sha256) AND d.dependency_role='contract_type')=1)
 AND (SELECT count(*) FROM dependencies d WHERE (d.phase,d.source_identity_sha256)=(r.phase,r.source_identity_sha256) AND d.dependency_role='position')<=1
 ) AS eligible_records,
 (SELECT count(*) FROM original r WHERE r.phase=ds.phase AND
 ((r.target_table='hr_employee' AND EXISTS(SELECT 1 FROM hr_employee t WHERE t.id=r.target_id AND t.tenant_id=${q(e.targetScope.tenantId)} AND t.park_id=${q(e.targetScope.parkId)} AND NOT t.is_deleted))
 OR (r.target_table='hr_contract' AND EXISTS(SELECT 1 FROM hr_contract t WHERE t.id=r.target_id AND t.tenant_id=${q(e.targetScope.tenantId)} AND t.park_id=${q(e.targetScope.parkId)} AND NOT t.is_deleted)))) AS available_targets,
 (SELECT count(*) FROM hr_incremental_initial_baseline bl WHERE bl.original_operation_id=${q(e.operationId)} AND bl.original_phase=ds.phase) AS accepted_baselines
 FROM domains ds
)
SELECT json_build_object('operationBound',(SELECT count(*)=1 FROM bound_operation), 'domains',
 (SELECT json_agg(json_build_object('phase',phase,'targetTable',target_table,'records',records,'recordSetSha256',record_hash,
 'dependencies',dependencies,'dependencySetSha256',dependency_hash,'eligibleRecords',eligible_records,'eligibleDependencies',eligible_dependencies,
 'availableTargets',available_targets,'acceptedBaselines',accepted_baselines,'currentTargetRowsSha256',current_target_rows_hash) ORDER BY phase COLLATE "C") FROM domain_counts))::text;
ROLLBACK;
`;
}
export function sanitizeOriginalBaselineObservation(raw, expectation = ORIGINAL_EXPECTATION) {
  const e=validateOriginalExpectation(expectation);
  let value;
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw)>16384) fail('ORIGINAL_RESULT_INVALID');
    value=JSON.parse(raw);
  } catch { fail('ORIGINAL_RESULT_INVALID'); }
  if (!exactKeys(value,['operationBound','domains']) || typeof value.operationBound!=='boolean' || !Array.isArray(value.domains) || value.domains.length!==2) fail('ORIGINAL_RESULT_INVALID');
  const domains=value.domains.map((d,i)=>{
    const expected=e.domains[i];
    if (!exactKeys(d,['phase','targetTable','records','recordSetSha256','dependencies','dependencySetSha256','eligibleRecords','eligibleDependencies','availableTargets','acceptedBaselines','currentTargetRowsSha256'])
      || d.phase!==expected.phase || d.targetTable!==expected.targetTable
      || !['records','dependencies','eligibleRecords','eligibleDependencies','availableTargets','acceptedBaselines'].every(k=>Number.isSafeInteger(d[k])&&d[k]>=0&&d[k]<=100000)
      || !['recordSetSha256','dependencySetSha256','currentTargetRowsSha256'].every(k=>typeof d[k]==='string'&&ID.test(d[k]))
      || d.eligibleRecords>d.records || d.availableTargets>d.records || d.acceptedBaselines>d.records || d.eligibleDependencies>d.dependencies) fail('ORIGINAL_RESULT_INVALID');
    const ready=value.operationBound && d.records===expected.records && d.dependencies===expected.dependencies
      && d.recordSetSha256===expected.recordSetSha256 && d.dependencySetSha256===expected.dependencySetSha256
      && d.eligibleRecords===d.records && d.eligibleDependencies===d.dependencies && d.availableTargets===d.records;
    return {...d,ready};
  });
  return {status:domains.every(d=>d.ready)?'PASS':'FAIL',evidenceScope:'original_receipt_readiness_only',operationBound:value.operationBound,
    domains,productionImport:'HOLD',baselineAnchoring:'HOLD',authorizationGranted:false};
}
export function observeOriginalBaselineReadonly() {
  let raw;
  try {
    raw=execFileSync('docker',['--host','unix:///var/run/docker.sock','exec','-i','jinhu-smart-park-prod-postgres','sh','-c',
      'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
      {input:buildOriginalBaselineReadonlySql(),encoding:'utf8',timeout:40000,maxBuffer:16384,stdio:['pipe','pipe','pipe']});
  } catch { fail('ORIGINAL_QUERY_FAILED'); }
  return sanitizeOriginalBaselineObservation(raw);
}


/** Snapshot-only original T5 aggregate observation; never certifies or writes a baseline. */
export function buildT5ProfileAggregateReadonlySql() {
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=pg_catalog,public;
SET LOCAL TIME ZONE 'Asia/Shanghai';
WITH operation AS (
 SELECT o.* FROM public.hr_yuzhou_t5_followon_operation o
 JOIN public.migration_batch b ON b.t5_followon_operation_id=o.operation_id
 WHERE o.operation_id='yzprod-import-20261002T012708Z-8d16a426fe54'
 AND o.binding_sha256='c15e13525f5c03ff06426150a2c7539f61e1a6ce5464af90e537380211b9559e'
 AND o.status='succeeded' AND o.finished_at IS NOT NULL AND o.rolled_back_at IS NULL
 AND o.binding->>'executionCodeSha'='7c3df1c230bde74badbf414acae36030d5fe8709'
 AND o.binding->>'sourceMappingContractSha256'='d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0'
 AND o.binding->'targetScope'->>'tenantId'='10000001'
 AND o.binding->'targetScope'->>'parkId'='20000001'
 AND b.source_system='yuzhou-v10' AND b.execution_context='t5_production_followon'
 AND b.status='succeeded' AND b.finished_at IS NOT NULL
 AND b.run_id=o.operation_id AND b.target_database=current_database()
 AND b.source_snapshot_sha256=o.binding->'triple'->>'sourceSnapshotHash'
 AND b.tool_version='t5-followon-v1@'||(o.binding->>'executionCodeSha')
), receipts AS (
 SELECT r.* FROM public.hr_yuzhou_t5_followon_projection_receipt r
 WHERE r.operation_id='yzprod-import-20261002T012708Z-8d16a426fe54'
), profiles AS (
 SELECT x.* FROM public.hr_employee_profile x JOIN receipts r ON r.target_id=x.id
 WHERE r.target_table='hr_employee_profile' AND r.disposition='insert'
 AND x.tenant_id='10000001' AND x.park_id='20000001'
), profile_hash AS (
 SELECT count(*) n,encode(public.digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex') h
 FROM (SELECT encode(public.digest(to_jsonb(x)::text,'sha256'),'hex') row_hash FROM profiles x) q
), receipt_hash AS (
 SELECT count(*) n,encode(public.digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex') h
 FROM (SELECT encode(public.digest(to_jsonb(r)::text,'sha256'),'hex') row_hash FROM receipts r) q
)
SELECT json_build_object(
 'operationBound',(SELECT count(*)=1 FROM operation),
 'profileCount',(SELECT n FROM profile_hash),
 'profileReceiptCount',(SELECT count(*) FROM receipts WHERE target_table='hr_employee_profile' AND disposition='insert'),
 'profileSha256',(SELECT h FROM profile_hash),
 'profileAggregateMatches',COALESCE((SELECT o.owned_state->'hr_employee_profile'->>'count'=p.n::text
  AND o.owned_state->'hr_employee_profile'->>'sha256'=p.h FROM operation o CROSS JOIN profile_hash p),false),
 'receiptCount',(SELECT n FROM receipt_hash),
 'receiptSha256',(SELECT h FROM receipt_hash),
 'receiptAggregateMatches',COALESCE((SELECT o.owned_state->'receipts'->>'count'=r.n::text
  AND o.owned_state->'receipts'->>'sha256'=r.h FROM operation o CROSS JOIN receipt_hash r),false),
 'profileExclusions',COALESCE((SELECT json_agg(json_build_object(
  'sourceIdentitySha256',r.source_identity_sha256,'sourceRowSha256',r.source_row_sha256,
  'decisionReceiptSha256',encode(public.digest(to_jsonb(r)::text,'sha256'),'hex'),'reasonCode',r.reason_code)
  ORDER BY r.source_identity_sha256 COLLATE "C") FROM receipts r
  WHERE r.target_table='hr_employee_profile' AND r.disposition='quarantine'), '[]'::json)
)::text;
ROLLBACK;
`;
}
export function sanitizeT5ProfileAggregateObservation(raw) {
  let v;
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw)>65536) fail('T5_RESULT_INVALID');
    v=JSON.parse(raw);
  } catch { fail('T5_RESULT_INVALID'); }
  const keys=['operationBound','profileCount','profileReceiptCount','profileSha256','profileAggregateMatches','receiptCount','receiptSha256','receiptAggregateMatches','profileExclusions'];
  if (!exactKeys(v,keys)
    || !['operationBound','profileAggregateMatches','receiptAggregateMatches'].every(k=>typeof v[k]==='boolean')
    || !['profileCount','profileReceiptCount','receiptCount'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0&&v[k]<=1000000)
    || !['profileSha256','receiptSha256'].every(k=>typeof v[k]==='string'&&ID.test(v[k]))) fail('T5_RESULT_INVALID');
  if (!Array.isArray(v.profileExclusions) || v.profileExclusions.length>200) fail('T5_RESULT_INVALID');
  const seen=new Set();
  for (const e of v.profileExclusions) {
    if (!exactKeys(e,['sourceIdentitySha256','sourceRowSha256','decisionReceiptSha256','reasonCode'])
      || !['sourceIdentitySha256','sourceRowSha256','decisionReceiptSha256'].every(k=>typeof e[k]==='string'&&ID.test(e[k]))
      || typeof e.reasonCode!=='string' || !/^[A-Z][A-Z0-9_]{1,63}$/u.test(e.reasonCode)
      || seen.has(e.sourceIdentitySha256)) fail('T5_RESULT_INVALID');
    seen.add(e.sourceIdentitySha256);
  }
  const ready=v.operationBound && v.profileCount>0 && v.profileCount===v.profileReceiptCount && v.profileAggregateMatches && v.receiptAggregateMatches;
  return {...v,status:ready?'PASS':'FAIL',evidenceScope:'original_t5_profile_aggregate_snapshot_only',baselineCertified:false,productionWrites:false};
}
export function observeT5ProfileAggregateReadonly() {
  let raw;
  try {
    raw=execFileSync('docker',['--host','unix:///var/run/docker.sock','exec','-i','jinhu-smart-park-prod-postgres','sh','-c',
      'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
      {input:buildT5ProfileAggregateReadonlySql(),encoding:'utf8',timeout:40000,maxBuffer:65536,stdio:['pipe','pipe','pipe']});
  } catch { fail('T5_QUERY_FAILED'); }
  return sanitizeT5ProfileAggregateObservation(raw);
}

if (process.argv[1] === "-" || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    const values = new Map();
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      if (!["--expected-commit", "--expected-api-commit", "--expected-web-commit", "--observer-code-commit"].includes(flag)
        || values.has(flag) || typeof args[i + 1] !== "string" || args[i + 1].startsWith("--")) fail("ARGUMENT_INVALID");
      values.set(flag, args[i + 1]);
    }
    const expectedCommit = values.get("--expected-commit");
    if (!expectedCommit) fail("ARGUMENT_INVALID");
    const runtime = observeProductionRuntimeRevision(expectedCommit, {
      expectedApiCommit: values.get("--expected-api-commit") ?? expectedCommit,
      expectedWebCommit: values.get("--expected-web-commit") ?? expectedCommit,
      observerCodeCommit: values.get("--observer-code-commit") ?? expectedCommit,
    });
    const originalBaseline = observeOriginalBaselineReadonly();
    const t5OriginalProfileAggregate = observeT5ProfileAggregateReadonly();
    process.stdout.write(JSON.stringify({...runtime, originalBaseline, t5OriginalProfileAggregate}) + "\n");
    // A valid mismatching T5 snapshot must remain downloadable for diagnosis.
    if (originalBaseline.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionRuntimeObservationError ? error.code : "PRODUCTION_RUNTIME_OBSERVATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
