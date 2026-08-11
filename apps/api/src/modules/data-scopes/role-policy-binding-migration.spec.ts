import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(__dirname, "../../../../../");
const migration = readFileSync(
  resolve(root, "database/migrations/000205_role_policy_binding_park_scope.sql"),
  "utf8"
);
const productionSeed = readFileSync(
  resolve(root, "database/seeds/000001_s1_production_core.sql"),
  "utf8"
);
const dataScopeEntity = readFileSync(resolve(__dirname, "entities/role-data-scope.entity.ts"), "utf8");
const fieldPolicyEntity = readFileSync(
  resolve(__dirname, "../field-policies/entities/role-field-policy.entity.ts"),
  "utf8"
);

test("role policy binding uniqueness is park-scoped without changing tenant-wide definitions", () => {
  assert.match(
    migration,
    /ON rel_role_data_scope \(tenant_id, park_id, role_id, rule_id\)\s+WHERE is_deleted = false/
  );
  assert.match(
    migration,
    /ON rel_role_field_policy \(tenant_id, park_id, role_id, field_policy_id\)\s+WHERE is_deleted = false/
  );
  assert.match(
    productionSeed,
    /ON CONFLICT \(tenant_id, park_id, role_id, rule_id\) WHERE is_deleted = false/
  );
  assert.match(dataScopeEntity, /\["tenantId", "parkId", "roleId", "ruleId"\]/);
  assert.match(fieldPolicyEntity, /\["tenantId", "parkId", "roleId", "fieldPolicyId"\]/);
});
