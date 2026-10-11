import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const countKeys = ['bookCount','snapshotCount','sourceRowCount','mappedCount','unmappedCount','duplicateSourceCount','quarantinedCount','employeeCount','itemCount','unresolvedItemCount','eligibleSourceCount','unqualifiedBatchCount','unavailableReferenceCount','unavailableEmployeeCount','duplicateEmployeeExtraCount'];
const additiveKeys = countKeys.filter(key => key !== 'employeeCount');
export function payrollSourceCoverageSql(month) {
  if (typeof month !== 'string' || !/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])-01$/.test(month)) throw new Error('HR_PAYROLL_COVERAGE_MONTH_INVALID');
  const aggregates = `count(DISTINCT book.id)::int AS "bookCount",count(f.id)::int AS "snapshotCount",
    COALESCE(sum(f.source_multiplicity),0) AS "sourceRowCount",
    count(f.id) FILTER(WHERE f.mapping_status='mapped')::int AS "mappedCount",
    count(f.id) FILTER(WHERE f.mapping_status='employee_unmapped')::int AS "unmappedCount",
    count(f.id) FILTER(WHERE f.mapping_status='duplicate_source')::int AS "duplicateSourceCount",
    count(f.id) FILTER(WHERE f.mapping_status='quarantined')::int AS "quarantinedCount",
    count(DISTINCT f.employee_id)::int AS "employeeCount",
    COALESCE(sum(f.item_count),0) AS "itemCount",COALESCE(sum(f.unresolved_item_count),0) AS "unresolvedItemCount",
    count(f.id) FILTER(WHERE f.source_class='eligible')::int AS "eligibleSourceCount",
    count(f.id) FILTER(WHERE f.source_class='unqualified_batch')::int AS "unqualifiedBatchCount",
    count(f.id) FILTER(WHERE f.source_class='unavailable_reference')::int AS "unavailableReferenceCount",
    count(f.id) FILTER(WHERE f.mapping_status='mapped' AND f.employee_unavailable)::int AS "unavailableEmployeeCount",
    COALESCE(sum(f.duplicate_employee_extra),0) AS "duplicateEmployeeExtraCount"`;
  // Self-contained because this module also runs over SSH stdin, without a source sync.
  // Receipt eligibility matches diagnose-hr-payroll-readiness; census retains all other batches.
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=public,pg_catalog;
WITH books AS (SELECT * FROM hr_payroll_book WHERE tenant_id='10000001' AND park_id='20000001'),
qualified_batches AS (
 SELECT batch.id FROM hr_payroll_legacy_batch batch
 WHERE batch.tenant_id='10000001' AND batch.park_id='20000001' AND NOT batch.is_deleted
 AND (batch.status='published' OR (batch.status='staged' AND batch.published_at IS NULL AND EXISTS(
  SELECT 1 FROM hr_yuzhou_t4_followon_operation receipt
  WHERE receipt.operation_id=batch.batch_code AND receipt.status='succeeded'
    AND receipt.binding->'targetScope'->>'tenantId'='10000001'
    AND receipt.binding->'targetScope'->>'parkId'='20000001'
    AND receipt.binding->'triple'->>'sourceSnapshotHash'=batch.source_backup_hash::text
    AND EXISTS(SELECT 1 FROM migration_batch control WHERE control.run_id=receipt.operation_id
      AND control.t4_followon_operation_id=receipt.operation_id AND control.status='succeeded'
      AND control.target_database=current_database())
 )))),
snapshots AS (
 SELECT s.id,s.book_period_id,s.employee_id,s.mapping_status,s.source_multiplicity,p.book_id,
   CASE WHEN book.is_deleted OR p.is_deleted OR s.is_deleted THEN 'unavailable_reference'
        WHEN q.id IS NOT NULL THEN 'eligible' ELSE 'unqualified_batch' END AS source_class,
   (e.id IS NULL OR e.is_deleted) AS employee_unavailable
 FROM hr_payroll_legacy_snapshot s
 JOIN hr_payroll_book_period p ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id
 JOIN books book ON book.id=p.book_id
 LEFT JOIN qualified_batches q ON q.id=s.batch_id
 LEFT JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id AND e.park_id=s.park_id
 WHERE s.tenant_id='10000001' AND s.park_id='20000001' AND p.period_month=date '${month}'
), items AS (
 SELECT item.snapshot_id,count(*)::int AS item_count,
 count(*) FILTER(WHERE item.item_version_id IS NULL)::int AS unresolved_item_count
 FROM hr_payroll_legacy_snapshot_item item JOIN snapshots s ON s.id=item.snapshot_id
 WHERE item.tenant_id='10000001' AND item.park_id='20000001' AND NOT item.is_deleted GROUP BY item.snapshot_id
), employee_duplicates AS (
 SELECT min(id::text)::uuid AS owner_id,count(*)-1 AS extra_count FROM snapshots
 WHERE employee_id IS NOT NULL AND mapping_status='mapped' GROUP BY book_id,employee_id HAVING count(*)>1
), facts AS (
 SELECT s.*,COALESCE(i.item_count,0) AS item_count,COALESCE(i.unresolved_item_count,0) AS unresolved_item_count,
 COALESCE(d.extra_count,0) AS duplicate_employee_extra FROM snapshots s
 LEFT JOIN items i ON i.snapshot_id=s.id LEFT JOIN employee_duplicates d ON d.owner_id=s.id
), book_counts AS (
 SELECT book.legacy_scheme AS scheme,${aggregates} FROM books book LEFT JOIN facts f ON f.book_id=book.id GROUP BY book.legacy_scheme
), totals AS (SELECT ${aggregates} FROM books book LEFT JOIN facts f ON f.book_id=book.id)
SELECT json_build_object('periodMonth','${month}','totals',(SELECT row_to_json(totals) FROM totals),
 'books',COALESCE((SELECT json_agg(book_counts ORDER BY scheme) FROM book_counts),'[]'::json));
ROLLBACK;`;
}

export function validatePayrollSourceCoverage(value, month) {
  const exactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object,key));
  const counts = object => exactKeys(object,countKeys) && countKeys.every(key=>Number.isSafeInteger(object[key]) && object[key]>=0)
    && object.mappedCount+object.unmappedCount+object.duplicateSourceCount+object.quarantinedCount===object.snapshotCount
    && object.eligibleSourceCount+object.unqualifiedBatchCount+object.unavailableReferenceCount===object.snapshotCount
    && object.sourceRowCount>=object.snapshotCount && object.employeeCount<=object.snapshotCount
    && object.unresolvedItemCount<=object.itemCount && object.unavailableEmployeeCount<=object.mappedCount
    && object.duplicateEmployeeExtraCount<=object.mappedCount;
  if (!exactKeys(value,['periodMonth','totals','books']) || value.periodMonth!==month || !counts(value.totals)
    || !Array.isArray(value.books) || value.books.length>35) throw new Error('HR_PAYROLL_COVERAGE_RESULT_INVALID');
  let previous=0;
  for (const book of value.books) {
    if (!exactKeys(book,['scheme',...countKeys]) || !Number.isInteger(book.scheme) || book.scheme<=previous || book.scheme>35 || book.bookCount<1
      || !counts(Object.fromEntries(countKeys.map(key=>[key,book[key]])))) throw new Error('HR_PAYROLL_COVERAGE_RESULT_INVALID');
    previous=book.scheme;
  }
  if (additiveKeys.some(key=>value.books.reduce((sum,book)=>sum+book[key],0)!==value.totals[key])
    || value.totals.employeeCount>value.books.reduce((sum,book)=>sum+book.employeeCount,0)
    || value.books.some(book=>book.employeeCount>value.totals.employeeCount)) throw new Error('HR_PAYROLL_COVERAGE_RESULT_INVALID');
  return {kind:'hr_payroll_source_coverage_counts',...value,amountReconciliation:'UNVERIFIED',businessAcceptance:'UNVERIFIED',productionWrites:0};
}

export function diagnosePayrollSourceCoverage(deployPath, month, run=execFileSync) {
  if (typeof deployPath!=='string' || !isAbsolute(deployPath)) throw new Error('HR_PAYROLL_COVERAGE_PATH_INVALID');
  const sql=payrollSourceCoverageSql(month);
  let value;
  try {
    value=JSON.parse(run('docker',['compose','--env-file','.env.production','-f','infra/docker/docker-compose.prod.yml','exec','-T','postgres','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],{cwd:deployPath,input:sql,encoding:'utf8',timeout:15000,maxBuffer:65536,stdio:['pipe','pipe','pipe']}));
  } catch { throw new Error('HR_PAYROLL_COVERAGE_PROBE_FAILED'); }
  return validatePayrollSourceCoverage(value,month);
}
if (process.argv[1]==='-' || (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))) {
  try { if(process.argv.length!==4) throw new Error('HR_PAYROLL_COVERAGE_ARGUMENTS_INVALID');process.stdout.write(JSON.stringify(diagnosePayrollSourceCoverage(process.argv[2],process.argv[3]))+'\n'); }
  catch(error) {const allowed=['HR_PAYROLL_COVERAGE_ARGUMENTS_INVALID','HR_PAYROLL_COVERAGE_PATH_INVALID','HR_PAYROLL_COVERAGE_MONTH_INVALID','HR_PAYROLL_COVERAGE_PROBE_FAILED','HR_PAYROLL_COVERAGE_RESULT_INVALID'];process.stderr.write((allowed.includes(error.message)?error.message:'HR_PAYROLL_COVERAGE_PROBE_FAILED')+'\n');process.exitCode=1;}
}
