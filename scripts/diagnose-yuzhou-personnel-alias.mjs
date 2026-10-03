import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Production observer only. The encrypted T5 source payload is intentionally never selected.
export const personnelAliasSql = `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=public,pg_catalog;
WITH ops AS (
 SELECT o.operation_id,o.parent_operation_id
 FROM hr_yuzhou_t5_followon_operation o
 JOIN hr_yuzhou_production_import_operation parent ON parent.operation_id=o.parent_operation_id
 JOIN migration_batch follow_batch ON follow_batch.t5_followon_operation_id=o.operation_id
  AND follow_batch.run_id=o.operation_id AND follow_batch.execution_context='t5_production_followon'
  AND follow_batch.status='succeeded' AND follow_batch.target_database=current_database()
 WHERE o.status='succeeded' AND parent.status='succeeded'
   AND o.binding->'targetScope'->>'tenantId'='10000001'
   AND o.binding->'targetScope'->>'parkId'='20000001'
   AND parent.target_tenant_id='10000001' AND parent.target_park_id='20000001'
   AND parent.code_sha=o.binding->'triple'->>'codeSha'
   AND parent.source_snapshot_sha256=o.binding->'triple'->>'sourceSnapshotHash'
   AND parent.mapping_contract_sha256=o.binding->'triple'->>'mappingContractHash'
   AND parent.sealed_plan_sha256=o.binding->'parent'->>'sealedPlanSha256'
   AND parent.target_identity_sha256=o.binding->>'targetIdentitySha256'
   AND parent.target_scope_sha256=o.binding->>'targetScopeSha256'
), raw AS (
 SELECT s.id,s.operation_id,s.tenant_id,s.park_id,s.source_domain,s.source_table,s.source_identity_sha256,
   s.source_row_sha256,s.owner_status,s.employee_id,s.owner_record_map_id,o.parent_operation_id,
   count(*) OVER (PARTITION BY s.operation_id,s.source_table,s.source_identity_sha256) AS source_cardinality,
   sr.target_id AS receipt_target_id,sr.source_row_sha256 AS receipt_row_sha256
 FROM hr_yuzhou_t5_followon_source s
 JOIN ops o ON o.operation_id=s.operation_id
  LEFT JOIN hr_yuzhou_t5_followon_projection_receipt sr
   ON sr.operation_id=s.operation_id AND sr.target_table='hr_yuzhou_t5_followon_source'
  AND sr.source_identity_sha256=s.source_identity_sha256 AND sr.source_row_sha256=s.source_row_sha256
  AND sr.target_id=s.id AND sr.disposition='insert'
 WHERE s.tenant_id='10000001' AND s.park_id='20000001'
   AND s.source_domain='person_core' AND s.source_table='dbo.person.core_residue'
), receipt_source AS (
 SELECT id,operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,
   owner_status,employee_id,owner_record_map_id,parent_operation_id,source_cardinality,receipt_target_id,receipt_row_sha256
 FROM raw WHERE receipt_target_id=id AND receipt_row_sha256=source_row_sha256
), t0 AS (
 SELECT s.id source_id,s.source_identity_sha256,s.source_row_sha256,s.employee_id,
   count(DISTINCT m.id) AS owner_evidence_count,min(m.id::text)::uuid AS map_id
 FROM receipt_source s
 JOIN legacy_record_map m ON m.id=s.owner_record_map_id AND m.target_id=s.employee_id
   AND m.target_table='hr_employee' AND m.source_system='yuzhou-v10' AND m.source_table='dbo.person'
   AND m.is_active AND m.mapping_status IN ('loaded','verified')
   AND m.source_pk_canonical='sha256:'||m.source_identity_sha256
 JOIN hr_yuzhou_production_import_record ir ON ir.operation_id=s.parent_operation_id
   AND ir.phase='T0' AND ir.source_identity_sha256=m.source_identity_sha256
   AND ir.source_row_sha256=m.source_row_sha256 AND ir.source_system=m.source_system
   AND ir.source_table=m.source_table AND ir.source_pk_canonical=m.source_pk_canonical
   AND ir.target_table='hr_employee' AND ir.target_id=s.employee_id AND ir.disposition='insert'
   AND ir.rollback_status='not_started'
 JOIN hr_yuzhou_production_import_phase phase ON phase.operation_id=ir.operation_id
   AND phase.phase=ir.phase AND phase.status='succeeded'
 JOIN hr_yuzhou_production_import_projection_receipt ip ON ip.operation_id=ir.operation_id
   AND ip.phase=ir.phase AND ip.source_identity_sha256=ir.source_identity_sha256
   AND ip.legacy_record_map_id=m.id AND ip.migration_batch_id=m.batch_id
 JOIN migration_batch batch ON batch.id=ip.migration_batch_id AND batch.id=m.batch_id
   AND batch.execution_context='production_import' AND batch.production_import_operation_id=ir.operation_id
   AND batch.production_import_phase='T0' AND batch.status='succeeded'
 JOIN hr_yuzhou_production_import_operation parent ON parent.operation_id=ir.operation_id
   AND parent.status='succeeded' AND parent.execution_contract_version=2
   AND parent.target_tenant_id=s.tenant_id AND parent.target_park_id=s.park_id
 JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id AND e.park_id=s.park_id AND NOT e.is_deleted
 WHERE s.owner_status='mapped'
 GROUP BY s.id,s.source_identity_sha256,s.source_row_sha256,s.employee_id
), mapped_owner AS (
 SELECT s.id,s.operation_id,s.tenant_id,s.park_id,s.source_domain,s.source_table,s.source_identity_sha256,
   s.source_row_sha256,s.owner_status,s.employee_id,s.owner_record_map_id,s.parent_operation_id,
   s.source_cardinality,s.receipt_target_id,s.receipt_row_sha256,m.map_id
 FROM receipt_source s JOIN t0 m ON m.source_id=s.id AND m.owner_evidence_count=1
 JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id AND e.park_id=s.park_id AND NOT e.is_deleted
), archive_values AS (
 SELECT s.id source_id,
   count(DISTINCT a.id) archive_count,
   count(DISTINCT reg.id) registry_count,
   (array_agg(a.restricted_safe_projection->'legacyFields'->'oldaddr'))[1] oldaddr_json,
   (array_agg(a.restricted_safe_projection->'legacyFields'->'edulevel'))[1] edulevel_json
 FROM mapped_owner s
 JOIN legacy_record_map m ON m.id=s.owner_record_map_id AND m.target_id=s.employee_id
   AND m.target_table='hr_employee' AND m.source_system='yuzhou-v10' AND m.source_table='dbo.person'
   AND m.is_active AND m.mapping_status IN ('loaded','verified')
 JOIN hr_yuzhou_t5_followon_projection_receipt rr ON rr.operation_id=s.operation_id
   AND rr.target_table='hr_legacy_identity_registry' AND rr.source_identity_sha256=s.source_identity_sha256
   AND rr.source_row_sha256=s.source_row_sha256 AND rr.disposition='insert'
 JOIN hr_legacy_identity_registry reg ON reg.id=rr.target_id AND reg.tenant_id=s.tenant_id AND reg.park_id=s.park_id
   AND reg.source_system='yuzhou-v10' AND reg.source_table='dbo.person.core_residue'
   AND reg.source_identity_sha256=s.source_identity_sha256 AND reg.source_row_sha256=s.source_row_sha256
   AND reg.mapping_status='mapped' AND reg.owner_employee_id=s.employee_id
   AND reg.owner_record_map_id=s.owner_record_map_id AND reg.owner_source_system=m.source_system
   AND reg.owner_source_table=m.source_table AND reg.owner_source_identity_sha256=m.source_identity_sha256
 JOIN hr_yuzhou_t5_followon_projection_receipt ar ON ar.operation_id=s.operation_id
   AND ar.target_table='hr_legacy_archive_record' AND ar.source_identity_sha256=s.source_identity_sha256
   AND ar.source_row_sha256=s.source_row_sha256 AND ar.disposition='insert'
 JOIN hr_legacy_archive_record a ON a.id=ar.target_id AND a.identity_registry_id=reg.id
   AND a.tenant_id=s.tenant_id AND a.park_id=s.park_id
 GROUP BY s.id
), active_profile_counts AS (
 SELECT employee_id,count(*) active_count FROM hr_employee_profile
 WHERE tenant_id='10000001' AND park_id='20000001' AND NOT is_deleted GROUP BY employee_id
), profiles AS (
 SELECT s.id source_id,p.id profile_id,p.native_place,p.degree,
   count(*) OVER (PARTITION BY s.id) profile_cardinality,ap.active_count
 FROM mapped_owner s
 JOIN hr_yuzhou_t5_followon_projection_receipt pr ON pr.operation_id=s.operation_id
   AND pr.target_table='hr_employee_profile' AND pr.source_identity_sha256=s.source_identity_sha256
   AND pr.source_row_sha256=s.source_row_sha256 AND pr.disposition='insert'
 JOIN hr_employee_profile p ON p.id=pr.target_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id
   AND p.employee_id=s.employee_id AND NOT p.is_deleted
   AND p.legacy_source_identity_sha256=s.source_identity_sha256
   AND p.legacy_source_row_sha256=s.source_row_sha256
 JOIN active_profile_counts ap ON ap.employee_id=s.employee_id
), exact_profiles AS (
 SELECT p.source_id,p.profile_id,p.native_place,p.degree,p.profile_cardinality,p.active_count
 FROM profiles p WHERE p.profile_cardinality=1 AND p.active_count=1
), joined AS (
 SELECT p.source_id,p.profile_id,p.native_place,p.degree,p.profile_cardinality,p.active_count,
   a.oldaddr_json,a.edulevel_json,a.archive_count
 FROM exact_profiles p LEFT JOIN archive_values a USING(source_id)
), classified AS (
 SELECT *,
   CASE WHEN jsonb_typeof(oldaddr_json)='string'
      AND oldaddr_json#>>'{}'<>'' AND btrim(oldaddr_json#>>'{}')<>'' AND char_length(oldaddr_json#>>'{}')<=50 THEN oldaddr_json#>>'{}' END oldaddr,
   CASE WHEN jsonb_typeof(edulevel_json)='string'
      AND edulevel_json#>>'{}'<>'' AND btrim(edulevel_json#>>'{}')<>'' AND char_length(edulevel_json#>>'{}')<=24 THEN edulevel_json#>>'{}' END edulevel,
   COALESCE(jsonb_typeof(oldaddr_json)='string' AND oldaddr_json#>>'{}'<>'' AND btrim(oldaddr_json#>>'{}')='',false) oldaddr_whitespace,
   COALESCE(jsonb_typeof(edulevel_json)='string' AND edulevel_json#>>'{}'<>'' AND btrim(edulevel_json#>>'{}')='',false) edulevel_whitespace
 FROM joined
), hashed AS (
 SELECT encode(digest(COALESCE(string_agg(source_identity_sha256::text||':'||source_row_sha256::text,E'\\n'
   ORDER BY source_identity_sha256::text COLLATE "C",source_row_sha256::text COLLATE "C"),''),'sha256'),'hex') AS source_set_sha256
 FROM raw
)
SELECT json_build_object(
 'operationCount',(SELECT count(DISTINCT operation_id) FROM raw),
  'sourceRecords',(SELECT count(*) FROM raw),
  'receiptMatchedSourceRecords',(SELECT count(*) FROM receipt_source),
 'missingSourceReceiptCount',(SELECT count(*) FROM raw)-(SELECT count(*) FROM receipt_source),
 'mappedRecords',(SELECT count(*) FROM raw WHERE owner_status='mapped'),
 'unmappedRecords',(SELECT count(*) FROM raw WHERE owner_status='unmapped'),
 'otherOwnerStatusRecords',(SELECT count(*) FROM raw WHERE owner_status NOT IN ('mapped','unmapped')),
 'duplicateSourceRows',(SELECT count(*) FROM raw WHERE source_cardinality<>1),
 't0MappedRecords',(SELECT count(*) FROM mapped_owner),
 'profileMatchedCount',(SELECT count(*) FROM exact_profiles),
  'duplicateProfiles',(SELECT count(DISTINCT source_id) FROM profiles WHERE profile_cardinality<>1 OR active_count<>1),
 'ambiguousArchiveRegistryCount',(SELECT count(DISTINCT source_id) FROM archive_values WHERE registry_count<>1 OR archive_count>1),
 'missingArchiveCount',(SELECT count(*) FROM mapped_owner m LEFT JOIN archive_values a ON a.source_id=m.id
   WHERE a.archive_count IS NULL OR a.archive_count<>1),
 'sourceSetSha256',(SELECT source_set_sha256 FROM hashed),
 'fields',json_build_object(
  'nativePlace',json_build_object(
   'targetNullSourceValid',(SELECT count(*) FROM classified WHERE native_place IS NULL AND oldaddr IS NOT NULL),
   'existingEqualPreserved',(SELECT count(*) FROM classified WHERE native_place IS NOT NULL AND oldaddr IS NOT NULL AND native_place=oldaddr),
   'existingDifferentPreserved',(SELECT count(*) FROM classified WHERE native_place IS NOT NULL AND oldaddr IS NOT NULL AND native_place<>oldaddr),
   'whitespaceOnlySource',(SELECT count(*) FROM classified WHERE oldaddr_whitespace),
   'missingOrInvalidSource',(SELECT count(*) FROM classified WHERE oldaddr IS NULL AND NOT oldaddr_whitespace)),
  'degree',json_build_object(
   'targetNullSourceValid',(SELECT count(*) FROM classified WHERE degree IS NULL AND edulevel IS NOT NULL),
   'existingEqualPreserved',(SELECT count(*) FROM classified WHERE degree IS NOT NULL AND edulevel IS NOT NULL AND degree=edulevel),
   'existingDifferentPreserved',(SELECT count(*) FROM classified WHERE degree IS NOT NULL AND edulevel IS NOT NULL AND degree<>edulevel),
   'whitespaceOnlySource',(SELECT count(*) FROM classified WHERE edulevel_whitespace),
   'missingOrInvalidSource',(SELECT count(*) FROM classified WHERE edulevel IS NULL AND NOT edulevel_whitespace)))
);
ROLLBACK;`;

const countKeys = ['operationCount','sourceRecords','receiptMatchedSourceRecords','missingSourceReceiptCount','mappedRecords','unmappedRecords',
  'otherOwnerStatusRecords','duplicateSourceRows','t0MappedRecords','profileMatchedCount','duplicateProfiles','ambiguousArchiveRegistryCount','missingArchiveCount'];
const fieldKeys = ['targetNullSourceValid','existingEqualPreserved','existingDifferentPreserved','whitespaceOnlySource','missingOrInvalidSource'];
const DB_SQLSTATE_ERRORS = new Map([
  ['57014','PERSONNEL_ALIAS_DB_TIMEOUT_57014'],
  ['42P01','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42703','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42883','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42804','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42P02','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42704','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42809','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42846','PERSONNEL_ALIAS_DB_SCHEMA_INVALID'],
  ['42501','PERSONNEL_ALIAS_DB_ACCESS_DENIED'],
]);

function safeProbeErrorCode(error) {
  const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : typeof error?.stderr === 'string' ? error.stderr : '';
  const lines = stderr.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) return 'PERSONNEL_ALIAS_PROBE_FAILED';
  const match = /^ERROR:\s+([0-9A-Z]{5})(?::(?:\s|$)|$)/.exec(lines[0]);
  return match ? DB_SQLSTATE_ERRORS.get(match[1]) ?? 'PERSONNEL_ALIAS_PROBE_FAILED' : 'PERSONNEL_ALIAS_PROBE_FAILED';
}

function validateResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PERSONNEL_ALIAS_RESULT_INVALID');
  const expected = [...countKeys,'sourceSetSha256','fields'].sort();
  if (Object.keys(value).sort().join('|') !== expected.join('|') || !countKeys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    || typeof value.sourceSetSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sourceSetSha256)
    || !value.fields || typeof value.fields !== 'object' || Array.isArray(value.fields)
    || Object.keys(value.fields).sort().join('|') !== 'degree|nativePlace') throw new Error('PERSONNEL_ALIAS_RESULT_INVALID');
  for (const field of Object.values(value.fields)) {
    if (!field || typeof field !== 'object' || Array.isArray(field) || Object.keys(field).sort().join('|') !== [...fieldKeys].sort().join('|')
      || !fieldKeys.every(key => Number.isSafeInteger(field[key]) && field[key] >= 0)) throw new Error('PERSONNEL_ALIAS_RESULT_INVALID');
  }
  if (value.operationCount > 1 || (value.sourceRecords > 0 && value.operationCount !== 1)
    || value.receiptMatchedSourceRecords > value.sourceRecords
    || value.missingSourceReceiptCount !== value.sourceRecords-value.receiptMatchedSourceRecords
    || value.mappedRecords + value.unmappedRecords + value.otherOwnerStatusRecords !== value.sourceRecords
    || value.t0MappedRecords > value.mappedRecords || value.profileMatchedCount > value.t0MappedRecords
    || Object.values(value.fields).some(field => fieldKeys.reduce((sum,key) => sum+field[key],0) !== value.profileMatchedCount)) {
    throw new Error('PERSONNEL_ALIAS_RESULT_INVALID');
  }
  return value;
}

export function diagnosePersonnelAlias(deployPath, run = execFileSync) {
  if (typeof deployPath !== 'string' || !isAbsolute(deployPath) || resolve(deployPath) !== deployPath
    || deployPath.includes('\0') || /[\r\n]/.test(deployPath) || deployPath === '/') throw new Error('PERSONNEL_ALIAS_PATH_INVALID');
  let value;
  try {
    const output = run('docker', ['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml',
      'exec','-T','postgres','sh','-c',
      'exec psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { cwd: deployPath, input: personnelAliasSql, encoding: 'utf8', timeout: 15000, maxBuffer: 8192, stdio: ['pipe','pipe','pipe'] });
    value = validateResult(JSON.parse(output));
  } catch (error) {
    if (error?.message === 'PERSONNEL_ALIAS_RESULT_INVALID') throw error;
    throw new Error(safeProbeErrorCode(error));
  }
  const matchedSubsetReady = value.sourceRecords > 0 && value.mappedRecords > 0
    && value.t0MappedRecords === value.mappedRecords && value.profileMatchedCount === value.mappedRecords
    && value.missingSourceReceiptCount === 0 && value.duplicateSourceRows === 0
    && value.otherOwnerStatusRecords === 0
    && value.duplicateProfiles === 0 && value.missingArchiveCount === 0
    && value.ambiguousArchiveRegistryCount === 0
    && Object.values(value.fields).every(field => field.whitespaceOnlySource === 0);
  const fullyReady = matchedSubsetReady && value.unmappedRecords === 0;
  const classification = fullyReady ? 'OBSERVED_READY_FOR_REVIEW'
    : matchedSubsetReady && value.unmappedRecords > 0 ? 'OBSERVED_MATCHED_SUBSET_FOR_REVIEW' : 'NOT_READY';
  return { kind: 'yuzhou_personnel_alias_observation', ...value,
    classification: value.sourceRecords === 0 ? 'NOT_READY' : classification,
    productionImport: 'HOLD', authorizationGranted: false, writerPresent: false };
}

if (process.argv[1] === '-' || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.length !== 3) throw new Error('PERSONNEL_ALIAS_PATH_INVALID');
    process.stdout.write(JSON.stringify(diagnosePersonnelAlias(process.argv[2]))+'\n');
  } catch (error) {
    const allowed = ['PERSONNEL_ALIAS_PATH_INVALID','PERSONNEL_ALIAS_PROBE_FAILED','PERSONNEL_ALIAS_RESULT_INVALID',
      'PERSONNEL_ALIAS_DB_TIMEOUT_57014','PERSONNEL_ALIAS_DB_SCHEMA_INVALID','PERSONNEL_ALIAS_DB_ACCESS_DENIED'];
    process.stderr.write((allowed.includes(error.message) ? error.message : 'PERSONNEL_ALIAS_PROBE_FAILED')+'\n');
    process.exitCode = 1;
  }
}
