import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed=readFileSync("database/seeds/production/000017_hr_department_manager_directory.sql","utf8");
const foundation=readFileSync("database/seeds/production/000016_hr_management_foundation.sql","utf8");
assert.match(seed,/code='DEPARTMENT_MANAGER'/u);
assert.match(seed,/code IN\('hr:employees','hr:employee:team_read','hr:employee_profile:team_read'\)/u);
assert.match(seed,/role_count <> 1/u);
assert.match(seed,/permission_count <> 3/u);
assert.match(seed,/LOCK TABLE sys_role, sys_permission, rel_role_perm/u);
assert.match(seed,/tenant_id='10000001' AND park_id='20000001' AND code='DEPARTMENT_MANAGER'/u);
assert.match(seed,/Expected exactly three active department employee permissions/u);
assert.match(seed,/permission\.park_id=role\.park_id/u);
assert.match(seed,/ON CONFLICT\(tenant_id,park_id,role_id,permission_id\) WHERE is_deleted=false/u);
for(const forbidden of ["hr:employee:read","hr:employee:self_read","hr:employee_profile:read","hr:employee_profile:self_read","hr:employee_profile:manage"]){
  assert.match(seed,new RegExp(`permission\\.code IN\\([^)]*${forbidden}`),`must explicitly revoke ${forbidden}`);
}
for(const forbidden of ["hr:payroll:read","hr:compensation:read"]){assert.equal(seed.includes(forbidden),false,`must not touch ${forbidden}`);}
assert.match(foundation,/'DEPARTMENT_MANAGER','部门负责人','hr:work_report:team_review'/u);
assert.match(foundation,/'DEPARTMENT_MANAGER','部门负责人','hr:performance:manager_review'/u);
console.log("HR M3 department-manager RBAC contract passed");
