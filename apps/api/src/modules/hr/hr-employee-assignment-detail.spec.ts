import assert from "node:assert/strict";
import test from "node:test";
import {NotFoundException} from "@nestjs/common";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrService} from "./hr.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"};
const actor=(permission:string):JwtPrincipal=>({sub:"synthetic-user",username:"synthetic",...scope,roles:[],permissions:[permission]});
function fixture(options:{missingOrg?:boolean;inactive?:boolean;missingPosition?:boolean;managerId?:string|null;managerFailure?:Error;dateFailure?:Error;selfId?:string;plannedDates?:string[];confirmedDates?:string[]}={}){
 const calls:Array<{repo:string;where:Record<string,unknown>}>=[];
 const base={id:"employee",fullName:"Synthetic employee",userId:"synthetic-user",primaryOrgId:"org",positionId:"position",managerEmployeeId:options.managerId===undefined?"manager":options.managerId,probationEndDate:"2026-10-30",attendanceCardNo:"NEVER-DISPLAY-CARD",...scope};
 const employees={findOne:async({where}:{where:Record<string,unknown>})=>{calls.push({repo:"employee",where});if(where.id==="manager"){if(options.managerFailure)throw options.managerFailure;return {...base,id:"manager",fullName:"Synthetic manager"};}return where.userId?{...base,id:options.selfId??base.id,fullName:"Synthetic own manager"}:where.id==="employee"?base:null;}};
 const orgs={findOne:async({where}:{where:Record<string,unknown>})=>{calls.push({repo:"org",where});return options.missingOrg?null:{id:"org",orgName:"Synthetic org",status:options.inactive?"disabled":"enabled"};}};
 const positions={findOne:async({where}:{where:Record<string,unknown>})=>{calls.push({repo:"position",where});return options.missingPosition?null:{id:"position",positionName:"Synthetic position",status:"enabled"};}};
 const args=Array(33).fill({});args[0]=employees;args[1]=positions;args[27]=orgs;args[30]={query:async(sql:string)=>{if(options.dateFailure&&(sql.includes("hr_probation_application_employee")||sql.includes("hr_employment_event")))throw options.dateFailure;return sql.includes("hr_probation_application_employee")?(options.plannedDates??[]).map(date=>({date})):sql.includes("hr_employment_event")?(options.confirmedDates??[]).map(date=>({date})):[{id:"employee"}];}};
 return {service:Reflect.construct(HrService,args) as HrService,calls};
}
test("detail emits scoped label allowlists and source-separated employment dates without card or entity internals",async()=>{
 const f=fixture({plannedDates:["2026-10-31"],confirmedDates:["2026-10-30"]}),r=await f.service.detailEmployeeForActor(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_READ),"employee");
 assert.deepEqual(r.assignmentDetails,{organization:{name:"Synthetic org",status:"available"},position:{name:"Synthetic position",status:"available"},manager:{name:"Synthetic manager",status:"available"}});
 assert.deepEqual(r.employmentDates,{unclassifiedRecordedDate:{date:"2026-10-30",status:"unclassified"},plannedConfirmation:{dates:["2026-10-31"],status:"planned"},confirmedEmployment:{dates:["2026-10-30"],status:"recorded"}});for(const key of ["attendanceCardNo","probationEndDate","tenantId","parkId"])assert.equal(key in r,false);
 for(const call of f.calls){assert.equal(call.where.tenantId,scope.tenantId);assert.equal(call.where.parkId,scope.parkId);assert.equal(call.where.isDeleted,false);}
 assert.equal(f.calls.find(c=>c.repo==="position")?.where.orgId,"org");
});
for(const permission of [HR_PERMISSIONS.HR_EMPLOYEE_SELF_READ,HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ])test(`${permission} cannot turn a manager UUID into a hidden person label read`,async()=>{
 const f=fixture(),r=await f.service.detailEmployeeForActor(scope,actor(permission),"employee");assert.deepEqual(r.assignmentDetails.manager,{name:null,status:"unavailable"});assert.equal(f.calls.some(c=>c.where.id==="manager"),false);
});
test("none and cross-principal scope fail before any employee or reference query",async()=>{
 for(const principal of [actor(HR_PERMISSIONS.HR_PAYSLIP_SELF_READ),{...actor(HR_PERMISSIONS.HR_EMPLOYEE_READ),parkId:"foreign"},{...actor(HR_PERMISSIONS.HR_EMPLOYEE_READ),tenantId:"foreign"}]){const f=fixture();await assert.rejects(f.service.detailEmployeeForActor(scope,principal,"employee"),NotFoundException);assert.equal(f.calls.length,0);}
});
test("inactive missing and mismatched links retain distinct safe states",async()=>{
 const r=await fixture({inactive:true,missingPosition:true,managerId:null}).service.detailEmployeeForActor(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_READ),"employee");assert.equal(r.assignmentDetails.organization.status,"inactive");assert.equal(r.assignmentDetails.position.status,"unavailable");assert.equal(r.assignmentDetails.manager.status,"unassigned");
 const f=fixture({missingOrg:true});assert.equal((await f.service.detailEmployeeForActor(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_READ),"employee")).assignmentDetails.organization.status,"unavailable");assert.equal(f.calls.some(c=>c.repo==="position"),false);
});
test("a manager database failure is not disguised as an unavailable relationship",async()=>{await assert.rejects(fixture({managerFailure:new Error("synthetic database failure")}).service.detailEmployeeForActor(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_READ),"employee"),/synthetic database failure/);});
test("a modern employment-date source failure is not disguised as an unclassified fact",async()=>{await assert.rejects(fixture({dateFailure:new Error("synthetic modern date query failure")}).service.detailEmployeeForActor(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_READ),"employee"),/synthetic modern date query failure/);});

test("team detail displays the already-resolved own manager name without a new person lookup",async()=>{
 const f=fixture({selfId:"own-anchor",managerId:"own-anchor"});const r=await f.service.detailEmployeeForActor(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ),"employee");assert.deepEqual(r.assignmentDetails.manager,{name:"Synthetic own manager",status:"available"});assert.equal(f.calls.some(c=>c.where.id==="own-anchor"),false);
});
