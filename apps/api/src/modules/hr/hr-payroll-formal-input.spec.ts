import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource, EntityManager } from "typeorm";
import type { AuditService } from "../audit/audit.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import type { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";

test("payroll batch metadata does not authorize financial detail or employee probes", async () => {
  let probes = 0;
  const db = { query: async () => { probes++; }, transaction: async () => { probes++; } } as unknown as DataSource;
  const service = new HrPayrollFormalInputService(db, {} as HrPayrollFormalRuleService, {} as AuditService);
  const scope = { tenantId: "synthetic", parkId: "synthetic" };
  const actor: JwtPrincipal = { ...scope, sub: "synthetic", username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_PAYROLL_READ] };
  await assert.rejects(() => service.detail(scope, actor, "input", { page: 1, pageSize: 20 }), ForbiddenException);
  await assert.rejects(() => service.list(scope, { ...actor, permissions: [] }, { periodId: "period", page: 1, pageSize: 20 }), ForbiddenException);
  await assert.rejects(() => service.confirm(scope, actor, "input", { expectedVersion: 1 }), ForbiddenException);
  await assert.rejects(() => service.lockConfirmedInput(db as unknown as EntityManager, scope, actor, "input", 1), ForbiddenException);
  assert.equal(probes, 0);
});

test("payroll management alone cannot probe or return employee monetary inputs", async () => {
  let probes = 0;
  const db = { transaction: async () => { probes++; } } as unknown as DataSource;
  const service = new HrPayrollFormalInputService(db, {} as HrPayrollFormalRuleService, {} as AuditService);
  const scope = { tenantId: "synthetic", parkId: "synthetic" };
  const actor: JwtPrincipal = { ...scope, sub: "synthetic", username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_PAYROLL_MANAGE] };
  await assert.rejects(() => service.create(scope, actor, {} as never), ForbiddenException);
  await assert.rejects(() => service.update(scope, actor, "input", {} as never), ForbiddenException);
  assert.equal(probes, 0);
});

test("preparation requires author and scoped financial, employee and rule authority before probes", async () => {
  let probes=0;
  const service=new HrPayrollFormalInputService({transaction:async()=>{probes++;}} as unknown as DataSource,{} as HrPayrollFormalRuleService,{} as AuditService);
  const scope={tenantId:"synthetic",parkId:"synthetic"};
  const required=[HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ,HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_PAYROLL_RULE_READ];
  for(const missing of required) {
    const actor:JwtPrincipal={...scope,sub:"synthetic",username:"synthetic",roles:[],permissions:required.filter(p=>p!==missing)};
    await assert.rejects(()=>service.preparation(scope,actor,{periodId:"period",ruleSetId:"rules",page:1,pageSize:20}),ForbiddenException);
  }
  assert.equal(probes,0);
});
