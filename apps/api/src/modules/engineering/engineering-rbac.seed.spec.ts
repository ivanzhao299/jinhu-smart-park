import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(__dirname, "../../../../../database/migrations/000157_epdr_rbac_menu_permissions.sql");

test("EPDR RBAC seed registers engineering module, menus, permissions and role grants", () => {
  const sql = readFileSync(migrationPath, "utf8");

  for (const value of [
    "INSERT INTO sys_module",
    "'engineering'",
    "INSERT INTO rel_tenant_module",
    "INSERT INTO sys_module_registry",
    "'engineering:dashboard'",
    "'engineering:projects'",
    "'engineering:plans'",
    "'engineering:daily-reports'",
    "'engineering:inspections'",
    "'engineering:rectifications'",
    "'engineering:acceptances'",
    "'ENGINEERING_DASHBOARD_VIEW'",
    "'ENGINEERING_PROJECT_CREATE'",
    "'ENGINEERING_PROJECT_APPROVE'",
    "'ENGINEERING_PLAN_APPROVE'",
    "'ENGINEERING_DAILY_REPORT_SUBMIT'",
    "'ENGINEERING_DAILY_REPORT_REVIEW'",
    "'ENGINEERING_INSPECTION_SUBMIT'",
    "'ENGINEERING_RECTIFICATION_ASSIGN'",
    "'ENGINEERING_RECTIFICATION_RECHECK'",
    "'ENGINEERING_ACCEPTANCE_REVIEW'",
    "'ENGINEERING_ACCEPTANCE_CLOSE'",
    "'SUPER_ADMIN'",
    "'ENGINEERING_DIRECTOR'",
    "'PROJECT_MANAGER'",
    "'CONTRACTOR_MANAGER'",
    "'AUDITOR'",
    "INSERT INTO rel_role_perm"
  ]) {
    assert.ok(sql.includes(value), `expected migration to include ${value}`);
  }
});
