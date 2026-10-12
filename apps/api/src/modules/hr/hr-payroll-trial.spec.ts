import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import type { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";
import { HrPayrollTrialService } from "./hr-payroll-trial.service";
import { comparePayrollTrialItems, payrollTrialDifference, type TrialSourceItem } from "./hr-payroll-trial-comparison";
import { calculateFormalPayroll } from "./hr-payroll-formal-calculation";

test("trial denies each missing permission and invalid nested inputs before probing", async () => {
  let probes=0;
  const db={transaction:()=>{probes++;}} as unknown as DataSource;
  const service=new HrPayrollTrialService(db,{} as HrPayrollFormalInputService,{} as HrPayrollFormalRunService,{} as AuditService);
  const scope={tenantId:"synthetic",parkId:"synthetic"};
  const permissions=[HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ,HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_PAYROLL_RULE_READ,HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE];
  const actor:JwtPrincipal={...scope,sub:randomUUID(),username:"synthetic",roles:[],permissions};
  for(const permission of permissions){const denied={...actor,permissions:permissions.filter(p=>p!==permission)};await assert.rejects(()=>service.options(scope,denied,{}),ForbiddenException);await assert.rejects(()=>service.calculate(scope,denied,{} as never),ForbiddenException);}
  const book={bookId:randomUUID(),inputId:randomUUID(),expectedInputVersion:1,reconciliationSourceId:randomUUID(),mappings:[]};
  const body={legacyBatchId:randomUUID(),month:"2026-07",books:[book]};
  await assert.rejects(()=>service.calculate(scope,{...actor,parkId:"foreign"},body),ForbiddenException);
  for(const bad of [{...body,books:[{...book,correctionOfRunId:randomUUID()}]},{...body,books:[book,book]},{...body,books:[{...book,expectedInputVersion:0}]},{...body,month:"2026-13"}])await assert.rejects(()=>service.calculate(scope,actor,bad),BadRequestException);
  await assert.rejects(()=>service.options(scope,actor,{month:"2026-07"}),BadRequestException);
  assert.equal(probes,0);
});
test("exact comparison preserves signed four decimals, zero, missing, null, text, unmatched and ambiguous source rows",()=>{
  assert.equal(payrollTrialDifference("900719925474.12","900719925474.1234"),"-0.0034");
  assert.equal(payrollTrialDifference("-0.01","-0.0100"),"0.0000");
  const calculation=calculateFormalPayroll({roundingPolicy:"line_items_half_up",items:[{code:"收入",role:"earning",expression:null},{code:"税",role:"tax",expression:null},{code:"应发",role:"gross",expression:"[收入]"},{code:"实发",role:"net",expression:"[应发]-[税]"}]},{directItems:{收入:"100.2350",税:"0.0000"},hrInputs:{}});
  const old=(id:string,patch:Partial<TrialSourceItem>={}):TrialSourceItem=>({id,snapshotId:"record",itemVersionId:id,name:"重名",valueType:"decimal",isSourceNull:false,value:"100.2350",known:true,...patch});
  const lines=comparePayrollTrialItems(calculation,[{modernCode:"收入",sourceItemVersionId:"salary"},{modernCode:"税",sourceItemVersionId:"null"},{modernCode:"应发",sourceItemVersionId:"text"}], [old("salary"),old("null",{value:null,isSourceNull:true}),old("text",{value:null,valueType:"text"}),old("extra",{value:"0.0000"}),old("unknown",{itemVersionId:null,known:false,value:null})]);
  assert.deepEqual(lines.map(row=>row.status),["different","source_null","nonnumeric","unmapped","source_only","unknown_source"]);assert.equal(lines[0]?.difference,"0.0050");
  const ambiguous=comparePayrollTrialItems(calculation,[{modernCode:"收入",sourceItemVersionId:"salary"},{modernCode:"税",sourceItemVersionId:"missing"}],[old("a",{itemVersionId:"salary"}),old("b",{itemVersionId:"salary"})]);
  assert.equal(ambiguous[0]?.status,"ambiguous_source");assert.equal(ambiguous[1]?.status,"missing_source");assert.equal(ambiguous.filter(row=>row.status==="source_only").length,2);
  assert.throws(()=>comparePayrollTrialItems(calculation,[{modernCode:"收入",sourceItemVersionId:"same"},{modernCode:"税",sourceItemVersionId:"same"}],[]),BadRequestException);
});


test("trial source options deny insurance without probing insurance facts", async () => {
  const queries:string[]=[];
  const manager={query:async(sql:string)=>{queries.push(sql);return [];}};
  const db={transaction:async(callback:(manager:unknown)=>unknown)=>callback(manager)} as unknown as DataSource;
  const scope={tenantId:"synthetic",parkId:"synthetic"},actor:JwtPrincipal={...scope,sub:randomUUID(),username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ,HR_PERMISSIONS.HR_EMPLOYEE_READ]};
  const inputs={lockConfirmedInput:async()=>({period:{month:"2026-07"},input:{employees:[{employeeId:randomUUID()}]},rule:{definition_evidence:{items:[{dependencies:["hr:养老保险个人金额"]}]}}})} as unknown as HrPayrollFormalInputService;
  const service=new HrPayrollFormalRunService(db,inputs,{} as AuditService);
  await assert.rejects(()=>service.options(scope,actor,{inputId:randomUUID(),expectedInputVersion:1,page:1,pageSize:20},true),ForbiddenException);
  assert.ok(queries.every(sql=>sql.startsWith("SET LOCAL")));
});
