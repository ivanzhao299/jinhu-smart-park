import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sharedSource = readFileSync(
  new URL("../../packages/shared/src/property-business/role-templates.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL("../../database/migrations/000208_property_role_template_metadata_visible.sql", import.meta.url),
  "utf8"
);
const seed = readFileSync(
  new URL("../../database/seeds/production/000015_property_role_template_reconcile.sql", import.meta.url),
  "utf8"
);
const homestayTaskBundleMigration = readFileSync(
  new URL("../../database/migrations/000262_homestay_task_operator_read_permission.sql", import.meta.url),
  "utf8"
);
const rolesService = readFileSync(
  new URL("../../apps/api/src/modules/roles/roles.service.ts", import.meta.url),
  "utf8"
);

const templateCodes = [
  "PROPERTY_OPERATIONS_MANAGER",
  "PROPERTY_OPERATIONS_APPROVER",
  "HOMESTAY_OPERATOR",
  "HOUSING_OPERATOR",
  "HOMESTAY_FINANCE",
  "HOUSING_FINANCE",
  "PROPERTY_AUDITOR"
];

for (const code of templateCodes) {
  assert.match(sharedSource, new RegExp(`code: "${code}"`));
  assert.match(seed, new RegExp(`'${code}'`));
}
assert.doesNotMatch(sharedSource, /__[A-Z_]+__/);
assert.match(sharedSource, /PROPERTY_ROLE_TEMPLATE_DEFINITIONS\.length|PROPERTY_ROLE_TEMPLATE_DEFINITIONS/);
assert.match(sharedSource, /dataScopeRuleCode: "current_park"/);
assert.match(sharedSource, /excludedPermissions: \["party:sensitive_read"\]/);
assert.match(sharedSource, /HOMESTAY_FINANCE_OPERATOR\.code/);
assert.match(sharedSource, /HOUSING_FINANCE_OPERATOR\.code/);
assert.match(sharedSource, /findPropertyRoleTemplateDefinition/);
assert.match(sharedSource, /resolvePropertyRoleTemplatePermissionCodes/);

for (const token of [
  "BEGIN;",
  "property-role-template-preflight-failed",
  "property-role-template-permission-preflight-failed",
  "property-role-template-reconcile-incomplete",
  "property-track-b-visible-seed-drift",
  "pg_advisory_xact_lock",
  "bundle.actual_hash=expected.definition_hash",
  "managed_template_code=role.code",
  "role.is_template=true",
  "role.is_super=false",
  "rule.rule_code='current_park'",
  "EXCEPT SELECT * FROM actual",
  "SELECT * FROM actual EXCEPT"
]) {
  assert.ok(seed.includes(token), `missing seed contract token: ${token}`);
}

assert.match(seed, /permission_code='party:sensitive_read'/);
assert.match(seed, /template_code<>'PROPERTY_OPERATIONS_APPROVER'.*property_approval:decide/s);
assert.doesNotMatch(seed, /INSERT INTO sys_user|UPDATE sys_user|DELETE FROM sys_user/);
assert.doesNotMatch(seed, /code\s*=\s*'SUPER_ADMIN'.*(INSERT|UPDATE)/s);
assert.match(seed, /\('HOMESTAY_OPERATOR','民宿经办',2,'8e36158a12eff2a8ad38aa0a418463d72b3b00b433a7a547a7217c2cd71ec4e7','feb2badfa65e82c0e45170bafd0defb07549f49e161e39d836a3cb0bc8d983f3',303\)/);
assert.match(seed, /\('HOMESTAY_OPERATOR',1,'c534047821ae825a4104503ae6d5c8df2da625199b6a2471b545c230aba67267','0f18c9719cf6df9342d1d4c83a87e33283b58ebcc7fca485952250b6c7733ad0'\)/);

for (const token of [
  "property-homestay-task-operator-bundle-predecessor-drift",
  "property-homestay-task-operator-bundle-definition-drift",
  "homestay:task:read",
  "definition_version = 2",
  "7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d"
]) {
  assert.ok(homestayTaskBundleMigration.includes(token), `missing homestay task bundle migration token: ${token}`);
}

for (const token of [
  "findPropertyRoleTemplateDefinition",
  "canonicalizePropertyRoleTemplateBundleSignature",
  "resolvePropertyRoleTemplatePermissionCodes",
  "resolveManagedTemplatePermissionIds",
  "resolveManagedTemplateDataScope",
  "resolveManagedTemplateDataScopeRuleIds",
  "dataScope: \"40\"",
  "Standard property role template definition drifted",
  "Standard property role template identity drifted",
  "Standard property role template protection drifted",
  "Instantiated from shared property role template"
]) {
  assert.ok(rolesService.includes(token), `missing API template instantiation contract token: ${token}`);
}

for (const token of [
  "managed_template_code varchar(64)",
  "template_definition_hash char(64)",
  "applied_bundle_codes jsonb",
  "uq_sys_role_managed_template_tenant",
  "property-track-b-visible-definition-drift",
  "('asset:property-operations:page','page',true)",
  "('property_approval:create','api',false)"
]) {
  assert.ok(migration.includes(token), `missing migration contract token: ${token}`);
}

console.log("property role template reconcile contract passed");
