import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("employee runtime scope consumes the shared matrix and no longer borrows workflow permissions",()=>{
  const shared=read("packages/shared/src/hr.ts"),policy=read("apps/api/src/modules/hr/hr-access-policy.ts");
  for(const atom of ["HR_EMPLOYEE_TEAM_READ","HR_EMPLOYEE_PROFILE_TEAM_READ","HR_EMPLOYEE_PROFILE_SELF_READ"]){
    assert.match(shared,new RegExp(atom));
  }
  assert.match(policy,/resolveHrAccessScope\("employee",actor\)/u);
  assert.match(policy,/HR_ACCESS_MATRIX\.DEPARTMENT_MANAGER\.sensitiveProfile/u);
  assert.doesNotMatch(policy,/resolveHrEmployeeAccessScope[\s\S]{0,700}HR_WORK_REPORT_TEAM_REVIEW/u);
  assert.doesNotMatch(policy,/resolveHrEmployeeAccessScope[\s\S]{0,700}HR_PERFORMANCE_MANAGER_REVIEW/u);
});

test("production role seed grants only the employee directory and masked profile atoms",()=>{
  const seed=read("database/seeds/production/000016_hr_management_foundation.sql");
  const directorySeed=read("database/seeds/production/000017_hr_department_manager_directory.sql");
  for(const atom of ["hr:employee:team_read","hr:employee_profile:team_read","hr:employee_profile:self_read"]){
    assert.match(seed,new RegExp(atom));
  }
  assert.match(seed,/\('DEPARTMENT_MANAGER','部门负责人','hr:employee:team_read'\)/u);
  assert.match(seed,/\('DEPARTMENT_MANAGER','部门负责人','hr:employee_profile:team_read'\)/u);
  assert.match(seed,/\('EMPLOYEE_SELF_SERVICE','员工自助','hr:employee_profile:self_read'\)/u);
  assert.doesNotMatch(seed,/\('DEPARTMENT_MANAGER','部门负责人','hr:employee_profile:read'\)/u);
  assert.doesNotMatch(seed,/\('EMPLOYEE_SELF_SERVICE','员工自助','hr:employee_profile:read'\)/u);
  assert.match(directorySeed,/code IN\('hr:employees','hr:employee:team_read','hr:employee_profile:team_read'\)/u);
  assert.doesNotMatch(directorySeed,/work-report\/performance manager permissions/u);
});
