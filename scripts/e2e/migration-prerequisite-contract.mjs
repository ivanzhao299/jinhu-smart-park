import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migrationPrerequisitesRoot = resolve(root, "database/migration-prerequisites");
const reviewedPrerequisiteFiles = [
  "000064_s3e_checkout_effective/001_core_role_templates.sql",
  "000189_property_b_module_rbac_definitions/001_asset_module.sql",
  "000189_property_b_module_rbac_definitions/002_asset_park_scope_id_unification.sql",
  "000189_property_b_module_rbac_definitions/003_asset_park_scope_reconcile.sql",
  "000193_property_b_runtime_integrity_forward_fix/001_property_runtime_checkpoint.sql",
  "000194_property_task_projection_contract_correction/001_property_runtime_control.sql",
  "000194_property_task_projection_contract_correction/002_runtime_control_scope_reconcile.sql",
  "000200_property_b_migration_compatibility_control/001_sign_forward_declared_runtime_catalog.sql"
];
const discoveredPrerequisiteFiles = readdirSync(migrationPrerequisitesRoot, {
  withFileTypes: true
})
  .filter((entry) => entry.isDirectory())
  .flatMap((directory) =>
    readdirSync(resolve(migrationPrerequisitesRoot, directory.name), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => `${directory.name}/${entry.name}`)
  )
  .sort();
assert.deepEqual(
  discoveredPrerequisiteFiles,
  reviewedPrerequisiteFiles,
  "every migration prerequisite SQL file must be explicitly added to this review contract"
);
const migrationPath = resolve(root, "database/migrations/000175_2026_responsibility_user_role_queue.sql");
const prerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000064_s3e_checkout_effective/001_core_role_templates.sql"
);
const propertyModuleMigrationPath = resolve(
  root,
  "database/migrations/000189_property_b_module_rbac_definitions.sql"
);
const assetModulePrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000189_property_b_module_rbac_definitions/001_asset_module.sql"
);
const assetParkScopeIdPrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000189_property_b_module_rbac_definitions/002_asset_park_scope_id_unification.sql"
);
const assetParkScopePrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000189_property_b_module_rbac_definitions/003_asset_park_scope_reconcile.sql"
);
const assetParkScopeSeedPath = resolve(
  root,
  "database/seeds/production/000007_asset_park_scope_reconcile.sql"
);
const propertyRuntimeControlSeedPath = resolve(
  root,
  "database/seeds/production/000008_property_runtime_control_scope_reconcile.sql"
);
const adminIssueRunnerMigrationPath = resolve(
  root,
  "database/migrations/000190_admin_issue_runner_repair.sql"
);
const propertyRuntimeIntegrityMigrationPath = resolve(
  root,
  "database/migrations/000193_property_b_runtime_integrity_forward_fix.sql"
);
const propertyRuntimeCheckpointPrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000193_property_b_runtime_integrity_forward_fix/001_property_runtime_checkpoint.sql"
);
const propertyTaskProjectionMigrationPath = resolve(
  root,
  "database/migrations/000194_property_task_projection_contract_correction.sql"
);
const propertyRuntimeControlPrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000194_property_task_projection_contract_correction/001_property_runtime_control.sql"
);
const propertyRuntimeControlScopePrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000194_property_task_projection_contract_correction/002_runtime_control_scope_reconcile.sql"
);
const propertyCompatibilityMigrationPath = resolve(
  root,
  "database/migrations/000200_property_b_migration_compatibility_control.sql"
);
const propertyCompatibilitySignaturePrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000200_property_b_migration_compatibility_control/001_sign_forward_declared_runtime_catalog.sql"
);
const permissionRepairSeedPath = resolve(
  root,
  "database/seeds/production/000004_core_role_permission_repair.sql"
);
const runnerPath = resolve(root, "scripts/db-migrate.sh");
const migrationAliasesPath = resolve(root, "database/migration-history-aliases.txt");
const migrationReplacementsPath = resolve(root, "database/migration-replacements.txt");
const propertyCompatibilityReplacementPatchPath = resolve(
  root,
  "database/migration-replacements/000200_property_b_migration_compatibility_control.patch"
);
const productionDeployWorkflowPath = resolve(root, ".github/workflows/deploy-production.yml");
const assetScopeDiagnosticPath = resolve(root, "scripts/diagnose-000189-asset-scope.sh");
const runtimeControlDiagnosticPath = resolve(root, "scripts/diagnose-000194-runtime-control.sh");
const retiredRuntimeOwnerRepairPath = resolve(root, "scripts/repair-000194-retired-runtime-owner.sh");
const canonicalSourceMigrationPath = resolve(
  root,
  "database/migrations/000207_asset_scope_canonical_source_reconcile.sql"
);
const productionDeployScriptPath = resolve(root, "scripts/prod-deploy.sh");
const canonicalSourceFixturePath = resolve(
  root,
  "scripts/e2e/verify-000207-canonical-source-reconcile.sh"
);

const migration = readFileSync(migrationPath);
const prerequisite = readFileSync(prerequisitePath, "utf8");
const propertyModuleMigration = readFileSync(propertyModuleMigrationPath);
const assetModulePrerequisite = readFileSync(assetModulePrerequisitePath, "utf8");
const assetParkScopeIdPrerequisite = readFileSync(assetParkScopeIdPrerequisitePath, "utf8");
const assetParkScopePrerequisite = readFileSync(assetParkScopePrerequisitePath, "utf8");
const assetParkScopeSeed = readFileSync(assetParkScopeSeedPath, "utf8");
const propertyRuntimeControlSeed = readFileSync(propertyRuntimeControlSeedPath, "utf8");
const canonicalSourceMigration = readFileSync(canonicalSourceMigrationPath, "utf8");
const productionDeployScript = readFileSync(productionDeployScriptPath, "utf8");
const canonicalSourceFixture = readFileSync(canonicalSourceFixturePath, "utf8");
const adminIssueRunnerMigration = readFileSync(adminIssueRunnerMigrationPath);
const propertyRuntimeIntegrityMigration = readFileSync(propertyRuntimeIntegrityMigrationPath);
const propertyRuntimeCheckpointPrerequisite = readFileSync(
  propertyRuntimeCheckpointPrerequisitePath,
  "utf8"
);
const propertyTaskProjectionMigration = readFileSync(propertyTaskProjectionMigrationPath);
const propertyRuntimeControlPrerequisite = readFileSync(
  propertyRuntimeControlPrerequisitePath,
  "utf8"
);
const propertyRuntimeControlScopePrerequisite = readFileSync(
  propertyRuntimeControlScopePrerequisitePath,
  "utf8"
);
const propertyCompatibilityMigration = readFileSync(propertyCompatibilityMigrationPath, "utf8");
const propertyCompatibilitySignaturePrerequisite = readFileSync(
  propertyCompatibilitySignaturePrerequisitePath,
  "utf8"
);
const permissionRepairSeed = readFileSync(permissionRepairSeedPath, "utf8");
const runner = readFileSync(runnerPath, "utf8");
const migrationAliases = readFileSync(migrationAliasesPath, "utf8");
const migrationReplacements = readFileSync(migrationReplacementsPath, "utf8");
const propertyCompatibilityReplacementPatch = readFileSync(
  propertyCompatibilityReplacementPatchPath,
  "utf8"
);
const productionDeployWorkflow = readFileSync(productionDeployWorkflowPath, "utf8");
const assetScopeDiagnostic = readFileSync(assetScopeDiagnosticPath, "utf8");
const runtimeControlDiagnostic = readFileSync(runtimeControlDiagnosticPath, "utf8");
const retiredRuntimeOwnerRepair = readFileSync(retiredRuntimeOwnerRepairPath, "utf8");
const withoutPinnedSearchPath = (sql) =>
  sql.replace(/^SET search_path = public, pg_catalog;\n\n/u, "").trim();

assert.equal(
  createHash("sha256").update(migration).digest("hex"),
  "5daaca3cb4a48b40c258446c36427c49ad657bd4d95de388ca9661c3cd52c89c",
  "historical migration 000175 must remain byte-for-byte unchanged"
);

assert.equal(
  createHash("sha256").update(propertyModuleMigration).digest("hex"),
  "f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2",
  "historical migration 000189 must remain byte-for-byte unchanged"
);

assert.equal(
  createHash("sha256").update(adminIssueRunnerMigration).digest("hex"),
  "be32f4b806141df07cc4793ce87a1d2f7785c55b6ea848818700b0f2630f04a0",
  "main-canonical migration 000190 must remain byte-for-byte unchanged"
);

assert.equal(
  createHash("sha256").update(propertyRuntimeIntegrityMigration).digest("hex"),
  "c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07",
  "historical migration 000193 must remain byte-for-byte unchanged"
);
assert.equal(
  createHash("sha256").update(propertyTaskProjectionMigration).digest("hex"),
  "93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0",
  "historical migration 000194 must remain byte-for-byte unchanged"
);
assert.equal(
  createHash("sha256").update(propertyCompatibilityMigration).digest("hex"),
  "da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a",
  "reviewed migration 000200 must remain byte-for-byte unchanged"
);
assert.equal(
  createHash("sha256")
    .update(propertyCompatibilitySignaturePrerequisite)
    .digest("hex"),
  "685bf06141d5769c6139fa4e4c8f7453438997e3dd05f93c8979a98d2e5c978c",
  "reviewed 000200 catalog-signature prerequisite must remain byte-for-byte unchanged"
);
assert.equal(
  createHash("sha256").update(propertyCompatibilityReplacementPatch).digest("hex"),
  "06fe3ae6d3a4d70bcb3c1d55ab1af367c3c95ac9f9e2d4aee03524e2497d13c9",
  "000200 replacement patch must remain byte-for-byte reviewed"
);
assert.deepEqual(
  migrationReplacements
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")),
  [
    "000200_property_b_migration_compatibility_control.sql|da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a|000200_property_b_migration_compatibility_control.patch|06fe3ae6d3a4d70bcb3c1d55ab1af367c3c95ac9f9e2d4aee03524e2497d13c9|d7dff444c2c7969618ee7de846b8a0fdccb02d57844477e916c2b2742d0d004b"
  ],
  "every migration replacement must be explicitly reviewed"
);
for (const replacementContract of [
  "property-runtime-control-migration-stage-drift",
  "property-runtime-control-correction-audit-drift",
  "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944",
  "b2a-contract-correction-000195",
  "requires_correction_audit",
  "runtime-control-contract-audit-v1",
  "runtime-control-contract-audit-v2",
  "evidence_hash",
  "approval_reference"
]) {
  assert.match(
    propertyCompatibilityReplacementPatch,
    new RegExp(replacementContract),
    `000200 replacement is missing ${replacementContract}`
  );
}

assert.match(
  propertyRuntimeCheckpointPrerequisite,
  /CREATE TABLE IF NOT EXISTS biz_property_runtime_checkpoint\s*\(/u
);
const authoritativeRuntimeCheckpointDefinition = propertyCompatibilityMigration.match(
  /CREATE TABLE IF NOT EXISTS biz_property_runtime_checkpoint \([\s\S]*?CREATE INDEX IF NOT EXISTS idx_biz_property_runtime_checkpoint_run[\s\S]*?\);/
);
assert.ok(
  authoritativeRuntimeCheckpointDefinition,
  "000200 must retain the authoritative runtime checkpoint table and index definition"
);
assert.equal(
  withoutPinnedSearchPath(propertyRuntimeCheckpointPrerequisite),
  authoritativeRuntimeCheckpointDefinition[0].trim(),
  "000193 prerequisite must exactly match the later authoritative 000200 definition"
);
const authoritativeRuntimeControlDefinition = propertyCompatibilityMigration.match(
  /CREATE TABLE IF NOT EXISTS sys_property_runtime_control \([\s\S]*?CREATE INDEX IF NOT EXISTS idx_sys_property_runtime_control_effective[\s\S]*?\);/
);
assert.ok(
  authoritativeRuntimeControlDefinition,
  "000200 must retain the authoritative runtime control table and index definition"
);
assert.equal(
  withoutPinnedSearchPath(propertyRuntimeControlPrerequisite),
  authoritativeRuntimeControlDefinition[0].trim(),
  "000194 prerequisite must exactly match the later authoritative 000200 definition"
);
assert.equal(
  [...propertyRuntimeControlPrerequisite.matchAll(/^\s*CREATE\s+TABLE\b/gim)].length,
  1,
  "000194 prerequisite must create exactly one compatibility table"
);
assert.equal(
  [...propertyRuntimeControlPrerequisite.matchAll(/^\s*CREATE\s+INDEX\b/gim)].length,
  1,
  "000194 prerequisite must create exactly one supporting index"
);
assert.equal(
  /^\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE)\b/im.test(
    propertyRuntimeControlPrerequisite
  ),
  false,
  "000194 prerequisite must not contain data writes or destructive DDL"
);
for (const requiredReconcileContract of [
  "BEGIN;",
  "SET LOCAL search_path = public, pg_catalog;",
  "LOCK TABLE public.sys_property_runtime_control IN SHARE ROW EXCLUSIVE MODE;",
  "property_runtime_control_target_history",
  "93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0",
  "property_runtime_control_signed_manifest",
  "property_runtime_control_target_scope",
  "module.module_code = 'asset'",
  "property-runtime-control-scope-reconcile-preflight-failed",
  "property-runtime-control-scope-reconcile-extra-control",
  "property-runtime-control-scope-reconcile-definition-drift",
  "ON CONFLICT (tenant_id, park_id, control_key) DO NOTHING",
  "property-runtime-control-scope-reconcile-postcondition-failed",
  "COMMIT;"
]) {
  assert.ok(
    propertyRuntimeControlScopePrerequisite.includes(requiredReconcileContract),
    `000194 runtime-control reconciliation prerequisite is missing ${requiredReconcileContract}`
  );
}
const runtimeControlScopeWrites = [
  ...propertyRuntimeControlScopePrerequisite.matchAll(
    /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gim
  )
].map((match) => `${match[1].toUpperCase()} ${match[2]}`);
assert.deepEqual(
  runtimeControlScopeWrites,
  [
    "INSERT INTO property_runtime_control_target_history",
    "INSERT INTO property_runtime_control_signed_manifest",
    "INSERT INTO property_runtime_control_target_scope",
    "INSERT INTO sys_property_runtime_control"
  ],
  "000194 runtime-control reconciliation prerequisite must remain insert-only"
);
assert.doesNotMatch(
  propertyRuntimeControlScopePrerequisite,
  /^\s*(?:UPDATE|DELETE\s+FROM|MERGE|ALTER|DROP|TRUNCATE)\b/im,
  "000194 runtime-control reconciliation prerequisite must not rewrite or delete evidence"
);
assert.match(
  propertyCompatibilitySignaturePrerequisite,
  /actual_count <> 57[\s\S]*actual_hash <> '8eac5a2f9fd0b9985623786274d28283e82f4d0409e7a350f29e33f57e1f1692'/u
);
for (const prerequisiteSql of [
  propertyRuntimeCheckpointPrerequisite,
  propertyRuntimeControlPrerequisite,
  propertyCompatibilitySignaturePrerequisite
]) {
  assert.match(
    prerequisiteSql,
    /^SET search_path = public, pg_catalog;$/mu,
    "runtime prerequisites must pin the public catalog search path"
  );
}
assert.match(
  propertyCompatibilitySignaturePrerequisite,
  /property-forward-declared-runtime-catalog-drift/u
);
assert.match(
  propertyCompatibilitySignaturePrerequisite,
  /signature := 'b0-catalog-v1:'\|\|object_row\.definition_hash;/u
);
for (const runtimeTable of [
  "biz_property_runtime_checkpoint",
  "sys_property_runtime_control"
]) {
  assert.ok(
    propertyCompatibilitySignaturePrerequisite.includes(runtimeTable),
    `000200 signature prerequisite is missing ${runtimeTable}`
  );
}
assert.equal(
  /^\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE)\b/im.test(
    propertyCompatibilitySignaturePrerequisite
  ),
  false,
  "000200 signature prerequisite must not write data or change permanent schema"
);
assert.equal(
  [...propertyCompatibilitySignaturePrerequisite.matchAll(/^\s*CREATE\b/gim)].length,
  1,
  "000200 signature prerequisite may create only its temporary catalog view"
);
assert.match(
  propertyCompatibilitySignaturePrerequisite,
  /^CREATE TEMP VIEW property_prerequisite_runtime_catalog AS/mu
);
const signatureExecutes = [
  ...propertyCompatibilitySignaturePrerequisite.matchAll(/^\s*EXECUTE format\(([\s\S]*?)\);$/gmu)
].map((match) => match[0]);
assert.equal(
  signatureExecutes.length,
  4,
  "000200 signature prerequisite must execute only four catalog COMMENT forms"
);
for (const allowedComment of [
  "COMMENT ON TABLE %s IS %L",
  "COMMENT ON COLUMN %s IS %L",
  "COMMENT ON INDEX %s IS %L",
  "COMMENT ON CONSTRAINT %I ON %s IS %L"
]) {
  assert.equal(
    signatureExecutes.filter((statement) => statement.includes(allowedComment)).length,
    1,
    `000200 signature prerequisite is missing or duplicating ${allowedComment}`
  );
}
assert.match(
  propertyRuntimeCheckpointPrerequisite,
  /CONSTRAINT uq_biz_property_runtime_checkpoint_key\s+UNIQUE \(tenant_id, park_id, checkpoint_kind, checkpoint_key\)/u
);
assert.match(
  propertyRuntimeCheckpointPrerequisite,
  /CREATE INDEX IF NOT EXISTS idx_biz_property_runtime_checkpoint_run\s+ON biz_property_runtime_checkpoint\s+\(tenant_id, park_id, status, checkpoint_kind, updated_at, id\);/u
);
assert.equal(
  [...propertyRuntimeCheckpointPrerequisite.matchAll(/^\s*CREATE\s+TABLE\b/gim)].length,
  1,
  "000193 prerequisite must create exactly one compatibility table"
);
assert.equal(
  [...propertyRuntimeCheckpointPrerequisite.matchAll(/^\s*CREATE\s+INDEX\b/gim)].length,
  1,
  "000193 prerequisite must create exactly one supporting index"
);
assert.equal(
  /^\s*(?:INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE)\b/im.test(
    propertyRuntimeCheckpointPrerequisite
  ),
  false,
  "000193 prerequisite must not contain data writes or destructive DDL"
);
assert.equal(
  /^\s*ALTER\b/im.test(propertyRuntimeCheckpointPrerequisite),
  false,
  "000193 prerequisite must not mutate unrelated existing schema"
);
for (const requiredConstraint of [
  "ck_biz_property_runtime_checkpoint_kind",
  "ck_biz_property_runtime_checkpoint_status",
  "ck_biz_property_runtime_checkpoint_counts",
  "ck_biz_property_runtime_checkpoint_evidence",
  "uq_biz_property_runtime_checkpoint_scope_id",
  "uq_biz_property_runtime_checkpoint_key"
]) {
  assert.ok(
    propertyRuntimeCheckpointPrerequisite.includes(requiredConstraint),
    `000193 prerequisite is missing ${requiredConstraint}`
  );
}

assert.match(assetModulePrerequisite, /INSERT INTO sys_module\s*\(/);
assert.match(assetModulePrerequisite, /'asset'/);
assert.match(
  assetModulePrerequisite,
  /ON CONFLICT \(module_code\) WHERE is_deleted = false\s+DO UPDATE SET status = 1;/
);
assert.match(
  assetModulePrerequisite,
  /WHERE module_code = 'asset'\s+AND status = 1\s+AND is_deleted = false;/
);
assert.match(assetModulePrerequisite, /active_asset_count <> 1/);

const assetWriteStatements = [
  ...assetModulePrerequisite.matchAll(/^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gim)
].map((match) => `${match[1].toUpperCase()} ${match[2]}`);
assert.deepEqual(
  assetWriteStatements,
  ["INSERT INTO sys_module"],
  "000189 prerequisite must write only the sys_module catalog"
);

for (const forbiddenBoundary of [
  "rel_tenant_module",
  "rel_plan_module",
  "sys_module_registry",
  "sys_permission",
  "sys_role",
  "sys_user",
  "sys_plan",
  "rel_role_perm",
  "rel_role_data_scope"
]) {
  assert.equal(
    new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${forbiddenBoundary}`, "i").test(
      assetModulePrerequisite
    ),
    false,
    `000189 prerequisite must not write ${forbiddenBoundary}`
  );
}

for (const requiredTypeContract of [
  "tenant_type NOT IN ('uuid', 'varchar')",
  "park_type NOT IN ('uuid', 'varchar')",
  "ALTER COLUMN tenant_id TYPE varchar(64) USING tenant_id::text",
  "ALTER COLUMN park_id TYPE varchar(64) USING park_id::text",
  "tenant_id = '00000000-0000-4000-8000-000000000001'",
  "park_id = '00000000-0000-4000-8000-000000000101'",
  "asset-park-scope-id-unification-postcondition-failed"
]) {
  assert.ok(
    assetParkScopeIdPrerequisite.includes(requiredTypeContract),
    `000189 asset scope type prerequisite is missing ${requiredTypeContract}`
  );
}
for (const forbiddenTypeBoundary of [
  "asset_building",
  "asset_floor",
  "asset_unit",
  "biz_park",
  "sys_tenant",
  "rel_tenant_module",
  "sys_permission",
  "sys_role",
  "rel_role_perm"
]) {
  assert.equal(
    new RegExp(
      `(?:ALTER\\s+TABLE|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:public\\.)?${forbiddenTypeBoundary}`,
      "i"
    ).test(assetParkScopeIdPrerequisite),
    false,
    `000189 asset scope type prerequisite must not write ${forbiddenTypeBoundary}`
  );
}

for (const requiredScopeContract of [
  "property_asset_park_target_scope",
  "JOIN biz_park park",
  "park.status = 1",
  "FROM sys_tenant tenant",
  "module.module_code = 'asset'",
  "assignment.enabled = true",
  "assignment.status = 'enabled'",
  "asset_count = 0",
  "exact_source_count = 1",
  "scope.exact_source_count <> 1",
  "scope.tenant_key = '10000001'",
  "scope.park_key = '20000001'",
  "park.park_code = 'JH'",
  "ambiguous_asset=%",
  "unresolved_source=%",
  "property-asset-park-scope-reconcile-preflight-failed",
  "property-asset-park-scope-reconcile-postcondition-failed",
  "ON CONFLICT (tenant_id, park_id, park_code) WHERE is_deleted = false DO NOTHING"
]) {
  assert.ok(
    assetParkScopePrerequisite.includes(requiredScopeContract),
    `000189 asset park prerequisite is missing ${requiredScopeContract}`
  );
}
const assetParkPrerequisiteWrites = [
  ...assetParkScopePrerequisite.matchAll(
    /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gim
  )
].map((match) => `${match[1].toUpperCase()} ${match[2]}`);
assert.deepEqual(
  assetParkPrerequisiteWrites,
  [
    "INSERT INTO property_asset_park_target_scope",
    "INSERT INTO property_asset_park_reconcile_scope",
    "INSERT INTO asset_park"
  ],
  "000189 asset park prerequisite must be insert-only"
);
for (const forbiddenScopeWrite of [
  "biz_park",
  "sys_tenant",
  "rel_tenant_module",
  "sys_module",
  "sys_permission",
  "sys_role",
  "rel_role_perm"
]) {
  assert.equal(
    new RegExp(
      `(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${forbiddenScopeWrite}`,
      "i"
    ).test(assetParkScopePrerequisite),
    false,
    `000189 asset park prerequisite must not write ${forbiddenScopeWrite}`
  );
}
for (const requiredSeedContract of [
  "production_asset_park_target_scope",
  "JOIN biz_park park",
  "FROM sys_tenant tenant",
  "module.module_code = 'asset'",
  "asset_count = 0",
  "asset_row_count <> asset_count",
  "exact_source_count = 1",
  "scope.exact_source_count = 0",
  "scope.tenant_key = '10000001'",
  "scope.park_key = '20000001'",
  "park.park_code = 'JH'",
  "INSERT INTO asset_park",
  "ON CONFLICT (tenant_id, park_id, park_code) WHERE is_deleted = false DO NOTHING",
  "production-asset-park-scope-reconcile-preflight-failed",
  "production-asset-park-scope-reconcile-failed"
]) {
  assert.ok(
    assetParkScopeSeed.includes(requiredSeedContract),
    `production asset park reconcile seed is missing ${requiredSeedContract}`
  );
}
const assetParkSeedWrites = [
  ...assetParkScopeSeed.matchAll(
    /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gim
  )
].map((match) => `${match[1].toUpperCase()} ${match[2]}`);
assert.deepEqual(
  assetParkSeedWrites,
  [
    "INSERT INTO production_asset_park_target_scope",
    "INSERT INTO production_asset_park_reconcile_scope",
    "INSERT INTO asset_park"
  ],
  "production asset park reconciliation must preserve canonical source and existing asset rows"
);

const assetConflictUpdate = assetModulePrerequisite.match(
  /DO UPDATE SET\s+([\s\S]*?);/
);
assert.ok(assetConflictUpdate, "000189 prerequisite must handle an existing active asset row");
assert.equal(
  assetConflictUpdate[1].trim(),
  "status = 1",
  "existing active asset metadata and identity must remain unchanged"
);

for (const roleCode of [
  "SYSTEM_ADMIN",
  "AUDITOR",
  "OPERATIONS_OWNER",
  "EXECUTIVE",
  "INVEST_MANAGER",
  "FINANCE_MANAGER",
  "FINANCE_SPECIALIST"
]) {
  assert.match(prerequisite, new RegExp(`'${roleCode}'`), `missing prerequisite role ${roleCode}`);
}

for (const forbiddenWrite of [
  "INSERT INTO sys_user",
  "INSERT INTO sys_permission",
  "INSERT INTO rel_role_perm",
  "INSERT INTO rel_role_data_scope",
  "INSERT INTO rel_tenant_module"
]) {
  assert.equal(prerequisite.includes(forbiddenWrite), false, `prerequisite must not contain ${forbiddenWrite}`);
}

assert.match(runner, /MIGRATION_PREREQUISITES_DIR=/);
assert.match(runner, /MIGRATION_REPLACEMENTS_FILE=/);
assert.match(runner, /validate_migration_replacement_manifest\(\)/u);
assert.match(runner, /migration replacement target is absent or duplicated/u);
assert.match(runner, /prepare_migration_execution\(\)/u);
assert.ok(
  runner.indexOf("ensure_dependency patch") > runner.indexOf('replacement_rows="$(awk'),
  "patch is required only after a replacement declaration matches the current migration"
);
assert.ok(
  runner.indexOf('history_row="$(psql_query') <
    runner.indexOf('prepare_migration_execution "$file" metadata'),
  "migration history must be read before replacement metadata or SQL is prepared"
);
assert.match(
  runner,
  /if \[ "\$migration_prepare_mode" = "metadata" \]; then\s+return 0[\s\S]*?ensure_dependency patch/u,
  "an already-succeeded replacement must skip without requiring patch"
);
assert.match(runner, /immutable migration source drifted before replacement/u);
assert.match(runner, /migration replacement patch checksum drifted/u);
assert.match(runner, /migration replacement output checksum drifted/u);
assert.match(runner, /approved immutable source checksum; replacement not re-run/u);
assert.match(runner, /psql_exec < "\$migration_execution_file"/u);
assert.match(runner, /prerequisite:\$\{prerequisite_target_filename\}:\$\{prerequisite_filename\}/);
assert.match(runner, /migration prerequisite changed after success/);
assert.match(runner, /migration prerequisite is already marked running/);
assert.match(runner, /Target migration not executed/);
assert.match(runner, /assert_history_tables_consistent/);
assert.match(runner, /migration history tables disagree/);
assert.match(runner, /FULL JOIN \$\{STANDARD_HISTORY_TABLE\}/u);
assert.match(runner, /primary_history\.filename IS NULL/u);
assert.match(runner, /standard_history\.filename IS NULL/u);
assert.match(runner, /CREATE TEMP TABLE migration_history_bootstrap_state ON COMMIT DROP/u);
assert.match(runner, /to_regclass\('public\.sys_schema_migration_history'\) IS NOT NULL AS primary_existed/u);
assert.match(runner, /to_regclass\('public\.schema_migrations'\) IS NOT NULL AS standard_existed/u);
assert.match(runner, /primary_existed AND NOT standard_existed/u);
assert.match(runner, /standard_existed AND NOT primary_existed/u);
assert.match(runner, /pg_try_advisory_lock\(hashtextextended\(current_database\(\) \|\| ':jinhu-db-migrate'/u);
assert.match(runner, /MIGRATION LOCK ACQUIRED/u);
assert.ok(
  runner.lastIndexOf("acquire_migration_lock") < runner.lastIndexOf("bootstrap_history_table"),
  "the database migration lock must be acquired before history bootstrap and execution"
);
assert.equal(
  runner.includes("fast_skip_if_manifest_fully_succeeded"),
  false,
  "runner must not bypass newly added prerequisites when all target migrations already succeeded"
);
assert.deepEqual(
  migrationAliases
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")),
  [
    "000183_floor_layout_deleted_file_backfill.sql|000199_floor_layout_deleted_file_backfill.sql|b8187f89e8810abeaac09f7e615e9247335e6a9655550e74886d65b4a2e1bdc3"
  ],
  "every migration history alias must be explicitly reviewed"
);
assert.match(runner, /reconcile_migration_history_aliases\(\)/u);
assert.match(runner, /both legacy and canonical migration history identities exist/u);
assert.match(runner, /COLLAPSE DUPLICATE MIGRATION HISTORY ALIAS/u);
assert.match(runner, /primary duplicate migration alias lost its validated rows/u);
assert.match(runner, /standard duplicate migration alias lost its validated rows/u);
assert.match(runner, /legacy migration history cannot be safely rekeyed/u);
assert.match(runner, /migration-alias:\$\{legacy_filename\}=>\$\{canonical_filename\}/u);
assert.match(runner, /migration history alias audit marker drifted/u);
assert.match(runner, /ON CONFLICT \(filename\) DO NOTHING;/u);
const aliasReconcileCall = runner.lastIndexOf("reconcile_migration_history_aliases");
const baselineCallForAlias = runner.lastIndexOf("baseline_nonempty_database_if_needed");
assert.ok(
  aliasReconcileCall !== -1 && aliasReconcileCall < baselineCallForAlias,
  "history aliases must reconcile before non-empty database baseline"
);
const rollbackRelease = productionDeployWorkflow.slice(
  productionDeployWorkflow.indexOf("rollback_release()"),
  productionDeployWorkflow.indexOf("trap rollback_release ERR")
);
assert.notEqual(
  productionDeployWorkflow.indexOf("rollback_release()"),
  -1,
  "production deployment must define source rollback"
);
assert.notEqual(
  productionDeployWorkflow.indexOf("trap rollback_release ERR"),
  -1,
  "production deployment must install the source rollback trap"
);
assert.match(rollbackRelease, /docker compose --env-file \.env\.production/u);
assert.match(rollbackRelease, /MODE=full sh scripts\/prod-healthcheck\.sh/u);
assert.match(rollbackRelease, /PRUNE_DOCKER_BUILD_CACHE=yes sh scripts\/prod-docker-cleanup\.sh/u);
assert.match(
  rollbackRelease,
  /scripts\/db-migrate\.sh database\/migration-replacements\.txt database\/migration-replacements\//u,
  "source rollback must retain the candidate replacement-aware migration control plane"
);
assert.doesNotMatch(
  rollbackRelease,
  /(?:pnpm db:migrate|pnpm prod:deploy|RUN_PRODUCTION_SEED)/u,
  "source rollback must not execute an older migration or production-seed manifest"
);
assert.match(productionDeployWorkflow, /diagnose-000189-scope/u);
assert.match(productionDeployWorkflow, /Diagnose 000189 asset scope parity \(read-only\)/u);
assert.match(productionDeployWorkflow, /Enforce 000189 asset scope parity before deployment/u);
assert.match(productionDeployWorkflow, /sh -s -- report '\$PROD_DEPLOY_PATH'/u);
assert.match(productionDeployWorkflow, /sh -s -- enforce '\$PROD_DEPLOY_PATH'/u);
const diagnosticStep = productionDeployWorkflow.slice(
  productionDeployWorkflow.indexOf("Diagnose 000189 asset scope parity (read-only)"),
  productionDeployWorkflow.indexOf("Ensure required production secrets")
);
assert.doesNotMatch(
  diagnosticStep,
  /(?:rsync|\.release\.json|pnpm|prod:deploy|db:migrate|db:seed|go-live-uat)/u,
  "read-only production diagnostic must not enter a deployment or source-sync path"
);
assert.match(assetScopeDiagnostic, /BEGIN TRANSACTION READ ONLY;/u);
assert.match(assetScopeDiagnostic, /SET LOCAL search_path = public, pg_catalog;/u);
assert.match(assetScopeDiagnostic, /invalid_scope/u);
assert.match(assetScopeDiagnostic, /invalid_tenant/u);
assert.match(assetScopeDiagnostic, /ambiguous_asset/u);
assert.match(assetScopeDiagnostic, /unresolved_source/u);
assert.match(assetScopeDiagnostic, /ready_existing_asset/u);
assert.match(assetScopeDiagnostic, /ready_exact_source/u);
assert.match(assetScopeDiagnostic, /ready_default_jh_source/u);
assert.match(assetScopeDiagnostic, /ready_ambiguous_source_migration_reconcile/u);
assert.match(assetScopeDiagnostic, /canonical_reconcile_state/u);
assert.match(assetScopeDiagnostic, /history_tables_state=/u);
assert.match(assetScopeDiagnostic, /ELSE 'partial'/u);
assert.ok(
  assetScopeDiagnostic.indexOf("history_tables_state=") <
    assetScopeDiagnostic.indexOf("history_state="),
  "asset-scope diagnostic must probe migration-history table presence before referencing either table"
);
assert.match(assetScopeDiagnostic, /matching_source_count = 1/u);
assert.match(assetScopeDiagnostic, /building_count/u);
assert.match(assetScopeDiagnostic, /floor_count/u);
assert.match(assetScopeDiagnostic, /unit_count/u);
assert.match(assetScopeDiagnostic, /org_count/u);
assert.match(assetScopeDiagnostic, /exact_source_codes/u);
assert.match(assetScopeDiagnostic, /\$1 !~ \/\^ready_\//u);
assert.doesNotMatch(
  assetScopeDiagnostic,
  /(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+)/u,
  "production scope diagnostic must remain read-only"
);
assert.match(runtimeControlDiagnostic, /BEGIN TRANSACTION READ ONLY;/u);
for (const requiredSeedContract of [
  "production-runtime-control-migration-stage-drift",
  "production-runtime-control-partial-state",
  "production-runtime-control-000194-correction-count",
  "production-runtime-control-000195-correction-count",
  "production-runtime-control-postcondition-failed",
  "b2a-contract-correction-000194",
  "b2a-contract-correction-000195"
]) {
  assert.ok(
    propertyRuntimeControlSeed.includes(requiredSeedContract),
    `late-scope runtime-control seed is missing ${requiredSeedContract}`
  );
}
assert.match(propertyRuntimeControlSeed, /LOCK TABLE public\.sys_property_runtime_control/u);
assert.match(propertyRuntimeControlSeed, /controls\.control_count=0 AND audits\.audit_count=0/u);
assert.match(propertyRuntimeControlSeed, /controls\.control_count=12 AND audits\.audit_count=24/u);
assert.match(propertyRuntimeControlSeed, /is_active boolean NOT NULL/u);
assert.match(propertyRuntimeControlSeed, /scope\.is_active AND \(SELECT count\(\*\) FROM public\.sys_tenant/u);
assert.match(propertyRuntimeControlSeed, /scope\.is_active[\s\S]*?NOT EXISTS/u);
assert.match(
  propertyRuntimeControlSeed,
  /park\.status='enabled' AND park\.is_deleted=false\)<>1[\s\S]*?park\.is_deleted=false\)<>1/u,
  "runtime-control seed must reject enabled plus disabled non-deleted asset projections"
);
assert.match(
  propertyRuntimeControlSeed,
  /sys_property_runtime_control control[\s\S]*?rel_tenant_module assignment[\s\S]*?module\.module_code='asset'/u,
  "runtime-control seed must retain and validate immutable histories after asset is disabled"
);
assert.match(
  propertyRuntimeControlSeed,
  /audit\.old_update_time IS DISTINCT FROM \([\s\S]*?prior\.new_update_time[\s\S]*?b2a-contract-correction-000194/u,
  "late-scope seed must bind the v2 audit start to the v1 audit completion"
);
assert.match(
  propertyCompatibilityReplacementPatch,
  /audit\.old_update_time IS DISTINCT FROM \([\s\S]*?prior\.new_update_time[\s\S]*?b2a-contract-correction-000194/u,
  "000200 replacement must bind the v2 audit start to the v1 audit completion"
);
assert.match(runtimeControlDiagnostic, /SET LOCAL search_path = public, pg_catalog;/u);
assert.match(runtimeControlDiagnostic, /ready_table_absent_reconcile/u);
assert.match(runtimeControlDiagnostic, /ready_missing_reconcile/u);
assert.match(runtimeControlDiagnostic, /ready_missing_seed_reconcile/u);
assert.match(runtimeControlDiagnostic, /ready_missing_asset_seed_reconcile/u);
assert.match(runtimeControlDiagnostic, /ready_ambiguous_source_migration_reconcile/u);
assert.match(runtimeControlDiagnostic, /canonical_reconcile_state/u);
assert.match(runtimeControlDiagnostic, /matching_source_count=1/u);
assert.match(runtimeControlDiagnostic, /ELSE 'partial'/u);
assert.match(runtimeControlDiagnostic, /canonical_reconcile_state" = "invalid"/u);
assert.match(
  runtimeControlDiagnostic,
  /assignment\.start_time IS NULL OR assignment\.start_time <= clock_timestamp\(\)/u,
  "runtime-control active scopes must honor the assignment start window"
);
const invalidScopeBranch = runtimeControlDiagnostic.indexOf(
  "WHEN tenant_key IS NULL OR park_key IS NULL"
);
const invalidStageBranch = runtimeControlDiagnostic.indexOf(
  "WHEN NOT (SELECT stage_valid FROM expected_contract)"
);
const ambiguousReadyBranch = runtimeControlDiagnostic.indexOf(
  "THEN 'ready_ambiguous_source_migration_reconcile'"
);
assert.ok(
  invalidScopeBranch !== -1 &&
    invalidScopeBranch < invalidStageBranch &&
    invalidScopeBranch < ambiguousReadyBranch,
  "invalid sentinel scope identifiers must be rejected before migration-stage or reconcile-ready branches"
);
assert.match(
  runtimeControlDiagnostic,
  /WHEN NOT is_active AND :'runtime_contract_stage'<>'post_000195' THEN 'migration_stage_drift'/u,
  "retained runtime-control scopes must not be ready before the final contract stage"
);
assert.match(
  runtimeControlDiagnostic,
  /WHEN asset_count=0 AND asset_row_count=0\s+AND is_active/u,
  "asset projection seed reconciliation must be limited to active scopes"
);
assert.match(
  runtimeControlDiagnostic,
  /WHEN missing_count=expected_count AND actual_count=0\s+AND is_active/u,
  "runtime-control seed reconciliation must be limited to active scopes"
);
assert.match(runtimeControlDiagnostic, /ready_retained_exact/u);
assert.match(runtimeControlDiagnostic, /asset_count=0 AND asset_row_count=0/u);
assert.match(runtimeControlDiagnostic, /asset_count <> 1 OR asset_row_count <> 1/u);
assert.match(runtimeControlDiagnostic, /retained_audit_drift_count/u);
assert.match(runtimeControlDiagnostic, /SELECT count\(\*\) FROM drift/u);
assert.match(
  runtimeControlDiagnostic,
  /contract_scope AS \([\s\S]*?sys_property_runtime_control control[\s\S]*?rel_tenant_module assignment/u,
  "runtime-control diagnostic must validate correction audits for active and retained signed scopes"
);
assert.match(
  assetParkScopeSeed,
  /JOIN sys_tenant tenant[\s\S]*?tenant\.status = 1[\s\S]*?tenant\.expire_time > clock_timestamp\(\)/u,
  "asset projection seed must exclude disabled or expired tenants just like the deployment classifier"
);
assert.match(
  runtimeControlDiagnostic,
  /HAVING count\(\*\) = 12[\s\S]*?count\(DISTINCT control\.control_key\) = 12/u,
  "runtime-control audit validation must run only after exact signed control-key parity"
);
assert.match(runtimeControlDiagnostic, /is_active AND tenant_count <> 1/u);
assert.match(
  runtimeControlDiagnostic,
  /OR \(is_active AND NOT \([\s\S]*?exact_source_count=1[\s\S]*?exact_source_count=0[\s\S]*?tenant_key='10000001'[\s\S]*?park_key='20000001'[\s\S]*?default_source_count=1[\s\S]*?\)\) THEN 'invalid_scope'/u,
  "runtime-control diagnostic must reject every active scope without a canonical exact source or the fixed unique JH fallback"
);
assert.match(
  runtimeControlDiagnostic,
  /active_scope AS \([\s\S]*?JOIN sys_tenant tenant[\s\S]*?tenant\.expire_time > clock_timestamp\(\)/u,
  "runtime-control active scopes must exclude disabled or expired tenants before retained classification"
);
assert.match(runtimeControlDiagnostic, /exact_source_count=1/u);
assert.match(runtimeControlDiagnostic, /exact_source_count=0/u);
assert.match(runtimeControlDiagnostic, /tenant_key='10000001'/u);
assert.match(runtimeControlDiagnostic, /park_key='20000001'/u);
assert.match(runtimeControlDiagnostic, /default_source_count=1/u);
assert.match(runtimeControlDiagnostic, /allow_seed_reconcile/u);
assert.match(runtimeControlDiagnostic, /runtime_compatibility_succeeded/u);
assert.match(runtimeControlDiagnostic, /d7dff444c2c7969618ee7de846b8a0fdccb02d57844477e916c2b2742d0d004b/u);
assert.match(runtimeControlDiagnostic, /missing_control/u);
assert.match(runtimeControlDiagnostic, /ready_exact/u);
assert.match(runtimeControlDiagnostic, /post_000194/u);
assert.match(runtimeControlDiagnostic, /post_000195/u);
assert.match(
  productionDeployWorkflow,
  /RUN_PRODUCTION_SEED: \$\{\{ steps\.deploy-mode\.outputs\.run_production_seed \}\}[\s\S]*?sh -s -- enforce '\$PROD_DEPLOY_PATH' '' '\$RUN_PRODUCTION_SEED'/u,
  "runtime-control gate may allow a wholly missing scope only when this deployment will run production seed"
);
assert.match(runtimeControlDiagnostic, /migration_stage_drift/u);
assert.match(
  runtimeControlDiagnostic,
  /runtime_contract_stage" != "pre_000194".*table_present" = "no"/su,
  "an absent runtime-control table is repairable only before 000194 succeeds"
);
assert.match(runtimeControlDiagnostic, /FULL JOIN schema_migrations standard_history USING \(filename\)/u);
assert.match(runtimeControlDiagnostic, /"2\|2\|0\|2\|2\|2\|0\|2\|0"/u);
assert.match(runtimeControlDiagnostic, /e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944/u);
assert.match(runtimeControlDiagnostic, /extra_control_scope/u);
assert.match(runtimeControlDiagnostic, /definition_drift/u);
assert.match(runtimeControlDiagnostic, /missing_keys/u);
assert.match(runtimeControlDiagnostic, /extra_keys/u);
assert.match(runtimeControlDiagnostic, /\$1 !~ \/\^ready_\//u);
assert.doesNotMatch(
  runtimeControlDiagnostic,
  /(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+)/u,
  "production runtime-control diagnostic must remain read-only"
);
assert.match(canonicalSourceMigration, /pg_advisory_xact_lock/u);
assert.match(canonicalSourceMigration, /LOCK TABLE public\.sys_module/u);
assert.match(canonicalSourceMigration, /LOCK TABLE public\.rel_tenant_module/u);
assert.match(canonicalSourceMigration, /LOCK TABLE public\.sys_tenant/u);
assert.match(canonicalSourceMigration, /LOCK TABLE public\.asset_park/u);
assert.match(canonicalSourceMigration, /LOCK TABLE public\.biz_park/u);
assert.match(canonicalSourceMigration, /LOCK TABLE public\.sys_property_runtime_control IN SHARE MODE/u);
assert.match(
  canonicalSourceMigration,
  /LOCK TABLE public\.sys_property_runtime_control_contract_audit IN SHARE MODE/u
);
const canonicalSourceMigrationChecksum = createHash("sha256")
  .update(canonicalSourceMigration)
  .digest("hex");
for (const diagnostic of [assetScopeDiagnostic, runtimeControlDiagnostic]) {
  assert.match(
    diagnostic,
    new RegExp(`canonical_reconcile_checksum="${canonicalSourceMigrationChecksum}"`, "u"),
    "canonical-source diagnostics must pin the exact 000207 migration checksum"
  );
}
assert.match(canonicalSourceMigration, /matching_source_count<>1/u);
assert.match(canonicalSourceMigration, /control_count<>12 OR total_control_count<>12/u);
assert.match(canonicalSourceMigration, /control\.control_kind=signed\.control_kind/u);
assert.match(canonicalSourceMigration, /control\.target=signed\.target/u);
assert.match(canonicalSourceMigration, /control\.adapter_version IS NOT DISTINCT FROM signed\.adapter_version/u);
assert.match(canonicalSourceMigration, /control\.enabled_by IS NULL AND control\.enabled_at IS NULL/u);
assert.match(canonicalSourceMigration, /lower\(tenant_id\) IN/u);
assert.match(canonicalSourceMigration, /lower\(park_id\) IN/u);
assert.ok(
  canonicalSourceMigration.indexOf("FROM reconcile_000207_active_scope") <
    canonicalSourceMigration.indexOf("WHERE state.source_count>1"),
  "000207 must reject sentinel identifiers across every active scope before selecting ambiguous candidates"
);
assert.doesNotMatch(
  canonicalSourceMigration,
  /remark='000207 canonical source superseded by asset projection'/u,
  "canonical reconciliation must preserve operator-entered biz_park remarks"
);
assert.match(canonicalSourceMigration, /audit_count<>24 OR total_audit_count<>24/u);
assert.match(canonicalSourceMigration, /reconcile_000207_runtime_audit_drift/u);
assert.match(canonicalSourceMigration, /runtime-control-contract-audit-v1/u);
assert.match(canonicalSourceMigration, /runtime-control-contract-audit-v2/u);
assert.match(canonicalSourceMigration, /audit\.evidence_hash IS DISTINCT FROM encode/u);
assert.match(canonicalSourceMigration, /sys_asset_scope_canonical_reconcile_audit/u);
assert.match(canonicalSourceMigration, /BEFORE UPDATE OR DELETE/u);
assert.match(canonicalSourceMigration, /status=0,is_deleted=true,version=target\.version\+1/u);
assert.match(canonicalSourceMigration, /asset-scope-canonical-source-reconcile-postcondition-failed/u);
assert.match(
  productionDeployScript,
  /db-migrate\.sh[\s\S]*diagnose-000189-asset-scope\.sh[\s\S]*repair-000194-retired-runtime-owner\.sh[\s\S]*diagnose-000194-runtime-control\.sh[\s\S]*db-seed-prod\.sh/u,
  "production deployment must repair reviewed retired owner rows between the 000189 and 000194 gates"
);
assert.match(retiredRuntimeOwnerRepair, /BEGIN TRANSACTION READ ONLY;/u);
assert.match(retiredRuntimeOwnerRepair, /ready_table_absent_reconcile/u);
assert.match(retiredRuntimeOwnerRepair, /ready_contract_not_final_reconcile/u);
assert.match(retiredRuntimeOwnerRepair, /000195_property_mutation_receipt_contract_v2\.sql/u);
assert.match(retiredRuntimeOwnerRepair, /ready_restore_retired_owner/u);
assert.match(retiredRuntimeOwnerRepair, /blocked_retired_owner_restore/u);
assert.match(retiredRuntimeOwnerRepair, /controls=12 AND valid_controls=12/u);
assert.match(retiredRuntimeOwnerRepair, /audits=24 AND valid_audits_194=12 AND valid_audits_195=12/u);
assert.match(retiredRuntimeOwnerRepair, /runtime-control-contract-audit-v1/u);
assert.match(retiredRuntimeOwnerRepair, /runtime-control-contract-audit-v2/u);
assert.match(retiredRuntimeOwnerRepair, /audit\.evidence_hash IS NOT DISTINCT FROM encode/u);
assert.match(retiredRuntimeOwnerRepair, /deleted_disabled_asset_parks/u);
assert.match(retiredRuntimeOwnerRepair, /deleted_disabled_asset_assignments/u);
assert.match(retiredRuntimeOwnerRepair, /live_asset_parks=0 AND deleted_asset_parks=1 AND deleted_disabled_asset_parks=1/u);
assert.match(retiredRuntimeOwnerRepair, /park\.is_deleted=true\)=1/u);
assert.match(retiredRuntimeOwnerRepair, /park\.is_deleted=true AND park\.status='disabled'/u);
assert.match(retiredRuntimeOwnerRepair, /live_biz_parks=0 AND deleted_biz_parks=1/u);
assert.match(retiredRuntimeOwnerRepair, /live_asset_assignments=0 AND deleted_asset_assignments=1 AND deleted_disabled_asset_assignments=1/u);
assert.match(retiredRuntimeOwnerRepair, /assignment\.is_deleted=true\)=1/u);
assert.match(retiredRuntimeOwnerRepair, /assignment\.is_deleted=true AND assignment\.enabled=false AND assignment\.status='disabled'/u);
assert.match(retiredRuntimeOwnerRepair, /module\.module_code='asset'/u);
assert.match(retiredRuntimeOwnerRepair, /UPDATE public\.asset_park park[\s\S]*version=park\.version\+1/u);
assert.match(retiredRuntimeOwnerRepair, /control\.tenant_id::uuid/u);
assert.match(retiredRuntimeOwnerRepair, /control\.park_id::uuid/u);
assert.match(retiredRuntimeOwnerRepair, /park\.tenant_id=control_scope\.tenant_uuid/u);
assert.match(retiredRuntimeOwnerRepair, /assignment\.tenant_id=control_scope\.tenant_uuid/u);
assert.match(retiredRuntimeOwnerRepair, /update_by='00000000-0000-4000-8000-000000000194'::uuid/u);
assert.match(retiredRuntimeOwnerRepair, /UPDATE public\.rel_tenant_module assignment[\s\S]*version=assignment\.version\+1/u);
assert.match(retiredRuntimeOwnerRepair, /asset_park_id_versions\|assignment_id_versions\|actor_id\|actor_label/u);
assert.match(retiredRuntimeOwnerRepair, /repaired_scopes="\$\(printf '%s\\n' "\$repair_output"/u);
assert.match(retiredRuntimeOwnerRepair, /retired runtime owner repair scope changed after classification/u);
assert.match(retiredRuntimeOwnerRepair, /repaired_asset_parks"\s+!=\s+"\$ready_count"/u);
assert.match(retiredRuntimeOwnerRepair, /repaired_assignments"\s+!=\s+"\$ready_count"/u);
assert.match(retiredRuntimeOwnerRepair, /\\nrepair_result\|%s\|%s\|%s\\n/u);
assert.doesNotMatch(
  retiredRuntimeOwnerRepair,
  /UPDATE public\.biz_park/u,
  "retired owner repair must not undelete the business park source"
);
assert.doesNotMatch(
  retiredRuntimeOwnerRepair,
  /deleted_biz_parks>=1/u,
  "retired owner repair must block ambiguous deleted canonical rows"
);
assert.match(canonicalSourceFixture, /ready_ambiguous_source_migration_reconcile/u);
assert.match(canonicalSourceFixture, /RELEASE_000207_NO_MATCH/u);
assert.match(canonicalSourceFixture, /failure_audit_count/u);
assert.match(canonicalSourceFixture, /test "\$failure_audit_count" = '0'/u);
assert.match(canonicalSourceFixture, /RELEASE_000207_AUDIT_DRIFT/u);
assert.match(canonicalSourceFixture, /preserved operator remark/u);
assert.match(canonicalSourceFixture, /SET control_kind='compatibility_write'/u);
assert.match(canonicalSourceFixture, /runtime-control audit evidence drift to stop 000207/u);
assert.match(canonicalSourceFixture, /migration_history_drift/u);
assert.match(canonicalSourceFixture, /Future asset assignments must not enter canonical reconciliation/u);
assert.match(canonicalSourceFixture, /already succeeded, checksum matched/u);
const ensureSecretsStep = productionDeployWorkflow.indexOf("Ensure required production secrets");
const enforceScopeStep = productionDeployWorkflow.indexOf(
  "Enforce 000189 asset scope parity before deployment"
);
const deployStep = productionDeployWorkflow.indexOf("      - name: Deploy");
const enforceRuntimeControlStep = productionDeployWorkflow.indexOf(
  "Enforce 000194 runtime control parity before deployment"
);
const repairRetiredOwnerStep = productionDeployWorkflow.indexOf(
  "Repair retired 000194 runtime owner rows before deployment"
);
assert.ok(
  ensureSecretsStep !== -1 &&
    ensureSecretsStep < enforceScopeStep &&
    enforceScopeStep < repairRetiredOwnerStep &&
    repairRetiredOwnerStep < enforceRuntimeControlStep &&
    enforceRuntimeControlStep < deployStep,
  "normal deployment must initialize secrets, repair reviewed retired owner rows, and enforce both migration parity gates before release sync"
);
assert.match(
  productionDeployWorkflow,
  /Repair retired 000194 runtime owner rows before deployment[\s\S]*?repair-000194-retired-runtime-owner\.sh/u
);
assert.match(
  productionDeployWorkflow,
  /Diagnose 000194 runtime control parity \(read-only\)[\s\S]*?diagnose-000194-runtime-control[\s\S]*?diagnose-000194-runtime-control\.sh/u
);

const historyWrite = runner.slice(
  runner.indexOf("write_history_row()"),
  runner.indexOf("run_prerequisite_file()")
);
assert.match(historyWrite, /BEGIN;/);
assert.match(historyWrite, /INSERT INTO \$\{HISTORY_TABLE\}/);
assert.match(historyWrite, /INSERT INTO \$\{STANDARD_HISTORY_TABLE\}/);
assert.match(historyWrite, /COMMIT;/);
assert.equal(
  historyWrite.includes("write_history_row_for_table"),
  false,
  "dual history writes must not use independent table transactions"
);

const prerequisiteCall = runner.indexOf('run_prerequisites_for_migration "$filename"');
const migrationLoop = runner.lastIndexOf('while IFS= read -r file; do', prerequisiteCall);
const baselineCall = runner.lastIndexOf("baseline_nonempty_database_if_needed", migrationLoop);
const targetChecksumConflict = runner.lastIndexOf("migration file changed after success", prerequisiteCall);
const targetRunningConflict = runner.lastIndexOf("migration is already marked running", prerequisiteCall);
const targetRunningWrite = runner.indexOf(
  'write_history_row "$filename" "$current_checksum" "running"',
  prerequisiteCall
);
assert.notEqual(prerequisiteCall, -1, "runner must invoke target prerequisites");
assert.ok(
  baselineCall !== -1 && baselineCall < migrationLoop && migrationLoop < prerequisiteCall,
  "baseline and fully migrated databases must enter the migration loop before prerequisite checks"
);
assert.ok(
  targetChecksumConflict < prerequisiteCall && targetRunningConflict < prerequisiteCall,
  "target history conflicts must be checked before retroactive prerequisite execution"
);
assert.ok(
  targetRunningWrite > prerequisiteCall,
  "prerequisites must complete before the target migration is marked running"
);

assert.equal(
  [...permissionRepairSeed.matchAll(/^    \('([^']+)', '([^']+)'\)/gm)].length,
  458,
  "permission repair seed must retain the reviewed reference/candidate residual matrix"
);
for (const representativeGrant of [
  "('OPERATIONS_OWNER', 'safety_inspect_point:read')",
  "('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_VIEW')",
  "('EXECUTIVE', 'safety_hazard:read')",
  "('AUDITOR', 'ENGINEERING_PROJECT_VIEW')"
]) {
  assert.ok(
    permissionRepairSeed.includes(representativeGrant),
    `missing representative repaired grant ${representativeGrant}`
  );
}
assert.match(permissionRepairSeed, /WHERE NOT EXISTS/);

console.log("[PASS] migration prerequisite contract");
