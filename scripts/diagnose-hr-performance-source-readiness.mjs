import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Built-ins only: this exact module is transported to the host over SSH stdin.
// No application builder, math, verifier or context/lock function is invoked.
export const sourceFamilies = [
 ['templateProfile','hr_performance_legacy_template_profile','dbo.assessmentcode'],
 ['levelRule','hr_performance_legacy_level_rule','dbo.assgradecode'],
 ['dimensionProfile','hr_performance_legacy_dimension_profile','dbo.assitem'],
 ['dimensionLevelGuide','hr_performance_legacy_dimension_level_guide','dbo.assitemgradedes'],
 ['dimensionResult','hr_performance_legacy_dimension_result','dbo.assessmentdetail'],
 ['masterResult','hr_performance_legacy_master_result','dbo.assessmentmaster'],
];
export const familyCountKeys = ['rawCount','visibleCount','exactMapCount','mapGapCount'];
export const masterCountKeys = ['resolutionPresentCount','resolutionMissingCount','personResolvedCount','personUnresolvedCount','personAmbiguousCount','personUnmatchedCount','detailResolvedCount','detailUnresolvedCount','detailAmbiguousCount','detailUnmatchedCount','bothResolvedCount','bothResolvedMatchedCount','bothResolvedMismatchCount','exactVisibleMatchedCount','subjectActiveEmployeeCount','formalReviewLinkCount','formalTemplateVersionLinkCount'];
export const ledgerCountKeys = ['relations308Count','relations308SucceededCount','facts310Count','facts310SucceededCount','assessment309Count','assessment309SucceededCount'];
export const formalCountKeys = ['legacyTemplateVersionLinkCount','fiveChannelVersionCount','fiveChannelPublishedVersionCount','fiveChannelDefinitionRevisionCount','fiveChannelInputRevisionCount'];
const scope = alias => `${alias}.tenant_id='10000001' AND ${alias}.park_id='20000001'`;
const resolutionMatch = `r.legacy_master_result_id=f.id AND r.tenant_id=f.tenant_id AND r.park_id=f.park_id AND r.migration_batch_id=f.migration_batch_id`;
const factSelect = sourceFamilies.map(([kind,table,source]) => `SELECT '${kind}'::text kind,'${table}'::text target_table,'${source}'::text source_table,f.id,f.tenant_id,f.park_id,f.migration_batch_id,f.legacy_record_map_id,f.source_identity_sha256,f.source_row_sha256 FROM ${table} f WHERE ${scope('f')}`).join('\n UNION ALL ');
const familySelect = sourceFamilies.map(([kind]) => `'${kind}',(SELECT json_build_object('rawCount',count(*),'visibleCount',count(*) FILTER(WHERE visible),'exactMapCount',count(*) FILTER(WHERE exact_map),'mapGapCount',count(*) FILTER(WHERE NOT exact_map)) FROM observed WHERE kind='${kind}')`).join(',\n');
const countFlags = (table,keys) => keys.map(key => `'${key}',(SELECT count(*) FROM ${table} WHERE "${key}")`).join(',\n');
const weightExists = condition => `EXISTS(SELECT 1 FROM hr_performance_legacy_ass_compute_weight_resolution r WHERE ${resolutionMatch} AND ${condition})`;
// Mirrors the succeeded-operation branch of migration308 T0 candidates inline.
// Its running/apply branch is a writer capability and is deliberately excluded.
export const performanceSourceReadinessSql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=public,pg_catalog;
WITH facts AS (${factSelect}), observed AS (
 SELECT f.*,
 EXISTS(SELECT 1 FROM legacy_record_map m JOIN migration_batch b ON b.id=f.migration_batch_id
   WHERE m.id=f.legacy_record_map_id AND m.batch_id=f.migration_batch_id AND m.source_system='yuzhou-v10'
   AND m.target_table=f.target_table AND m.target_id=f.id AND m.mapping_status='verified' AND m.is_active
   AND b.source_system='yuzhou-v10' AND b.execution_context='production_import' AND b.status='succeeded') visible,
 EXISTS(SELECT 1 FROM legacy_record_map m WHERE m.id=f.legacy_record_map_id AND m.batch_id=f.migration_batch_id
   AND m.source_system='yuzhou-v10' AND m.source_table=f.source_table AND m.target_table=f.target_table AND m.target_id=f.id
   AND f.source_identity_sha256~'^[0-9a-f]{64}$' AND f.source_row_sha256~'^[0-9a-f]{64}$'
   AND m.source_identity_sha256=f.source_identity_sha256 AND m.source_row_sha256=f.source_row_sha256
   AND m.mapping_status='verified' AND m.is_active) exact_map
 FROM facts f
), import_batches AS (
 SELECT b.* FROM migration_batch b WHERE b.source_system='yuzhou-v10' AND b.execution_context='production_import'
 AND b.production_import_phase='T0' AND b.status='succeeded' AND b.target_database=current_database()
), t0_candidates AS (
 SELECT m.source_identity_sha256,m.id owner_map_id,e.id employee_id
 FROM legacy_record_map m
 JOIN hr_yuzhou_production_import_projection_receipt receipt ON receipt.legacy_record_map_id=m.id AND receipt.phase='T0'
 JOIN hr_yuzhou_production_import_record rec ON (rec.operation_id,rec.phase,rec.source_identity_sha256)=(receipt.operation_id,receipt.phase,receipt.source_identity_sha256)
 JOIN hr_yuzhou_production_import_phase ph ON (ph.operation_id,ph.phase)=(receipt.operation_id,receipt.phase)
 JOIN hr_yuzhou_production_import_operation op ON op.operation_id=receipt.operation_id
 JOIN migration_batch b ON b.id=receipt.migration_batch_id AND b.id=m.batch_id
 JOIN hr_employee e ON (e.id,e.tenant_id,e.park_id)=(m.target_id,'10000001','20000001')
 WHERE m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.target_table='hr_employee'
 AND m.mapping_status IN('loaded','verified') AND m.is_active AND receipt.source_identity_sha256=m.source_identity_sha256
 AND rec.source_system='yuzhou-v10' AND rec.source_table='dbo.person' AND rec.source_pk_canonical='sha256:'||m.source_identity_sha256
 AND rec.target_table='hr_employee' AND rec.target_id=m.target_id AND rec.disposition IN('insert','merge','skip_approved')
 AND rec.rollback_status='not_started' AND ph.status='succeeded' AND op.status='succeeded' AND op.execution_contract_version=2
 AND (op.target_tenant_id,op.target_park_id)=('10000001','20000001')
 AND b.execution_context='production_import' AND b.production_import_operation_id=receipt.operation_id
 AND b.production_import_phase='T0' AND b.status='succeeded' AND NOT e.is_deleted
), unique_t0 AS (
 SELECT source_identity_sha256,(array_agg(owner_map_id ORDER BY owner_map_id))[1] owner_map_id,
 (array_agg(employee_id ORDER BY employee_id))[1] employee_id FROM t0_candidates GROUP BY source_identity_sha256 HAVING count(*)=1
), result_people AS (
 SELECT 'master_result'::text fact_kind,f.id,f.tenant_id,f.park_id,f.migration_batch_id,f.source_person_code FROM hr_performance_legacy_master_result f WHERE ${scope('f')}
 UNION ALL SELECT 'dimension_result',f.id,f.tenant_id,f.park_id,f.migration_batch_id,f.source_person_code FROM hr_performance_legacy_dimension_result f WHERE ${scope('f')}
), active_subjects AS (
 SELECT f.fact_kind,f.id FROM result_people f WHERE EXISTS(
 SELECT 1 FROM hr_performance_legacy_identity_resolution r
 JOIN unique_t0 t ON t.source_identity_sha256=r.source_person_identity_sha256 AND t.owner_map_id=r.owner_t0_record_map_id AND t.employee_id=r.target_employee_id
 JOIN legacy_record_map m ON m.id=t.owner_map_id AND m.source_system='yuzhou-v10' AND m.source_table='dbo.person'
 AND m.source_pk_canonical='sha256:'||r.source_person_identity_sha256 AND m.source_identity_sha256=r.source_person_identity_sha256
 AND m.target_table='hr_employee' AND m.target_id=r.target_employee_id AND m.mapping_status='verified' AND m.is_active
 JOIN hr_employee e ON (e.id,e.tenant_id,e.park_id)=(r.target_employee_id,f.tenant_id,f.park_id) AND e.id=m.target_id AND NOT e.is_deleted
 WHERE r.fact_kind=f.fact_kind AND r.person_role='subject' AND r.person_resolution_status='resolved'
 AND (r.tenant_id,r.park_id,r.migration_batch_id)=(f.tenant_id,f.park_id,f.migration_batch_id)
 AND CASE f.fact_kind WHEN 'master_result' THEN r.legacy_master_result_id ELSE r.legacy_dimension_result_id END=f.id
 AND r.source_person_identity_sha256=CASE WHEN NULLIF(btrim(f.source_person_code),'') IS NULL THEN NULL
 ELSE encode(digest(convert_to('dbo.person','UTF8')||decode('00','hex')||convert_to(btrim(f.source_person_code),'UTF8'),'sha256'),'hex') END)
), master_flags AS (
 SELECT f.id,
 ${weightExists('true')} "resolutionPresentCount",
 NOT ${weightExists('true')} "resolutionMissingCount",
 ${weightExists("r.person_resolution_status='resolved'")} "personResolvedCount",
 ${weightExists("r.person_resolution_status<>'resolved'")} "personUnresolvedCount",
 ${weightExists("r.person_resolution_status IN('evidence_ambiguous','template_ambiguous')")} "personAmbiguousCount",
 ${weightExists("r.person_resolution_status IN('evidence_unmatched','template_unmatched')")} "personUnmatchedCount",
 ${weightExists("r.detail_resolution_status='resolved'")} "detailResolvedCount",
 ${weightExists("r.detail_resolution_status<>'resolved'")} "detailUnresolvedCount",
 ${weightExists("r.detail_resolution_status='ambiguous'")} "detailAmbiguousCount",
 ${weightExists("r.detail_resolution_status='unmatched'")} "detailUnmatchedCount",
 ${weightExists("r.person_resolution_status='resolved' AND r.detail_resolution_status='resolved'")} "bothResolvedCount",
 ${weightExists("r.person_resolution_status='resolved' AND r.detail_resolution_status='resolved' AND r.comparison_status='matched'")} "bothResolvedMatchedCount",
 ${weightExists("r.person_resolution_status='resolved' AND r.detail_resolution_status='resolved' AND r.comparison_status='mismatch'")} "bothResolvedMismatchCount",
 ${weightExists("r.person_resolution_status='resolved' AND r.detail_resolution_status='resolved' AND r.comparison_status='matched'")}
 AND EXISTS(SELECT 1 FROM observed o WHERE o.kind='masterResult' AND o.id=f.id AND o.visible AND o.exact_map) "exactVisibleMatchedCount",
 EXISTS(SELECT 1 FROM active_subjects s WHERE s.fact_kind='master_result' AND s.id=f.id) "subjectActiveEmployeeCount",
 EXISTS(SELECT 1 FROM hr_performance_cycle_employee ce JOIN hr_performance_review_cycle c ON(c.id,c.tenant_id,c.park_id)=(ce.cycle_id,ce.tenant_id,ce.park_id)
 WHERE(ce.id,ce.tenant_id,ce.park_id)=(f.target_cycle_employee_id,f.tenant_id,f.park_id)) "formalReviewLinkCount",
 EXISTS(SELECT 1 FROM hr_performance_template_version v WHERE(v.id,v.tenant_id,v.park_id)=(f.target_template_version_id,f.tenant_id,f.park_id)) "formalTemplateVersionLinkCount"
 FROM hr_performance_legacy_master_result f WHERE ${scope('f')}
), relation_receipts AS (
 SELECT r.*,EXISTS(SELECT 1 FROM import_batches b
 JOIN hr_yuzhou_production_import_operation op ON op.operation_id=r.operation_id
 JOIN hr_yuzhou_production_import_phase ph ON(ph.operation_id,ph.phase)=(op.operation_id,'T0')
 WHERE b.id=r.migration_batch_id AND b.production_import_operation_id=r.operation_id
 AND op.intent='production_import' AND op.status='succeeded' AND ph.status='succeeded'
 AND(op.target_tenant_id,op.target_park_id)=(r.tenant_id,r.park_id)
 AND r.source_snapshot_sha256=b.source_snapshot_sha256 AND r.source_snapshot_sha256=op.source_snapshot_sha256
 AND r.code_sha=op.code_sha AND r.mapping_contract_sha256=op.mapping_contract_sha256 AND r.target_identity_sha256=op.target_identity_sha256
 AND r.target_scope_sha256=op.target_scope_sha256 AND r.t0_phase_receipt_sha256=ph.after_canonical_sha256
 AND r.status='succeeded' AND r.rollback_operation_id IS NULL AND r.rollback_receipt_sha256 IS NULL AND r.rolled_back_at IS NULL) succeeded
 FROM hr_yuzhou_performance_relations_production_receipt r WHERE ${scope('r')}
), fact_receipts AS (
 SELECT r.*,EXISTS(SELECT 1 FROM relation_receipts parent WHERE parent.succeeded
 AND(parent.operation_id,parent.migration_batch_id)=(r.operation_id,r.migration_batch_id)
 AND r.source_snapshot_sha256=parent.source_snapshot_sha256 AND r.code_sha=parent.code_sha
 AND r.mapping_contract_sha256=parent.mapping_contract_sha256 AND r.target_identity_sha256=parent.target_identity_sha256
 AND r.target_scope_sha256=parent.target_scope_sha256 AND r.t0_phase_receipt_sha256=parent.t0_phase_receipt_sha256
 AND r.parent_relations_receipt_sha256=parent.receipt_sha256
 AND r.status='succeeded' AND r.rollback_operation_id IS NULL AND r.rollback_receipt_sha256 IS NULL
 AND r.extension_rollback_nonce_sha256 IS NULL AND r.rolled_back_at IS NULL) succeeded
 FROM hr_yuzhou_performance_fact_identity_production_receipt r WHERE ${scope('r')}
), assessment_operations AS (
 SELECT r.*,EXISTS(SELECT 1 FROM relation_receipts parent WHERE parent.succeeded
 AND(parent.operation_id,parent.migration_batch_id)=(r.parent_import_operation_id,r.migration_batch_id)
 AND r.source_snapshot_sha256=parent.source_snapshot_sha256 AND r.code_sha=parent.code_sha
 AND r.mapping_contract_sha256=parent.mapping_contract_sha256 AND r.target_identity_sha256=parent.target_identity_sha256
 AND r.target_scope_sha256=parent.target_scope_sha256 AND r.t0_artifact_sha256=parent.t0_phase_receipt_sha256
 AND r.status='succeeded' AND r.rolled_back_at IS NULL AND r.applied_state_sha256~'^[0-9a-f]{64}$') succeeded
 FROM hr_yuzhou_performance_person_assessment_operation r WHERE r.target_tenant_id='10000001' AND r.target_park_id='20000001'
)
SELECT json_build_object(
 'sources',json_build_object(${familySelect}),
 'master',json_build_object(${countFlags('master_flags',masterCountKeys)}),
 'dimensionSubjectActiveEmployeeCount',(SELECT count(*) FROM active_subjects WHERE fact_kind='dimension_result'),
 'ledgers',json_build_object('relations308Count',(SELECT count(*) FROM relation_receipts),'relations308SucceededCount',(SELECT count(*) FROM relation_receipts WHERE succeeded),
 'facts310Count',(SELECT count(*) FROM fact_receipts),'facts310SucceededCount',(SELECT count(*) FROM fact_receipts WHERE succeeded),
 'assessment309Count',(SELECT count(*) FROM assessment_operations),'assessment309SucceededCount',(SELECT count(*) FROM assessment_operations WHERE succeeded)),
 'formal',json_build_object(
 'legacyTemplateVersionLinkCount',(SELECT count(*) FROM hr_performance_legacy_template_profile f WHERE ${scope('f')} AND EXISTS(SELECT 1 FROM hr_performance_template_version v WHERE(v.id,v.template_id,v.tenant_id,v.park_id)=(f.target_template_version_id,f.target_template_id,f.tenant_id,f.park_id))),
 'fiveChannelVersionCount',(SELECT count(*) FROM hr_performance_template_version v WHERE ${scope('v')} AND v.calculation_mode='five_channel_v1'),
 'fiveChannelPublishedVersionCount',(SELECT count(*) FROM hr_performance_template_version v WHERE ${scope('v')} AND v.calculation_mode='five_channel_v1' AND v.status='published'),
 'fiveChannelDefinitionRevisionCount',(SELECT count(*) FROM hr_performance_channel_definition_revision r WHERE ${scope('r')}),
 'fiveChannelInputRevisionCount',(SELECT count(*) FROM hr_performance_channel_input_revision r WHERE ${scope('r')})),
 'scopedSourceFactsSha256',(SELECT encode(digest(convert_to(COALESCE(json_agg(json_build_array(kind,id,migration_batch_id,legacy_record_map_id,source_identity_sha256,source_row_sha256) ORDER BY kind COLLATE "C",id::text COLLATE "C",migration_batch_id::text COLLATE "C",legacy_record_map_id::text COLLATE "C",source_identity_sha256 COLLATE "C",source_row_sha256 COLLATE "C")::text,'[]'),'UTF8'),'sha256'),'hex') FROM facts));
ROLLBACK;`;

function exactKeys(value, keys) {
 return value !== null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
}
function counts(value, keys) { return exactKeys(value,keys) && keys.every(key=>Number.isSafeInteger(value[key]) && value[key]>=0); }
export function validPerformanceSourceReadiness(value) {
 if(!exactKeys(value,['sources','master','dimensionSubjectActiveEmployeeCount','ledgers','formal','scopedSourceFactsSha256']) ||
 !exactKeys(value.sources,sourceFamilies.map(([kind])=>kind)) || !counts(value.master,masterCountKeys) || !counts(value.ledgers,ledgerCountKeys) || !counts(value.formal,formalCountKeys) ||
 !Number.isSafeInteger(value.dimensionSubjectActiveEmployeeCount) || value.dimensionSubjectActiveEmployeeCount<0 || typeof value.scopedSourceFactsSha256!=='string' || !/^[0-9a-f]{64}$/.test(value.scopedSourceFactsSha256)) return false;
 for(const [kind] of sourceFamilies) { const f=value.sources[kind];if(!counts(f,familyCountKeys)||f.visibleCount>f.rawCount||f.exactMapCount>f.rawCount||f.mapGapCount!==f.rawCount-f.exactMapCount) return false; }
 const m=value.master, raw=value.sources.masterResult.rawCount;
 if(masterCountKeys.some(k=>m[k]>raw) || m.resolutionMissingCount!==raw-m.resolutionPresentCount || m.personUnresolvedCount!==m.resolutionPresentCount-m.personResolvedCount || m.detailUnresolvedCount!==m.resolutionPresentCount-m.detailResolvedCount ||
 m.personAmbiguousCount+m.personUnmatchedCount>m.personUnresolvedCount || m.detailAmbiguousCount+m.detailUnmatchedCount!==m.detailUnresolvedCount ||
 m.bothResolvedCount>Math.min(m.personResolvedCount,m.detailResolvedCount) || m.bothResolvedCount<Math.max(0,m.personResolvedCount+m.detailResolvedCount-m.resolutionPresentCount) ||
 m.bothResolvedMatchedCount+m.bothResolvedMismatchCount!==m.bothResolvedCount || m.exactVisibleMatchedCount>Math.min(m.bothResolvedMatchedCount,value.sources.masterResult.visibleCount,value.sources.masterResult.exactMapCount) ||
 value.dimensionSubjectActiveEmployeeCount>value.sources.dimensionResult.rawCount || value.formal.legacyTemplateVersionLinkCount>value.sources.templateProfile.rawCount || value.formal.fiveChannelPublishedVersionCount>value.formal.fiveChannelVersionCount) return false;
 return ['relations308','facts310','assessment309'].every(prefix=>value.ledgers[`${prefix}SucceededCount`]<=value.ledgers[`${prefix}Count`]);
}
// JSON.parse alone silently accepts duplicate keys. Inspect each object before parsing.
export function parsePerformanceSourceReadiness(raw) {
 try {
 const tokens=String(raw).match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [], stack=[];
 for(let i=0;i<tokens.length;i++) {
  const t=tokens[i];
  if(t==='{') stack.push(new Set()); else if(t==='[') stack.push(null); else if(t==='}'||t===']') stack.pop();
  else if(t.startsWith('"')&&tokens[i+1]===':'&&stack.at(-1) instanceof Set) { const key=JSON.parse(t);if(stack.at(-1).has(key)) throw new Error('HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID');stack.at(-1).add(key); }
 }
 } catch { throw new Error('HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID'); }
 let value;try { value=JSON.parse(raw); } catch { throw new Error('HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID'); }
 if(!validPerformanceSourceReadiness(value)) throw new Error('HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID');
 return value;
}
export function diagnosePerformanceSourceReadiness(deployPath, run=execFileSync) {
 if(typeof deployPath!=='string'||!isAbsolute(deployPath)) throw new Error('HR_PERFORMANCE_SOURCE_READINESS_PATH_INVALID');
 let raw;
 try { raw=run('docker',['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml','exec','-T','postgres','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],{cwd:deployPath,input:performanceSourceReadinessSql,encoding:'utf8',timeout:15000,maxBuffer:16384,stdio:['pipe','pipe','pipe']}); }
 catch { throw new Error('HR_PERFORMANCE_SOURCE_READINESS_PROBE_FAILED'); }
 return {kind:'hr_performance_source_readiness_counts',...parsePerformanceSourceReadiness(raw),formalContinuationReadiness:'UNVERIFIED',productionBusinessWrites:0};
}
if(process.argv[1]==='-'||(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))) {
 try { if(process.argv.length!==3) throw new Error('HR_PERFORMANCE_SOURCE_READINESS_PATH_INVALID');process.stdout.write(JSON.stringify(diagnosePerformanceSourceReadiness(process.argv[2]))+'\n'); }
 catch(error) { const allowed=['HR_PERFORMANCE_SOURCE_READINESS_PATH_INVALID','HR_PERFORMANCE_SOURCE_READINESS_PROBE_FAILED','HR_PERFORMANCE_SOURCE_READINESS_RESULT_INVALID'];process.stderr.write((allowed.includes(error.message)?error.message:'HR_PERFORMANCE_SOURCE_READINESS_PROBE_FAILED')+'\n');process.exitCode=1; }
}
