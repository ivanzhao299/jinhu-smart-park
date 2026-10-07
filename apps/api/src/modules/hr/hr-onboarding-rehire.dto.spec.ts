import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HrRehireOptionsDto, SaveHrOnboardingApplicationDto } from "./dto/hr-onboarding.dto";

const employeeId="00000000-0000-4000-8000-000000000001";
const initial={applicationName:"Formal entry",employeeId,applicationDate:"2026-02-01",plannedHireDate:"2026-02-02",probationMonths:0,attendanceCardNo:"12345"};
const rehire={...initial,entryType:"rehire",expectedEmployeeVersion:1,targetOrgId:employeeId,targetPositionId:employeeId,targetManagerEmployeeId:null};
const errors=(input:object)=>validate(plainToInstance(SaveHrOnboardingApplicationDto,input));

test("rehire requests require a positive version, current assignment and explicit manager choice",async()=>{
 assert.equal((await errors(rehire)).length,0);
 for(const field of ["expectedEmployeeVersion","targetOrgId","targetPositionId","targetManagerEmployeeId"]){
  const input={...rehire} as Record<string,unknown>;delete input[field];assert.ok((await errors(input)).some(e=>e.property===field),field);
 }
 for(const value of [0,-1,1.5,"1",null])assert.ok((await errors({...rehire,expectedEmployeeVersion:value})).length>0);
 assert.ok((await errors({...rehire,targetManagerEmployeeId:"not-a-uuid"})).length>0);
});

test("initial onboarding retains its existing request shape",async()=>{assert.equal((await errors(initial)).length,0);});

test("rehire reference queries enforce bounded pages and valid search scope",async()=>{
 assert.equal((await validate(plainToInstance(HrRehireOptionsDto,{page:"2",page_size:"20",kind:"manager",employeeId}))).length,0);
 for(const input of [{page:0},{page_size:101},{kind:"all"},{employeeId:"invalid"},{keyword:"x".repeat(101)}])assert.ok((await validate(plainToInstance(HrRehireOptionsDto,input))).length>0);
});
