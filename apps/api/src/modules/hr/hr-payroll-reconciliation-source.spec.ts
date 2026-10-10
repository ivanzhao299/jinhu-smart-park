import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, ConflictException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DataSource, QueryFailedError } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import { CreateHrPayrollReconciliationSourceDto, HrPayrollReconciliationSourcePeriodQueryDto } from "./dto/hr-payroll-history.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import { HR_PAYROLL_DSL_PARSER_VERSION, parsePayrollFormula } from "./hr-payroll-formula-dsl";

const scope={tenantId:"fixture-tenant",parkId:"fixture-park"};
const actor:JwtPrincipal={sub:"10000000-0000-4000-8000-000000000001",username:"fixture",roles:[],permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW],...scope};
const dto:CreateHrPayrollReconciliationSourceDto={legacyBatchId:"20000000-0000-4000-8000-000000000001",bookId:"30000000-0000-4000-8000-000000000001",periodMonth:"2026-07-01",bindingSha256:"a".repeat(64),sourceSha256:"b".repeat(64),snapshotCount:1,itemCount:1,reason:"fixture review"};
function fixture(failure?:string,auditFailure=false){
 const calls:Array<{sql:string;params?:unknown[]}>=[];let transactions=0;let auditCalls=0;
 const manager={query:async(sql:string,params?:unknown[])=>{
  calls.push({sql,params});
  if(sql.includes("hr_freeze")&&failure)throw new QueryFailedError(sql,params??[],Object.assign(new Error("private row must never escape"),{code:failure}));
  return [{id:"40000000-0000-4000-8000-000000000001"}];
 }};
 const db={transaction:async(isolation:string,fn:(m:typeof manager)=>Promise<unknown>)=>{transactions++;assert.equal(isolation,"READ COMMITTED");return fn(manager);}};
 const audit={recordOperationRequired:async(input:Record<string,unknown>,m:unknown)=>{
  auditCalls++;assert.equal(m,manager);assert.equal(input.method,"POST");
  assert.deepEqual(input.afterJson,{sourceSha256:dto.sourceSha256,snapshotCount:1,itemCount:1});
  assert.equal(input.beforeJson,null);if(auditFailure)throw new Error("audit unavailable");
 }};
 return {service:new HrPayrollHistoryService(db as unknown as DataSource,audit as unknown as AuditService),calls,get transactions(){return transactions;},get auditCalls(){return auditCalls;}};
}
test("ordinary employee and calculate-only actors cannot freeze history",async()=>{
 for(const permissions of [[],[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]]){
  const f=fixture();await assert.rejects(()=>f.service.createReconciliationSource(scope,{...actor,permissions},dto),ForbiddenException);assert.equal(f.transactions,0);
 }
});
test("preview requires review permission before reading history",async()=>{
 const f=fixture(); await assert.rejects(()=>f.service.previewReconciliationSource(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},dto),ForbiddenException); assert.equal(f.transactions,0);
});
test("available source months require review permission, validate the query, and keep their audit in the read transaction",async()=>{
 const query={legacyBatchId:dto.legacyBatchId,bookId:dto.bookId,page:2,pageSize:50};
 assert.equal((await validate(plainToInstance(HrPayrollReconciliationSourcePeriodQueryDto,query))).length,0);
 for(const patch of [{legacyBatchId:"nope"},{page:0},{pageSize:101},{pageSize:1.2}]) assert.ok((await validate(plainToInstance(HrPayrollReconciliationSourcePeriodQueryDto,{...query,...patch}))).length>0);
 const calls:Array<{sql:string;params?:unknown[]}>=[];let auditManager:unknown;
 const manager={query:async(sql:string,params?:unknown[])=>{calls.push({sql,params});return sql.includes("WITH eligible")?[{periodMonth:"2026-07-01",recordCount:"2",mappedRecordCount:"1",unmappedRecordCount:"1",mappedEmployeeCount:"1",mappedItemCount:"3",total:"51"}]:[];}};
 const db={transaction:async(isolation:string,fn:(m:typeof manager)=>Promise<unknown>)=>{assert.equal(isolation,"READ COMMITTED");return fn(manager);}};
 const audit={recordOperationRequired:async(input:Record<string,unknown>,m:unknown)=>{auditManager=m;assert.equal(input.method,"GET");assert.equal(input.action,"读取可用工资来源月份");assert.deepEqual(input.afterJson,{bookId:query.bookId,page:2,pageSize:50,total:51});}};
 const service=new HrPayrollHistoryService(db as unknown as DataSource,audit as unknown as AuditService);
 await assert.rejects(()=>service.reconciliationSourcePeriods(scope,{...actor,permissions:[]},query),ForbiddenException);
 assert.equal(calls.length,0);
 assert.deepEqual(await service.reconciliationSourcePeriods(scope,actor,query),{items:[{periodMonth:"2026-07-01",recordCount:2,mappedRecordCount:1,unmappedRecordCount:1,mappedEmployeeCount:1,mappedItemCount:3}],total:51,page:2,pageSize:50});
 assert.equal(auditManager,manager);assert.match(calls.find(call=>call.sql.includes("WITH eligible"))!.sql,/migration_batch/);assert.match(calls.find(call=>call.sql.includes("WITH eligible"))!.sql,/scoped_snapshots/);
});
test("available source months do not escape when their required audit fails",async()=>{
 const manager={query:async(sql:string)=>sql.includes("WITH eligible")?[{total:"0"}]:[]};
 const db={transaction:async(_isolation:string,fn:(m:typeof manager)=>Promise<unknown>)=>fn(manager)};
 const service=new HrPayrollHistoryService(db as unknown as DataSource,{recordOperationRequired:async()=>{throw new Error("audit unavailable");}} as unknown as AuditService);
 await assert.rejects(()=>service.reconciliationSourcePeriods(scope,actor,{legacyBatchId:dto.legacyBatchId,bookId:dto.bookId}),/audit unavailable/);
});
test("preview returns only scoped metadata and keeps its audit in the read transaction",async()=>{
 const metadata={legacyBatchId:dto.legacyBatchId,bookId:dto.bookId,periodMonth:dto.periodMonth,bindingSha256:dto.bindingSha256,sourceSha256:dto.sourceSha256,snapshotCount:1,itemCount:1,employeeCount:1};
 const calls:Array<{sql:string;params?:unknown[]}>=[];
 const manager={query:async(sql:string,params?:unknown[])=>{calls.push({sql,params});return [metadata];}};
 const db={transaction:async(isolation:string,fn:(m:typeof manager)=>Promise<unknown>)=>{assert.equal(isolation,"READ COMMITTED");return fn(manager);}};
 const audit={recordOperationRequired:async(input:Record<string,unknown>,m:unknown)=>{assert.equal(m,manager);assert.equal(input.method,"GET");assert.deepEqual(input.afterJson,{snapshotCount:1,itemCount:1});}};
 const service=new HrPayrollHistoryService(db as unknown as DataSource,audit as unknown as AuditService);
 assert.deepEqual(await service.previewReconciliationSource(scope,actor,dto),metadata);
 assert.match(calls[2]!.sql,/MATERIALIZED/);assert.match(calls[2]!.sql,/hr_build_payroll_reconciliation_source/);
 assert.deepEqual(calls[2]!.params,[scope.tenantId,scope.parkId,dto.legacyBatchId,dto.bookId,dto.periodMonth]);
 assert.equal(calls.some(call=>/INSERT|UPDATE|DELETE/.test(call.sql)),false);
});
test("reviewer uses scoped parameterized transaction, bounded waits and atomic metadata audit",async()=>{
 const f=fixture();const result=await f.service.createReconciliationSource(scope,actor,dto);
 assert.match(f.calls[0]!.sql,/statement_timeout='15s'/);assert.match(f.calls[1]!.sql,/lock_timeout='2s'/);
 assert.deepEqual(f.calls[2]!.params,[scope.tenantId,scope.parkId,dto.legacyBatchId,dto.bookId,dto.periodMonth,dto.bindingSha256,dto.sourceSha256,1,1,actor.sub,dto.reason]);
 assert.equal(f.auditCalls,1);assert.equal(result.sourceSha256,dto.sourceSha256);
 assert.equal("frozen_input" in result,false);assert.equal("items" in result,false);
});
test("source drift, timeout and deadlock become safe conflicts",async()=>{
 for(const code of ["P0001","55P03","57014","40P01","40001"]){
  const f=fixture(code);await assert.rejects(()=>f.service.createReconciliationSource(scope,actor,dto),error=>error instanceof ConflictException&&!error.message.includes("private row"));assert.equal(f.auditCalls,0);
 }
});
test("audit failure rejects the enclosing freeze transaction",async()=>{
 const f=fixture(undefined,true);await assert.rejects(()=>f.service.createReconciliationSource(scope,actor,dto),/audit unavailable/);
});
test("freeze DTO rejects malformed scope, dates, hashes, counts and absent review reason",async()=>{
 assert.equal((await validate(plainToInstance(CreateHrPayrollReconciliationSourceDto,dto))).length,0);
 for(const patch of [{legacyBatchId:"wrong"},{periodMonth:"2026-07-15"},{bindingSha256:"z".repeat(64)},{sourceSha256:"short"},{snapshotCount:0},{snapshotCount:5001},{itemCount:200001},{itemCount:1.5},{reason:"   "}]){
  assert.ok((await validate(plainToInstance(CreateHrPayrollReconciliationSourceDto,{...dto,...patch}))).length>0);
 }
});

function simulationFixture(sourceMonth="2026-07-01",missingSource=false,insuranceAmount?:string|null,parserOverride?:string){
 const calls:Array<{sql:string;params?:unknown[]}>=[];
 const employee="50000000-0000-4000-8000-000000000001",sourceId="60000000-0000-4000-8000-000000000001";
 const expression="[人事系统.基本工资]+[人事系统.津贴]"+(insuranceAmount !== undefined?"-[人事系统.养老保险个人金额]":""),parsed=parsePayrollFormula(expression);
 const snapshotJson=`[{"id":"70000000-0000-4000-8000-000000000001","employee_id":"${employee}","net_amount":900719925474.1234}]`;
 const itemJson='[{"snapshot_id":"70000000-0000-4000-8000-000000000001","item_version_id":"80000000-0000-4000-8000-000000000001","decimal_value":900719925474.1234,"value_type":"decimal","is_source_null":false,"is_deleted":false}]';
 const manager={query:async(sql:string,params?:unknown[])=>{
  calls.push({sql,params});
  if(sql.includes("FROM hr_attendance_payroll_input_batch b"))return [{id:"attendance",period_month:"2026-07-01",period_status:"closed",batch_status:"effective"}];
  if(sql.includes("SELECT id,status FROM hr_payroll_legacy_batch"))return [{id:dto.legacyBatchId,status:"staged"}];
  if(sql.includes("FROM hr_payroll_reconciliation_source"))return missingSource?[]:[{id:sourceId,book_id:dto.bookId,period_month:sourceMonth,source_sha256:dto.sourceSha256,snapshots_json:snapshotJson,items_json:itemJson}];
  if(sql.includes("SELECT f.id,f.book_id"))return [{id:"formula",book_id:dto.bookId,item_version_id:"item",raw_expression:expression,raw_condition:null,dsl_ast:parsed.ast,dependency_codes:parsed.dependencies,parser_version:parserOverride??parsed.parserVersion,calculation_order:1,item_code:"NET",item_category:"summary"}];
  if(sql.includes("AS x(id uuid"))return [{id:"snapshot",employee_id:employee,net_amount:"900719925474.1234",employee_version:1,book_id:dto.bookId}];
  if(sql.includes("FROM hr_payroll_reconciliation_policy_current cur"))return [{book_id:dto.bookId,policy_version_id:"policy",policy_version_no:1,net_item_version_id:"item",tolerance_amount:"0.0100",item_code:"NET",formula_version_id:"formula"}];
  if(sql.includes("FROM hr_attendance_payroll_input_item"))return [{id:"attendance-item",employee_id:employee,worked_minutes:9600,late_minutes:0,early_minutes:0,absence_days:0,missing_punch_days:0}];
  if(sql.includes("FROM hr_employee_compensation"))return [{id:"compensation",employee_id:employee,version:1,effective_from:"2026-07-01",base_salary:"120.0000",allowance_amount:"5.0000",variable_target:"0.0000"}];
  if(sql.includes("FROM hr_employee_insurance_period"))return Array.isArray(params?.[2]) && params[2].length===0?[]:[{id:"insurance",employee_id:employee,version:1,needs_review:false}];
  if(sql.includes("FROM hr_insurance_owned_revision r"))return [{id:actor.sub,employee_id:employee,revision_no:1,snapshot_sha256:"a".repeat(64),result:{items:[{insuranceKind:"oldage",amounts:{base:"0.10",employer:"0.09",employee:insuranceAmount,supplement:"0.00"}}]}}];
  if(sql.includes("FROM hr_employee_insurance_item"))return insuranceAmount===undefined?[]:[{id:"insurance-item",period_id:"insurance",version:1,insurance_kind:"oldage",employee_amount:insuranceAmount,total_amount:null,employer_amount:null,supplement_amount:null}];
  if(sql.includes("AS i(snapshot_id uuid"))return [{item_code:"NET",item_version_id:"item",decimal_value:"900719925474.1234"}];
  if(sql.startsWith("INSERT INTO hr_payroll_reconciliation_run"))return [{id:"run"}];
  if(sql.startsWith("INSERT INTO hr_payroll_reconciliation_result"))return [{id:"result"}];
  if(sql.startsWith("SELECT pg_advisory")||sql.startsWith("INSERT INTO hr_payroll_reconciliation_item_difference")||sql.startsWith("UPDATE hr_payroll_reconciliation_run"))return [];
  throw new Error(`Unexpected simulation query: ${sql.slice(0,60)}`);
 }};
 const db={transaction:async(fn:(m:typeof manager)=>Promise<unknown>)=>fn(manager)};
 return {service:new HrPayrollHistoryService(db as unknown as DataSource,{} as AuditService),calls,sourceId,snapshotJson,itemJson};
}
test("staged history stays rejected without an explicit frozen source",async()=>{
 const f=simulationFixture();await assert.rejects(()=>f.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub}),ConflictException);
 assert.equal(f.calls.some(c=>c.sql.startsWith("INSERT")),false);
});
test("wrong-period or foreign frozen source cannot fall back to live history",async()=>{
 for(const f of [simulationFixture("2026-06-01"),simulationFixture("2026-07-01",true)]){
  await assert.rejects(()=>f.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,reconciliationSourceId:f.sourceId}),ConflictException);
  assert.equal(f.calls.some(c=>c.sql.startsWith("INSERT")),false);
 }
});
test("frozen simulation uses JSON text, exact decimal evaluation, source binding and no payroll writes",async()=>{
 const f=simulationFixture();await f.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,reconciliationSourceId:f.sourceId});
 assert.equal(f.calls.find(c=>c.sql.includes("AS x(id uuid"))!.params![0],f.snapshotJson);
 assert.equal(f.calls.find(c=>c.sql.includes("AS i(snapshot_id uuid"))!.params![0],f.itemJson);
 const inserted=f.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_result"))!;
 assert.deepEqual(inserted.params!.slice(9,12),["900719925474.1234","125.0000","-900719925349.1234"]);
 const run=f.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_run"))!;
 assert.equal(run.params![15],f.sourceId);assert.match(String(run.params![10]),new RegExp(dto.sourceSha256));
 assert.equal(f.calls.some(c=>c.sql.includes("FROM hr_payroll_legacy_snapshot ")||c.sql.includes("FROM hr_payroll_legacy_snapshot_item ")),false);
 assert.equal(f.calls.some(c=>/INSERT INTO hr_payroll_run|hr_payslip|SET status='published'/.test(c.sql)),false);
});

test("reviewed insurance amount changes actual simulation result and remains frozen in run evidence",async()=>{
 const f=simulationFixture("2026-07-01",false,"0.01");
 await f.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,reconciliationSourceId:f.sourceId});
 const result=f.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_result"))!;
 assert.equal(result.params![10],"124.9900");
 const run=f.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_run"))!;
 assert.equal(run.params![4],"jinhu-payroll-dsl-v2");
 assert.equal(JSON.parse(String(run.params![9]))["50000000-0000-4000-8000-000000000001"].items[0].employeeAmount,"0.01");
 const next=simulationFixture("2026-07-01",false,"0.02");
 await next.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,reconciliationSourceId:next.sourceId});
 assert.notEqual(run.params![11],next.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_run"))!.params![11]);
 assert.equal(result.params![10],"124.9900");
});
test("insurance formula cannot reuse old approval parser or silently substitute a missing amount",async()=>{
 for(const f of [simulationFixture("2026-07-01",false,"0.01",HR_PAYROLL_DSL_PARSER_VERSION),simulationFixture("2026-07-01",false,null)]) {
  await assert.rejects(()=>f.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,reconciliationSourceId:f.sourceId}),ConflictException);
  assert.equal(f.calls.some(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_result")),false);
 }
});

test("explicit modern source freezes its identity/hash and uses a separate result FK",async()=>{
 const f=simulationFixture("2026-07-01",false,"0.03");
 const employee="50000000-0000-4000-8000-000000000001";
 const insuranceSources=[{employeeId:employee,sourceKind:"modern_confirmed" as const,sourceId:actor.sub,expectedVersion:1,expectedHash:"a".repeat(64)}];
 const principal={...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE,HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ,HR_PERMISSIONS.HR_EMPLOYEE_READ]};
 await f.service.simulateReconciliation(scope,principal,{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,reconciliationSourceId:f.sourceId,insuranceSources});
 const result=f.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_result"))!;
 assert.equal(result.params![7],null);assert.equal(result.params![14],actor.sub);assert.equal(result.params![10],"124.9700");
 const run=f.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_run"))!;
 const frozen=JSON.parse(String(run.params![9]))[employee];
 assert.equal(frozen.snapshotVersion,"insurance-modern-v1");assert.equal(frozen.snapshotHash,"a".repeat(64));
 const difference=f.calls.find(c=>c.sql.startsWith("INSERT INTO hr_payroll_reconciliation_item_difference"))!;
 assert.ok(difference.params!.some(value=>typeof value==="string" && value.includes('"insuranceModernRevisionId"')));
 assert.deepEqual(f.calls.find(c=>c.sql.includes("FROM hr_employee_insurance_period"))!.params![2],[]);
});
test("modern source permission denial happens before probes and explicit historical version drift rejects",async()=>{
 const f=simulationFixture();const employeeId="50000000-0000-4000-8000-000000000001";
 await assert.rejects(()=>f.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,insuranceSources:[{employeeId,sourceKind:"modern_confirmed",sourceId:actor.sub,expectedVersion:1,expectedHash:"a".repeat(64)}]}),ForbiddenException);
 assert.equal(f.calls.length,0);
 await assert.rejects(()=>f.service.simulateReconciliation(scope,{...actor,permissions:[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE]},{legacyBatchId:dto.legacyBatchId,attendanceInputBatchId:actor.sub,reconciliationSourceId:f.sourceId,insuranceSources:[{employeeId,sourceKind:"historical",sourceId:"insurance",expectedVersion:2}]}),/stale, foreign or changed/u);
 assert.equal(f.calls.some(c=>c.sql.startsWith("INSERT")),false);
});
