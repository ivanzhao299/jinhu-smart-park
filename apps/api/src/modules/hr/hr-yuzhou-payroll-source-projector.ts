import { ConflictException } from "@nestjs/common";
import type { TenantParkScope, YuzhouPayrollSourcePackage } from "@jinhu/shared";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";

/** Append source facts only. Caller owns the month/head transaction and audit. */
export async function projectPayrollSource(
  manager: EntityManager, scope: TenantParkScope, actorId: string,
  pkg: YuzhouPayrollSourcePackage, operationId: string,
): Promise<string> {
  const params = [scope.tenantId, scope.parkId];
  const own = async (table: string, id: string) => manager.query(
    `INSERT INTO hr_yuzhou_payroll_source_ownership(tenant_id,park_id,operation_id,target_table,target_id)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [...params, operationId, table, id]);
  const [batch] = await manager.query(
    `INSERT INTO hr_payroll_legacy_batch(tenant_id,park_id,batch_code,source_system,source_kind,
       source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,quarantined_row_count,status,create_by,remark)
     VALUES($1,$2,$3,'yuzhou-v10','payroll_source_v1',NULL,$4,$5,$6,$6,0,'staged',$7,'typed complete monthly source') RETURNING id`,
    [...params, `payroll-source-${operationId}`, pkg.catalogSha256, pkg.evidenceSha256,
      pkg.books.reduce((count, book) => count + book.records.length, 0), actorId]);
  await own("hr_payroll_legacy_batch", batch.id);

  // Different month imports can share books. Serialize version allocation in a
  // fixed order, without updating an existing append-only catalog/period row.
  for (const book of [...pkg.books].sort((a, b) => a.scheme - b.scheme)) {
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [JSON.stringify(["hr-payroll-source-book", ...params, book.scheme])]);
    await manager.query(
      `INSERT INTO hr_payroll_book(tenant_id,park_id,source_system,legacy_scheme,book_name,source_hash,status,create_by,remark)
       VALUES($1,$2,'yuzhou-v10',$3,$4,$5,'review_required',$6,'typed monthly source')
       ON CONFLICT(tenant_id,park_id,source_system,legacy_scheme) DO NOTHING`,
      [...params, book.scheme, book.bookName, book.closeSourceHash, actorId]);
    const [saved] = await manager.query(
      `SELECT id FROM hr_payroll_book WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10'
       AND legacy_scheme=$3 AND NOT is_deleted FOR UPDATE`, [...params, book.scheme]);
    if (!saved) throw new ConflictException("Payroll source book is unavailable");
    await own("hr_payroll_book", saved.id);
    await manager.query(
      `INSERT INTO hr_payroll_book_period(tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash,create_by,remark)
       VALUES($1,$2,$3,$4::date,$5,$6,$7,'typed monthly source')
       ON CONFLICT(tenant_id,park_id,book_id,period_month) DO NOTHING`,
      [...params, saved.id, `${pkg.month}-01`, book.closeState, book.closeSourceHash, actorId]);
    const [period] = await manager.query(
      `SELECT id FROM hr_payroll_book_period WHERE tenant_id=$1 AND park_id=$2 AND book_id=$3
       AND period_month=$4::date AND NOT is_deleted FOR SHARE`, [...params, saved.id, `${pkg.month}-01`]);
    if (!period) throw new ConflictException("Payroll source period is unavailable");
    await own("hr_payroll_book_period", period.id);
    const itemVersions = new Map<string, string>();
    const formulaTargets = new Map<string, string>();
    for (const item of [...book.items].sort((a, b) => a.legacyItemName.localeCompare(b.legacyItemName))) {
      await manager.query(
        `INSERT INTO hr_payroll_item_definition(tenant_id,park_id,book_id,legacy_item_name,item_code,create_by,remark)
         VALUES($1,$2,$3,$4,$5,$6,'typed monthly source')
         ON CONFLICT(tenant_id,park_id,book_id,legacy_item_name) DO NOTHING`,
        [...params, saved.id, item.legacyItemName, item.itemCode, actorId]);
      const [definition] = await manager.query(
        `SELECT id,item_code FROM hr_payroll_item_definition WHERE tenant_id=$1 AND park_id=$2
         AND book_id=$3 AND legacy_item_name=$4 AND NOT is_deleted FOR SHARE`, [...params, saved.id, item.legacyItemName]);
      if (!definition || definition.item_code !== item.itemCode)
        throw new ConflictException("Payroll source item identity changed");
      await own("hr_payroll_item_definition", definition.id);
      const metadataFields = [
        ["taxable", "taxable", "boolean"], ["print_enabled", "printEnabled", "boolean"], ["enabled", "enabled", "boolean"],
        ["legacy_print_width", "printWidth", "integer"], ["legacy_print_width_hash", "printWidthSourceHash", "varchar"],
        ["legacy_tax_flag", "taxFlag", "varchar"], ["legacy_no_decimal_flag", "noDecimalFlag", "varchar"], ["legacy_use_flag", "useFlag", "varchar"],
        ["legacy_decimal_length", "legacyDecimalLength", "integer"], ["legacy_decimal_length_hash", "decimalLengthSourceHash", "varchar"],
        ["legacy_print_report", "legacyPrintReport", "integer"], ["legacy_print_report_hash", "printReportSourceHash", "varchar"],
        ["legacy_item_title", "itemTitle", "varchar"], ["legacy_long_description", "longDescription", "varchar"],
        ["suppress_decimals", "suppressDecimals", "boolean"], ["legacy_metadata_review_required", "legacyMetadataReviewRequired", "boolean"],
      ] as const;
      const metadata = item.declarativeMetadata ?? { taxable: null, printEnabled: null, enabled: false,
        printWidth: null, printWidthSourceHash: null, taxFlag: null, noDecimalFlag: null, useFlag: null,
        legacyDecimalLength: null, decimalLengthSourceHash: null, legacyPrintReport: null, printReportSourceHash: null,
        itemTitle: null, longDescription: null, suppressDecimals: null, legacyMetadataReviewRequired: true };
      const columns = ["display_name", "value_type", "legacy_item_type", "legacy_add_or_sub", "item_category", "decimal_scale", "sort_no", "source_hash", ...metadataFields.map(f => f[0])];
      const types = ["varchar", "varchar", "varchar", "varchar", "varchar", "integer", "integer", "varchar", ...metadataFields.map(f => f[2])];
      const values = [item.displayName, item.valueType, item.legacyItemType, item.legacyAddOrSub,
        item.itemCategory, item.decimalScale, item.sortNo, item.sourceHash, ...metadataFields.map(f => metadata[f[1]])];
      // Older normalized callers may omit metadata. They may reuse the same
      // source-hash version, but a new version stays disabled and needs review.
      const matchLength = item.declarativeMetadata ? values.length : 8;
      const predicates = columns.slice(0, matchLength).map((column, index) => `${column} IS NOT DISTINCT FROM $${index + 4}::${types[index]}`);
      let [version] = await manager.query(
        `SELECT id FROM hr_payroll_item_version WHERE tenant_id=$1 AND park_id=$2 AND item_definition_id=$3
         AND ${predicates.join(" AND ")} AND NOT is_deleted ORDER BY version_no DESC LIMIT 1 FOR SHARE`,
        [...params, definition.id, ...values.slice(0, matchLength)]);
      if (!version) {
        [version] = await manager.query(
          `INSERT INTO hr_payroll_item_version(tenant_id,park_id,item_definition_id,version_no,${columns.join(",")},create_by,remark)
           SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(max(version_no),0)+1,
             ${values.map((_, index) => `$${index + 4}::${types[index]}`).join(",")},$${values.length + 4}::uuid,'typed monthly source'
           FROM hr_payroll_item_version WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND item_definition_id=$3::uuid RETURNING id`,
          [...params, definition.id, ...values, actorId]);
      }
      itemVersions.set(item.legacyItemName, version.id);
      itemVersions.set(item.itemCode, version.id);
      formulaTargets.set(item.itemCode, version.id);
      await own("hr_payroll_item_version", version.id);
    }
    for (const formula of [...book.formulas].sort((a, b) => a.legacyFormulaId - b.legacyFormulaId)) {
      // Legacy formula IDs are unique across the scope, not just within a book.
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [JSON.stringify(["hr-payroll-source-formula", ...params, formula.legacyFormulaId])]);
      // Original T4 keeps orphan formulas with a null item and manual review.
      // Preserve the raw target in the encrypted source package; never invent
      // a catalog item or approve a formula to unblock the whole month.
      const itemId = formula.itemCode ? formulaTargets.get(formula.itemCode) ?? null : null;
      let [version] = await manager.query(
        `SELECT id FROM hr_payroll_formula_version WHERE tenant_id=$1 AND park_id=$2 AND legacy_formula_id=$3
         AND book_id=$4 AND item_version_id IS NOT DISTINCT FROM $5::uuid AND raw_expression=$6
         AND raw_condition IS NOT DISTINCT FROM $7::text AND calculation_order=$8 AND NOT is_deleted
         ORDER BY version_no DESC LIMIT 1 FOR SHARE`,
        [...params, formula.legacyFormulaId, saved.id, itemId, formula.rawExpression, formula.rawCondition, formula.calculationOrder]);
      if (!version) {
        [version] = await manager.query(
          `INSERT INTO hr_payroll_formula_version(tenant_id,park_id,book_id,item_version_id,legacy_formula_id,version_no,
             raw_expression,raw_condition,expression_hash,parse_status,dependency_codes,calculation_order,create_by,remark)
           SELECT $1::varchar,$2::varchar,$3::uuid,$4::uuid,$5::integer,COALESCE(max(version_no),0)+1,$6,$7,$8,'manual_review','[]'::jsonb,$9,$10,'typed monthly source'
           FROM hr_payroll_formula_version WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND legacy_formula_id=$5::integer RETURNING id`,
          [...params, saved.id, itemId, formula.legacyFormulaId, formula.rawExpression, formula.rawCondition,
            createHash("sha256").update(formula.rawExpression).digest("hex"), formula.calculationOrder, actorId]);
      }
      await own("hr_payroll_formula_version", version.id);
    }
    for (const record of book.records) {
      const [snapshot] = await manager.query(
        `INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,
           legacy_employee_hash,source_content_group_hash,source_multiplicity,mapping_status,gross_amount,deduction_amount,
           tax_amount,net_amount,source_hash,create_by,remark)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'mapped',$9,$10,$11,$12,$13,$14,'typed monthly source') RETURNING id`,
        [...params, batch.id, period.id, record.employeeMappingId, record.sourceTable.replace(/^dbo\./u, ""),
          createHash("sha256").update(record.sourcePersonIdentity).digest("hex"), record.sourceRowSha256,
          record.summary.grossAmount ?? null, record.summary.deductionAmount ?? null, record.summary.taxAmount ?? null,
          record.summary.netAmount ?? null, record.sourceRowSha256, actorId]);
      await own("hr_payroll_legacy_snapshot", snapshot.id);
      for (const value of record.values) {
        const itemId = itemVersions.get(value.column);
        if (!itemId) throw new ConflictException("Payroll source value has no catalog item version");
        const raw = value.isSourceNull ? null : value.decimalValue ?? value.textValue ?? value.dateValue;
        const [savedValue] = await manager.query(
          `INSERT INTO hr_payroll_legacy_snapshot_item(tenant_id,park_id,snapshot_id,item_version_id,legacy_column_name,
             value_type,is_source_null,raw_value,decimal_value,text_value,date_value,sort_no,source_hash,create_by,remark)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,'typed monthly source') RETURNING id`,
          [...params, snapshot.id, itemId, value.column, value.valueType, value.isSourceNull, raw,
            value.decimalValue ?? null, value.textValue ?? null, value.dateValue ?? null, value.sourceHash, actorId]);
        await own("hr_payroll_legacy_snapshot_item", savedValue.id);
      }
    }
  }
  return batch.id;
}
