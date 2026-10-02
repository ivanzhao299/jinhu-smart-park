import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import type {DataSource,EntityManager} from "typeorm";
import type {AuditService} from "../audit/audit.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrPayrollHistoryService} from "./hr-payroll-history.service";
const scope={tenantId:"tenant",parkId:"park"};
const actor={sub:"actor",username:"synthetic",roles:[],permissions:["*"],...scope} as JwtPrincipal;
const query={legacyBatchId:"legacy",attendanceInputBatchId:"attendance",page:1,page_size:50};
function fixture(auditFails=false){
 const calls:Array<{sql:string;params:unknown[]}> = [];let audited=false;
 const manager={query:async(sql:string,params:unknown[]=[])=>{
  calls.push({sql,params});if(sql.includes("SELECT p.period_month"))return [{period_month:"2026-07-01"}];
  if(sql.includes("SELECT status FROM hr_payroll_legacy_batch"))return [{status:"published"}];
  if(sql.includes("count(*)::int AS total"))return [{total:1}];
  if(sql.includes('employee_code AS "employeeCode"'))return [{employeeId:"employee",employeeCode:"SYN-1",fullName:"Synthetic"}];
  if(sql.includes("UNION ALL SELECT"))return [{employeeId:"employee",sourceId:"historical",sourceKind:"historical",expectedVersion:1,expectedHash:null}];
  return [];
 }} as unknown as EntityManager;
 const db={transaction:async(isolation:string,fn:(m:EntityManager)=>unknown)=>{assert.equal(isolation,"REPEATABLE READ");return fn(manager);}} as DataSource;
 const audit={recordOperationRequired:async(input:Record<string,unknown>,m:EntityManager)=>{assert.equal(m,manager);assert.deepEqual(input.afterJson,{employeeCount:1,optionCount:1});audited=true;if(auditFails)throw new Error("audit unavailable");}} as unknown as AuditService;
 return {service:new HrPayrollHistoryService(db,audit),calls,get audited(){return audited;}};
}
test("source option authority precedes all identity probes",async()=>{
 const f=fixture();await assert.rejects(()=>f.service.insuranceSourceOptions(scope,{...actor,permissions:[]},query),/permission/);assert.equal(f.calls.length,0);
});
test("source options are bounded scoped projections with required same-manager audit",async()=>{
 const f=fixture();const result=await f.service.insuranceSourceOptions(scope,actor,query);assert.equal(result.total,1);assert.equal(f.audited,true);
 assert.equal(result.items[0]!.options[0]!.expectedHash,undefined);
 const page=f.calls.find(call=>call.sql.includes('employee_code AS "employeeCode"'))!;assert.deepEqual(page.params,["tenant","park","2026-07-01","legacy",50,0]);
 assert.ok(!f.calls.some(call=>/SELECT.*(?:salary|employee_amount|total_amount)/u.test(call.sql)));
 await assert.rejects(()=>fixture(true).service.insuranceSourceOptions(scope,actor,query),/audit unavailable/);
});
