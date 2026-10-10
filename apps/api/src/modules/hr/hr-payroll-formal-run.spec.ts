import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import type { AuditService } from "../audit/audit.service";
import type { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";
import { HrService } from "./hr.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

test("formal payroll authority and invalid source selection fail before transactions", async () => {
  let probes = 0;
  const db = { transaction: async () => { probes++; } } as unknown as DataSource;
  const service = new HrPayrollFormalRunService(db, {} as HrPayrollFormalInputService, {} as AuditService);
  const scope = { tenantId: "synthetic", parkId: "synthetic" };
  const actor: JwtPrincipal = { ...scope, sub: "synthetic", username: "synthetic", roles: [], permissions: [] };
  await assert.rejects(() => service.create(scope, actor, {} as never), ForbiddenException);
  await assert.rejects(() => service.options(scope, actor, {} as never), ForbiddenException);
  await assert.rejects(() => service.detail(scope, actor, "run", { page: 1, pageSize: 20 }), ForbiddenException);
  await assert.rejects(() => service.list(scope, actor, { page: 1, pageSize: 20 }), ForbiddenException);
  await assert.rejects(() => service.transition(scope, actor, "run", "review", { expectedVersion: 1, reason: "复核" }), ForbiddenException);
  const author = { ...actor, permissions: ["*"] };
  const selection = { inputId: "00000000-0000-4000-8000-000000000001", expectedInputVersion: 1 };
  await assert.rejects(() => service.create(scope, author, { ...selection, correctionOfRunId: "00000000-0000-4000-8000-000000000002" }), BadRequestException);
  await assert.rejects(() => service.create(scope, author, { ...selection, correctionReason: "理由无原批次" }), BadRequestException);
  await assert.rejects(() => service.create(scope, author, { ...selection, expectedInputVersion: 0 }), BadRequestException);
  await assert.rejects(() => service.options(scope, author, {inputId:selection.inputId,expectedInputVersion:0,page:1,pageSize:20}), BadRequestException);
  await assert.rejects(() => service.options(scope, author, {inputId:selection.inputId,expectedInputVersion:1,attendanceInputBatchId:"not-a-uuid",page:1,pageSize:20}), BadRequestException);
  assert.equal(probes, 0);
});

test("retired simplified creation cannot silently skip employees or write zero-tax payroll",async()=>{
  let writes=0;const receiver={dataSource:{transaction:async()=>{writes++;}}};
  await assert.rejects(()=>HrService.prototype.createPayrollRun.call(receiver as never,{} as never,{} as never,{} as never),/已确认员工输入/);
  assert.equal(writes,0);
});

 test("recorded run list projects scoped formal evidence flags without raw evidence",async()=>{
 const scope={tenantId:"tenant",parkId:"park"};let queryArgs:unknown[]=[];let audited=0;
 const rows=[{id:"formal",runNo:1,status:"calculated"},{id:"recorded",runNo:2,status:"reviewing"}];
 const receiver={payrollRuns:{find:async(options:unknown)=>{assert.deepEqual(options,{where:{...scope,isDeleted:false},order:{createTime:"DESC"}});return rows;}},dataSource:{query:async(sql:string,args:unknown[])=>{assert.match(sql,/tenant_id=\$1 AND park_id=\$2/);queryArgs=args;return [{run_id:"formal"}];}},auditService:{recordOperationRequired:async()=>{audited++;}}};
 const result=await HrService.prototype.listPayrollRuns.call(receiver as never,scope,{} as never);
 assert.deepEqual(queryArgs,["tenant","park",["formal","recorded"]]);assert.deepEqual(result.map(row=>row.usesApprovedInputs),[true,false]);assert.equal(audited,1);assert.ok(result.every(row=>!Object.hasOwn(row,"snapshot")));
 });
