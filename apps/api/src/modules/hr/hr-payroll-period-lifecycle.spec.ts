import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { AuditService } from "../audit/audit.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPayrollPeriodLifecycleService } from "./hr-payroll-period-lifecycle.service";

const scope = { tenantId: randomUUID(), parkId: randomUUID() };
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic", roles: [], permissions: [] };
function fixture() {
  let calls = 0;
  const db = { transaction: () => { calls++; throw new Error("unexpected database probe"); } } as unknown as DataSource;
  return { service: new HrPayrollPeriodLifecycleService(db, {} as AuditService), calls: () => calls };
}
test("payroll lifecycle checks every required authority before probing scoped identities", async () => {
  const id = randomUUID(), originalRunId = randomUUID();
  const methods = [
    { required: [HR_PERMISSIONS.HR_PAYROLL_READ], run: (s: HrPayrollPeriodLifecycleService, a: JwtPrincipal) => s.context(scope, a, id) },
    { required: [HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ], run: (s: HrPayrollPeriodLifecycleService, a: JwtPrincipal) => s.close(scope, a, id, { expectedVersion: 1, reason: "核对完成" }) },
    { required: [HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ], run: (s: HrPayrollPeriodLifecycleService, a: JwtPrincipal) => s.openCorrection(scope, a, id, { expectedVersion: 2, originalRunId, expectedRunVersion: 3, reason: "更正输入" }) },
    { required: [HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ], run: (s: HrPayrollPeriodLifecycleService, a: JwtPrincipal) => s.cancelCorrection(scope, a, id, { expectedVersion: 1, reason: "无需更正" }) },
    { required: [HR_PERMISSIONS.HR_PAYROLL_CONFIRM, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ], run: (s: HrPayrollPeriodLifecycleService, a: JwtPrincipal) => s.completeCorrection(scope, a, id, { expectedVersion: 1, reason: "核对完成", completedRunId: randomUUID() }) },
  ];
  for (const entry of methods) for (const missing of entry.required) {
    const f = fixture();
    await assert.rejects(() => entry.run(f.service, { ...actor, permissions: entry.required.filter(p => p !== missing) }), ForbiddenException);
    assert.equal(f.calls(), 0);
  }
});
test("lifecycle DTO rejects malformed version, blank reasons and extra payload before transactions", async () => {
  const f = fixture(), privileged = { ...actor, permissions: ["*"] }, id = randomUUID();
  for (const expectedVersion of [0, -1, 1.5, 2147483647]) await assert.rejects(() => f.service.close(scope, privileged, id, { expectedVersion, reason: "核对完成" }), BadRequestException);
  await assert.rejects(() => f.service.close(scope, privileged, id, { expectedVersion: 1, reason: "  " }), BadRequestException);
  await assert.rejects(() => f.service.close(scope, privileged, "invalid", { expectedVersion: 1, reason: "核对完成" }), BadRequestException);
  await assert.rejects(() => f.service.close(scope, privileged, id, { expectedVersion: 1, reason: "核对完成", status: "open" } as never), BadRequestException);
  await assert.rejects(() => f.service.openCorrection(scope, privileged, id, { expectedVersion: 1, expectedRunVersion: 1, originalRunId: "invalid", reason: "更正" }), BadRequestException);
  assert.equal(f.calls(), 0);
});
