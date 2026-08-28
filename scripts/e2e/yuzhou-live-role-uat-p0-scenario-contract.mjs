import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createYuzhouP0Plans,provisionYuzhouP0Fixture } from "../hr-cutover/yuzhou-live-role-uat-p0-scenario.mjs";

const root=resolve(import.meta.dirname,"../.."),read=path=>readFileSync(resolve(root,path),"utf8");
const matrix=JSON.parse(read("scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json"));
const fixtureKeys=["employeeId","outsideEmployeeId","contractId","selfApprovalId","outsideApprovalId","insurancePeriodId","payrollRunId","teamReminderId","selfReminderId","reminderId","cancelReminderId","outsideReminderId","contractFileId","outsideContractFileId","auditFailureFileId","storageFailureFileId"];
const ids=Object.fromEntries(fixtureKeys.map((key,index)=>[key,`aaaaaaaa-aaaa-4aaa-8aaa-${String(index+1).padStart(12,"0")}`]));

test("P0 scenario owns exact isolated fixtures and reversible audit/storage faults",()=>{
 const source=read("scripts/hr-cutover/yuzhou-live-role-uat-p0-scenario.mjs"),runner=read("scripts/hr-cutover/run-full-domain-technical-uat.mjs");
 for(const table of ["hr_approval_request","hr_employee_skill","hr_legacy_employee_materialization_gap","hr_employee_insurance_period","hr_employee_insurance_item","hr_payroll_period","hr_payroll_run","hr_payslip","hr_contract_reminder_policy","hr_contract_reminder","sys_file"])assert.match(source,new RegExp(table));
 for(const proof of ["selfApprovalId","outsideApprovalId","teamReminderId","outsideReminderId","insurancePeriodId","payrollRunId","contractFileId","outsideContractFileId","auditFailureFileId","storageFailureFileId"])assert.match(source,new RegExp(proof));
 assert.match(runner,/CREATE TRIGGER trg_p0_fail_required_audit/);assert.match(runner,/DROP TRIGGER IF EXISTS trg_p0_fail_required_audit/);assert.match(runner,/YUZHOU_UAT_P0_FAULT_NOT_RESTORED/);assert.match(source,/created>0&&after-before===created/);
 assert.match(runner,/p0Execution:"PASS"/);assert.match(runner,/humanUat:"HOLD"/);assert.doesNotMatch(`${source}${runner}`,/productionImport:"GO"/);
});

test("P0 plans bind all 25 stable IDs to the run owner and reject missing fixture identities",()=>{
 const fixture={...ids,successAbsolutePath:"/tmp/success",storageMissingAbsolutePath:"/tmp/missing"};
 const inspect=new Proxy({},{get:()=>async()=>0}),fault={auditRequestId:ids.auditFailureFileId,enableAuditFailure:async()=>{},disableAuditFailure:async()=>{}};
 const plans=createYuzhouP0Plans({runId:"rehearsal-A",matrix,fixture,inspect,fault});
 assert.deepEqual(plans.map(row=>row.id),matrix.checks.map(row=>row.id));assert(plans.every(row=>row.owner==="rehearsal-A"&&row.evidenceSources.includes("response")&&row.evidenceSources.length===2));
 assert.throws(()=>createYuzhouP0Plans({runId:"rehearsal-A",matrix,fixture:{...fixture,payrollRunId:null},inspect,fault}),error=>error.code==="YUZHOU_UAT_P0_FIXTURE_INCOMPLETE");
 assert.throws(()=>createYuzhouP0Plans({runId:"rehearsal-A",matrix,fixture:{...fixture,payrollRunId:fixture.insurancePeriodId},inspect,fault}),error=>error.code==="YUZHOU_UAT_P0_FIXTURE_IDENTITY_COLLISION");
});

test("pre-existing audit rows cannot satisfy the current request audit proof",async()=>{
 let required=7;
 const inspect=new Proxy({requiredAuditTotal:async()=>required,auditTotal:async()=>required},{get:(target,key)=>key in target?target[key]:async()=>0});
 const fault={auditRequestId:ids.auditFailureFileId,enableAuditFailure:async()=>{},disableAuditFailure:async()=>{}};
 const plan=createYuzhouP0Plans({runId:"rehearsal-A",matrix,fixture:{...ids,successAbsolutePath:"/tmp/success",storageMissingAbsolutePath:"/tmp/missing"},inspect,fault})[0];
 await plan.prepare();
 const stale=await plan.assert({status:200,payload:{data:[{id:ids.selfApprovalId},{id:ids.outsideApprovalId}]},support:[]});
 assert.equal(stale.required_audit_written,false);
 required+=1;
 const current=await plan.assert({status:200,payload:{data:[{id:ids.selfApprovalId},{id:ids.outsideApprovalId}]},support:[]});
 assert.equal(current.required_audit_written,true);
});

test("a second run cannot reuse or overwrite the first run-owned file fixture",async()=>{
 const dir=mkdtempSync(resolve(tmpdir(),"jinhu-p0-run-owner-"));
 const created={selfApprovalId:ids.selfApprovalId,outsideApprovalId:ids.outsideApprovalId,insurancePeriodId:ids.insurancePeriodId,payrollRunId:ids.payrollRunId,teamReminderId:ids.teamReminderId,selfReminderId:ids.selfReminderId,reminderId:ids.reminderId,cancelReminderId:ids.cancelReminderId,outsideReminderId:ids.outsideReminderId,contractFileId:ids.contractFileId,outsideContractFileId:ids.outsideContractFileId,auditFailureFileId:ids.auditFailureFileId,storageFailureFileId:ids.storageFailureFileId};
 const db=async()=>JSON.stringify(created),input={db,vars:{run:"run-a"},fileRoot:dir,contractId:ids.contractId};
 try{
  await provisionYuzhouP0Fixture(input);
  await assert.rejects(provisionYuzhouP0Fixture({...input,vars:{run:"run-b"}}),error=>error.code==="YUZHOU_UAT_P0_FIXTURE_ALREADY_EXISTS");
 }finally{rmSync(dir,{recursive:true,force:true});}
});
