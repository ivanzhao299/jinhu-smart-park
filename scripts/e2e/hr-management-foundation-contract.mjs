import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("database/seeds/production/000016_hr_management_foundation.sql", "utf8");
const menu = readFileSync("apps/web/lib/menu.ts", "utf8");
const layout = readFileSync("apps/web/app/hr/layout.tsx", "utf8");
const workbench = readFileSync("apps/web/app/hr/HrWorkbench.tsx", "utf8");

assert.match(seed, /VALUES\('hr','人力资源管理','management'/);
assert.match(seed, /'\/hr','briefcase-business',1,72/);
assert.match(seed, /'hr:employee:manage'/);
assert.match(seed, /'hr:employee:self_read'/);
assert.match(seed, /IN\('HR_MANAGER','EMPLOYEE_SELF_SERVICE','DEPARTMENT_MANAGER'\)/);
assert.match(seed, /'DEPARTMENT_MANAGER','部门负责人','hr:work_report:team_review'/);
assert.match(seed, /'DEPARTMENT_MANAGER','部门负责人','hr:performance:manager_review'/);
assert.doesNotMatch(seed, /'DEPARTMENT_MANAGER','部门负责人','hr:(employee_profile|compensation|payroll):(read|manage|confirm)'/);
assert.doesNotMatch(seed, /INSERT INTO rel_user_role/i, "HR foundation must not silently bind existing users");
assert.doesNotMatch(seed, /password|mobile|email/i, "HR foundation must not seed credentials or employee PII");
assert.match(menu, /"\/hr"/);
assert.match(menu, /"\/hr\/employees"/);
for (const route of ["goals","work-reports","performance","feedback-360","compensation","payroll","approvals"]) assert.match(menu, new RegExp(`"/hr/${route}"`));
assert.match(menu, /"briefcase-business": BriefcaseBusiness/);
assert.match(layout, /<DashboardLayout>\{children\}<\/DashboardLayout>/);
assert.match(workbench, /module="hr" permission="hr:dashboard"/);

console.log("HR management foundation contract: PASS");
