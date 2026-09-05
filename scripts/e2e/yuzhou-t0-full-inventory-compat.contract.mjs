import test from "node:test";
import assert from "node:assert/strict";
import { parseLegacyPositionHeadcount, validateProductionT0DecisionInventory } from "../hr-cutover/materialize-production-t0-decision-candidates.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "../hr-cutover/production-import-target-model.mjs";

const triple = { codeSha: "a".repeat(40), sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) };
const clone = value => JSON.parse(JSON.stringify(value));
function inventory(full = true) {
  const tables = full ? Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables) : ["sys_org", "hr_position", "hr_employee"];
  const records = ["sys_org", ...(full ? ["hr_contract_type"] : [])].map((targetTable, index) => ({ targetTable,
    targetId: `${index + 1}1111111-1111-4111-8111-111111111111`, targetVersion: 1,
    businessIdentitySha256: "d".repeat(64), targetCanonicalSha256: "e".repeat(64) }));
  return { formatVersion: 1, kind: full ? "yuzhou_hr_production_target_inventory_readonly" : "yuzhou_hr_production_t0_target_inventory_readonly",
    status: "PASS", productionImport: "HOLD", executionReachable: false, targetIdentitySha256: "f".repeat(64), targetScopeSha256: "1".repeat(64),
    targetTableCounts: Object.fromEntries(tables.map(table => [table, records.filter(row => row.targetTable === table).length])), records,
    ...(full ? { sourceManifestSha256: "2".repeat(64), triple: clone(triple) } : {}) };
}
const rejects = (value, expected = triple) => assert.throws(() => validateProductionT0DecisionInventory(value, expected), { code: "PRODUCTION_IMPORT_T0_DECISION_INVENTORY_INVALID" });

test("legacy staffing limits preserve int4 values, zero and null without coercing invalid input", () => {
  for (const [source, expected] of [[0, 0], [7, 7], [" 12 ", 12], ["+8", 8], [-1, -1], ["-2147483648", -2147483648], [2147483647, 2147483647], [null, null], [undefined, null], ["", null], ["  ", null]]) {
    assert.deepEqual(parseLegacyPositionHeadcount(source), { value: expected, valid: true });
  }
  for (const source of [true, false, [], {}, "null", "1.2", 1.5, "1e2", "0x10", "unknown", 2147483648, -2147483649, Infinity, NaN]) {
    assert.deepEqual(parseLegacyPositionHeadcount(source), { value: null, valid: false });
  }
});

test("full inventory validates all tables then exposes only T0 lookup, preserving full provenance", () => {
  const original = inventory();
  const snapshot = clone(original);
  const result = validateProductionT0DecisionInventory(original, triple);
  assert.equal(result.records.size, 1);
  assert.equal([...result.records.values()][0].targetTable, "sys_org");
  assert.deepEqual(result.value, snapshot);
  assert.deepEqual(original, snapshot);
  assert.equal(result.value.records.length, 2);
});
test("legacy three-table receipt remains supported without manufactured provenance", () => {
  const result = validateProductionT0DecisionInventory(inventory(false), triple);
  assert.equal(result.records.size, 1);
  assert.equal(result.value.sourceManifestSha256, undefined);
});
test("missing or drifted full-inventory C/S/M rejected", () => {
  for (const key of Object.keys(triple)) {
    const next = inventory(); next.triple[key] = (key === "codeSha" ? "9".repeat(40) : "9".repeat(64)); rejects(next);
  }
  const missing = inventory(); delete missing.triple; rejects(missing);
  rejects(inventory(), null);
  const malformed = inventory(); malformed.triple.sourceSnapshotHash = [triple.sourceSnapshotHash]; rejects(malformed);
});
test("source binding and non-executable receipt required", () => {
  for (const value of [undefined, "invalid", ["2".repeat(64)]]) {
    const next = inventory(); next.sourceManifestSha256 = value; rejects(next);
  }
  for (const patch of [{ status: "FAIL" }, { productionImport: "READY" }, { executionReachable: true }, { extra: true }]) rejects({ ...inventory(), ...patch });
});
test("unknown, missing or mismatched non-T0 counts cannot disappear in T0 projection", () => {
  const unknown = inventory(); unknown.targetTableCounts.unknown = 0; rejects(unknown);
  const missing = inventory(); delete missing.targetTableCounts.hr_contract; rejects(missing);
  const drift = inventory(); drift.targetTableCounts.hr_contract_type = 0; rejects(drift);
  const legacy = inventory(false); legacy.targetTableCounts.hr_contract = 0; rejects(legacy);
});
test("malformed or duplicate non-T0 records fail before projection", () => {
  for (const patch of [{ targetCanonicalSha256: "bad" }, { businessIdentitySha256: ["d".repeat(64)] }, { targetId: "" }, { targetVersion: -1 }, { targetTable: "unknown" }, { rawValue: "synthetic" }]) {
    const next = inventory(); Object.assign(next.records[1], patch); rejects(next);
  }
  const duplicate = inventory(); duplicate.records.push(clone(duplicate.records[1])); duplicate.targetTableCounts.hr_contract_type += 1; rejects(duplicate);
  const duplicateId = inventory(); duplicateId.records.push({ ...duplicateId.records[1], businessIdentitySha256: "3".repeat(64) }); duplicateId.targetTableCounts.hr_contract_type += 1; rejects(duplicateId);
});
