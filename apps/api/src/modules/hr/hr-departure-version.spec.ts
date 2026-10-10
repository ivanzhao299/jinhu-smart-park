import assert from "node:assert/strict";
import test from "node:test";
import type {DataSource,EntityManager} from "typeorm";
import type {AuditService} from "../audit/audit.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrDepartureService} from "./hr-departure.service";
const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"};
const actor=(permissions:string[]):JwtPrincipal=>({sub:"reviewer",username:"synthetic",roles:[],permissions,...scope});
const row={id:"application",version:7,application_no:"SYN-7",application_name:"Synthetic departure",applicant_user_id:"applicant",subject_employee_id:"employee",application_date:"2026-10-01",planned_departure_date:"2026-10-10",reason:"Synthetic reason",status:"submitted",review_comment:"Actual opinion",reviewed_at:"2026-10-10T04:00:00Z",private_column:"internal"};
const audit={recordOperationRequired:async()=>undefined} as unknown as AuditService;
test("departure list projects actual version and authorized opinion/time without internal fields",async()=>{
 const db={query:async(sql:string)=>sql.includes("count(*)")?[{total:1}]:[row]} as unknown as DataSource;
 const service=new HrDepartureService(db,audit);
 const full=await service.list(scope,actor(["hr:departure:read"]),{page:1,page_size:50});
 assert.equal(full.items[0]?.version,7);assert.equal(full.items[0]?.reviewedAt,row.reviewed_at);assert.equal(full.items[0]?.reviewComment,row.review_comment);assert.equal("private_column" in full.items[0]!,false);
 const self=await service.list(scope,actor(["hr:departure:self_read"]),{page:1,page_size:50});
 assert.equal(self.items[0]?.version,7);assert.equal(self.items[0]?.reviewedAt,undefined);assert.equal(self.items[0]?.reviewComment,undefined);assert.equal(self.items[0]?.reason,undefined);
});
test("departure review returns the persisted new version and actual opinion from transaction readback",async()=>{
 const opinion="Correct the handover plan";let updated=false;
 const manager={query:async(sql:string,params:unknown[])=>{
  if(sql.includes("FOR UPDATE"))return [row];
  if(sql.startsWith("UPDATE hr_departure_application")){assert.equal(params[0],"returned");assert.equal(params[1],opinion);updated=true;return [];}
  if(sql.startsWith("SELECT d.*")){assert.ok(updated);return [{...row,version:8,status:"returned",review_comment:opinion}];}
  return [];
 }};
 const db={transaction:async<T>(work:(m:EntityManager)=>Promise<T>)=>work(manager as unknown as EntityManager)} as unknown as DataSource;
 const result=await new HrDepartureService(db,audit).review(scope,actor(["hr:departure:read","hr:departure:review"]),"application",{action:"return",comment:opinion});
 assert.equal(result.version,8);assert.equal(result.reviewComment,opinion);assert.equal(result.reviewedAt,row.reviewed_at);assert.equal(result.status,"returned");
});

test("team readers receive the scoped projection and an auditable team read",async()=>{
 let auditInput:unknown;
 const scopedAudit={recordOperationRequired:async(input:unknown)=>{auditInput=input;}} as unknown as AuditService;
 const db={query:async(sql:string)=>sql.includes("count(*)")?[{total:1}]:[row]} as unknown as DataSource;
 const result=await new HrDepartureService(db,scopedAudit).list(scope,actor(["hr:departure:team_read"]),{page:1,page_size:50});
 assert.equal(result.items[0]?.reason,undefined);
 assert.equal(result.items[0]?.reviewComment,undefined);
 assert.deepEqual((auditInput as {afterJson:{fieldGroups:string[];projection:string}}).afterJson,{fieldGroups:[],projection:"team",itemCount:1});
});

test("departure list fails closed when its mandatory sensitive-read audit cannot persist",async()=>{
 const failingAudit={recordOperationRequired:async()=>{throw new Error("Synthetic audit unavailable");}} as unknown as AuditService;
 const db={query:async(sql:string)=>sql.includes("count(*)")?[{total:1}]:[row]} as unknown as DataSource;
 await assert.rejects(new HrDepartureService(db,failingAudit).list(scope,actor(["hr:departure:read"]),{page:1,page_size:50}),/Synthetic audit unavailable/);
});
