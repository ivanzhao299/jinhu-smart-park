import assert from "node:assert/strict";
import test from "node:test";

import { ProductionImportT5NonfileRollbackError, rollbackT5NonfilePrivateStage } from "../hr-cutover/production-import-t5-nonfile-rollback.mjs";

const operationId = "yzprod-import-20260902T120000Z-abcdef123456";
const scope = { tenantId: "tenant-a", parkId: "park-a", scopeSha256: "a".repeat(64) };
const batchId = "33333333-3333-4333-8333-333333333333";

test("T5 rollback deletes only recorded rows, deactivates their maps, and proves zero active residuals", async () => {
  const calls = [];
  const tx = { async query(sql, parameters) {
    calls.push({ sql, parameters });
    if (sql.includes("lock-rollback-batch")) return { rows: [{ id: batchId }] };
    if (sql.includes("rollback-map-counts")) return { rows: [{ target_table: "hr_employee_skill", count: 1 }] };
    if (sql.includes("rollback-delete:hr_employee_skill")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
    if (sql.includes("rollback-deactivate-maps")) return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
    if (sql.includes("rollback-residual")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-finish-batch")) return { rows: [{ id: batchId }] };
    throw new Error("unexpected SQL");
  } };
  const result = await rollbackT5NonfilePrivateStage({ tx, operationId, targetScope: scope });
  assert.equal(result.residualCount, 0);
  assert.equal(result.deleted.hr_employee_skill, 1);
  assert.ok(calls.every(call => call.sql.includes("legacy_record_map") || call.sql.includes("migration_batch") || call.sql.includes("hr_employee_skill")));
  assert.ok(calls.some(call => call.sql.includes("map.batch_id=$1::uuid") && call.sql.includes("map.target_id=target.id")));
});

test("T5 rollback refuses broad or incomplete input before querying", async () => {
  const tx = { async query() { throw new Error("query must not run"); } };
  await assert.rejects(() => rollbackT5NonfilePrivateStage({ tx, operationId: "invalid", targetScope: scope }), ProductionImportT5NonfileRollbackError);
});
