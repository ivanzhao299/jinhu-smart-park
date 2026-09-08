import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createLabImportPhaseRollback } from "../hr-cutover/production-import-phase-rollback.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportTargetCanonicalHash } from "../hr-cutover/production-import-target-model.mjs";

const h = value => createHash("sha256").update(value).digest("hex");
const id = index => `00000000-0000-5000-8000-${String(index).padStart(12, "0")}`;
const scope = { tenantId: "fixture-tenant", parkId: "fixture-park", scopeSha256: h("scope") };
const options = { expectedDatabase: "jinhu_hr_migration_lab_fixture", codeSha: "a".repeat(40), sourceSnapshotHash: h("source"), runId: "fixture-run" };
function fixture(table = "sys_org") {
  const rule = model.targetTables[table], phase = rule.phase;
  const business = [], records = [], maps = [];
  for (let index = 1; index <= (table === "sys_org" ? 4 : 1); index++) {
    const quarantine = index === 4;
    const payload = Object.fromEntries(rule.fieldWhitelist.map(field => [field, null]));
    if (table === "sys_org") Object.assign(payload, { org_code: `ORG-${index}`, org_name: `Fixture ${index}`, org_type: "department", sort_order: index, status: "enabled" });
    else payload.source_effective_at = "2024-01-02T03:04:05.123456+08:00";
    const derived = Object.fromEntries(rule.derivedFields.map(field => [field, null]));
    if (table === "sys_org") derived.parent_id = index > 1 && !quarantine ? id(index - 1) : null;
    const sourceIdentitySha256 = h(`source-${index}`);
    const row = { sourceSystem: model.sourceSystem, sourceTable: rule.allowedSourceTables[0], sourceIdentitySha256,
      sourcePkCanonical: `sha256:${sourceIdentitySha256}`, sourceRowSha256: h(`row-${index}`), plannedTargetTable: table,
      disposition: quarantine ? "quarantine" : "insert", dependencyRefs: table === "sys_org"
        ? index > 1 && !quarantine ? [{ role: "parent_org", phase, sourceIdentitySha256: records[index - 2].sourceIdentitySha256, expectedTargetTable: table }] : []
        : [{ role: "employee", phase: "T0", sourceIdentitySha256: h("employee"), expectedTargetTable: "hr_employee" }] };
    if (!quarantine) {
      Object.assign(row, { targetTable: table, targetId: id(index), targetVersionAfter: 1,
        expectedTargetAfterSha256: computeProductionImportTargetCanonicalHash(table, scope, payload, derived) });
      business.push({ id: row.targetId, version: 1, ...payload, ...derived });
    }
    records.push(row);
    maps.push({ id: id(index + 100), source_system: row.sourceSystem, source_table: row.sourceTable, source_pk_canonical: row.sourcePkCanonical,
      source_identity_sha256: sourceIdentitySha256, source_row_sha256: row.sourceRowSha256, target_table: table, target_id: row.targetId ?? null,
      mapping_status: quarantine ? "quarantined" : "loaded", is_active: true });
  }
  return { records, maps, business, phase, table };
}
function fake(data, changes = {}) {
  const calls = [], deleted = [];
  const batch = { id: id(999), run_id: `${options.runId}-${data.phase.toLowerCase()}`, source_system: model.sourceSystem,
    source_snapshot_sha256: options.sourceSnapshotHash, target_database: options.expectedDatabase,
    tool_version: `lab-import-v1@${options.codeSha}`, execution_context: "lab_rehearsal", status: "succeeded", ...changes.batch };
  return { calls, deleted, batch, async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("hr-lab-rollback:target")) return { rows: [{ database_name: changes.database ?? options.expectedDatabase, tenant_exists: true, park_exists: !changes.wrongScope }] };
    if (sql.includes("lock-batch")) return { rows: [batch] };
    if (sql.includes("later-phases")) return { rows: changes.later ? [{ status: "succeeded" }] : [] };
    if (sql.includes("lock-maps")) return { rows: data.maps };
    if (sql.includes("lock-business")) return { rows: data.business.filter(row => params[2].includes(row.id)) };
    if (sql.includes("bulk-delete-insert")) {
      const rows = JSON.parse(params[2]);
      for (const row of rows) {
        assert(!data.business.some(other => other.parent_id === row.id), "parent deletion before its child");
        data.business.splice(data.business.findIndex(other => other.id === row.id), 1);
        deleted.push(row.id);
      }
      return { rows };
    }
    if (sql.includes("deactivate-maps")) { for (const row of data.maps) Object.assign(row, { is_active: false, mapping_status: "rolled_back" }); return { rows: data.maps }; }
    if (sql.includes("hr-lab-rollback:items")) return { rows: [] };
    if (sql.includes("hr-lab-rollback:finish")) { batch.status = "rolled_back"; return { rows: [{ id: batch.id }] }; }
    throw new Error("unexpected query");
  } };
}
const invoke = (tx, data) => createLabImportPhaseRollback(options)({ tx, phase: data.phase, records: data.records, targetScope: scope });

test("reverse organization DAG before parents, quarantine maps inactive, audit preserved and replay rejected", async () => {
  const data = fixture(), tx = fake(data), original = structuredClone(data.records);
  const result = await invoke(tx, data);
  assert.deepEqual(tx.deleted, [id(3), id(2), id(1)]);
  assert.equal(data.business.length, 0);
  assert.deepEqual(data.records, original);
  assert.equal(result.deletedInsertCount, 3);
  assert.equal(result.quarantineNoopCount, 1);
  assert.equal(result.inactiveMapCount, 4);
  assert.equal(result.productionImport, "HOLD");
  assert(data.maps.every(row => !row.is_active && row.mapping_status === "rolled_back"));
  const sql = tx.calls.map(call => call.sql).join("\n");
  assert.doesNotMatch(sql, /hr_yuzhou_production_import|DELETE FROM migration|DELETE FROM legacy_record_map|COMMIT|BEGIN/);
  assert.match(sql, /INSERT INTO migration_batch_item/);
  assert.match(sql, /'rollback','succeeded'/);
  assert.equal(tx.calls.find(call => call.sql.includes("lock-batch")).params[0], "fixture-run-t0");
  assert.deepEqual(tx.calls.find(call => call.sql.includes("later-phases")).params[0], ["fixture-run-t1", "fixture-run-t2", "fixture-run-t3"]);
  assert.doesNotMatch(JSON.stringify(result), /sourceIdentity|targetId|Fixture/);
  await assert.rejects(invoke(tx, data), error => error.code === "LAB_ROLLBACK_ALREADY_APPLIED");
});

for (const [name, change, mutate, code] of [
  ["wrong database", { database: "jinhu_smart_park" }, null, "LAB_ROLLBACK_DATABASE_DENIED"],
  ["foreign scope", { wrongScope: true }, null, "LAB_ROLLBACK_SCOPE_DENIED"],
  ["foreign run source", { batch: { source_snapshot_sha256: h("foreign") } }, null, "LAB_ROLLBACK_BATCH_MISMATCH"],
  ["foreign code", { batch: { tool_version: "other" } }, null, "LAB_ROLLBACK_BATCH_MISMATCH"],
  ["production batch", { batch: { execution_context: "production_import" } }, null, "LAB_ROLLBACK_BATCH_MISMATCH"],
  ["later phase active", { later: true }, null, "LAB_ROLLBACK_LATER_PHASE_ACTIVE"],
  ["extra map", {}, data => data.maps.push({ ...data.maps[0], id: id(200), source_identity_sha256: h("extra") }), "LAB_ROLLBACK_MAP_COVERAGE_MISMATCH"],
  ["missing map", {}, data => data.maps.pop(), "LAB_ROLLBACK_MAP_COVERAGE_MISMATCH"],
  ["wrong source hash", {}, data => { data.maps[0].source_row_sha256 = h("drift"); }, "LAB_ROLLBACK_MAP_COVERAGE_MISMATCH"],
  ["wrong target ID", {}, data => { data.maps[0].target_id = id(55); }, "LAB_ROLLBACK_MAP_COVERAGE_MISMATCH"],
  ["wrong canonical", {}, data => { data.records[0].expectedTargetAfterSha256 = h("wrong"); }, "PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED"],
  ["wrong last row version", {}, data => { data.business[2].version = 2; }, "PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED"],
  ["missing parent", {}, data => { data.records[1].dependencyRefs[0].sourceIdentitySha256 = h("missing"); }, "LAB_ROLLBACK_DEPENDENCY_INVALID"],
  ["cycle", {}, data => { data.records[0].dependencyRefs = [{ role: "parent_org", phase: "T0", sourceIdentitySha256: data.records[2].sourceIdentitySha256, expectedTargetTable: "sys_org" }]; }, "LAB_ROLLBACK_DEPENDENCY_INVALID"],
]) test(`${name} fails before deleting any row`, async () => {
  const data = fixture(); mutate?.(data); const tx = fake(data, change);
  await assert.rejects(invoke(tx, data), error => error.code === code);
  assert.deepEqual(tx.deleted, []);
  assert(!tx.calls.some(call => call.sql.includes("deactivate-maps")));
});

test("T1 exact local microseconds survive canonical check and lossy Date rejected", async () => {
  const data = fixture("hr_employment_event"), tx = fake(data);
  await invoke(tx, data);
  assert.match(tx.calls.find(call => call.sql.includes("lock-business")).sql, /to_char\(source_effective_at,'YYYY-MM-DD"T"HH24:MI:SS.US'\)\|\|'\+08:00'/);
  const lossy = fixture("hr_employment_event");
  lossy.business[0].source_effective_at = new Date("2024-01-02T03:04:05.123+08:00");
  const lossyTx = fake(lossy);
  await assert.rejects(invoke(lossyTx, lossy), error => error.code === "PRODUCTION_IMPORT_T1_TIMESTAMP_READBACK_INVALID");
  assert.deepEqual(lossyTx.deleted, []);
});
