import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
const page=read("apps/web/app/hr/employees/HrEmployeesClient.tsx");
const api=read("apps/web/lib/hr-api.ts");

test("employee directory and profiles use only their exact park team and self atoms",()=>{
  assert.match(page,/canReadAll=hasPermission\(user,HR_PERMISSIONS\.HR_EMPLOYEE_READ\)/u);
  assert.match(page,/canReadTeam=hasPermission\(user,HR_PERMISSIONS\.HR_EMPLOYEE_TEAM_READ\)/u);
  assert.match(page,/canReadSelf=hasPermission\(user,HR_PERMISSIONS\.HR_EMPLOYEE_SELF_READ\)/u);
  assert.match(page,/HR_EMPLOYEE_PROFILE_READ,HR_PERMISSIONS\.HR_EMPLOYEE_PROFILE_MANAGE/u);
  assert.match(page,/HR_EMPLOYEE_PROFILE_TEAM_READ/u);
  assert.match(page,/HR_EMPLOYEE_PROFILE_SELF_READ/u);
  assert.doesNotMatch(page,/HR_WORK_REPORT_TEAM_REVIEW|HR_PERFORMANCE_MANAGER_REVIEW/u);
});

test("self masked profile and independently permitted detail sections remain usable",()=>{
  assert.match(api,/myProfile:\(token\?:string,signal\?:AbortSignal\)=>unwrap\(apiRequest<HrEmployeeProfile\|null>\("\/hr\/employees\/me\/profile"/u);
  assert.match(page,/const isSelf=detail\.userId===user\?\.id/u);
  assert.match(page,/canReadProfileSelf&&isSelf\?hrApi\.myProfile\(token,controller\.signal\)/u);
  assert.match(page,/const detail=await hrApi\.employee\(row\.id,token,controller\.signal\)/u);
  assert.match(page,/Promise\.allSettled\(\[/u);
  assert.match(page,/canReadEvents\?hrApi\.events/u);
  assert.match(page,/canReadContracts\?hrApi\.contracts/u);
  assert.match(page,/canReadRecords\?hrApi\.employeeRecords/u);
  assert.match(page,/profile\.masked\?"脱敏敏感档案":"敏感档案"/u);
});

test("employee writes remain behind exact manage or transition atoms",()=>{
  assert.match(page,/canManage&&createOpen\?<form/u);
  assert.match(page,/canManageProfile\?<><h3>维护敏感档案/u);
  assert.match(page,/canManageEmployeeDocuments\?<FileUploader/u);
  assert.match(page,/hasPermission\(user,HR_PERMISSIONS\.HR_EMPLOYMENT_TRANSITION\)&&selected\.employmentStatus!=="departed"/u);
  assert.doesNotMatch(page,/canReadTeam[^\n]{0,300}(createEmployee|updateProfile|transition\()/u);
});

test("Web employee and profile contracts expose only reviewed response keys",()=>{
  const employee=api.match(/export interface HrEmployee \{([^}]*)\}/u)?.[1]??"";
  for(const key of ["id","employeeCode","fullName","userId","primaryOrgId","positionId","managerEmployeeId","employmentType","employmentStatus","hireDate","departureDate","workLocation","workMobile","workEmail"]){
    assert.match(employee,new RegExp(`(?:^|;)${key}:`));
  }
  for(const forbidden of ["tenantId","parkId","attendanceCardNo","createBy","createTime","updateBy","updateTime","isDeleted","version","remark"]){
    assert.doesNotMatch(employee,new RegExp(`(?:^|;)${forbidden}:`));
  }
});
