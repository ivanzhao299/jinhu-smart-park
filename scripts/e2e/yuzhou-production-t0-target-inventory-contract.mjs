#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  ProductionT0TargetInventoryError,
  materializeProductionT0TargetInventory,
} from "../hr-cutover/materialize-production-t0-target-inventory.mjs";

const scope = { tenantId: "10000001", parkId: "20000001" };
const input = {
  targetIdentityMaterial: "private-runtime-identity",
  targetScope: scope,
  records: [
    { targetTable: "sys_org", targetId: "11111111-1111-4111-8111-111111111111", targetVersion: 1, targetFields: { org_code: "ROOT", org_name: "Fixture Org", org_type: "company", sort_order: 0, status: "enabled", remark: null }, derivedFields: { parent_id: null } },
    { targetTable: "hr_position", targetId: "22222222-2222-4222-8222-222222222222", targetVersion: 2, targetFields: { position_code: "P1", position_name: "Fixture Position", job_family: null, job_level: null, headcount_limit: null, status: "enabled", remark: null }, derivedFields: { org_id: "11111111-1111-4111-8111-111111111111" } },
    { targetTable: "hr_employee", targetId: "33333333-3333-4333-8333-333333333333", targetVersion: 3, targetFields: { employee_code: "E1", full_name: "Fixture Person", employment_type: "full_time", employment_status: "active", hire_date: null, probation_end_date: null, departure_date: null, work_location: null, work_mobile: null, work_email: "fixture@example.invalid", remark: null }, derivedFields: { primary_org_id: "11111111-1111-4111-8111-111111111111", position_id: "22222222-2222-4222-8222-222222222222" } },
  ],
};

const result = materializeProductionT0TargetInventory(input);
assert.deepEqual(result.targetTableCounts, { hr_employee: 1, hr_position: 1, sys_org: 1 });
assert.equal(result.status, "PASS");
assert.equal(result.productionImport, "HOLD");
assert.equal(result.records.length, 3);
assert.match(result.targetIdentitySha256, /^[0-9a-f]{64}$/u);
assert.match(result.targetScopeSha256, /^[0-9a-f]{64}$/u);
assert.doesNotMatch(JSON.stringify(result), /Fixture|E1|P1|ROOT|example/u);
assert.throws(
  () => materializeProductionT0TargetInventory({ ...input, records: [...input.records, input.records[0]] }),
  error => error instanceof ProductionT0TargetInventoryError && error.code === "PRODUCTION_IMPORT_TARGET_INVENTORY_DUPLICATE",
);
assert.throws(
  () => materializeProductionT0TargetInventory({ ...input, records: [{ ...input.records[0], targetFields: { ...input.records[0].targetFields, org_name: null } }] }),
  error => error instanceof ProductionT0TargetInventoryError && error.code === "PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID",
);

console.log("Yuzhou production T0 target inventory contract passed: host-only raw projection becomes hash-only inventory with production write held.");
