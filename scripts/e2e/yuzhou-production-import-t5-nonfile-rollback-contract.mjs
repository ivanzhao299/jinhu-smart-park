import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ProductionImportT5NonfileRollbackError, rollbackT5NonfilePrivateStage } from "../hr-cutover/production-import-t5-nonfile-rollback.mjs";

const operationId = "yzprod-import-20260902T120000Z-abcdef123456";
const rollbackOperationId = "yzprod-rollback-20260902T130000Z-abcdef123456";
const targetIdentitySha256 = "b".repeat(64);
const actorId = "11111111-1111-4111-8111-111111111111";
const scope = { tenantId: "tenant-a", parkId: "park-a", scopeSha256: "a".repeat(64) };
const batchId = "33333333-3333-4333-8333-333333333333";
const input = tx => ({ tx, operationId, rollbackOperationId, targetIdentitySha256, targetScope: scope, actorId });
const guardMigration = readFileSync(new URL("../../database/migrations/000294_hr_yuzhou_production_import_t5_scope_rollback_guard.sql", import.meta.url), "utf8");

test("T5 rollback deletes only recorded rows, deactivates their maps, and proves zero active residuals", async () => {
  const calls = [];
  const tx = { async query(sql, parameters) {
    calls.push({ sql, parameters });
    if (sql.includes("bind-rollback-context")) return { rows: [{ batch_id: batchId, run_id: `${operationId}-t5` }] };
    if (sql.includes("rollback-map-counts")) return { rows: [{ target_table: "hr_employee_skill", mapping_status: "loaded", count: 1 }] };
    if (sql.includes("rollback-delete:hr_employee_skill")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
    if (sql.includes("rollback-target-residual:")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-deactivate-maps")) return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
    if (sql.includes("rollback-residual")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-finish-batch")) return { rows: [{ id: batchId }] };
    throw new Error("unexpected SQL");
  } };
  const result = await rollbackT5NonfilePrivateStage(input(tx));
  assert.equal(result.residualCount, 0);
  assert.equal(result.deleted.hr_employee_skill.loaded, 1);
  assert.ok(calls.some(call => call.sql.includes("map.batch_id=$1::uuid") && call.sql.includes("map.target_id=target.id")));
  const binding = calls.find(call => call.sql.includes("bind-rollback-context"));
  assert.deepEqual(binding.parameters, [rollbackOperationId, operationId, targetIdentitySha256, scope.tenantId, scope.parkId, scope.scopeSha256, actorId]);
  assert.equal(calls.some(call => call.sql.includes("set_config('yuzhou.custom_field_rollback")), false);
});

test("T5 rollback refuses broad or incomplete input before querying", async () => {
  const tx = { async query() { throw new Error("query must not run"); } };
  await assert.rejects(() => rollbackT5NonfilePrivateStage({ ...input(tx), operationId: "invalid" }), ProductionImportT5NonfileRollbackError);
});

test("T5 rollback deactivates a quarantined map without attempting a target-row delete", async () => {
  const calls = [];
  const tx = { async query(sql) {
    calls.push(sql);
    if (sql.includes("bind-rollback-context")) return { rows: [{ batch_id: batchId, run_id: `${operationId}-t5` }] };
    if (sql.includes("rollback-map-counts")) return { rows: [{ target_table: "hr_employee_skill", mapping_status: "quarantined", count: 1 }] };
    if (sql.includes("rollback-target-residual:")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-deactivate-maps")) return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
    if (sql.includes("rollback-residual")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-finish-batch")) return { rows: [{ id: batchId }] };
    throw new Error("unexpected SQL");
  } };
  const result = await rollbackT5NonfilePrivateStage(input(tx));
  assert.equal(result.deleted.hr_employee_skill.quarantined, 1);
  assert.equal(calls.some(sql => sql.includes("rollback-delete:hr_employee_skill")), false);
});

test("T5 rollback rejects any active batch map outside the exact seven-table allowlist", async () => {
  const calls = [];
  const tx = { async query(sql) {
    calls.push(sql);
    if (sql.includes("bind-rollback-context")) return { rows: [{ batch_id: batchId, run_id: `${operationId}-t5` }] };
    if (sql.includes("rollback-map-counts")) return { rows: [{ target_table: "hr_payroll_record", mapping_status: "loaded", count: 1 }] };
    throw new Error("delete must not run");
  } };
  await assert.rejects(
    () => rollbackT5NonfilePrivateStage(input(tx)),
    error => error.code === "PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_DATABASE_RESULT_INVALID",
  );
  assert.equal(calls.length, 2);
});

test("T5 rollback removes custom values and logic fingerprints before definitions and proves all targets empty", async () => {
  const calls = [];
  const tx = { async query(sql) {
    calls.push(sql);
    if (sql.includes("bind-rollback-context")) return { rows: [{ batch_id: batchId, run_id: `${operationId}-t5` }] };
    if (sql.includes("rollback-map-counts")) return { rows: [{ target_table: "hr_employee_custom_value", mapping_status: "loaded", count: 1 }, { target_table: "hr_custom_field_legacy_logic_fingerprint", mapping_status: "loaded", count: 10 }, { target_table: "hr_custom_field_definition", mapping_status: "loaded", count: 1 }] };
    if (sql.includes("rollback-delete:hr_employee_custom_value")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
    if (sql.includes("rollback-delete:hr_custom_field_legacy_logic_fingerprint")) return { rows: Array.from({ length: 10 }, (_, index) => ({ id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}` })) };
    if (sql.includes("rollback-delete:hr_custom_field_definition")) return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
    if (sql.includes("rollback-target-residual:")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-deactivate-maps")) return { rows: Array.from({ length: 12 }, (_, index) => ({ id: `66666666-6666-4666-8666-${String(index).padStart(12, "0")}` })) };
    if (sql.includes("rollback-residual")) return { rows: [{ count: 0 }] };
    if (sql.includes("rollback-finish-batch")) return { rows: [{ id: batchId }] };
    throw new Error("unexpected SQL");
  } };
  const result = await rollbackT5NonfilePrivateStage(input(tx));
  assert.equal(result.residualCount, 0);
  assert.ok(calls.findIndex(sql => sql.includes("rollback-delete:hr_employee_custom_value")) < calls.findIndex(sql => sql.includes("rollback-delete:hr_custom_field_definition")));
  assert.ok(calls.findIndex(sql => sql.includes("rollback-delete:hr_custom_field_legacy_logic_fingerprint")) < calls.findIndex(sql => sql.includes("rollback-delete:hr_custom_field_definition")));
  assert.equal(calls.filter(sql => sql.includes("rollback-target-residual:hr_employee_custom_value")).length, 1);
  assert.equal(calls.filter(sql => sql.includes("rollback-target-residual:hr_custom_field_legacy_logic_fingerprint")).length, 1);
  assert.equal(calls.filter(sql => sql.includes("rollback-target-residual:hr_custom_field_definition")).length, 1);
});

test("T5 production custom-field rollback cannot be authorized by a caller-set GUC or run id", () => {
  assert.match(guardMigration, /hr_yuzhou_bind_t5_nonfile_rollback_context/u);
  assert.match(guardMigration, /authorization_use\.intent='production_import_rollback'/u);
  assert.match(guardMigration, /rollback_operation\.t5_nonfile_execution_xid=pg_current_xact_id\(\)/u);
  assert.match(guardMigration, /rollback_operation\.t5_nonfile_executor_actor_id/u);
  assert.match(guardMigration, /batch\.production_import_actor_id=p_actor_id/u);
  assert.match(guardMigration, /rollback_operation\.t5_nonfile_executor_actor_id=batch\.production_import_actor_id/u);
  assert.match(guardMigration, /operation\.target_identity_sha256=rollback_operation\.target_identity_sha256/u);
  assert.match(guardMigration, /operation\.target_scope_sha256=public\.hr_yuzhou_production_target_scope_sha256/u);
  assert.match(guardMigration, /CREATE OR REPLACE FUNCTION hr_guard_legacy_custom_field_logic\(\)[\s\S]*hr_yuzhou_t5_nonfile_rollback_context_allowed/u);
  assert.match(guardMigration, /batch\.execution_context='lab_rehearsal'[\s\S]*current_setting\('yuzhou\.custom_field_rollback',true\)[\s\S]*OR[\s\S]*batch\.execution_context='production_import'/u);
});

test("T5 rollback fails closed before map inspection when no exact database authorization binding exists", async () => {
  const calls = [];
  const tx = { async query(sql) {
    calls.push(sql);
    if (sql.includes("bind-rollback-context")) return { rows: [] };
    throw new Error("map query must not run");
  } };
  await assert.rejects(
    () => rollbackT5NonfilePrivateStage(input(tx)),
    error => error.code === "PRODUCTION_IMPORT_T5_NONFILE_ROLLBACK_AUTH_REQUIRED",
  );
  assert.equal(calls.length, 1);
});
