import { ConflictException } from "@nestjs/common";
import type { TenantParkScope, YuzhouPayrollSourcePackage } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { readCurrentPayrollSourceBatch } from "./hr-payroll-frozen-source";

/** Caller holds source fact locks and the current month lock. No payroll writes. */
export async function findT4PayrollBaseline(
  manager: EntityManager, scope: TenantParkScope, pkg: YuzhouPayrollSourcePackage,
): Promise<string | null> {
  const args = [scope.tenantId, scope.parkId, `${pkg.month}-01`];
  // Include unqualified batches in discovery: their presence must never silently
  // fall through to inserting another copy of the original month's facts.
  const candidates: Array<{ id: string }> = await manager.query(`SELECT DISTINCT batch.id
    FROM hr_payroll_legacy_batch batch JOIN hr_payroll_legacy_snapshot snapshot
      ON (snapshot.batch_id,snapshot.tenant_id,snapshot.park_id)=(batch.id,batch.tenant_id,batch.park_id)
    JOIN hr_payroll_book_period period ON (period.id,period.tenant_id,period.park_id)=
      (snapshot.book_period_id,snapshot.tenant_id,snapshot.park_id)
    WHERE batch.tenant_id=$1 AND batch.park_id=$2 AND batch.source_kind='t4'
      AND period.period_month=$3::date ORDER BY batch.id`, args);
  if (!candidates.length) return null;
  if (candidates.length !== 1) throw new ConflictException("T4_BASELINE_AMBIGUOUS");
  const id = candidates[0]!.id;
  await readCurrentPayrollSourceBatch(manager, scope, id, pkg.month);
  const [{ control_id: controlId }] = await manager.query(`SELECT control.id AS control_id
    FROM hr_payroll_legacy_batch batch JOIN migration_batch control
      ON control.run_id=batch.batch_code AND control.t4_followon_operation_id=batch.batch_code
    WHERE batch.tenant_id=$1 AND batch.park_id=$2 AND batch.id=$3
      AND control.status='succeeded' AND control.target_database=current_database()`, [scope.tenantId, scope.parkId, id]);

  // Amounts stay inside PostgreSQL. EXCEPT ALL compares exact numerics, source
  // NULLs, empty/raw text, roster and immutable source catalogs in both directions.
  const [{ equivalent, owned }] = await manager.query(`WITH
    expected_books AS (SELECT book FROM jsonb_array_elements($5::jsonb->'books') book),
    expected_rows AS (SELECT (book->>'scheme')::int scheme,row
      FROM expected_books CROSS JOIN LATERAL jsonb_array_elements(book->'records') row),
    expected_values AS (SELECT scheme,row,value FROM expected_rows
      CROSS JOIN LATERAL jsonb_array_elements(row->'values') value),
    actual_rows AS (SELECT s.*,p.book_id,b.legacy_scheme AS scheme,p.legacy_close_state,p.source_hash AS close_hash,p.id AS period_id
      FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_book_period p
        ON (p.id,p.tenant_id,p.park_id)=(s.book_period_id,s.tenant_id,s.park_id)
      JOIN hr_payroll_book b ON (b.id,b.tenant_id,b.park_id)=(p.book_id,p.tenant_id,p.park_id)
      WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.batch_id=$3 AND p.period_month=$4::date),
    actual_books AS (SELECT DISTINCT scheme,book_id,period_id,legacy_close_state,close_hash FROM actual_rows),
    actual_values AS (SELECT i.*,s.scheme,s.employee_id,s.source_hash AS row_hash FROM actual_rows s
      JOIN hr_payroll_legacy_snapshot_item i ON (i.snapshot_id,i.tenant_id,i.park_id)=(s.id,s.tenant_id,s.park_id)),
    actual_catalog AS (SELECT v.*,d.legacy_item_name,d.item_code,d.id AS definition_id,b.scheme
      FROM actual_books b JOIN hr_payroll_item_definition d ON d.book_id=b.book_id AND d.tenant_id=$1 AND d.park_id=$2
      JOIN hr_payroll_item_version v ON v.item_definition_id=d.id AND v.tenant_id=$1 AND v.park_id=$2
      WHERE EXISTS(SELECT 1 FROM legacy_record_map m WHERE m.batch_id=$6 AND m.target_table='hr_payroll_item_version'
        AND m.target_id=v.id AND m.is_active AND m.mapping_status IN('loaded','verified'))),
    actual_formulas AS (SELECT f.*,d.item_code,b.scheme FROM actual_books b
      JOIN hr_payroll_formula_version f ON f.book_id=b.book_id AND f.tenant_id=$1 AND f.park_id=$2
      LEFT JOIN hr_payroll_item_version v ON v.id=f.item_version_id AND v.tenant_id=$1 AND v.park_id=$2
      LEFT JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=$1 AND d.park_id=$2
      WHERE EXISTS(SELECT 1 FROM legacy_record_map m WHERE m.batch_id=$6 AND m.target_table='hr_payroll_formula_version'
        AND m.target_id=f.id AND m.is_active AND m.mapping_status IN('loaded','verified'))),
    expected_facts AS (
      SELECT scheme,(row->>'employeeMappingId')::uuid AS employee_id,row->>'sourceRowSha256' AS source_hash,
        encode(digest(row->>'sourcePersonIdentity','sha256'),'hex') AS employee_hash,
        replace(row->>'sourceTable','dbo.','') AS source_table,
        (row->'summary'->>'grossAmount')::numeric gross,(row->'summary'->>'deductionAmount')::numeric deduction,
        (row->'summary'->>'taxAmount')::numeric tax,(row->'summary'->>'netAmount')::numeric net FROM expected_rows),
    actual_facts AS (SELECT scheme,employee_id,source_hash,legacy_employee_hash,legacy_source_table,
      gross_amount,deduction_amount,tax_amount,net_amount FROM actual_rows),
    expected_items AS (SELECT scheme,(row->>'employeeMappingId')::uuid AS employee_id,
      row->>'sourceRowSha256' AS row_hash,value->>'column' AS column_name,value->>'valueType' AS value_type,
      (value->>'isSourceNull')::boolean AS is_null,
      COALESCE(value->>'decimalValue',value->>'textValue',value->>'dateValue') AS raw,
      (value->>'decimalValue')::numeric AS decimal_value,value->>'textValue' AS text_value,
      (value->>'dateValue')::date AS date_value,value->>'sourceHash' AS source_hash FROM expected_values),
    saved_items AS (SELECT scheme,employee_id,row_hash,legacy_column_name,value_type,is_source_null,raw_value,
      decimal_value,text_value,date_value,source_hash FROM actual_values),
    expected_catalog AS (SELECT (book->>'scheme')::int AS scheme,item->>'legacyItemName' AS name,
      item->>'itemCode' AS code,item->>'displayName' AS display_name,item->>'valueType' AS value_type,
      item->>'legacyItemType' AS item_type,item->>'legacyAddOrSub' AS add_sub,item->>'itemCategory' AS category,
      (item->>'decimalScale')::int AS scale,(item->>'sortNo')::int AS sort_no,item->>'sourceHash' AS source_hash
      FROM expected_books CROSS JOIN LATERAL jsonb_array_elements(book->'items') item),
    saved_catalog AS (SELECT scheme,legacy_item_name,item_code,display_name,value_type,legacy_item_type,
      legacy_add_or_sub,item_category,decimal_scale,sort_no,source_hash FROM actual_catalog),
    expected_formulas AS (SELECT (book->>'scheme')::int AS scheme,(formula->>'legacyFormulaId')::int AS formula_id,
      CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(book->'items') item WHERE item->>'itemCode'=formula->>'itemCode')
        THEN formula->>'itemCode' ELSE NULL END AS item_code,formula->>'rawExpression' AS expression,formula->>'rawCondition' AS condition,
      (formula->>'calculationOrder')::int AS calculation_order,
      encode(digest(formula->>'rawExpression','sha256'),'hex') AS expression_hash
      FROM expected_books CROSS JOIN LATERAL jsonb_array_elements(book->'formulas') formula),
    saved_formulas AS (SELECT scheme,legacy_formula_id,item_code,raw_expression,raw_condition,calculation_order,expression_hash FROM actual_formulas),
    owned_targets AS (
      SELECT 'hr_payroll_legacy_batch'::text AS table_name,id,manifest_hash AS hash FROM hr_payroll_legacy_batch WHERE id=$3 AND tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'hr_payroll_book',b.id,b.source_hash FROM actual_books a JOIN hr_payroll_book b ON b.id=a.book_id
      UNION ALL SELECT 'hr_payroll_book_period',period_id,close_hash FROM actual_books
      UNION ALL SELECT DISTINCT 'hr_payroll_item_definition',definition_id,encode(digest(scheme::text||':'||legacy_item_name,'sha256'),'hex') FROM actual_catalog
      UNION ALL SELECT 'hr_payroll_item_version',id,source_hash FROM actual_catalog
      UNION ALL SELECT 'hr_payroll_formula_version',id,expression_hash FROM actual_formulas
      UNION ALL SELECT 'hr_payroll_legacy_snapshot',id,source_hash FROM actual_rows
      UNION ALL SELECT 'hr_payroll_legacy_snapshot_item',id,source_hash FROM actual_values)
    SELECT NOT EXISTS(
      (SELECT * FROM expected_facts EXCEPT ALL SELECT * FROM actual_facts)
      UNION ALL (SELECT * FROM actual_facts EXCEPT ALL SELECT * FROM expected_facts))
      AND NOT EXISTS((SELECT * FROM expected_items EXCEPT ALL SELECT * FROM saved_items)
        UNION ALL (SELECT * FROM saved_items EXCEPT ALL SELECT * FROM expected_items))
      AND NOT EXISTS((SELECT * FROM expected_catalog EXCEPT ALL SELECT * FROM saved_catalog)
        UNION ALL (SELECT * FROM saved_catalog EXCEPT ALL SELECT * FROM expected_catalog))
      AND NOT EXISTS(SELECT 1 FROM expected_books CROSS JOIN LATERAL jsonb_array_elements(book->'items') expected
        WHERE expected ? 'declarativeMetadata' AND NOT EXISTS(SELECT 1 FROM actual_catalog v
          WHERE v.scheme=(book->>'scheme')::int AND v.legacy_item_name=expected->>'legacyItemName'
          AND jsonb_build_object('taxable',v.taxable,'printEnabled',v.print_enabled,'enabled',v.enabled,
            'printWidth',v.legacy_print_width,'printWidthSourceHash',v.legacy_print_width_hash,
            'taxFlag',v.legacy_tax_flag,'noDecimalFlag',v.legacy_no_decimal_flag,'useFlag',v.legacy_use_flag,
            'legacyDecimalLength',v.legacy_decimal_length,'decimalLengthSourceHash',v.legacy_decimal_length_hash,
            'legacyPrintReport',v.legacy_print_report,'printReportSourceHash',v.legacy_print_report_hash,
            'itemTitle',v.legacy_item_title,'longDescription',v.legacy_long_description,
            'suppressDecimals',v.suppress_decimals,'legacyMetadataReviewRequired',v.legacy_metadata_review_required)=expected->'declarativeMetadata'))
      AND NOT EXISTS((SELECT * FROM expected_formulas EXCEPT ALL SELECT * FROM saved_formulas)
        UNION ALL (SELECT * FROM saved_formulas EXCEPT ALL SELECT * FROM expected_formulas))
      AND NOT EXISTS((SELECT (book->>'scheme')::int,(book->>'closeState')::int,book->>'closeSourceHash' FROM expected_books
        EXCEPT ALL SELECT scheme,legacy_close_state,close_hash FROM actual_books)
        UNION ALL (SELECT scheme,legacy_close_state,close_hash FROM actual_books EXCEPT ALL
        SELECT (book->>'scheme')::int,(book->>'closeState')::int,book->>'closeSourceHash' FROM expected_books))
      AND NOT EXISTS(SELECT 1 FROM actual_rows WHERE is_deleted OR source_multiplicity<>1 OR mapping_status<>'mapped')
      AND NOT EXISTS(SELECT 1 FROM actual_values WHERE is_deleted)
      AND NOT EXISTS(SELECT 1 FROM actual_catalog WHERE is_deleted)
      AND NOT EXISTS(SELECT 1 FROM actual_formulas WHERE is_deleted) AS equivalent,
      NOT EXISTS(SELECT 1 FROM owned_targets target WHERE
        (SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=$6 AND m.target_table=target.table_name
          AND m.target_id=target.id AND m.source_row_sha256=target.hash AND m.is_active
          AND m.mapping_status IN('loaded','verified'))<>1) AS owned`,
  [scope.tenantId, scope.parkId, id, `${pkg.month}-01`, JSON.stringify(pkg), controlId]);
  if (!equivalent || !owned) throw new ConflictException("T4_BASELINE_SOURCE_DIFFERS_REVIEW_REQUIRED");
  // Preserve the original builder and its original v1 frozen hash. Its receipt,
  // control, scoped fact-map and exact-count checks run again under these locks.
  for (const book of pkg.books) {
    await manager.query(`SELECT jsonb_array_length(hr_build_payroll_reconciliation_source(
      $1,$2,$3,b.id,$4::date,NULL,$6,$7)->'snapshots') AS count
      FROM hr_payroll_book b WHERE b.tenant_id=$1 AND b.park_id=$2 AND b.legacy_scheme=$5
        AND b.source_system='yuzhou-v10' AND NOT b.is_deleted`,
    [scope.tenantId, scope.parkId, id, `${pkg.month}-01`, book.scheme, book.records.length,
      book.records.reduce((count, record) => count + record.values.length, 0)]);
  }
  return id;
}
