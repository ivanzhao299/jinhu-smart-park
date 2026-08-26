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
const housingApproverMigration = readFileSync(
  new URL("../../database/migrations/000263_housing_approver_task_read_permission.sql", import.meta.url),
  "utf8"
);
const trackBSeed = readFileSync(
  new URL("../../database/seeds/production/000006_property_track_b_permission_reconcile.sql", import.meta.url),
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
assert.match(seed, /\('PROPERTY_OPERATIONS_APPROVER',1,'ec8371f75e168bb260873f135d9ab1677123714770cff7ccea83e115a8015102','9bb64e651981515dfbca11fc3d495f3eb4f01551fee54cfd2807b9eadba96972'\)/);

for (const token of [
  "property-homestay-task-operator-bundle-predecessor-drift",
  "property-homestay-task-operator-bundle-definition-drift",
  "property-homestay-task-operator-permission-cardinality-drift tenants=",
  "affected_tenants AS",
  "role.applied_bundle_codes ? 'property-bundle:property-homestay-task-operator'",
  "active_api_permission_count",
  "tenant_id || ':total=' || permission_count::text",
  "WHERE permission_count<>1 OR active_api_permission_count<>1",
  "target_definition_version=2",
  "target_drift_count=0",
  "predecessor_drift_count=0",
  "homestay:task:read",
  "definition_version = 2",
  "7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d"
]) {
  assert.ok(homestayTaskBundleMigration.includes(token), `missing homestay task bundle migration token: ${token}`);
}
assert.doesNotMatch(homestayTaskBundleMigration, /SELECT count\(\*\) INTO permission_count\s+FROM sys_permission/);
assert.match(
  homestayTaskBundleMigration,
  /FILTER \(\s*WHERE permission\.permission_type='api'\s+AND permission\.is_enabled=true\s+AND permission\.status='enabled'\s+AND permission\.is_deleted=false\s*\)/s
);
assert.match(trackBSeed, /bundle_member_count <> 131/);
assert.match(trackBSeed, /bundle_permission_count <> 56/);
assert.match(trackBSeed, /resolved_bundle_permission_count <> 56/);

for (const token of [
  "property-housing-approver-bundle-predecessor-drift",
  "property-housing-approver-permission-cardinality-drift tenants=",
  "Copied from role PROPERTY_OPERATIONS_APPROVER",
  "managed_template_code='PROPERTY_OPERATIONS_APPROVER'",
  "role.applied_bundle_codes='[\"property-bundle:property-homestay-approver\",\"property-bundle:property-housing-approver\"]'::jsonb",
  "housing:task:read",
  "definition_version=2",
  "7e08f8fe91b9889d1769f72d92d4cd5de395d0ba5dacd20acf00d1d810783d3e",
  "38ef71a8cd4b612c1683334f5575678b5d50af9dce4af42faffde0b9da4b68d5",
  "1474c9b46fbab59394d3e7d43d181c6cc3f2b32dd0fcbd527e8d9b43a060376e"
]) {
  assert.ok(housingApproverMigration.includes(token), `missing housing approver migration token: ${token}`);
}
assert.doesNotMatch(housingApproverMigration, /tenant_id\s*=\s*'10000001'/);

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
