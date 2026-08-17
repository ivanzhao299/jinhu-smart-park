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
  assert.match(fieldPolicyConvergenceMigration, /^\s*CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\s+BEGIN;/);
  assert.match(fieldPolicyConvergenceMigration, /COMMIT;\s*$/);
  assert.match(fieldPolicyConvergenceMigration, /FROM rel_role_field_perm legacy/);
  assert.match(fieldPolicyConvergenceMigration, /CREATE TABLE IF NOT EXISTS public\.sys_role_field_policy_convergence_audit/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'biz\.leasing_%' THEN 'leasing'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'rel\.leasing_%' THEN 'leasing'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'rel\.homestay_booking_guest' THEN 'homestay'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'rel\.housing_lease_occupant' THEN 'housing_rental'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource IN \('biz\.park', 'biz\.building', 'biz\.floor', 'biz\.unit'\) THEN 'asset'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'biz\.park_tenant%' THEN 'leasing'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'biz\.work_order%' THEN 'workorder'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'biz\.homestay_%' THEN 'homestay'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'biz\.housing_%' THEN 'housing_rental'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'iot_%' THEN 'iot'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'scene_%' THEN 'iot'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'biz\.homestay_booking' THEN 'booking'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'biz\.homestay_ledger' THEN 'ledger'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'rel\.homestay_booking_guest' THEN 'guest'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'biz\.housing_lease' THEN 'lease'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'biz\.housing_handover' THEN 'handover'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'rel\.housing_lease_occupant' THEN 'occupant'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource = 'system\.file' THEN 'sys_file'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'iot_%' THEN legacy\.resource/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN legacy\.resource LIKE 'scene_%' THEN legacy\.resource/);
  assert.match(fieldPolicyConvergenceMigration, /RAISE EXCEPTION 'Cannot converge deprecated role field permissions: unmapped legacy resources remain'/);
  assert.match(fieldPolicyConvergenceMigration, /legacy_access_mode NOT IN \('none', 'mask', 'read', 'write'\)/);
  assert.match(fieldPolicyConvergenceMigration, /unknown legacy access modes remain/);
  assert.match(fieldPolicyConvergenceMigration, /INSERT INTO sys_field_policy/);
  assert.match(fieldPolicyConvergenceMigration, /INSERT INTO rel_role_field_policy/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'none' THEN 'hidden'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'mask' THEN 'masked'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'read' THEN 'readonly'/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'write' THEN 'editable'/);
  assert.match(fieldPolicyConvergenceMigration, /tmp_role_field_policy_existing_reconciliations/);
  assert.match(
    fieldPolicyConvergenceMigration,
    /ON CONFLICT \(tenant_id, module, entity, field_key\) WHERE is_deleted = false DO UPDATE SET/
  );
  assert.match(fieldPolicyConvergenceMigration, /status = 'enabled'/);
  assert.match(fieldPolicyConvergenceMigration, /COALESCE\(sys_field_policy\.mask_rule, EXCLUDED\.mask_rule, 'default'\)/);
  assert.match(fieldPolicyConvergenceMigration, /WHEN 'visible' THEN 4[\s\S]*WHEN 'editable' THEN 5/);
  assert.match(fieldPolicyConvergenceMigration, /WHERE sys_field_policy\.status <> 'enabled'[\s\S]*sys_field_policy\.policy_type IS DISTINCT FROM/);
  assert.match(fieldPolicyConvergenceMigration, /without relaxing legacy restrictions/);
  assert.match(
    fieldPolicyConvergenceMigration,
    /ON CONFLICT \(tenant_id, park_id, role_id, field_policy_id\) WHERE is_deleted = false DO NOTHING/
  );
  assert.match(fieldPolicyConvergenceMigration, /conflicting_field_count/);
  assert.match(fieldPolicyConvergenceMigration, /policy_precedence[\s\S]*hidden[\s\S]*masked[\s\S]*readonly[\s\S]*visible[\s\S]*editable/);
  assert.match(fieldPolicyConvergenceMigration, /existing_policy_reconciliations/);
  assert.match(fieldPolicyConvergenceMigration, /resource_mapping_samples/);
  assert.match(fieldPolicyConvergenceMigration, /conflict_samples/);
  assert.match(fieldPolicyConvergenceMigration, /Deprecated legacy field-permission write model/);
  assert.match(productionSeed, /policy_type = CASE[\s\S]*sys_field_policy\.policy_type[\s\S]*EXCLUDED\.policy_type/);
  assert.match(productionSeed, /ELSE COALESCE\(EXCLUDED\.mask_rule, sys_field_policy\.mask_rule\)/);
  assert.match(productionSeed, /NOT EXISTS \(\s+SELECT 1\s+FROM rel_role_field_policy link[\s\S]*link\.field_policy_id = sys_field_policy\.id/);
  assert.doesNotMatch(productionSeed, /policy_type = EXCLUDED\.policy_type,\s+mask_rule = EXCLUDED\.mask_rule,\s+status = EXCLUDED\.status/);
});
