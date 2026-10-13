import { ConflictException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";

export const PAYROLL_SOURCE_TABLES = "hr_payroll_legacy_snapshot,hr_payroll_legacy_snapshot_item,hr_payroll_book_period,legacy_record_map,hr_payroll_book,hr_payroll_item_definition,hr_payroll_item_version";
export type FrozenPayrollSource = { id: string; legacyBatchId: string; bookId: string; month: string; sourceHash: string; bindingHash: string; recordCount: number; itemCount: number };

/** Caller owns a READ COMMITTED transaction and retains all locks through its required audit. */
export async function lockCurrentPayrollSource(manager: EntityManager, scope: TenantParkScope, id: string, maxRecords = 5000): Promise<FrozenPayrollSource> {
  await manager.query(`LOCK TABLE ${PAYROLL_SOURCE_TABLES} IN SHARE MODE`);
  const rows: FrozenPayrollSource[] = await manager.query(`SELECT id,legacy_batch_id AS "legacyBatchId",book_id AS "bookId",to_char(period_month,'YYYY-MM') AS month,
    source_sha256 AS "sourceHash",binding_sha256 AS "bindingHash",snapshot_count AS "recordCount",item_count AS "itemCount"
    FROM hr_payroll_reconciliation_source WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND octet_length(frozen_input::text)<=16777216 FOR SHARE`, [id, scope.tenantId, scope.parkId]);
  if (rows.length !== 1) throw new ConflictException("Choose an available frozen payroll source in the current scope");
  const source = rows[0]!;
  if (source.recordCount > maxRecords) throw new ConflictException("Frozen payroll roster exceeds the complete preparation limit");
  // The existing builder verifies succeeded T4/current-database control receipts, ownership,
  // counts and binding while holding their row locks. Compare against current content, not just stored hashes.
  const [{ current_hash: currentHash }] = await manager.query(`SELECT encode(digest(hr_build_payroll_reconciliation_source($1,$2,$3,$4,$5::date,$6,$7,$8)::text,'sha256'),'hex') AS current_hash`,
    [scope.tenantId, scope.parkId, source.legacyBatchId, source.bookId, `${source.month}-01`, source.bindingHash, source.recordCount, source.itemCount]);
  if (currentHash !== source.sourceHash) throw new ConflictException("Frozen payroll source changed; review and freeze the complete current source again");
  return source;
}
