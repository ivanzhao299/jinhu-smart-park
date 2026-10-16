import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This observer deliberately does not call a source-builder or calculation function: those
// paths lock/create review evidence. It reads fixed, scoped aggregate facts only.
// Self-contained because the workflow sends this module to the host over stdin.
export const modernPreparationCountKeys = ['sourceBookCount','linkedRuleBookCount','effectiveRuleBookCount','draftInputCount','confirmedInputCount','currentRuleConfirmedInputCount','bookWithCurrentRuleConfirmedInputCount','exactRosterBookCount'];
export const modernPreparationCtes = `modern_rosters AS (
 SELECT s.book_id,count(*)::int AS record_count,count(DISTINCT s.employee_id)::int AS employee_count,
   count(*) FILTER(WHERE s.mapping_status='mapped' AND s.employee_id IS NOT NULL)::int AS mapped_count,
   array_agg(DISTINCT s.employee_id::text ORDER BY s.employee_id::text) FILTER(WHERE s.employee_id IS NOT NULL) AS employee_ids
 FROM observed_snapshots s WHERE s.period_month=(SELECT period_month FROM latest) GROUP BY s.book_id
), modern_sets AS (
 SELECT s.id,s.source_book_id FROM hr_payroll_rule_set s JOIN modern_rosters roster ON roster.book_id=s.source_book_id
 WHERE s.tenant_id='10000001' AND s.park_id='20000001'
), modern_effective AS (
 SELECT DISTINCT ON(v.rule_set_id) v.id,v.rule_set_id FROM hr_payroll_rule_version v JOIN modern_sets s ON s.id=v.rule_set_id
 WHERE v.tenant_id='10000001' AND v.park_id='20000001' AND v.status='approved'
   AND v.effective_from<=(SELECT period_month FROM latest)
 ORDER BY v.rule_set_id,v.effective_from DESC
), modern_inputs AS (
 SELECT i.*,s.source_book_id FROM hr_payroll_formal_input i JOIN modern_sets s ON s.id=i.rule_set_id
 JOIN hr_payroll_period p ON(p.id,p.tenant_id,p.park_id)=(i.period_id,i.tenant_id,i.park_id)
 WHERE i.tenant_id='10000001' AND i.park_id='20000001' AND p.period_month=(SELECT period_month FROM latest)
   AND NOT p.is_deleted AND p.status='open' AND i.correction_window_id IS NULL
), modern_current_inputs AS (
 SELECT i.* FROM modern_inputs i JOIN modern_effective v ON(v.id,v.rule_set_id)=(i.rule_version_id,i.rule_set_id)
 WHERE i.status='confirmed' AND NOT EXISTS(SELECT 1 FROM hr_payroll_formal_input newer
   WHERE(newer.period_id,newer.rule_set_id,newer.tenant_id,newer.park_id)=(i.period_id,i.rule_set_id,i.tenant_id,i.park_id)
     AND newer.status='confirmed' AND newer.revision_no>i.revision_no)
), modern_exact_rosters AS (
 SELECT DISTINCT i.source_book_id FROM modern_current_inputs i JOIN modern_rosters r ON r.book_id=i.source_book_id
 WHERE r.record_count=r.employee_count AND r.mapped_count=r.record_count
   AND jsonb_array_length(i.employees)=r.employee_count
   AND (SELECT array_agg(e->>'employeeId' ORDER BY e->>'employeeId') FROM jsonb_array_elements(i.employees) e)=r.employee_ids
)`;
export const modernPreparationSelect = `json_build_object(
 'sourceBookCount',(SELECT count(*)::int FROM modern_rosters),
 'linkedRuleBookCount',(SELECT count(DISTINCT source_book_id)::int FROM modern_sets),
 'effectiveRuleBookCount',(SELECT count(DISTINCT s.source_book_id)::int FROM modern_effective v JOIN modern_sets s ON s.id=v.rule_set_id),
 'draftInputCount',(SELECT count(*)::int FROM modern_inputs WHERE status='draft'),
 'confirmedInputCount',(SELECT count(*)::int FROM modern_inputs WHERE status='confirmed'),
 'currentRuleConfirmedInputCount',(SELECT count(*)::int FROM modern_current_inputs),
 'bookWithCurrentRuleConfirmedInputCount',(SELECT count(DISTINCT source_book_id)::int FROM modern_current_inputs),
 'exactRosterBookCount',(SELECT count(*)::int FROM modern_exact_rosters))`;
export function validModernPreparation(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==modernPreparationCountKeys.length||modernPreparationCountKeys.some(key=>!Object.hasOwn(value,key)||!Number.isSafeInteger(value[key])||value[key]<0)) return false;
 return (value.linkedRuleBookCount>0 || (value.draftInputCount===0 && value.confirmedInputCount===0))
   && value.linkedRuleBookCount<=value.sourceBookCount && value.effectiveRuleBookCount<=value.linkedRuleBookCount
   && value.currentRuleConfirmedInputCount<=value.confirmedInputCount
   && value.bookWithCurrentRuleConfirmedInputCount<=value.currentRuleConfirmedInputCount
   && value.bookWithCurrentRuleConfirmedInputCount<=value.effectiveRuleBookCount
   && value.exactRosterBookCount<=value.bookWithCurrentRuleConfirmedInputCount;
}
export const payrollReadinessSql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=public,pg_catalog;
WITH active_books AS (
  SELECT id FROM hr_payroll_book
  WHERE tenant_id='10000001' AND park_id='20000001' AND NOT is_deleted
), scoped_batches AS (
  SELECT batch.id,batch.batch_code,batch.source_backup_hash,batch.status,batch.published_at
  FROM hr_payroll_legacy_batch batch
  WHERE batch.tenant_id='10000001' AND batch.park_id='20000001' AND NOT batch.is_deleted
), receipt_qualified_batches AS (
  SELECT batch.id,batch.status,batch.published_at
  FROM scoped_batches batch
  JOIN hr_yuzhou_t4_followon_operation receipt ON receipt.operation_id=batch.batch_code
    AND receipt.status='succeeded'
    AND receipt.binding->'targetScope'->>'tenantId'='10000001'
    AND receipt.binding->'targetScope'->>'parkId'='20000001'
    AND receipt.binding->'triple'->>'sourceSnapshotHash'=batch.source_backup_hash::text
  WHERE EXISTS(SELECT 1 FROM migration_batch control
    WHERE control.run_id=receipt.operation_id AND control.t4_followon_operation_id=receipt.operation_id
      AND control.status='succeeded' AND control.target_database=current_database())
), eligible_staged_batches AS (
  SELECT id FROM receipt_qualified_batches WHERE status='staged' AND published_at IS NULL
), observed_snapshots AS (
  SELECT s.id,s.batch_id,s.mapping_status,s.employee_id,p.period_month,p.book_id
  FROM hr_payroll_legacy_snapshot s
  JOIN hr_payroll_book_period p ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id AND NOT p.is_deleted
  JOIN active_books book ON book.id=p.book_id
  WHERE s.tenant_id='10000001' AND s.park_id='20000001' AND NOT s.is_deleted
    AND (s.batch_id IN(SELECT id FROM eligible_staged_batches)
      OR s.batch_id IN(SELECT id FROM scoped_batches WHERE status='published'))
), qualified_sources AS (
  SELECT source.id,source.legacy_batch_id,source.book_id,source.period_month
  FROM hr_payroll_reconciliation_source source
  JOIN active_books book ON book.id=source.book_id
  JOIN scoped_batches batch ON batch.id=source.legacy_batch_id
  JOIN hr_yuzhou_t4_followon_operation receipt ON receipt.operation_id=source.operation_id
    AND receipt.status='succeeded' AND receipt.binding_sha256=source.binding_sha256
    AND receipt.binding->'targetScope'->>'tenantId'=source.tenant_id
    AND receipt.binding->'targetScope'->>'parkId'=source.park_id
    AND receipt.binding->'triple'->>'sourceSnapshotHash'=batch.source_backup_hash::text
  WHERE source.tenant_id='10000001' AND source.park_id='20000001'
    AND batch.status='staged' AND batch.published_at IS NULL
    AND EXISTS(SELECT 1 FROM migration_batch control WHERE control.run_id=source.operation_id
      AND control.t4_followon_operation_id=source.operation_id AND control.status='succeeded'
      AND control.target_database=current_database())
), observed_months AS (
  SELECT period_month FROM observed_snapshots
  UNION SELECT period_month FROM qualified_sources
), months AS (SELECT period_month FROM observed_months ORDER BY period_month DESC LIMIT 24),
latest AS (SELECT max(period_month) AS period_month FROM observed_months),
source_counts AS (
 SELECT count(*) FILTER (WHERE s.mapping_status='mapped')::int AS mapped,
        count(*) FILTER (WHERE s.mapping_status<>'mapped' OR s.mapping_status IS NULL)::int AS unmapped
 FROM observed_snapshots s JOIN latest l ON s.period_month=l.period_month
), attendance AS (
 SELECT max(p.period_month) AS latest_month,count(*) FILTER (WHERE p.period_month=(SELECT period_month FROM latest))::int AS latest_effective_closed
 FROM hr_attendance_payroll_input_batch b JOIN hr_attendance_period p ON p.id=b.period_id AND p.tenant_id=b.tenant_id AND p.park_id=b.park_id
 WHERE b.tenant_id='10000001' AND b.park_id='20000001' AND NOT b.is_deleted AND NOT p.is_deleted AND b.status='effective' AND p.status='closed'
), insurance AS (
 SELECT max(r.period_month) AS latest_month,count(*) FILTER (WHERE r.period_month=(SELECT period_month FROM latest) AND c.id IS NOT NULL)::int AS latest_closed
 FROM hr_insurance_owned_revision r LEFT JOIN hr_insurance_owned_close c ON c.revision_id=r.id AND c.tenant_id=r.tenant_id AND c.park_id=r.park_id
 WHERE r.tenant_id='10000001' AND r.park_id='20000001'
   AND NOT EXISTS(SELECT 1 FROM hr_insurance_owned_revision successor WHERE successor.previous_revision_id=r.id AND successor.tenant_id=r.tenant_id AND successor.park_id=r.park_id)
), formal AS (
 SELECT count(*) FILTER (WHERE p.period_month=(SELECT period_month FROM latest))::int AS latest_runs,
        count(*) FILTER (WHERE p.period_month=(SELECT period_month FROM latest) AND r.status='draft')::int AS latest_draft,
        count(*) FILTER (WHERE p.period_month=(SELECT period_month FROM latest) AND r.status='calculated')::int AS latest_calculated,
        count(*) FILTER (WHERE p.period_month=(SELECT period_month FROM latest) AND r.status='reviewing')::int AS latest_reviewing,
        count(*) FILTER (WHERE p.period_month=(SELECT period_month FROM latest) AND r.status='confirmed')::int AS latest_confirmed,
        count(*) FILTER (WHERE p.period_month=(SELECT period_month FROM latest) AND r.status='cancelled')::int AS latest_cancelled
 FROM hr_payroll_run r JOIN hr_payroll_period p ON p.id=r.period_id AND p.tenant_id=r.tenant_id AND p.park_id=r.park_id
 WHERE r.tenant_id='10000001' AND r.park_id='20000001' AND NOT r.is_deleted AND NOT p.is_deleted
), reconciliation AS (
 SELECT (SELECT count(*)::int FROM qualified_sources src WHERE src.period_month=(SELECT period_month FROM latest)) AS latestReceiptQualifiedFrozenSources,
        count(*) FILTER(WHERE run.status='calculating')::int AS calculating_runs,
        count(*) FILTER(WHERE run.status='review')::int AS review_runs,
        count(*) FILTER(WHERE run.status='accepted')::int AS accepted_runs,
        count(*) FILTER(WHERE run.status='rejected')::int AS rejected_runs
 FROM hr_payroll_reconciliation_run run
 JOIN hr_attendance_payroll_input_batch input ON input.id=run.attendance_input_batch_id AND input.tenant_id=run.tenant_id AND input.park_id=run.park_id
 JOIN hr_attendance_period period ON period.id=input.period_id AND period.tenant_id=input.tenant_id AND period.park_id=input.park_id
 LEFT JOIN qualified_sources src ON src.id=run.reconciliation_source_id AND src.legacy_batch_id=run.legacy_batch_id AND src.period_month=period.period_month
 WHERE run.tenant_id='10000001' AND run.park_id='20000001' AND NOT run.is_deleted AND NOT input.is_deleted AND NOT period.is_deleted AND period.period_month=(SELECT period_month FROM latest)
   AND (src.id IS NOT NULL OR (run.reconciliation_source_id IS NULL AND EXISTS(SELECT 1 FROM scoped_batches batch WHERE batch.id=run.legacy_batch_id AND batch.status='published') AND EXISTS(SELECT 1 FROM observed_snapshots snapshot WHERE snapshot.batch_id=run.legacy_batch_id AND snapshot.period_month=period.period_month)))
), setup AS (
 SELECT (SELECT count(*)::int FROM hr_payroll_formula_version f JOIN active_books book ON book.id=f.book_id JOIN hr_payroll_item_version item ON item.id=f.item_version_id AND item.tenant_id=f.tenant_id AND item.park_id=f.park_id JOIN hr_payroll_item_definition definition ON definition.id=item.item_definition_id AND definition.tenant_id=item.tenant_id AND definition.park_id=item.park_id AND definition.book_id=f.book_id WHERE f.tenant_id='10000001' AND f.park_id='20000001' AND NOT f.is_deleted AND f.parse_status='approved_for_simulation' AND NOT item.is_deleted AND item.enabled AND NOT definition.is_deleted) AS approved_formulas,
        (SELECT count(*)::int FROM hr_payroll_reconciliation_policy_current c JOIN hr_payroll_reconciliation_policy_version v ON v.id=c.policy_version_id AND v.tenant_id=c.tenant_id AND v.park_id=c.park_id AND v.book_id=c.book_id WHERE c.tenant_id='10000001' AND c.park_id='20000001' AND NOT v.is_deleted AND v.status='approved') AS current_net_policies
), ${modernPreparationCtes}
SELECT json_build_object('latestObservedMonth',to_char((SELECT period_month FROM latest),'YYYY-MM-DD'),'totalDistinctMonths',(SELECT count(*)::int FROM observed_months),'monthsTruncated',(SELECT count(*)>24 FROM observed_months),'observedMonths',(SELECT COALESCE(json_agg(to_char(period_month,'YYYY-MM-DD') ORDER BY period_month DESC),'[]'::json) FROM months),'latestCompleteMonth','UNVERIFIED','activeBookCount',(SELECT count(*)::int FROM active_books),'publishedBatchCount',(SELECT count(*)::int FROM scoped_batches WHERE status='published'),'stagedBatchCount',(SELECT count(*)::int FROM scoped_batches WHERE status='staged' AND published_at IS NULL),'receiptQualifiedStagedBatchCount',(SELECT count(*)::int FROM eligible_staged_batches),'latestMappedSnapshots',(SELECT mapped FROM source_counts),'latestUnmappedSnapshots',(SELECT unmapped FROM source_counts),'latestEffectiveClosedAttendanceBatches',(SELECT latest_effective_closed FROM attendance),'latestAttendanceMonth',to_char((SELECT latest_month FROM attendance),'YYYY-MM-DD'),'latestClosedInsuranceInputs',(SELECT latest_closed FROM insurance),'latestInsuranceMonth',to_char((SELECT latest_month FROM insurance),'YYYY-MM-DD'),'latestFormalRuns',(SELECT latest_runs FROM formal),'latestFormalDraftRuns',(SELECT latest_draft FROM formal),'latestFormalCalculatedRuns',(SELECT latest_calculated FROM formal),'latestFormalReviewingRuns',(SELECT latest_reviewing FROM formal),'latestConfirmedFormalRuns',(SELECT latest_confirmed FROM formal),'latestFormalCancelledRuns',(SELECT latest_cancelled FROM formal),'latestReceiptQualifiedFrozenSources',(SELECT latestReceiptQualifiedFrozenSources FROM reconciliation),'reconciliationCalculatingRuns',(SELECT calculating_runs FROM reconciliation),'reconciliationReviewRuns',(SELECT review_runs FROM reconciliation),'reconciliationAcceptedRuns',(SELECT accepted_runs FROM reconciliation),'reconciliationRejectedRuns',(SELECT rejected_runs FROM reconciliation),'approvedFormulaCount',(SELECT approved_formulas FROM setup),'currentNetPolicyCount',(SELECT current_net_policies FROM setup),'modernPreparation',${modernPreparationSelect});
ROLLBACK;`;

const keys = ['latestObservedMonth','totalDistinctMonths','monthsTruncated','observedMonths','latestCompleteMonth','activeBookCount','publishedBatchCount','stagedBatchCount','receiptQualifiedStagedBatchCount','latestMappedSnapshots','latestUnmappedSnapshots','latestEffectiveClosedAttendanceBatches','latestAttendanceMonth','latestClosedInsuranceInputs','latestInsuranceMonth','latestFormalRuns','latestFormalDraftRuns','latestFormalCalculatedRuns','latestFormalReviewingRuns','latestConfirmedFormalRuns','latestFormalCancelledRuns','latestReceiptQualifiedFrozenSources','reconciliationCalculatingRuns','reconciliationReviewRuns','reconciliationAcceptedRuns','reconciliationRejectedRuns','approvedFormulaCount','currentNetPolicyCount','modernPreparation'];
const isMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);
const isNullableMonth = value => value === null || isMonth(value);
export function diagnosePayrollReadiness(deployPath, run = execFileSync) {
  if (typeof deployPath !== 'string' || !isAbsolute(deployPath)) throw new Error('HR_PAYROLL_READINESS_PATH_INVALID');
  let value;
  try {
    value = JSON.parse(run('docker',['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml','exec','-T','postgres','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],{cwd:deployPath,input:payrollReadinessSql,encoding:'utf8',timeout:15000,maxBuffer:8192,stdio:['pipe','pipe','pipe']}));
  } catch { throw new Error('HR_PAYROLL_READINESS_PROBE_FAILED'); }
  const months = value?.observedMonths;
  const orderedMonths = Array.isArray(months) && months.every((month,index) => isMonth(month) && (index === 0 || months[index-1] > month));
  if (!value || !validModernPreparation(value.modernPreparation) || value.modernPreparation.sourceBookCount>value.activeBookCount || (value.latestObservedMonth===null && value.modernPreparation.sourceBookCount!==0) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value,key)) || value.latestCompleteMonth !== 'UNVERIFIED' || !isNullableMonth(value.latestObservedMonth) || !isNullableMonth(value.latestAttendanceMonth) || !isNullableMonth(value.latestInsuranceMonth) || !orderedMonths || months.length > 24 || !Number.isSafeInteger(value.totalDistinctMonths) || value.totalDistinctMonths < 0 || typeof value.monthsTruncated !== 'boolean' || value.monthsTruncated !== (value.totalDistinctMonths > 24) || (value.monthsTruncated ? months.length !== 24 : value.totalDistinctMonths !== months.length) || (value.latestObservedMonth === null ? value.totalDistinctMonths !== 0 || months.length !== 0 : months[0] !== value.latestObservedMonth) || keys.filter(key => /Count$|Snapshots$|Batches$|Inputs$|Runs$|Sources$/.test(key)).some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)) throw new Error('HR_PAYROLL_READINESS_RESULT_INVALID');
  return {kind:'hr_payroll_readiness_counts',...Object.fromEntries(keys.map(key=>[key,value[key]])),modernCalculationReadiness:'UNVERIFIED',modernPreparationScope:'LATEST_OBSERVED_ACTIVE_ELIGIBLE_SOURCE_BOOKS',legacyFormulaCountsAreModernPrerequisites:false,eligibility:'UNVERIFIED',productionImport:'HOLD'};
}
if (process.argv[1] === '-' || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  try { if (process.argv.length !== 3) throw new Error('HR_PAYROLL_READINESS_PATH_INVALID'); process.stdout.write(JSON.stringify(diagnosePayrollReadiness(process.argv[2]))+'\n'); }
  catch (error) { const allowed=['HR_PAYROLL_READINESS_PATH_INVALID','HR_PAYROLL_READINESS_PROBE_FAILED','HR_PAYROLL_READINESS_RESULT_INVALID']; process.stderr.write((allowed.includes(error.message)?error.message:'HR_PAYROLL_READINESS_PROBE_FAILED')+'\n'); process.exitCode=1; }
}
