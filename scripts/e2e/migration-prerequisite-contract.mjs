import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
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
const adminIssueRunnerPrerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000190_admin_issue_runner_repair/001_sys_role_scope_conflict_arbiter.sql"
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
const adminIssueRunnerPrerequisite = readFileSync(adminIssueRunnerPrerequisitePath, "utf8");
const permissionRepairSeed = readFileSync(permissionRepairSeedPath, "utf8");
const runner = readFileSync(runnerPath, "utf8");

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
  "75a6ed711fd8bfad608bb774e8e7704f6419c2ade660af7119f940cefbeaf8bd",
  "historical migration 000190 must remain byte-for-byte unchanged"
);

assert.match(
  adminIssueRunnerPrerequisite,
  /CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_role_scope_code_active\s+ON sys_role \(tenant_id, park_id, code\)\s+WHERE is_deleted = false;/u
);
assert.equal(
  [...adminIssueRunnerPrerequisite.matchAll(/^\s*CREATE\s+UNIQUE\s+INDEX\b/gim)].length,
  1,
  "000190 prerequisite must create exactly one compatibility index"
);
assert.equal(
  /^\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE)\b/im.test(adminIssueRunnerPrerequisite),
  false,
  "000190 prerequisite must not contain data writes or destructive DDL"
);
assert.equal(
  /^\s*CREATE\b(?!\s+UNIQUE\s+INDEX\b)/im.test(adminIssueRunnerPrerequisite),
  false,
  "000190 prerequisite must not create anything except its compatibility index"
);

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
const targetChecksumConflict = runner.lastIndexOf("migration file changed after success", prerequisiteCall);
const targetRunningConflict = runner.lastIndexOf("migration is already marked running", prerequisiteCall);
const targetRunningWrite = runner.indexOf(
  'write_history_row "$filename" "$current_checksum" "running"',
  prerequisiteCall
);
assert.notEqual(prerequisiteCall, -1, "runner must invoke target prerequisites");
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
