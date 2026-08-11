import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const seedPath = "database/seeds/production/000010_jh_engineering_project_manager_rbac_reconcile.sql";
const sql = await readFile(seedPath, "utf8");

assert.match(sql, /BEGIN;[\s\S]*COMMIT;/, "repair must be transactional");
assert.match(sql, /LOCK TABLE sys_role, rel_role_perm, rel_user_role/, "repair must serialize RBAC convergence");
assert.match(sql, /'JH_ENGINEERING_PROJECT_MANAGER'/, "canonical role must be explicit");
assert.match(sql, /'shao_minghong'/, "reviewed account mapping must be explicit");
assert.match(sql, /'PROPERTY_STAFF', 'MAINTENANCE_ENGINEER'/, "only reviewed legacy aliases may be replaced");
assert.match(sql, /unexpected_binding_count <> 0/, "unexpected roles must fail closed");
assert.match(sql, /expected_permission_count <> resolved_permission_count/, "missing permission definitions must fail closed");
assert.match(sql, /permission\.code LIKE 'homestay:%'/, "homestay denial must be asserted");
assert.match(sql, /permission\.code LIKE 'housing:%'/, "housing denial must be asserted");

for (const permission of [
  "ENGINEERING_PROJECT_VIEW",
  "ENGINEERING_DAILY_REPORT_CREATE",
  "ENGINEERING_INSPECTION_CREATE",
  "ENGINEERING_RECTIFICATION_SUBMIT",
  "ENGINEERING_ACCEPTANCE_SUBMIT",
  "workorder:create",
  "file:upload",
]) {
  assert.match(sql, new RegExp(`'${permission.replaceAll(":", "\\:")}'`), `missing required permission ${permission}`);
}

for (const forbiddenGrant of ["homestay:read", "housing:read", "workorder:assign", "system:user:update"]) {
  assert.equal(
    sql.includes(`('${forbiddenGrant}')`),
    false,
    `least-privilege role must not grant ${forbiddenGrant}`,
  );
}

console.log("Jinhu engineering project manager RBAC source contract passed.");
