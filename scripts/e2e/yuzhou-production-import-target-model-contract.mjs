import assert from "node:assert/strict";

import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
  deriveProductionImportTargetId,
  stableProductionImportCanonicalJson,
  validateProductionImportTargetModel,
} from "../hr-cutover/production-import-target-model.mjs";

const sha = character => character.repeat(64);
const scope = { tenantId: "10000001", parkId: "20000001", scopeSha256: sha("a") };

const model = validateProductionImportTargetModel(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL);
assert.equal(model.sourceSystem, "yuzhou-v10");
const names = Object.keys(model.targetTables);
assert.equal(names.length, 16);
assert.deepEqual(
  Object.values(model.targetTables).reduce((counts, table) => ({ ...counts, [table.phase]: (counts[table.phase] ?? 0) + 1 }), {}),
  { T0: 3, T1: 1, T2: 4, T3: 8 },
);

for (const [tableName, table] of Object.entries(model.targetTables)) {
  assert.deepEqual(table.scopeColumns, ["tenant_id", "park_id"], `${tableName} exact scope`);
  assert.ok(table.fieldWhitelist.length > 0, `${tableName} whitelist`);
  assert.ok(table.allowedSourceTables.length > 0 && table.allowedSourceTables.every(value => /^dbo\.[a-z0-9_]+$/u.test(value)), `${tableName} source table allowlist`);
  assert.ok(table.requiredFields.every(field => table.fieldWhitelist.includes(field)), `${tableName} required whitelist`);
  assert.ok(table.canonicalFields.every(field => table.fieldWhitelist.includes(field) || table.derivedFields.includes(field)), `${tableName} canonical whitelist`);
  assert.ok(table.uniqueKey.every(field => [...table.scopeColumns, ...table.fieldWhitelist, ...table.derivedFields].includes(field)), `${tableName} unique key`);
  assert.ok(table.allowedDispositions.includes("insert") && table.allowedDispositions.includes("quarantine") && table.allowedDispositions.includes("skip_approved"));
  for (const denied of ["id", "tenant_id", "park_id", "create_by", "create_time", "update_by", "update_time", "version", "is_deleted"]) {
    assert.ok(!table.fieldWhitelist.includes(denied), `${tableName}.${denied} must be derived or database-owned`);
  }
}

assert.deepEqual(model.targetTables.hr_employee.foreignKeys, [
  { column: "primary_org_id", dependencyRole: "primary_org", targetTable: "sys_org", required: true },
  { column: "position_id", dependencyRole: "position", targetTable: "hr_position", required: false },
]);
assert.deepEqual(model.targetTables.hr_contract.uniqueKey, ["tenant_id", "park_id", "contract_no"]);
assert.deepEqual(model.targetTables.hr_employee_insurance_item.decimalStringFields.sort(), ["contribution_base", "employee_amount", "employer_amount", "supplement_amount", "total_amount"]);
assert.ok(!model.targetTables.hr_employment_event.allowedDispositions.includes("merge"), "immutable event cannot merge");
assert.ok(model.targetTables.sys_org.allowedDispositions.includes("merge"), "T0 master may merge only with sealed CAS approval");

const payload = { org_code: "001", org_name: "园区", org_type: "company", sort_order: 0, status: "enabled", remark: null };
const canonicalA = stableProductionImportCanonicalJson({ z: [3, { b: 2, a: 1 }], a: "x" });
const canonicalB = stableProductionImportCanonicalJson({ a: "x", z: [3, { a: 1, b: 2 }] });
assert.equal(canonicalA, canonicalB, "canonical JSON ignores object insertion order");

const targetIdA = deriveProductionImportTargetId({ targetScope: scope, targetTable: "sys_org", sourceIdentitySha256: sha("b") });
const targetIdB = deriveProductionImportTargetId({ targetScope: { ...scope }, targetTable: "sys_org", sourceIdentitySha256: sha("b") });
assert.equal(targetIdA, targetIdB);
assert.match(targetIdA, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
assert.notEqual(targetIdA, deriveProductionImportTargetId({ targetScope: scope, targetTable: "hr_position", sourceIdentitySha256: sha("b") }));

const businessA = computeProductionImportBusinessIdentityHash("sys_org", scope, payload, {}, model);
const businessB = computeProductionImportBusinessIdentityHash("sys_org", scope, { ...payload, org_name: "改名不改变业务键" }, {}, model);
assert.equal(businessA, businessB, "business identity uses the declared unique key only");
assert.notEqual(businessA, computeProductionImportBusinessIdentityHash("sys_org", scope, { ...payload, org_code: "002" }, {}, model));

const targetHashA = computeProductionImportTargetCanonicalHash("sys_org", scope, payload, {}, model);
const targetHashB = computeProductionImportTargetCanonicalHash("sys_org", scope, { status: "enabled", org_type: "company", remark: null, sort_order: 0, org_name: "园区", org_code: "001" }, {}, model);
assert.equal(targetHashA, targetHashB);
assert.notEqual(targetHashA, computeProductionImportTargetCanonicalHash("sys_org", scope, { ...payload, org_name: "园区集团" }, {}, model));

assert.throws(
  () => validateProductionImportTargetModel({ ...model, targetTables: { ...model.targetTables, sys_org: { ...model.targetTables.sys_org, fieldWhitelist: [...model.targetTables.sys_org.fieldWhitelist, "create_time"] } } }),
  /TARGET_MODEL_INVALID/u,
);

console.log("Yuzhou production import target-model contract passed: 16 tables, exact identities, stable canonical CAS");
