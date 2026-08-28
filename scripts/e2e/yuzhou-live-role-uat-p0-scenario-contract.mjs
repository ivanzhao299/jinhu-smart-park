import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createYuzhouP0Plans } from "../hr-cutover/yuzhou-live-role-uat-p0-scenario.mjs";

const root=resolve(import.meta.dirname,"../.."),read=path=>readFileSync(resolve(root,path),"utf8");
const matrix=JSON.parse(read("scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json"));
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("P0 scenario owns exact isolated fixtures and reversible audit/storage faults",()=>{
 const source=read("scripts/hr-cutover/yuzhou-live-role-uat-p0-scenario.mjs"),runner=read("scripts/hr-cutover/run-full-domain-technical-uat.mjs");
 for(const table of ["hr_approval_request","hr_employee_skill","hr_legacy_employee_materialization_gap","hr_employee_insurance_period","hr_employee_insurance_item","hr_payroll_period","hr_payroll_run","hr_payslip","hr_contract_reminder_policy","hr_contract_reminder","sys_file"])assert.match(source,new RegExp(table));
 for(const proof of ["selfApprovalId","outsideApprovalId","teamReminderId","outsideReminderId","insurancePeriodId","payrollRunId","contractFileId","outsideContractFileId","auditFailureFileId","storageFailureFileId"])assert.match(source,new RegExp(proof));
 assert.match(runner,/CREATE TRIGGER trg_p0_fail_required_audit/);assert.match(runner,/DROP TRIGGER IF EXISTS trg_p0_fail_required_audit/);assert.match(runner,/YUZHOU_UAT_P0_FAULT_NOT_RESTORED/);
 assert.match(runner,/p0Execution:"PASS"/);assert.match(runner,/humanUat:"HOLD"/);assert.doesNotMatch(`${source}${runner}`,/productionImport:"GO"/);
});

test("P0 plans bind all 25 stable IDs to the run owner and reject missing fixture identities",()=>{
 const fixture={employeeId:id,outsideEmployeeId:id,contractId:id,selfApprovalId:id,outsideApprovalId:id,insurancePeriodId:id,payrollRunId:id,teamReminderId:id,selfReminderId:id,reminderId:id,cancelReminderId:id,outsideReminderId:id,contractFileId:id,outsideContractFileId:id,auditFailureFileId:id,storageFailureFileId:id,successAbsolutePath:"/tmp/success",storageMissingAbsolutePath:"/tmp/missing"};
 const inspect=new Proxy({},{get:()=>async()=>0}),fault={auditRequestId:id,enableAuditFailure:async()=>{},disableAuditFailure:async()=>{}};
 const plans=createYuzhouP0Plans({runId:"rehearsal-A",matrix,fixture,inspect,fault});
 assert.deepEqual(plans.map(row=>row.id),matrix.checks.map(row=>row.id));assert(plans.every(row=>row.owner==="rehearsal-A"&&row.evidenceSources.includes("response")&&row.evidenceSources.length===2));
 assert.throws(()=>createYuzhouP0Plans({runId:"rehearsal-A",matrix,fixture:{...fixture,payrollRunId:null},inspect,fault}),error=>error.code==="YUZHOU_UAT_P0_FIXTURE_INCOMPLETE");
});
