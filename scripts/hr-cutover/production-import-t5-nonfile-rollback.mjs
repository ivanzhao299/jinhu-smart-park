const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TABLES = Object.freeze(["hr_employee_credential", "hr_employee_skill", "hr_employee_family", "hr_employee_profile"]);

export class ProductionImportT5NonfileRollbackError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportT5NonfileRollbackError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportT5NonfileRollbackError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const rows = (result, label) => {
  if (!result || !Array.isArray(result.rows)) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_DATABASE_RESULT_INVALID", `${label} returned no rows`);
  return result.rows;
};

function validateInput(input) {
  if (!object(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["operationId", "targetScope", "tx"].sort())) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_INPUT_INVALID", "input keys differ");
  if (!input.tx || typeof input.tx.query !== "function" || !OPERATION_ID.test(input.operationId ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_INPUT_INVALID", "transaction or operation invalid");
  if (!object(input.targetScope) || JSON.stringify(Object.keys(input.targetScope).sort()) !== JSON.stringify(["tenantId", "parkId", "scopeSha256"].sort()) || typeof input.targetScope.tenantId !== "string" || typeof input.targetScope.parkId !== "string") fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_INPUT_INVALID", "target scope invalid");
}

async function lockedBatch(tx, operationId) {
  const result = rows(await tx.query(
    `/* hr-prod-t5:lock-rollback-batch */
     SELECT id::text FROM migration_batch
     WHERE production_import_operation_id=$1 AND production_import_phase='T5' AND execution_context='production_import' AND status='succeeded'
     FOR UPDATE`,
    [operationId],
  ), "lock T5 batch");
  if (result.length !== 1 || !UUID.test(result[0].id ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_BATCH_REQUIRED", "exactly one successful T5 batch is required");
  return result[0].id;
}

async function mappedCounts(tx, batchId) {
  const result = rows(await tx.query(
    `/* hr-prod-t5:rollback-map-counts */
     SELECT target_table,count(*)::integer AS count
     FROM legacy_record_map
     WHERE batch_id=$1::uuid AND is_active=true AND target_table=ANY($2::text[])
     GROUP BY target_table`,
    [batchId, TABLES],
  ), "T5 map counts");
  const counts = Object.fromEntries(TABLES.map(table => [table, 0]));
  for (const row of result) {
    if (!TABLES.includes(row.target_table) || !Number.isSafeInteger(Number(row.count)) || Number(row.count) < 0) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_DATABASE_RESULT_INVALID", "invalid mapped count");
    counts[row.target_table] = Number(row.count);
  }
  return counts;
}

async function deleteTable(tx, batchId, targetScope, table, expected) {
  if (expected === 0) return;
  const result = rows(await tx.query(
    `/* hr-prod-t5:rollback-delete:${table} */
     DELETE FROM ${table} target
     USING legacy_record_map map
     WHERE map.batch_id=$1::uuid AND map.is_active=true AND map.target_table=$2
       AND map.target_id=target.id AND target.tenant_id=$3 AND target.park_id=$4
     RETURNING target.id::text`,
    [batchId, table, targetScope.tenantId, targetScope.parkId],
  ), `delete ${table}`);
  if (result.length !== expected || result.some(row => !UUID.test(row.id ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_RESIDUAL", `${table} delete count differs`);
}

/**
 * Reverses only rows recorded by writeT5NonfilePrivateStage in the caller's
 * already-authorized SERIALIZABLE transaction. It never searches by employee,
 * name, source key, or a broad tenant-wide predicate.
 */
export async function rollbackT5NonfilePrivateStage(input) {
  validateInput(input);
  const batchId = await lockedBatch(input.tx, input.operationId);
  const counts = await mappedCounts(input.tx, batchId);
  for (const table of TABLES) await deleteTable(input.tx, batchId, input.targetScope, table, counts[table]);
  const mapResult = rows(await input.tx.query(
    `/* hr-prod-t5:rollback-deactivate-maps */
     UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now()
     WHERE batch_id=$1::uuid AND is_active=true AND target_table=ANY($2::text[])
     RETURNING id::text`,
    [batchId, TABLES],
  ), "deactivate T5 maps");
  const expected = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (mapResult.length !== expected) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_RESIDUAL", "mapped row count differs");
  const residual = rows(await input.tx.query(
    `/* hr-prod-t5:rollback-residual */
     SELECT count(*)::integer AS count FROM legacy_record_map
     WHERE batch_id=$1::uuid AND is_active=true AND target_table=ANY($2::text[])`,
    [batchId, TABLES],
  ), "T5 rollback residual");
  if (residual.length !== 1 || Number(residual[0].count) !== 0) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_RESIDUAL", "active T5 maps remain");
  const batch = rows(await input.tx.query(
    `/* hr-prod-t5:rollback-finish-batch */
     UPDATE migration_batch SET status='rolled_back',phase='rollback',finished_at=now(),update_time=now()
     WHERE id=$1::uuid AND status='succeeded' RETURNING id::text`,
    [batchId],
  ), "finish T5 rollback");
  if (batch.length !== 1 || batch[0].id !== batchId) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_DATABASE_RESULT_INVALID", "T5 batch state differs");
  return { phase: "T5", migrationBatchId: batchId, status: "rolled_back", deleted: counts, residualCount: 0 };
}
