import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { HrEmployeeProfileEntity } from "./entities/hr.entities";
import { HrService } from "./hr.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
const managerId="00000000-0000-4000-8000-000000000001";
const managedId="00000000-0000-4000-8000-000000000002";
const siblingId="00000000-0000-4000-8000-000000000003";
const actor=(permission:string,sub="10000000-0000-4000-8000-000000000001"):JwtPrincipal=>({sub,username:"actor",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[permission]});
const profile={
  id:"20000000-0000-4000-8000-000000000001",employeeId:managedId,idType:"resident_id",
  idNumberMasked:"320812198901011234",idNumberEncrypted:"encrypted-private-value",
  personalMobile:"13812345678",personalEmail:"private@example.com",address:"private address",
  emergencyContactName:"王小明",emergencyContactMobile:"13987654321",remark:"private remark",
  tenantId:scope.tenantId,parkId:scope.parkId,createBy:"private-actor",updateBy:"private-actor",
} as HrEmployeeProfileEntity;

function serviceFor(options:{managedIds?:string[];auditError?:Error}={}){
  let profileReads=0,auditCalls=0;
  const employees={findOne:async({where}:{where:Record<string,unknown>})=>{
    if(where.userId)return {id:managerId,userId:where.userId};
    if(where.id)return {id:where.id,userId:null};
    return null;
  }};
  const profiles={findOne:async({where}:{where:Record<string,unknown>})=>{profileReads+=1;return {...profile,employeeId:String(where.employeeId)};}};
  const dataSource={query:async()=> (options.managedIds??[managedId]).map(id=>({id}))};
  const audit={recordOperationRequired:async()=>{auditCalls+=1;if(options.auditError)throw options.auditError;}};
  const sensitive={decrypt:()=>"must-not-be-returned"};
  const args=Array(33).fill({});args[0]=employees;args[3]=profiles;args[30]=dataSource;args[31]=audit;args[32]=sensitive;
  return {service:Reflect.construct(HrService,args) as HrService,counts:()=>({profileReads,auditCalls})};
}

test("department manager receives only an audited masked profile inside the managed tree",async()=>{
  const fixture=serviceFor();
  const result=await fixture.service.employeeProfile(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_TEAM_READ),managedId);
  assert.equal(result?.personalMobile,"138****5678");
  for(const forbidden of ["idNumberEncrypted","idNumber","tenantId","parkId","createBy","updateBy","remark","dateOfBirth","highestEducation"]){
    assert.equal(forbidden in (result??{}),false,`${forbidden} must not be exposed`);
  }
  assert.deepEqual(fixture.counts(),{profileReads:1,auditCalls:1});
});

test("manager cross-tree and employee cross-person UUID guesses fail before profile lookup",async()=>{
  const manager=serviceFor({managedIds:[managedId]});
  await assert.rejects(manager.service.employeeProfile(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_TEAM_READ),siblingId),NotFoundException);
  assert.deepEqual(manager.counts(),{profileReads:0,auditCalls:0});

  const employee=serviceFor();
  await assert.rejects(employee.service.employeeProfile(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_SELF_READ),managedId),NotFoundException);
  assert.deepEqual(employee.counts(),{profileReads:0,auditCalls:0});
});

test("employee self endpoint resolves the linked employee and keeps the self-masked allowlist",async()=>{
  const fixture=serviceFor();
  const result=await fixture.service.myEmployeeProfile(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_SELF_READ));
  assert.equal(result?.employeeId,managerId);
  assert.equal(result?.personalEmail,"p***@example.com");
  assert.equal("remark" in (result??{}),false);
  assert.deepEqual(fixture.counts(),{profileReads:1,auditCalls:1});
});

test("unrelated permissions resolve to none and never query a sensitive profile",async()=>{
  const fixture=serviceFor();
  await assert.rejects(fixture.service.employeeProfile(scope,actor(HR_PERMISSIONS.HR_PAYSLIP_SELF_READ),managedId),NotFoundException);
  assert.deepEqual(fixture.counts(),{profileReads:0,auditCalls:0});
});

test("required audit failure rejects the sensitive response",async()=>{
  const fixture=serviceFor({auditError:new Error("audit unavailable")});
  await assert.rejects(fixture.service.employeeProfile(scope,actor(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_TEAM_READ),managedId),/audit unavailable/u);
  assert.deepEqual(fixture.counts(),{profileReads:1,auditCalls:1});
});
