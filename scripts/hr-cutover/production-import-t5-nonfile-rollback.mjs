const OPERATION_ID = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const ROLLBACK_OPERATION_ID = /^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TABLES = Object.freeze(["hr_employee_custom_value", "hr_custom_field_legacy_logic_fingerprint", "hr_employee_credential", "hr_employee_skill", "hr_employee_family", "hr_employee_profile", "hr_custom_field_definition"]);

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
  if (!object(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["actorId", "operationId", "rollbackOperationId", "targetIdentitySha256", "targetScope", "tx"].sort())) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_INPUT_INVALID", "input keys differ");
  if (!input.tx || typeof input.tx.query !== "function" || !OPERATION_ID.test(input.operationId ?? "") || !ROLLBACK_OPERATION_ID.test(input.rollbackOperationId ?? "") || !SHA256.test(input.targetIdentitySha256 ?? "") || !UUID.test(input.actorId ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_INPUT_INVALID", "transaction, authorization, target, or actor invalid");
  if (!object(input.targetScope) || JSON.stringify(Object.keys(input.targetScope).sort()) !== JSON.stringify(["tenantId", "parkId", "scopeSha256"].sort()) || typeof input.targetScope.tenantId !== "string" || typeof input.targetScope.parkId !== "string" || !SHA256.test(input.targetScope.scopeSha256 ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_INPUT_INVALID", "target scope invalid");
}

async function lockedBatch(input) {
  const result = rows(await input.tx.query(
    `/* hr-prod-t5:bind-rollback-context */
     SELECT batch_id::text,run_id
     FROM hr_yuzhou_bind_t5_nonfile_rollback_context($1,$2,$3,$4,$5,$6,$7::uuid)`,
    [input.rollbackOperationId, input.operationId, input.targetIdentitySha256, input.targetScope.tenantId, input.targetScope.parkId, input.targetScope.scopeSha256, input.actorId],
  ), "bind T5 rollback authorization");
  if (result.length !== 1 || !UUID.test(result[0].batch_id ?? "") || result[0].run_id !== `${input.operationId}-t5`) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_AUTH_REQUIRED", "exactly one transaction-bound rollback authorization and T5 batch are required");
  return { batchId: result[0].batch_id, runId: result[0].run_id };
}

async function mappedCounts(tx, batchId) {
  const result = rows(await tx.query(
    `/* hr-prod-t5:rollback-map-counts */
     SELECT target_table,mapping_status,count(*)::integer AS count
     FROM legacy_record_map
     WHERE batch_id=$1::uuid AND is_active=true
     GROUP BY target_table,mapping_status`,
    [batchId],
  ), "T5 map counts");
  const counts = Object.fromEntries(TABLES.map(table => [table, { loaded: 0, quarantined: 0 }]));
  for (const row of result) {
    if (!TABLES.includes(row.target_table) || !["loaded", "verified", "quarantined"].includes(row.mapping_status) || !Number.isSafeInteger(Number(row.count)) || Number(row.count) < 0) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_DATABASE_RESULT_INVALID", "invalid mapped count");
    if (row.mapping_status === "quarantined") counts[row.target_table].quarantined += Number(row.count);
    else counts[row.target_table].loaded += Number(row.count);
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
       AND map.mapping_status IN ('loaded','verified')
       AND map.target_id=target.id AND target.tenant_id=$3 AND target.park_id=$4
     RETURNING target.id::text`,
    [batchId, table, targetScope.tenantId, targetScope.parkId],
  ), `delete ${table}`);
  if (result.length !== expected || result.some(row => !UUID.test(row.id ?? ""))) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_RESIDUAL", `${table} delete count differs`);
}

async function assertNoTargetResidual(tx, batchId, targetScope, table) {
  const result = rows(await tx.query(
    `/* hr-prod-t5:rollback-target-residual:${table} */
     SELECT count(*)::integer AS count
     FROM ${table} target
     JOIN legacy_record_map map ON map.batch_id=$1::uuid AND map.target_table=$2 AND map.target_id=target.id
     WHERE target.tenant_id=$3 AND target.park_id=$4`,
    [batchId, table, targetScope.tenantId, targetScope.parkId],
  ), `${table} rollback residual`);
  if (result.length !== 1 || Number(result[0].count) !== 0) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_RESIDUAL", `${table} target rows remain`);
}

/**
 * Reverses only rows recorded by writeT5NonfilePrivateStage in the caller's
 * already-authorized SERIALIZABLE transaction. It never searches by employee,
 * name, source key, or a broad tenant-wide predicate.
 */
export async function rollbackT5NonfilePrivateStage(input) {
  validateInput(input);
  const { batchId } = await lockedBatch(input);
  const counts = await mappedCounts(input.tx, batchId);
  for (const table of TABLES) await deleteTable(input.tx, batchId, input.targetScope, table, counts[table].loaded);
  for (const table of TABLES) await assertNoTargetResidual(input.tx, batchId, input.targetScope, table);
  const mapResult = rows(await input.tx.query(
    `/* hr-prod-t5:rollback-deactivate-maps */
     UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now()
     WHERE batch_id=$1::uuid AND is_active=true AND target_table=ANY($2::text[])
     RETURNING id::text`,
    [batchId, TABLES],
  ), "deactivate T5 maps");
  const expected = Object.values(counts).reduce((sum, value) => sum + value.loaded + value.quarantined, 0);
  if (mapResult.length !== expected) fail("PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_RESIDUAL", "mapped row count differs");
  const residual = rows(await input.tx.query(
    `/* hr-prod-t5:rollback-residual */
     SELECT count(*)::integer AS count FROM legacy_record_map
     WHERE batch_id=$1::uuid AND is_active=true`,
    [batchId],
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
