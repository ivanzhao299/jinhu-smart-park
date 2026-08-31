import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(__dirname,"../.."),read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("decision center is dedicated, aggregate-only, mobile-safe, and wired to its protected API",()=>{
 const page=read("app/hr/decision-center/HrDecisionCenterClient.tsx"),api=read("lib/hr-api.ts"),menu=read("lib/menu.ts"),seed=read("../../database/seeds/production/000016_hr_management_foundation.sql");
 assert.match(page,/HR_DECISION_CENTER_PAGE/);assert.match(page,/permission="hr:decision_center"/);assert.match(page,/abortRef\.current\?\.abort/);assert.match(page,/ds-mobile-record-list/);assert.match(page,/不展示员工身份信息、联系方式、档案敏感字段或薪资金额/);
 assert.match(page,/岗位编制与在岗/);assert.match(page,/仅统计已启用岗位；未设置编制人数不作为零。/);assert.match(page,/snapshot\.staffing\.activeUnassignedHeadcount/);assert.match(page,/snapshot\.staffing\.overCapacityPositionCount/);
 assert.doesNotMatch(page,/fullName|employeeCode|workMobile|workEmail|salary/);
 assert.match(api,/workforceDecisionSnapshot:/);assert.match(api,/\/hr\/decision-center\/workforce/);assert.match(menu,/"\/hr\/decision-center"/);assert.match(seed,/'hr:decision_center','人力资源决策中心','page','\/hr\/decision-center'/);assert.match(seed,/'HR_MANAGER','人力资源负责人','hr:decision_center'/);
});
