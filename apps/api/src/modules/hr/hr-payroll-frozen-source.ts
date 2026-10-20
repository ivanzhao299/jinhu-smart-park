import { ConflictException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";

export const PAYROLL_SOURCE_TABLES = "hr_payroll_legacy_snapshot,hr_payroll_legacy_snapshot_item,hr_payroll_book_period,legacy_record_map,hr_payroll_book,hr_payroll_item_definition,hr_payroll_item_version,hr_payroll_formula_version";
export type FrozenPayrollSource = { id: string; legacyBatchId: string; bookId: string; month: string; sourceHash: string; bindingHash: string; recordCount: number; itemCount: number; sourceKind?: "t4" | "payroll_source_v1" };

/** Receipt metadata only; caller has already checked the route's read/write permissions. */
export async function readCurrentPayrollSourceBatch(
  manager: EntityManager, scope: TenantParkScope, batchId: string,
  month: string | null, allowPublished = false, lock = true,
): Promise<{ status: "staged" | "published" }> {
  const period = month?.length === 7 ? `${month}-01` : month;
  const [batch] = await manager.query(`SELECT status,source_kind,published_at FROM hr_payroll_legacy_batch
    WHERE id=$3 AND tenant_id=$1 AND park_id=$2 AND NOT is_deleted ${lock ? "FOR SHARE" : ""}`,
  [scope.tenantId, scope.parkId, batchId]);
  if (allowPublished && batch?.status === "published" && batch.source_kind === "t4") return { status: "published" };
  if (!batch || batch.status !== "staged" || batch.published_at !== null)
    throw new ConflictException("Select an available current payroll source");
  const rows = batch.source_kind === "payroll_source_v1"
    ? await manager.query(`SELECT generation.id FROM hr_yuzhou_payroll_source_generation generation
      JOIN hr_yuzhou_payroll_source_operation operation ON (operation.id,operation.tenant_id,operation.park_id)=(generation.operation_id,generation.tenant_id,generation.park_id)
      JOIN hr_yuzhou_payroll_source_head head ON (head.tenant_id,head.park_id,head.source_instance,head.period_month)=(generation.tenant_id,generation.park_id,generation.source_instance,generation.period_month)
      WHERE generation.tenant_id=$1 AND generation.park_id=$2 AND generation.legacy_batch_id=$3
      AND ($4::date IS NULL OR generation.period_month=$4::date) AND operation.status='committed'
      AND operation.database_name=current_database() AND operation.database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND head.source_system='yuzhou-v10' AND head.operation_id=generation.operation_id
      AND head.version=generation.generation AND head.head_hash=operation.head_hash
      AND operation.generation=generation.generation AND operation.source_instance=generation.source_instance
      AND operation.period_month=generation.period_month AND operation.record_count=generation.record_count
      AND operation.value_count=generation.value_count AND operation.book_count=generation.book_count
      AND operation.roster_sha256=generation.roster_sha256 AND operation.catalog_sha256=generation.catalog_sha256
      AND operation.book_set_sha256=generation.book_set_sha256 ${lock ? "FOR SHARE OF generation,operation,head" : ""}`,
    [scope.tenantId, scope.parkId, batchId, period])
    : await manager.query(`SELECT batch.id FROM hr_payroll_legacy_batch batch
      JOIN hr_yuzhou_t4_followon_operation receipt ON receipt.operation_id=batch.batch_code AND receipt.status='succeeded'
      AND receipt.binding->'targetScope'->>'tenantId'=batch.tenant_id AND receipt.binding->'targetScope'->>'parkId'=batch.park_id
      AND receipt.binding->'triple'->>'sourceSnapshotHash'=batch.source_backup_hash::text
      JOIN migration_batch control ON control.run_id=receipt.operation_id AND control.t4_followon_operation_id=receipt.operation_id
      AND control.status='succeeded' AND control.target_database=current_database()
      WHERE batch.id=$3 AND batch.tenant_id=$1 AND batch.park_id=$2 AND batch.source_kind='t4'
      AND NOT EXISTS(SELECT 1 FROM hr_yuzhou_payroll_source_head head
        JOIN hr_yuzhou_payroll_source_generation generation ON (generation.operation_id,generation.tenant_id,generation.park_id)=(head.operation_id,head.tenant_id,head.park_id)
        WHERE head.tenant_id=$1 AND head.park_id=$2 AND head.period_month=$4::date AND generation.legacy_batch_id<>batch.id)
      ${lock ? "FOR SHARE OF batch,receipt,control" : ""}`, [scope.tenantId, scope.parkId, batchId, period]);
  if (rows.length !== 1) throw new ConflictException("Payroll source receipt is unavailable or superseded");
  return { status: "staged" };
}

/** Caller owns a READ COMMITTED transaction and retains all locks through its required audit. */
export async function lockCurrentPayrollSource(manager: EntityManager, scope: TenantParkScope, id: string, maxRecords = 5000): Promise<FrozenPayrollSource> {
  await manager.query(`LOCK TABLE ${PAYROLL_SOURCE_TABLES} IN SHARE MODE`);
  const rows: FrozenPayrollSource[] = await manager.query(`SELECT id,legacy_batch_id AS "legacyBatchId",book_id AS "bookId",to_char(period_month,'YYYY-MM') AS month,
    source_sha256 AS "sourceHash",binding_sha256 AS "bindingHash",snapshot_count AS "recordCount",item_count AS "itemCount",source_kind AS "sourceKind"
    FROM hr_payroll_reconciliation_source WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND octet_length(frozen_input::text)<=16777216 FOR SHARE`, [id, scope.tenantId, scope.parkId]);
  if (rows.length !== 1) throw new ConflictException("Choose an available frozen payroll source in the current scope");
  const source = rows[0]!;
  if (source.recordCount > maxRecords) throw new ConflictException("Frozen payroll roster exceeds the complete preparation limit");
  await readCurrentPayrollSourceBatch(manager, scope, source.legacyBatchId, source.month);
  // The existing builder verifies succeeded T4/current-database control receipts, ownership,
  // counts and binding while holding their row locks. Compare against current content, not just stored hashes.
  const [{ current_hash: currentHash }] = await manager.query(`SELECT encode(digest(hr_build_current_payroll_reconciliation_source($1,$2,$3,$4,$5::date,$6,$7,$8)::text,'sha256'),'hex') AS current_hash`,
    [scope.tenantId, scope.parkId, source.legacyBatchId, source.bookId, `${source.month}-01`, source.bindingHash, source.recordCount, source.itemCount]);
  if (currentHash !== source.sourceHash) throw new ConflictException("Frozen payroll source changed; review and freeze the complete current source again");
  return source;
}
