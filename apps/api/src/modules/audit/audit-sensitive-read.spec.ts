import assert from "node:assert/strict";
import test from "node:test";
import type { RecordOperationInput } from "./audit.service";
import { AuditService } from "./audit.service";

const input:RecordOperationInput={
  tenantId:"tenant-1",parkId:"park-1",userId:"user-1",username:"hr",roleCodes:["HR_MANAGER"],
  module:"人力资源管理",resource:"hr.payslip",action:"读取工资明细",bizType:"hr_payroll_run",bizId:null,
  beforeJson:null,afterJson:{fieldGroups:["financial"],projection:"admin"},method:"GET",path:"/hr/payroll/runs",
  success:true,result:"success",requestId:null
};

test("required sensitive-read audit rejects while legacy best-effort audit behavior remains unchanged",async()=>{
  const failure=new Error("audit persistence unavailable");
  const repository={create:(value:unknown)=>value,save:async()=>{throw failure;}};
  const service=new AuditService({} as never,repository as never);
  await assert.rejects(service.recordOperationRequired(input),failure);
  await assert.doesNotReject(service.recordOperation(input));
});
