import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(__dirname, "../../../../../");
const migration = readFileSync(
  resolve(root, "database/migrations/000205_role_policy_binding_park_scope.sql"),
  "utf8"
);
const fieldPolicyConvergenceMigration = readFileSync(
  resolve(root, "database/migrations/000215_role_field_permission_policy_convergence.sql"),
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
const ciWorkflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
const runtimeControlRetry = readFileSync(
  resolve(root, "scripts/e2e/verify-000194-runtime-control-retry.sh"),
  "utf8"
);

test("role policy binding uniqueness is park-scoped without changing tenant-wide definitions", () => {
  assert.match(migration, /^\s*--[\s\S]*?\n\s*BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
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

test("release fixtures select the conflict identity for their migration boundary", () => {
  const legacyConflict = "ON CONFLICT (tenant_id, role_id, rule_id) WHERE is_deleted = false";
  const parkConflict =
    "ON CONFLICT (tenant_id, park_id, role_id, rule_id) WHERE is_deleted = false";
  assert.match(ciWorkflow, new RegExp(legacyConflict.replace(/[()]/g, "\\$&")));
  assert.match(runtimeControlRetry, new RegExp(legacyConflict.replace(/[()]/g, "\\$&")));
  assert.match(runtimeControlRetry, /legacy_baseline_seeds\/000001_s1_production_core\.sql/);
  assert.match(runtimeControlRetry, /fresh_baseline_seeds\/000001_s1_production_core\.sql/);
  assert.match(runtimeControlRetry, new RegExp(parkConflict.replace(/[()]/g, "\\$&")));
});

test("legacy role field-permission migration converges to authoritative field-policy bindings", () => {
  assert.match(fieldPolicyConvergenceMigration, /FROM rel_role_field_perm legacy/);
  assert.match(fieldPolicyConvergenceMigration, /CREATE TABLE IF NOT EXISTS public\.sys_role_field_policy_convergence_audit/);
  assert.match(fieldPolicyConvergenceMigration, /INSERT INTO sys_field_policy/);
  assert.match(fieldPolicyConvergenceMigration, /INSERT INTO rel_role_field_policy/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'none' THEN 'hidden'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'mask' THEN 'masked'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'read' THEN 'readonly'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'write' THEN 'editable'/);
  assert.match(
    fieldPolicyConvergenceMigration,
    /ON CONFLICT \(tenant_id, park_id, role_id, field_policy_id\) WHERE is_deleted = false DO NOTHING/
  );
  assert.match(fieldPolicyConvergenceMigration, /conflicting_field_count/);
  assert.match(fieldPolicyConvergenceMigration, /policy_precedence[\s\S]*hidden[\s\S]*masked[\s\S]*readonly[\s\S]*editable/);
  assert.match(fieldPolicyConvergenceMigration, /conflict_samples/);
  assert.match(fieldPolicyConvergenceMigration, /Deprecated legacy field-permission write model/);
});
