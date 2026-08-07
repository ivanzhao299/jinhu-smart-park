import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migrationPrerequisitesRoot = resolve(root, "database/migration-prerequisites");
const reviewedPrerequisiteFiles = [
  "000064_s3e_checkout_effective/001_core_role_templates.sql",
  "000189_property_b_module_rbac_definitions/001_asset_module.sql",
  "000193_property_b_runtime_integrity_forward_fix/001_property_runtime_checkpoint.sql",
  "000194_property_task_projection_contract_correction/001_property_runtime_control.sql",
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

const migration = readFileSync(migrationPath);
const prerequisite = readFileSync(prerequisitePath, "utf8");
const propertyModuleMigration = readFileSync(propertyModuleMigrationPath);
const assetModulePrerequisite = readFileSync(assetModulePrerequisitePath, "utf8");
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
const propertyCompatibilityMigration = readFileSync(propertyCompatibilityMigrationPath, "utf8");
const propertyCompatibilitySignaturePrerequisite = readFileSync(
  propertyCompatibilitySignaturePrerequisitePath,
  "utf8"
);
const permissionRepairSeed = readFileSync(permissionRepairSeedPath, "utf8");
const runner = readFileSync(runnerPath, "utf8");
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
assert.match(runner, /prerequisite:\$\{prerequisite_target_filename\}:\$\{prerequisite_filename\}/);
assert.match(runner, /migration prerequisite changed after success/);
assert.match(runner, /migration prerequisite is already marked running/);
assert.match(runner, /Target migration not executed/);
assert.match(runner, /assert_history_tables_consistent/);
assert.match(runner, /migration history tables disagree/);
assert.equal(
  runner.includes("fast_skip_if_manifest_fully_succeeded"),
  false,
  "runner must not bypass newly added prerequisites when all target migrations already succeeded"
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
