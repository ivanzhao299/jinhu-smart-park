import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migrationPath = resolve(root, "database/migrations/000175_2026_responsibility_user_role_queue.sql");
const prerequisitePath = resolve(
  root,
  "database/migration-prerequisites/000175_2026_responsibility_user_role_queue/001_core_role_templates.sql"
);
const runnerPath = resolve(root, "scripts/db-migrate.sh");

const migration = readFileSync(migrationPath);
const prerequisite = readFileSync(prerequisitePath, "utf8");
const runner = readFileSync(runnerPath, "utf8");

assert.equal(
  createHash("sha256").update(migration).digest("hex"),
  "5daaca3cb4a48b40c258446c36427c49ad657bd4d95de388ca9661c3cd52c89c",
  "historical migration 000175 must remain byte-for-byte unchanged"
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

const prerequisiteCall = runner.indexOf('run_prerequisites_for_migration "$filename"');
const targetRunningWrite = runner.indexOf(
  'write_history_row "$filename" "$current_checksum" "running"',
  prerequisiteCall
);
assert.notEqual(prerequisiteCall, -1, "runner must invoke target prerequisites");
assert.ok(
  targetRunningWrite > prerequisiteCall,
  "prerequisites must complete before the target migration is marked running"
);

console.log("[PASS] migration prerequisite contract");
