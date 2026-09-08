import { ProductionImportExecutionError } from "./production-import-sealed-plan-lib.mjs";
import { probeT0BusinessRows } from "./production-import-phase-writers.mjs";
const SHA256 = /^[0-9a-f]{64}$/u;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code, detail) => { throw new ProductionImportExecutionError(code, detail); };
function oneRow(result) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) fail("T0_BUSINESS_PROBE_DATABASE_RESULT_INVALID", "one row required");
  return result.rows[0];
}

/** T0 laboratory business-row probe.
 * The pool must use a loopback endpoint (including Docker forwarding).
 * This owns a dedicated connection and never persists rows or migration metadata.
 * External encrypted quarantine artifacts remain the caller's responsibility;
 * this is not cryptographic record-map or persistent rollback validation.
 */
export async function runT0RollbackOnlyBusinessProbe(input) {
  if (!isObject(input) || Object.keys(input).some(key => !["pool", "expectedDatabase", "targetScope", "phase", "payloadBundle"].includes(key))) fail("T0_BUSINESS_PROBE_INPUT_INVALID", "invalid input");
  if (!input.pool || typeof input.pool.connect !== "function" || !["127.0.0.1", "::1", "localhost"].includes(input.pool.options?.host) ||
      !/^jinhu_hr_migration_lab_[a-z0-9_]+$/u.test(input.expectedDatabase ?? "") || input.expectedDatabase.length > 63 ||
      !isObject(input.targetScope) || !SHA256.test(input.targetScope.scopeSha256 ?? "") ||
      [input.targetScope.tenantId, input.targetScope.parkId].some(value => typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value))) {
    fail("T0_BUSINESS_PROBE_INPUT_INVALID", "laboratory binding required");
  }
  const tx = await input.pool.connect();
  let primaryCode;
  let databaseCode;
  let databaseConstraint;
  let rollbackCode;
  let rollbackVerified = false;
  let report;
  let baseline;
  let tableRows;
  const safeCode = error => error instanceof ProductionImportExecutionError && /^[A-Z0-9_]+$/u.test(error.code)
    ? error.code : "T0_BUSINESS_PROBE_DATABASE_FAILED";
  async function inventory() {
    const counts = {};
    for (const [table, rows] of tableRows) {
      const observed = oneRow(await tx.query(
        `/* hr-t0-probe:inventory:${table} */
         SELECT count(*) FILTER (WHERE tenant_id=$1 AND park_id=$2)::text AS scoped_count,
                count(*) FILTER (WHERE id=ANY($3::uuid[]))::text AS target_count FROM ${table}`,
        [input.targetScope.tenantId, input.targetScope.parkId, rows.map(row => row.record.targetId)],
      ), "probe inventory");
      if (!/^\d+$/u.test(observed.scoped_count ?? "") || observed.target_count !== "0") fail("T0_BUSINESS_PROBE_TARGET_RESIDUAL", "target inventory differs");
      counts[table] = observed.scoped_count;
    }
    return counts;
  }
  try {
    await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const database = oneRow(await tx.query("/* hr-t0-probe:database */ SELECT current_database() AS database_name"), "probe database");
    if (database.database_name !== input.expectedDatabase) fail("T0_BUSINESS_PROBE_DATABASE_DENIED", "exact laboratory database required");
    const scope = oneRow(await tx.query(
      `/* hr-t0-probe:scope */ SELECT
       EXISTS (SELECT 1 FROM sys_tenant WHERE btrim(tenant_id::text)=$1 AND status=1 AND is_deleted=false
         AND (expire_time IS NULL OR expire_time>clock_timestamp())) AS tenant_exists,
       EXISTS (SELECT 1 FROM biz_park WHERE btrim(tenant_id::text)=$1 AND btrim(park_id::text)=$2
         AND status=1 AND is_deleted=false) AS park_exists`,
      [input.targetScope.tenantId, input.targetScope.parkId],
    ), "probe scope");
    if (scope.tenant_exists !== true || scope.park_exists !== true) fail("T0_BUSINESS_PROBE_SCOPE_DENIED", "active owned scope required");
    report = await probeT0BusinessRows({ ...input, tx }, async rows => {
      tableRows = rows;
      baseline = await inventory();
    });
  } catch (error) {
    primaryCode = safeCode(error);
    databaseCode = /^[0-9A-Z]{5}$/u.test(error?.code ?? "") ? error.code : null;
    databaseConstraint = /^[a-z][a-z0-9_]{0,62}$/u.test(error?.constraint ?? "") ? error.constraint : null;
  } finally {
    try {
      await tx.query("ROLLBACK");
      if (baseline) {
        const after = await inventory();
        if (JSON.stringify(after) !== JSON.stringify(baseline)) fail("T0_BUSINESS_PROBE_SCOPE_COUNT_DRIFT", "scope counts changed");
        rollbackVerified = true;
      }
    } catch (error) {
      rollbackCode = safeCode(error);
    } finally {
      // Discard a connection whose rollback or verification failed.
      tx.release(rollbackCode ? new Error("T0_BUSINESS_PROBE_ROLLBACK_FAILED") : undefined);
    }
  }
  if (primaryCode || rollbackCode) {
    const error = new ProductionImportExecutionError(rollbackCode ? "T0_BUSINESS_PROBE_ROLLBACK_FAILED" : primaryCode, "probe failed; productionImport=HOLD");
    Object.assign(error, { primaryCode: primaryCode ?? null, databaseCode, databaseConstraint, rollbackCode: rollbackCode ?? null, rollbackVerified, productionImport: "HOLD" });
    throw error;
  }
  return { ...report, status: "PASS", persistentRollbackValidated: false, rollbackVerified, targetResidualCount: 0, scopedCountsBefore: baseline, scopedCountsAfter: baseline };
}
