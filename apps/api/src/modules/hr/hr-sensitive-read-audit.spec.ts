import assert from "node:assert/strict";
import test from "node:test";
import type { RecordOperationInput } from "../audit/audit.service";
import { buildHrSensitiveReadAuditInput,recordHrSensitiveRead } from "./hr-sensitive-read-audit";

test("sensitive read audit contains actor, scope, action, field groups and business id only", async()=>{
  const calls:RecordOperationInput[]=[];
  await recordHrSensitiveRead({recordOperationRequired:async input=>{calls.push(input);}},
    {tenantId:"tenant-1",parkId:"park-1"},
    {sub:"user-1",username:"hr",realName:"HR",roles:["HR_MANAGER"]},
    {resource:"hr.employee_profile",action:"读取员工敏感档案",bizType:"hr_employee",bizId:"00000000-0000-4000-8000-000000000001",path:"/hr/employees/:id/profile",fieldGroups:["identity","contact"],projection:"masked",itemCount:1}
  );
  assert.equal(calls.length,1);
  const input=calls[0]!;
  assert.equal(input.tenantId,"tenant-1");assert.equal(input.parkId,"park-1");assert.equal(input.userId,"user-1");
  assert.equal(input.bizId,"00000000-0000-4000-8000-000000000001");assert.equal(input.method,"GET");
  assert.deepEqual(input.afterJson,{fieldGroups:["identity","contact"],projection:"masked",itemCount:1});
  assert.equal(input.beforeJson,null);assert.equal(input.errorMsg,undefined);
});

test("sensitive reads fail closed when required audit persistence fails",async()=>{
  await assert.rejects(
    recordHrSensitiveRead(
      {recordOperationRequired:async()=>{throw new Error("audit unavailable");}},
      {tenantId:"tenant-1",parkId:"park-1"},
      {sub:"user-1",username:"hr",roles:["HR_MANAGER"]},
      {resource:"hr.payslip",action:"读取工资明细",bizType:"hr_payroll_run",bizId:null,path:"/hr/payroll/runs",fieldGroups:["financial"],projection:"admin"}
    ),
    /audit unavailable/u
  );
});

test("audit builder never accepts or serializes sensitive field values",()=>{
  const input=buildHrSensitiveReadAuditInput(
    {tenantId:"tenant-1",parkId:"park-1"},
    {sub:"user-1",username:"employee",roles:["EMPLOYEE_SELF_SERVICE"]},
    {resource:"hr.payslip",action:"读取本人工资条",bizType:"hr_employee",bizId:"00000000-0000-4000-8000-000000000002",path:"/hr/payslips/me",fieldGroups:["financial","compensation"],projection:"self",itemCount:2}
  );
  const serialized=JSON.stringify(input);
  for(const forbidden of ["13812345678","320812198901011234","6222021234567890","10000.00","private@example.com"]){
    assert.equal(serialized.includes(forbidden),false);
  }
  assert.deepEqual(Object.keys(input.afterJson??{}).sort(),["fieldGroups","itemCount","projection"]);
});
