#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ProductionTargetInventoryError,
  buildProductionTargetInventorySql,
  materializeProductionTargetInventory,
} from "../hr-cutover/materialize-production-target-inventory.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "../hr-cutover/production-import-target-model.mjs";

const scope = { tenantId: "10000001", parkId: "20000001" };
const contractType = {
  targetTable: "hr_contract_type",
  targetId: "11111111-1111-4111-8111-111111111111",
  targetVersion: 3,
  targetFields: { type_code: "FIXTURE", type_name: "Fixture Contract Type", status: "enabled", is_historical_import: true, remark: null },
  derivedFields: {},
};
const insuranceItem = {
  targetTable: "hr_employee_insurance_item",
  targetId: "22222222-2222-4222-8222-222222222222",
  targetVersion: 1,
  targetFields: { insurance_kind: "fixture", contribution_base: "100.00", total_amount: "30.00", employer_amount: "20.00", employee_amount: "10.00", supplement_amount: null, legacy_base_negative: false, remark: null },
  derivedFields: { period_id: "33333333-3333-4333-8333-333333333333" },
};

const result = materializeProductionTargetInventory({ targetIdentityMaterial: "private-runtime-identity", targetScope: scope, records: [insuranceItem, contractType] });
assert.equal(result.status, "PASS");
assert.equal(result.productionImport, "HOLD");
assert.equal(result.executionReachable, false);
assert.equal(result.records.length, 2);
assert.equal(Object.keys(result.targetTableCounts).length, 16);
assert.equal(result.targetTableCounts.hr_contract_type, 1);
assert.equal(result.targetTableCounts.hr_employee_insurance_item, 1);
assert.equal(Object.values(result.targetTableCounts).reduce((sum, value) => sum + value, 0), 2);
assert.doesNotMatch(JSON.stringify(result), /FIXTURE|Fixture Contract Type|100\.00|30\.00|fixture/u);
assert.throws(
  () => materializeProductionTargetInventory({ targetIdentityMaterial: "private-runtime-identity", targetScope: scope, records: [contractType, contractType] }),
  error => error instanceof ProductionTargetInventoryError && error.code === "PRODUCTION_IMPORT_TARGET_INVENTORY_DUPLICATE",
);
assert.throws(
  () => materializeProductionTargetInventory({ targetIdentityMaterial: "private-runtime-identity", targetScope: scope, records: [{ ...insuranceItem, derivedFields: { period_id: null } }] }),
  error => error instanceof ProductionTargetInventoryError && error.code === "PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID",
);

const sql = buildProductionTargetInventorySql();
assert.match(sql, /^BEGIN TRANSACTION READ ONLY;/u);
assert.match(sql, /FROM public\."hr_contract_type"/u);
assert.match(sql, /FROM public\."hr_employee_insurance_item"/u);
for (const table of Object.keys(DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables)) assert.match(sql, new RegExp(`FROM public\\."${table}"`, "u"));
assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/iu);
assert.match(sql, /"probation_salary"::text/u);
assert.match(sql, /to_char\([^)]*"signed_at"/u);
assert.match(sql, /'targetIdentityMaterial'/u);

const hostProbe = readFileSync(new URL("../diagnose-yuzhou-hr-production-target-inventory.sh", import.meta.url), "utf8");
assert.match(hostProbe, /umask 077/u);
assert.match(hostProbe, /BEGIN TRANSACTION READ ONLY|materialize-production-target-inventory\.mjs --sql/u);
assert.match(hostProbe, /trap 'rm -f "\$query" "\$payload" "\$receipt" "\$probe_error"'/u);
assert.doesNotMatch(hostProbe, /probe="\$\(\{/u, "hash inventory must not be buffered in a shell variable");
assert.doesNotMatch(hostProbe, /(?:cat|printf).*\$payload/u, "raw production rows must never be printed");

console.log("Yuzhou production target inventory contract passed: all 16 T0-T3 target tables become a hash-only read-only inventory.");
