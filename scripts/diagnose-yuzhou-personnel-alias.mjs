import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORRECTION_MAPPING_VERSION = 'yuzhou-personnel-alias-null-fill-v1';

// Mirrors certifyOriginalProfiles' PostgreSQL JSON text / sorted row-hash
// algorithm. An observation is not the API's locked certificate or authorization.
export const profileBaselineSetCtes = `baseline_sets AS (
 SELECT o.operation_id,
   COALESCE(o.status='succeeded' AND o.finished_at IS NOT NULL AND o.rolled_back_at IS NULL,false) operation_valid,
   ph.document profile_document,rh.document receipt_document,o.owned_state
 FROM ops selected JOIN hr_yuzhou_t5_followon_operation o USING(operation_id)
 CROSS JOIN LATERAL (
   SELECT jsonb_build_object('count',count(*)::int,'sha256',
     encode(digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex')) document
   FROM (SELECT encode(digest(to_jsonb(p)::text,'sha256'),'hex') row_hash
     FROM hr_employee_profile p JOIN hr_yuzhou_t5_followon_projection_receipt r
       ON r.target_id=p.id AND r.target_table='hr_employee_profile'
       AND r.operation_id=o.operation_id AND r.disposition='insert'
     WHERE p.tenant_id='10000001' AND p.park_id='20000001') hashes
 ) ph
 CROSS JOIN LATERAL (
   SELECT jsonb_build_object('count',count(*)::int,'sha256',
     encode(digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex')) document
   FROM (SELECT encode(digest(to_jsonb(r)::text,'sha256'),'hex') row_hash
     FROM hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=o.operation_id) hashes
 ) rh
)`;
export const profileBaselineSetSelect = `json_build_object(
 'operationCount',(SELECT count(*) FROM baseline_sets),
 'validOperationCount',(SELECT count(*) FROM baseline_sets WHERE operation_valid),
 'nonEmptyProfileSetCount',(SELECT count(*) FROM baseline_sets WHERE (profile_document->>'count')::int>0),
 'matchingProfileSetCount',(SELECT count(*) FROM baseline_sets WHERE profile_document=owned_state->'hr_employee_profile'),
 'matchingReceiptSetCount',(SELECT count(*) FROM baseline_sets WHERE receipt_document=owned_state->'receipts'),
 'intactWholeSetCount',(SELECT count(*) FROM baseline_sets WHERE operation_valid
   AND (profile_document->>'count')::int>0 AND profile_document=owned_state->'hr_employee_profile'
   AND receipt_document=owned_state->'receipts'))`;

// Production observer only. The encrypted T5 source payload is intentionally never selected.
export const personnelAliasSql = `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SET LOCAL enable_nestloop=off;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL TIME ZONE 'Asia/Shanghai';
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
), profile_receipt_summary AS (
 SELECT s.id source_id,count(pr.target_table) receipt_count,
   count(pr.target_table) FILTER (WHERE pr.source_row_sha256=s.source_row_sha256) matching_source_row_count,
   count(pr.target_table) FILTER (WHERE pr.source_row_sha256=s.source_row_sha256 AND pr.disposition='insert') matching_insert_count,
   min(pr.target_id::text)::uuid AS target_id,
   min(pr.reason_code) FILTER (WHERE pr.source_row_sha256=s.source_row_sha256) AS reason_code
 FROM mapped_owner s LEFT JOIN hr_yuzhou_t5_followon_projection_receipt pr
   ON pr.operation_id=s.operation_id AND pr.target_table='hr_employee_profile'
   AND pr.source_identity_sha256=s.source_identity_sha256
 GROUP BY s.id,s.source_row_sha256
), profile_gap_basis AS (
 SELECT s.id source_id,s.source_row_sha256,s.source_identity_sha256,s.employee_id,s.tenant_id,s.park_id,
   q.receipt_count,q.matching_source_row_count,q.matching_insert_count,q.reason_code,p.id profile_id,p.tenant_id profile_tenant_id,
   p.park_id profile_park_id,p.employee_id profile_employee_id,p.is_deleted,
   p.legacy_source_identity_sha256 profile_source_identity_sha256,p.legacy_source_row_sha256 profile_source_row_sha256,
   COALESCE(ap.active_count,0) active_count,
   CASE WHEN e.id IS NULL OR e.employment_status IS NULL OR e.employment_status='' THEN 'unknown'
     WHEN e.employment_status='departed' THEN 'departed' ELSE 'nonDeparted' END employment_status_bucket,
   (e.user_id IS NOT NULL) linked_account
 FROM mapped_owner s JOIN profile_receipt_summary q ON q.source_id=s.id
 LEFT JOIN hr_employee_profile p ON p.id=q.target_id AND q.receipt_count=1 AND q.matching_source_row_count=1 AND q.matching_insert_count=1
 LEFT JOIN active_profile_counts ap ON ap.employee_id=s.employee_id
 LEFT JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id AND e.park_id=s.park_id AND NOT e.is_deleted
), profile_gap_classified AS (
 SELECT source_id,employee_id,tenant_id,park_id,reason_code,employment_status_bucket,COALESCE(linked_account,false) linked_account,CASE
   WHEN receipt_count=0 THEN 'receiptMissing'
   WHEN receipt_count>1 THEN 'ambiguousActiveProfiles'
   WHEN matching_source_row_count=0 THEN 'receiptSourceMismatch'
   WHEN matching_insert_count=0 THEN 'receiptNotInserted'
   WHEN profile_id IS NULL THEN 'targetMissing'
   WHEN is_deleted THEN 'targetDeleted'
   WHEN profile_tenant_id IS DISTINCT FROM tenant_id OR profile_park_id IS DISTINCT FROM park_id
     OR profile_employee_id IS DISTINCT FROM employee_id THEN 'targetScopeOrOwnerMismatch'
   WHEN profile_source_identity_sha256 IS DISTINCT FROM source_identity_sha256
     OR profile_source_row_sha256 IS DISTINCT FROM source_row_sha256 THEN 'targetSourceMismatch'
   WHEN active_count<>1 THEN 'ambiguousActiveProfiles'
   ELSE 'matched' END AS category
 FROM profile_gap_basis
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
), correction_rows AS (
 SELECT jsonb_build_object('tenantId',m.tenant_id,'parkId',m.park_id,'operationId',m.operation_id,
     'parentOperationId',m.parent_operation_id,'ownerRecordMapId',m.owner_record_map_id,'employeeId',m.employee_id,
     'sourceIdentitySha256',m.source_identity_sha256,'sourceRowSha256',m.source_row_sha256,'profileId',c.profile_id) binding,
   jsonb_strip_nulls(jsonb_build_object('native_place',CASE WHEN c.native_place IS NULL THEN c.oldaddr END,
     'degree',CASE WHEN c.degree IS NULL THEN c.edulevel END)) patch,
   jsonb_build_object('native_place',c.native_place,'degree',c.degree) before_image,
   jsonb_build_object('native_place',COALESCE(CASE WHEN c.native_place IS NULL THEN c.oldaddr END,c.native_place),
     'degree',COALESCE(CASE WHEN c.degree IS NULL THEN c.edulevel END,c.degree)) after_image,
   m.source_identity_sha256,c.profile_id,c.native_place IS NULL AND c.oldaddr IS NOT NULL native_place_fill,
   c.degree IS NULL AND c.edulevel IS NOT NULL degree_fill
 FROM classified c JOIN mapped_owner m ON m.id=c.source_id
 WHERE c.archive_count=1 AND ((c.native_place IS NULL AND c.oldaddr IS NOT NULL)
   OR (c.degree IS NULL AND c.edulevel IS NOT NULL))
), correction_documents AS (
 SELECT count(*) planned_profiles,count(*) FILTER (WHERE native_place_fill) native_place_fills,
   count(*) FILTER (WHERE degree_fill) degree_fills,
   jsonb_agg(jsonb_build_object('binding',binding,'patch',patch)
     ORDER BY source_identity_sha256::text COLLATE "C",profile_id::text COLLATE "C") plan_rows,
   jsonb_agg(jsonb_build_object('binding',binding,'before',before_image)
     ORDER BY source_identity_sha256::text COLLATE "C",profile_id::text COLLATE "C") before_rows,
   jsonb_agg(jsonb_build_object('binding',binding,'after',after_image)
     ORDER BY source_identity_sha256::text COLLATE "C",profile_id::text COLLATE "C") after_rows
 FROM correction_rows
), correction_seal AS (
 SELECT planned_profiles,native_place_fills,degree_fills,
   encode(digest(convert_to(jsonb_build_object('sealVersion',1,'mappingVersion','${CORRECTION_MAPPING_VERSION}',
     'rows',COALESCE(plan_rows,'[]'::jsonb))::text,'UTF8'),'sha256'),'hex') plan_sha256,
   encode(digest(convert_to(jsonb_build_object('sealVersion',1,'mappingVersion','${CORRECTION_MAPPING_VERSION}',
     'rows',COALESCE(before_rows,'[]'::jsonb))::text,'UTF8'),'sha256'),'hex') before_sha256,
   encode(digest(convert_to(jsonb_build_object('sealVersion',1,'mappingVersion','${CORRECTION_MAPPING_VERSION}',
     'rows',COALESCE(after_rows,'[]'::jsonb))::text,'UTF8'),'sha256'),'hex') after_sha256
 FROM correction_documents
), hashed AS (
 SELECT encode(digest(COALESCE(string_agg(source_identity_sha256::text||':'||source_row_sha256::text,E'\\n'
   ORDER BY source_identity_sha256::text COLLATE "C",source_row_sha256::text COLLATE "C"),''),'sha256'),'hex') AS source_set_sha256
 FROM raw
), ${profileBaselineSetCtes}
SELECT json_build_object(
 'originalBaselineSet',${profileBaselineSetSelect},
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
 'profileGaps',json_build_object(
   'matched',(SELECT count(*) FROM profile_gap_classified WHERE category='matched'),
   'receiptMissing',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptMissing'),
   'receiptSourceMismatch',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptSourceMismatch'),
   'receiptNotInserted',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted'),
   'targetMissing',(SELECT count(*) FROM profile_gap_classified WHERE category='targetMissing'),
   'targetDeleted',(SELECT count(*) FROM profile_gap_classified WHERE category='targetDeleted'),
   'targetScopeOrOwnerMismatch',(SELECT count(*) FROM profile_gap_classified WHERE category='targetScopeOrOwnerMismatch'),
   'targetSourceMismatch',(SELECT count(*) FROM profile_gap_classified WHERE category='targetSourceMismatch'),
   'ambiguousActiveProfiles',(SELECT count(*) FROM profile_gap_classified WHERE category='ambiguousActiveProfiles')),
 'profileNonInsertSummary',json_build_object(
   'reasons',json_build_object(
     'identityAmbiguous',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted' AND reason_code='EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS'),
     'sourceMaterializationQuarantined',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted' AND reason_code='SOURCE_MATERIALIZATION_QUARANTINED'),
     'employeeNotMapped',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted' AND reason_code='EMPLOYEE_NOT_MAPPED'),
     'other',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted'
       AND reason_code IS DISTINCT FROM 'EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS'
       AND reason_code IS DISTINCT FROM 'SOURCE_MATERIALIZATION_QUARANTINED'
       AND reason_code IS DISTINCT FROM 'EMPLOYEE_NOT_MAPPED')),
   'employmentStatus',json_build_object(
     'departed',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted' AND employment_status_bucket='departed'),
     'nonDeparted',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted' AND employment_status_bucket='nonDeparted'),
     'unknown',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted' AND employment_status_bucket='unknown')),
   'linkedAccountCount',(SELECT count(*) FROM profile_gap_classified WHERE category='receiptNotInserted' AND linked_account),
   'currentContractCandidateCount',(SELECT count(*) FROM profile_gap_classified g WHERE g.category='receiptNotInserted'
     AND EXISTS (SELECT 1 FROM hr_contract c WHERE c.tenant_id=g.tenant_id AND c.park_id=g.park_id
       AND c.employee_id=g.employee_id AND NOT c.is_deleted AND c.status='active'
       AND (c.end_date IS NULL OR c.end_date>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date)))),
 'correctionPlan',json_build_object(
   'sealVersion',1,'mappingVersion','yuzhou-personnel-alias-null-fill-v1',
   'plannedProfiles',(SELECT planned_profiles FROM correction_seal),
   'nativePlaceFills',(SELECT native_place_fills FROM correction_seal),
   'degreeFills',(SELECT degree_fills FROM correction_seal),
   'planSha256',(SELECT plan_sha256 FROM correction_seal),
   'beforeSha256',(SELECT before_sha256 FROM correction_seal),
   'afterSha256',(SELECT after_sha256 FROM correction_seal)),
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

const selectStart = personnelAliasSql.indexOf('WITH ops AS (');
const selectEnd = personnelAliasSql.lastIndexOf('\nROLLBACK;');
if (selectStart < 0 || selectEnd <= selectStart) throw new Error('PERSONNEL_ALIAS_RESULT_INVALID');
export const personnelAliasExplainSql = `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SET LOCAL enable_nestloop=off;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL TIME ZONE 'Asia/Shanghai';
EXPLAIN (FORMAT JSON) ${personnelAliasSql.slice(selectStart, selectEnd)}
ROLLBACK;`;

const countKeys = ['operationCount','sourceRecords','receiptMatchedSourceRecords','missingSourceReceiptCount','mappedRecords','unmappedRecords',
  'otherOwnerStatusRecords','duplicateSourceRows','t0MappedRecords','profileMatchedCount','duplicateProfiles','ambiguousArchiveRegistryCount','missingArchiveCount'];
const fieldKeys = ['targetNullSourceValid','existingEqualPreserved','existingDifferentPreserved','whitespaceOnlySource','missingOrInvalidSource'];
const profileGapKeys = ['matched','receiptMissing','receiptSourceMismatch','receiptNotInserted','targetMissing','targetDeleted',
  'targetScopeOrOwnerMismatch','targetSourceMismatch','ambiguousActiveProfiles'];
const profileNonInsertReasonKeys = ['identityAmbiguous','sourceMaterializationQuarantined','employeeNotMapped','other'];
const profileNonInsertStatusKeys = ['departed','nonDeparted','unknown'];
const baselineSetKeys = ['operationCount','validOperationCount','nonEmptyProfileSetCount','matchingProfileSetCount','matchingReceiptSetCount','intactWholeSetCount'];
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
  const expected = [...countKeys,'sourceSetSha256','fields','profileGaps','profileNonInsertSummary','correctionPlan','originalBaselineSet'].sort();
  const baseline = value.originalBaselineSet;
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)
    || Object.keys(baseline).sort().join('|') !== [...baselineSetKeys].sort().join('|')
    || !baselineSetKeys.every(key => Number.isSafeInteger(baseline[key]) && baseline[key] >= 0)
    || baseline.operationCount > 1 || baseline.operationCount < value.operationCount
    || baselineSetKeys.slice(1).some(key => baseline[key] > baseline.operationCount)
    || baseline.intactWholeSetCount > Math.min(baseline.validOperationCount,baseline.nonEmptyProfileSetCount,
      baseline.matchingProfileSetCount,baseline.matchingReceiptSetCount)) throw new Error('PERSONNEL_ALIAS_RESULT_INVALID');
  if (Object.keys(value).sort().join('|') !== expected.join('|') || !countKeys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    || typeof value.sourceSetSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sourceSetSha256)
    || !value.profileGaps || typeof value.profileGaps !== 'object' || Array.isArray(value.profileGaps)
    || Object.keys(value.profileGaps).sort().join('|') !== [...profileGapKeys].sort().join('|')
    || !profileGapKeys.every(key => Number.isSafeInteger(value.profileGaps[key]) && value.profileGaps[key] >= 0)
    || !value.profileNonInsertSummary || typeof value.profileNonInsertSummary !== 'object' || Array.isArray(value.profileNonInsertSummary)
    || Object.keys(value.profileNonInsertSummary).sort().join('|') !== 'currentContractCandidateCount|employmentStatus|linkedAccountCount|reasons'
    || !value.profileNonInsertSummary.reasons || typeof value.profileNonInsertSummary.reasons !== 'object' || Array.isArray(value.profileNonInsertSummary.reasons)
    || Object.keys(value.profileNonInsertSummary.reasons).sort().join('|') !== [...profileNonInsertReasonKeys].sort().join('|')
    || !profileNonInsertReasonKeys.every(key => Number.isSafeInteger(value.profileNonInsertSummary.reasons[key]) && value.profileNonInsertSummary.reasons[key] >= 0)
    || !value.profileNonInsertSummary.employmentStatus || typeof value.profileNonInsertSummary.employmentStatus !== 'object'
    || Array.isArray(value.profileNonInsertSummary.employmentStatus)
    || Object.keys(value.profileNonInsertSummary.employmentStatus).sort().join('|') !== [...profileNonInsertStatusKeys].sort().join('|')
    || !profileNonInsertStatusKeys.every(key => Number.isSafeInteger(value.profileNonInsertSummary.employmentStatus[key])
      && value.profileNonInsertSummary.employmentStatus[key] >= 0)
    || !Number.isSafeInteger(value.profileNonInsertSummary.linkedAccountCount) || value.profileNonInsertSummary.linkedAccountCount < 0
    || !Number.isSafeInteger(value.profileNonInsertSummary.currentContractCandidateCount)
    || value.profileNonInsertSummary.currentContractCandidateCount < 0
    || !value.correctionPlan || typeof value.correctionPlan !== 'object' || Array.isArray(value.correctionPlan)
    || Object.keys(value.correctionPlan).sort().join('|') !== 'afterSha256|beforeSha256|degreeFills|mappingVersion|nativePlaceFills|planSha256|plannedProfiles|sealVersion'
    || value.correctionPlan.sealVersion !== 1 || value.correctionPlan.mappingVersion !== CORRECTION_MAPPING_VERSION
    || !Number.isSafeInteger(value.correctionPlan.plannedProfiles) || value.correctionPlan.plannedProfiles < 0
    || !Number.isSafeInteger(value.correctionPlan.nativePlaceFills) || value.correctionPlan.nativePlaceFills < 0
    || !Number.isSafeInteger(value.correctionPlan.degreeFills) || value.correctionPlan.degreeFills < 0
    || !/^[0-9a-f]{64}$/.test(value.correctionPlan.planSha256)
    || !/^[0-9a-f]{64}$/.test(value.correctionPlan.beforeSha256)
    || !/^[0-9a-f]{64}$/.test(value.correctionPlan.afterSha256)
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
    || profileGapKeys.reduce((sum,key) => sum+value.profileGaps[key],0) !== value.t0MappedRecords
    || value.profileGaps.matched !== value.profileMatchedCount
    || profileNonInsertReasonKeys.reduce((sum,key) => sum+value.profileNonInsertSummary.reasons[key],0) !== value.profileGaps.receiptNotInserted
    || profileNonInsertStatusKeys.reduce((sum,key) => sum+value.profileNonInsertSummary.employmentStatus[key],0) !== value.profileGaps.receiptNotInserted
    || value.profileNonInsertSummary.linkedAccountCount > value.profileGaps.receiptNotInserted
    || value.profileNonInsertSummary.currentContractCandidateCount > value.profileGaps.receiptNotInserted
    || value.correctionPlan.plannedProfiles > value.profileMatchedCount
    || value.correctionPlan.nativePlaceFills > value.fields.nativePlace.targetNullSourceValid
    || value.correctionPlan.degreeFills > value.fields.degree.targetNullSourceValid
    || value.correctionPlan.plannedProfiles < Math.max(value.correctionPlan.nativePlaceFills,value.correctionPlan.degreeFills)
    || value.correctionPlan.plannedProfiles > value.correctionPlan.nativePlaceFills+value.correctionPlan.degreeFills
    || Object.values(value.fields).some(field => fieldKeys.reduce((sum,key) => sum+field[key],0) !== value.profileMatchedCount)) {
    throw new Error('PERSONNEL_ALIAS_RESULT_INVALID');
  }
  return value;
}

const planNodeTypes = new Set(['Aggregate','Append','BitmapAnd','Bitmap Heap Scan','Bitmap Index Scan','BitmapOr','CTE Scan','Gather','Gather Merge',
  'Function Scan','Hash','Hash Join','Incremental Sort','Index Only Scan','Index Scan','Limit','Materialize','Memoize','Merge Append','Merge Join',
  'Nested Loop','ProjectSet','Result','Sample Scan','SetOp','Sort','Subquery Scan','Seq Scan','Table Function Scan','Tid Scan','Unique','Values Scan','WindowAgg']);

export function sanitizePersonnelAliasPlan(value) {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object' || Array.isArray(value[0])) {
    throw new Error('PERSONNEL_ALIAS_PLAN_INVALID');
  }
  const root = value[0];
  if (!root.Plan) throw new Error('PERSONNEL_ALIAS_PLAN_INVALID');
  const nodes = [];
  const visit = (node, parentIndex, depth) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 64 || nodes.length >= 2048
      || typeof node['Node Type'] !== 'string'
      || !planNodeTypes.has(node['Node Type']) || !Number.isSafeInteger(node['Plan Rows']) || node['Plan Rows'] < 0
      || !Number.isSafeInteger(node['Plan Width']) || node['Plan Width'] < 0
      || typeof node['Startup Cost'] !== 'number' || !Number.isFinite(node['Startup Cost']) || node['Startup Cost'] < 0
      || typeof node['Total Cost'] !== 'number' || !Number.isFinite(node['Total Cost']) || node['Total Cost'] < node['Startup Cost']
      || (node.Plans !== undefined && !Array.isArray(node.Plans))) throw new Error('PERSONNEL_ALIAS_PLAN_INVALID');
    const index = nodes.length;
    nodes.push({ index, parentIndex, nodeType: node['Node Type'], planRows: node['Plan Rows'], startupCost: node['Startup Cost'],
      totalCost: node['Total Cost'], planWidth: node['Plan Width'] });
    for (const child of node.Plans ?? []) visit(child, index, depth + 1);
  };
  visit(root.Plan, null, 0);
  const result = { kind: 'yuzhou_personnel_alias_explain', nodes, productionImport: 'HOLD', authorizationGranted: false,
    writerPresent: false, executedQuery: false };
  if (root['Planning Time'] !== undefined) {
    if (typeof root['Planning Time'] !== 'number' || !Number.isFinite(root['Planning Time']) || root['Planning Time'] < 0) {
      throw new Error('PERSONNEL_ALIAS_PLAN_INVALID');
    }
    result.planningTimeMs = root['Planning Time'];
  }
  if (root.JIT !== undefined) {
    const jit = root.JIT;
    if (!jit || typeof jit !== 'object' || Array.isArray(jit)
      || !Number.isSafeInteger(jit.Functions) || jit.Functions < 0 || !jit.Options || typeof jit.Options !== 'object'
      || Array.isArray(jit.Options) || ['Inlining','Optimization','Expressions','Deforming'].some(key => jit.Options[key] !== undefined
        && typeof jit.Options[key] !== 'boolean')) {
      throw new Error('PERSONNEL_ALIAS_PLAN_INVALID');
    }
    result.jit = { functions: jit.Functions, options: Object.fromEntries([
      ['Inlining','inlining'],['Optimization','optimization'],['Expressions','expressions'],['Deforming','deforming'],
    ].filter(([key]) => jit.Options[key] !== undefined).map(([key,name]) => [name,jit.Options[key]])) };
  }
  return result;
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
  const correctionPlanReady = value.sourceRecords > 0 && value.receiptMatchedSourceRecords === value.sourceRecords
    && value.missingSourceReceiptCount === 0 && value.duplicateSourceRows === 0
    && value.mappedRecords > 0 && value.t0MappedRecords === value.mappedRecords && value.otherOwnerStatusRecords === 0
    && value.duplicateProfiles === 0 && value.ambiguousArchiveRegistryCount === 0 && value.missingArchiveCount === 0
    && value.profileGaps.matched === value.profileMatchedCount
    && profileGapKeys.filter(key => !['matched','receiptNotInserted'].includes(key)).every(key => value.profileGaps[key] === 0)
    && Object.values(value.fields).every(field => field.whitespaceOnlySource === 0)
    && value.profileNonInsertSummary.reasons.identityAmbiguous === value.profileGaps.receiptNotInserted
    && value.profileNonInsertSummary.reasons.sourceMaterializationQuarantined === 0
    && value.profileNonInsertSummary.reasons.employeeNotMapped === 0 && value.profileNonInsertSummary.reasons.other === 0
    && value.correctionPlan.plannedProfiles > 0;
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
    correctionPlanStatus: correctionPlanReady ? 'MATCHED_SUBSET_FOR_REVIEW' : 'NOT_READY',
    originalBaselineSetStatus: value.originalBaselineSet.operationCount === 1 && value.originalBaselineSet.intactWholeSetCount === 1
      ? 'OBSERVED_INTACT_FOR_API_RECHECK' : 'ORIGINAL_SET_NOT_PROVEN',
    productionImport: 'HOLD', authorizationGranted: false, writerPresent: false };
}

export function diagnosePersonnelAliasPlan(deployPath, run = execFileSync) {
  if (typeof deployPath !== 'string' || !isAbsolute(deployPath) || resolve(deployPath) !== deployPath
    || deployPath.includes('\0') || /[\r\n]/.test(deployPath) || deployPath === '/') throw new Error('PERSONNEL_ALIAS_PATH_INVALID');
  try {
    const output = run('docker', ['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml',
      'exec','-T','postgres','sh','-c',
      'exec psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { cwd: deployPath, input: personnelAliasExplainSql, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, stdio: ['pipe','pipe','pipe'] });
    return sanitizePersonnelAliasPlan(JSON.parse(output));
  } catch (error) {
    if (error?.message === 'PERSONNEL_ALIAS_PLAN_INVALID') throw error;
    throw new Error(safeProbeErrorCode(error));
  }
}

if (process.argv[1] === '-' || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    const explain = args[0] === '--explain';
    const deployPath = explain ? args[1] : args[0];
    if (args.length !== (explain ? 2 : 1) || (explain && args[0] !== '--explain') || (!explain && args[0]?.startsWith('--'))) {
      throw new Error('PERSONNEL_ALIAS_PATH_INVALID');
    }
    process.stdout.write(JSON.stringify(explain ? diagnosePersonnelAliasPlan(deployPath) : diagnosePersonnelAlias(deployPath))+'\n');
  } catch (error) {
    const allowed = ['PERSONNEL_ALIAS_PATH_INVALID','PERSONNEL_ALIAS_PROBE_FAILED','PERSONNEL_ALIAS_RESULT_INVALID',
      'PERSONNEL_ALIAS_DB_TIMEOUT_57014','PERSONNEL_ALIAS_DB_SCHEMA_INVALID','PERSONNEL_ALIAS_DB_ACCESS_DENIED','PERSONNEL_ALIAS_PLAN_INVALID'];
    process.stderr.write((allowed.includes(error.message) ? error.message : 'PERSONNEL_ALIAS_PROBE_FAILED')+'\n');
    process.exitCode = 1;
  }
}
