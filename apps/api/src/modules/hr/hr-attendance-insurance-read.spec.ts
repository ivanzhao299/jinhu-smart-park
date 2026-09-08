import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrService } from "./hr.service";

const scope={tenantId:"tenant-1",parkId:"park-1"};
type TestScope=typeof scope;
type TestAccess="park"|"managed_org_tree"|"self";
const raw={id:"period-1",employee_id:"employee-1",employee_code:"JH-001",employee_name:"张三",period_year:2025,period_month:7,needs_review:false,review_reason_code:null,legacy_compatibility:{legacyFlags:{fund:"Y"},fieldPresence:{insureaccount:true}}};
const items=[{insuranceKind:"pension",contributionBase:"5000.00",employeeAmount:"400.00",employerAmount:"800.00",totalAmount:"1200.00",supplementAmount:"0.00",legacyBaseNegative:false}];

async function project(access:TestAccess,includeItems=true,canReadAmounts=access==="self",source:Record<string,unknown>=raw){
 const target={insuranceItems:{find:async()=>items}};
 const projector=(HrService.prototype as unknown as {projectInsurancePeriod:(scope:TestScope,row:Record<string,unknown>,access:TestAccess,includeItems:boolean,canReadAmounts:boolean)=>Promise<Record<string,unknown>>}).projectInsurancePeriod;
 return projector.call(target,scope,source,access,includeItems,canReadAmounts);
}

test("insurance projections expose employer cost only to park HR",async()=>{
 const park=await project("park",true,true),team=await project("managed_org_tree"),self=await project("self");
 assert.deepEqual(Object.keys(park),["id","periodYear","periodMonth","needsReview","reviewReasonCode","itemCount","employeeId","employeeCode","employeeName","employeeAmount","supplementAmount","employerAmount","totalAmount","legacyCompatibility","items"]);
 assert.equal((park.items as Array<Record<string,unknown>>)[0]?.employerAmount,"800.00");
 assert.deepEqual(park.legacyCompatibility,{legacyFlags:{fund:"Y"},fieldPresence:{insureaccount:true}});
 assert.deepEqual(Object.keys(team),["id","periodYear","periodMonth","needsReview","reviewReasonCode","itemCount","employeeId","employeeCode","employeeName"]);
 assert.equal("legacyCompatibility" in team,false);
 assert.equal("items" in team,false);
 assert.equal("employeeAmount" in team,false);assert.equal("supplementAmount" in team,false);
 assert.deepEqual(Object.keys(self),["id","periodYear","periodMonth","needsReview","reviewReasonCode","itemCount","employeeAmount","supplementAmount","items"]);
 assert.equal("employeeId" in self,false);assert.equal("employerAmount" in self,false);assert.equal("totalAmount" in self,false);
 assert.equal("legacyCompatibility" in self,false);
 assert.equal("employerAmount" in (self.items as Array<Record<string,unknown>>)[0]!,false);
 for(const output of [park,team,self])for(const forbidden of ["sourceSnapshot","legacyId","tenantId","parkId","createBy","updateBy","remark","version"])assert.equal(forbidden in output,false);
});

test("insurance compatibility strips unknown source fields and malformed nested values",async()=>{
 const source={...raw,legacy_compatibility:{privateRaw:"PRIVATE",legacyFlags:{fund:"Y",oldage:null,remedy:0,losework:false,wound:Infinity,bear:{raw:"PRIVATE"},bankAccount:"PRIVATE"},fieldPresence:{insureaccount:true,hurt:"PRIVATE",privateRaw:true}}};
 const result=await project("park",false,false,source);
 assert.deepEqual(result.legacyCompatibility,{legacyFlags:{oldage:null,remedy:0,losework:false,fund:"Y"},fieldPresence:{insureaccount:true}});
 assert.ok(!JSON.stringify(result).includes("PRIVATE"));
 assert.equal("legacyCompatibility" in await project("self",false,false,source),false);
});

test("M6 Slice 1 adds no write route or historical schema mutation",()=>{
 const controller=readFileSync(resolve(__dirname,"hr.controller.ts"),"utf8");
 const service=readFileSync(resolve(__dirname,"hr.service.ts"),"utf8");
 for(const route of ["attendance/calendars","insurance/periods","insurance/periods/me","insurance/periods/:id"])assert.match(controller,new RegExp(`@Get\\("${route}"\\)`));
 assert.doesNotMatch(controller,/@(?:Post|Put|Delete)\("(?:attendance\/calendars|insurance\/)/);
 assert.doesNotMatch(service,/getRepository\((?:HrAttendanceCalendarSourceEntity|HrAttendanceDayEntity|HrEmployeeInsurancePeriodEntity|HrEmployeeInsuranceItemEntity)\)[\s\S]{0,120}\.save\(/);
 for(const field of ["source_snapshot","legacy_id","tenant_id","park_id","create_by","update_by","remark","version"])assert.doesNotMatch(service,new RegExp(`AS ${field}\\b`));
 assert.match(service,/reviewReasonCode/);
});

test("insurance review projection exposes only a whitelisted reason code",async()=>{
 const target={insuranceItems:{find:async()=>items}};
 const projector=(HrService.prototype as unknown as {projectInsurancePeriod:(scope:TestScope,row:Record<string,unknown>,access:TestAccess,includeItems:boolean,canReadAmounts:boolean)=>Promise<Record<string,unknown>>}).projectInsurancePeriod;
 const reviewed=await projector.call(target,scope,{...raw,needs_review:true,review_reason_code:"T3_INT4_INVALID"},"park",false,true);
 assert.equal(reviewed.reviewReasonCode,"T3_INT4_INVALID");
 assert.equal("sourceSnapshot" in reviewed,false);
 const fallback=await projector.call(target,scope,{...raw,needs_review:true,review_reason_code:"UNTRUSTED"},"park",false,true);
 assert.equal(fallback.reviewReasonCode,"T3_RECORD_NEEDS_REVIEW");
});

test("attendance and insurance reads fail before response when required audit is unavailable",async()=>{
 const qb={where(){return this;},andWhere(){return this;},innerJoin(){return this;},select(){return this;},orderBy(){return this;},addOrderBy(){return this;},skip(){return this;},take(){return this;},offset(){return this;},limit(){return this;},clone(){return this;},async getCount(){return 0;},async getMany(){return [];},async getRawMany(){return [];}};
 const args=Array(32).fill({});args[22]={createQueryBuilder:()=>qb};args[23]={createQueryBuilder:()=>qb};args[24]={createQueryBuilder:()=>qb};args[25]={find:async()=>[]};args[31]={recordOperationRequired:async()=>{throw new Error("required audit unavailable");}};
 const service=Reflect.construct(HrService,args) as HrService;
 const base={sub:"user-1",username:"tester",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],isSuper:false};
 const attendance={...base,permissions:[HR_PERMISSIONS.HR_ATTENDANCE_READ]} as JwtPrincipal;
 const insurance={...base,permissions:[HR_PERMISSIONS.HR_INSURANCE_READ]} as JwtPrincipal;
 await assert.rejects(service.listAttendanceCalendars(scope,attendance,{page:1,page_size:20}),/required audit unavailable/u);
 await assert.rejects(service.listInsurancePeriods(scope,insurance,{page:1,page_size:20}),/required audit unavailable/u);
});

test("the self-only insurance service entry cannot be forced without the exact permission",async()=>{
 const args=Array(32).fill({});
 const service=Reflect.construct(HrService,args) as HrService;
 const actor={sub:"user-1",username:"tester",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[HR_PERMISSIONS.HR_INSURANCE_TEAM_READ],isSuper:false} as JwtPrincipal;
 assert.deepEqual(await service.listInsurancePeriods(scope,actor,{page:1,page_size:20},true),{items:[],total:0,page:1,page_size:20});
});

test("empty authorized insurance scopes are audited before returning",async()=>{
 let audits=0;
 const args=Array(32).fill({});
 args[31]={recordOperationRequired:async()=>{audits+=1;}};
 const service=Reflect.construct(HrService,args) as HrService;
 Object.assign(service,{ledgerEmployeeIds:async()=>[]});
 const actor={sub:"user-1",username:"tester",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[HR_PERMISSIONS.HR_INSURANCE_TEAM_READ],isSuper:false} as JwtPrincipal;
 assert.deepEqual(await service.listInsurancePeriods(scope,actor,{page:1,page_size:20}),{items:[],total:0,page:1,page_size:20});
 assert.equal(audits,1);
});
