import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { runT0RollbackOnlyBusinessProbe } from "../hr-cutover/t0-rollback-only-business-probe.mjs";
import { computeProductionImportPayloadHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { computeProductionImportBusinessIdentityHash, computeProductionImportTargetCanonicalHash, deriveProductionImportTargetId } from "../hr-cutover/production-import-target-model.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const targetScope = { tenantId: "synthetic-tenant", parkId: "synthetic-park", scopeSha256: hash("scope") };
const expectedDatabase = "jinhu_hr_migration_lab_synthetic";
function fixture() {
  const records = [];
  const bundles = [];
  for (let index = 0; index < 3; index++) {
    const payload = { org_code: `TEST-${index}`, org_name: `Synthetic ${index}`, org_type: "department", sort_order: index,
      status: "enabled", remark: null, contact_phone: "", planned_headcount: 0, legacy_source_id: index };
    const sourceIdentitySha256 = hash(`source-${index}`);
    const targetId = deriveProductionImportTargetId({ targetScope, targetTable: "sys_org", sourceIdentitySha256 });
    const derived = { parent_id: index === 1 ? records[0].targetId : null };
    const record = { sourceSystem: "yuzhou-v10", sourceTable: "dbo.departmentcode", sourcePkCanonical: `sha256:${sourceIdentitySha256}`,
      sourceIdentitySha256, sourceRowSha256: hash(`row-${index}`), payloadSha256: computeProductionImportPayloadHash(payload),
      plannedTargetTable: "sys_org", disposition: index === 2 ? "quarantine" : "insert", dependencyRefs: index === 1
        ? [{ phase: "T0", role: "parent_org", expectedTargetTable: "sys_org", sourceIdentitySha256: records[0].sourceIdentitySha256 }] : [] };
    if (index !== 2) Object.assign(record, { targetId, targetTable: "sys_org", targetVersionAfter: 1,
      expectedTargetAfterSha256: computeProductionImportTargetCanonicalHash("sys_org", targetScope, payload, derived),
      businessIdentitySha256: computeProductionImportBusinessIdentityHash("sys_org", targetScope, payload, derived) });
    records.push(record);
    bundles.push({ sourceIdentitySha256, sourceRowSha256: record.sourceRowSha256, targetTable: "sys_org", payloadSha256: record.payloadSha256, payload });
  }
  return { targetScope, expectedDatabase, phase: { phase: "T0", records: records.reverse() }, payloadBundle: { phase: "T0", targetScope, records: bundles } };
}
function pool(options = {}) {
  const calls = [];
  const inserted = new Map();
  let releaseError;
  return { options: { host: options.host ?? "127.0.0.1" }, calls, inserted,
    get releaseError() { return releaseError; },
    async connect() {
      calls.push("connect");
      return { release(error) { releaseError = error; calls.push("release"); }, async query(sql, params) {
        calls.push(sql);
        if (sql === "ROLLBACK") {
          if (options.rollbackFailure) throw new Error("private rollback details");
          if (!options.residual) inserted.clear();
          return { rows: [] };
        }
        if (sql.startsWith("BEGIN")) return { rows: [] };
        if (sql.includes("hr-t0-probe:database")) return { rows: [{ database_name: options.database ?? expectedDatabase }] };
        if (sql.includes("hr-t0-probe:scope")) return { rows: [{ tenant_exists: true, park_exists: !options.wrongScope }] };
        if (sql.includes("hr-t0-probe:inventory")) return { rows: [{ scoped_count: "14", target_count: options.collision || params[2].some(id => inserted.has(id)) ? "1" : "0" }] };
        if (sql.includes("hr-prod-phase:bulk-insert")) {
          if (options.sqlFailure) throw Object.assign(new Error("private SQL details"), { code: "23514", constraint: "ck_hr_employee_dates" });
          const rows = JSON.parse(params[0]);
          for (const row of rows) inserted.set(row.id, row);
          return { rows };
        }
        if (sql.includes("hr-prod-phase:lock-existing")) return { rows: params[2].map(id => ({ ...inserted.get(id), ...(options.readbackDrift ? { org_name: "drift" } : {}) })) };
        throw new Error("unexpected query");
      } };
    } };
}

test("synthetic T0 inserts parents first, verifies all fields, quarantines without writes, rolls back on one connection", async () => {
  const input = fixture();
  const original = structuredClone(input);
  const db = pool();
  const report = await runT0RollbackOnlyBusinessProbe({ ...input, pool: db });
  assert.deepEqual(input, original);
  assert.equal(report.insertedCount, 2);
  assert.equal(report.quarantinedCount, 1);
  assert.equal(report.productionImport, "HOLD");
  assert.equal(report.rollbackVerified, true);
  assert.equal(report.cryptographicMapsValidated, false);
  assert.equal(report.persistentRollbackValidated, false);
  assert.equal(db.inserted.size, 0);
  assert.equal(db.calls[1], "BEGIN ISOLATION LEVEL SERIALIZABLE");
  assert.equal(db.calls.filter(sql => sql === "ROLLBACK").length, 1);
  assert.equal(db.calls.at(-1), "release");
  assert.equal(db.calls.filter(sql => sql.includes("bulk-insert")).length, 2);
  assert.equal(db.calls.filter(sql => sql.includes("lock-existing")).length, 2);
  assert.doesNotMatch(db.calls.join("\n"), /COMMIT|migration_batch|legacy_record_map|production_import_operation|bulk-merge/);
  assert.doesNotMatch(JSON.stringify(report), /Synthetic|sourceIdentity|targetId|TEST-/);
});

for (const [name, opts, mutate, code] of [
  ["wrong actual database", { database: "jinhu_smart_park" }, null, "T0_BUSINESS_PROBE_DATABASE_DENIED"],
  ["wrong scope", { wrongScope: true }, null, "T0_BUSINESS_PROBE_SCOPE_DENIED"],
  ["existing target IDs", { collision: true }, null, "T0_BUSINESS_PROBE_TARGET_RESIDUAL"],
  ["SQL failure", { sqlFailure: true }, null, "T0_BUSINESS_PROBE_DATABASE_FAILED"],
  ["canonical readback failure", { readbackDrift: true }, null, "PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED"],
  ["non T0", {}, input => { input.phase.phase = "T1"; }, "PRODUCTION_IMPORT_PHASE_WRITER_INPUT_INVALID"],
  ["merge", {}, input => { const row = input.phase.records[2]; Object.assign(row, { disposition: "merge", expectedTargetBeforeSha256: row.expectedTargetAfterSha256, expectedTargetVersionBefore: 0 }); }, "T0_BUSINESS_PROBE_DISPOSITION_DENIED"],
  ["missing parent", {}, input => { input.phase.records[1].dependencyRefs[0].sourceIdentitySha256 = hash("absent"); }, "PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED"],
  ["quarantined parent", {}, input => { input.phase.records[1].dependencyRefs[0].sourceIdentitySha256 = input.phase.records[0].sourceIdentitySha256; }, "PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED"],
  ["wrong role", {}, input => { input.phase.records[1].dependencyRefs[0].role = "employee"; }, "PRODUCTION_IMPORT_DEPENDENCY_INVALID"],
  ["cross phase reference", {}, input => { input.phase.records[1].dependencyRefs[0].phase = "T1"; }, "PRODUCTION_IMPORT_DEPENDENCY_INVALID"],
  ["payload scope mismatch", {}, input => { input.payloadBundle.targetScope = { ...targetScope, parkId: "another" }; }, "T0_BUSINESS_PROBE_SCOPE_DENIED"],
]) test(`${name} fails closed and releases after rollback`, async () => {
  const input = fixture();
  mutate?.(input);
  const db = pool(opts);
  await assert.rejects(runT0RollbackOnlyBusinessProbe({ ...input, pool: db }), error => error.code === code && !/private/.test(error.message));
  assert.equal(db.calls.filter(sql => sql === "ROLLBACK").length, 1);
  assert.equal(db.calls.at(-1), "release");
  assert.equal(db.inserted.size, 0);
});

test("failed rollback preserves both stable codes and discards connection", async () => {
  const db = pool({ sqlFailure: true, rollbackFailure: true });
  await assert.rejects(runT0RollbackOnlyBusinessProbe({ ...fixture(), pool: db }), error =>
    error.code === "T0_BUSINESS_PROBE_ROLLBACK_FAILED" && error.primaryCode === "T0_BUSINESS_PROBE_DATABASE_FAILED" &&
    error.rollbackCode === "T0_BUSINESS_PROBE_DATABASE_FAILED" && !error.rollbackVerified && !/private/.test(error.message));
  assert(db.releaseError);
});

test("SQL errors retain stable diagnostics without raw row details", async () => {
  const db = pool({ sqlFailure: true });
  await assert.rejects(runT0RollbackOnlyBusinessProbe({ ...fixture(), pool: db }), error =>
    error.databaseCode === "23514" && error.databaseConstraint === "ck_hr_employee_dates" &&
    error.rollbackVerified && !/private/.test(error.message));
});
test("residual after successful rollback cannot report pass", async () => {
  const db = pool({ residual: true });
  await assert.rejects(runT0RollbackOnlyBusinessProbe({ ...fixture(), pool: db }), error => error.code === "T0_BUSINESS_PROBE_ROLLBACK_FAILED" && !error.rollbackVerified);
  assert(db.releaseError);
});
test("remote pool endpoint or unsafe expected database rejected before connection", async () => {
  for (const override of [{ pool: pool({ host: "db.example" }) }, { expectedDatabase: "jinhu_smart_park" }]) {
    const db = override.pool ?? pool();
    await assert.rejects(runT0RollbackOnlyBusinessProbe({ ...fixture(), pool: db, ...override }), error => error.code === "T0_BUSINESS_PROBE_INPUT_INVALID");
    assert.deepEqual(db.calls, []);
  }
});
