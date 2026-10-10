import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource, type EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";

// This test never creates a database, applies migrations, or commits fixture rows.  The caller
// supplies the already-migrated isolated schema and this outer transaction is always rolled back.
const enabled = process.env.HR_PAYROLL_ATTENDANCE_COVERAGE_PG === "1";

test("full-schema selected attendance coverage keeps global counts and rejects non-current batches", { skip: !enabled }, async () => {
  assert.equal(process.env.HR_PAYROLL_ATTENDANCE_COVERAGE_ISOLATED, "yes");
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.equal(process.env.POSTGRES_PORT, "15432");
  assert.ok(process.env.POSTGRES_DB, "POSTGRES_DB must name the existing isolated database");
  const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15432, username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, synchronize: false, entities: [] });
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction("SERIALIZABLE");
  try {
    const manager = runner.manager;
    // Keep every real service call inside the fixture transaction, so a passing test leaves no rows.
    const transactional = { transaction: async <T>(work: (tx: EntityManager) => Promise<T>) => work(manager) } as DataSource;
    const audit = { recordOperationRequired: async () => undefined } as unknown as AuditService;
    const rules = new HrPayrollFormalRuleService(transactional, audit);
    const inputs = new HrPayrollFormalInputService(transactional, rules, audit);
    const runs = new HrPayrollFormalRunService(transactional, inputs, audit);
    const scope: TenantParkScope = { tenantId: `coverage-${randomUUID()}`, parkId: `coverage-${randomUUID()}` };
    const author: JwtPrincipal = { ...scope, sub: randomUUID(), username: "coverage-author", roles: [], permissions: ["*"] };
    const reviewer: JwtPrincipal = { ...scope, sub: randomUUID(), username: "coverage-reviewer", roles: [], permissions: ["*"] };
    const employees = Array.from({ length: 23 }, () => randomUUID()).sort();
    const periodId = randomUUID(), attendancePeriodId = randomUUID(), foreignAttendancePeriodId = randomUUID();
    await manager.query("INSERT INTO hr_payroll_period(id,tenant_id,park_id,period_month,start_date,end_date,status) VALUES($1,$2,$3,'2026-10-01','2026-10-01','2026-10-31','open')", [periodId, scope.tenantId, scope.parkId]);
    await manager.query("INSERT INTO hr_attendance_period(id,tenant_id,park_id,period_month,status) VALUES($1,$2,$3,'2026-10-01','closed'),($4,$2,$3,'2026-09-01','closed')", [attendancePeriodId, scope.tenantId, scope.parkId, foreignAttendancePeriodId]);
    for (const [index, employeeId] of employees.entries()) {
      await manager.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,hire_date) VALUES($1,$2,$3,$4,$5,'active','2026-10-01')", [employeeId, scope.tenantId, scope.parkId, `COV-${index + 1}`, `Coverage ${index + 1}`]);
    }
    const definition = { roundingPolicy: "line_items_half_up" as const, items: [
      { code: "收入", role: "earning" as const, expression: null },
      { code: "考勤扣款", role: "deduction" as const, expression: "[人事系统.缺勤天数]" },
      { code: "应发", role: "gross" as const, expression: "[收入]" },
      { code: "个税", role: "tax" as const, expression: "0" },
      { code: "实发", role: "net" as const, expression: "[应发]-[考勤扣款]-[个税]" },
    ] };
    const set = await rules.createSet(scope, author, { ruleCode: `COV-${randomUUID().slice(0, 8)}`, displayName: "考勤覆盖夹具规则" });
    const draft = await rules.createVersion(scope, author, set.id, { expectedHeadRevision: 0, definition, reason: "验证考勤来源覆盖" });
    const submitted = await rules.submitVersion(scope, author, draft.id, { expectedVersion: draft.version });
    const approved = await rules.reviewVersion(scope, reviewer, draft.id, { expectedVersion: submitted.version, decision: "approve", effectiveFrom: "2026-10", reason: "独立复核考勤依赖" });
    const input = await inputs.create(scope, author, { periodId, ruleSetId: set.id, ruleVersionId: approved.id, expectedHeadRevision: 0, reason: "23 人考勤覆盖夹具", employees: employees.map(employeeId => ({ employeeId, expectedEmployeeVersion: 1, directItems: { 收入: "100.0000" } })) });
    const confirmed = await inputs.confirm(scope, reviewer, input.id, { expectedVersion: input.version });

    const summaries = new Map<string, string>();
    for (const employeeId of employees) {
      const summaryId = randomUUID(); summaries.set(employeeId, summaryId);
      await manager.query("INSERT INTO hr_attendance_month_summary(id,tenant_id,park_id,period_id,employee_id,summary_version) VALUES($1,$2,$3,$4,$5,1)", [summaryId, scope.tenantId, scope.parkId, attendancePeriodId, employeeId]);
    }
    const partialId = randomUUID(), foreignMonthId = randomUUID(), ineffectiveId = randomUUID(), foreignScopeId = randomUUID();
    await manager.query("INSERT INTO hr_attendance_payroll_input_batch(id,tenant_id,park_id,period_id,batch_no,batch_type,created_from_summary_version,status) VALUES($1,$2,$3,$4,1,'close',1,'effective'),($5,$2,$3,$6,1,'close',1,'effective'),($7,$2,$3,$4,2,'close',1,'superseded'),($8,$9,$10,$4,1,'close',1,'effective')", [partialId, scope.tenantId, scope.parkId, attendancePeriodId, foreignMonthId, foreignAttendancePeriodId, ineffectiveId, foreignScopeId, `foreign-${randomUUID()}`, `foreign-${randomUUID()}`]);
    for (const [index, employeeId] of employees.entries()) {
      if (index === 20) continue; // 23-person roster deliberately lacks employee 21 in the selected partial batch.
      await manager.query("INSERT INTO hr_attendance_payroll_input_item(tenant_id,park_id,batch_id,employee_id,source_summary_id,worked_minutes,late_minutes,early_minutes,absence_days,missing_punch_days) VALUES($1,$2,$3,$4,$5,0,0,0,0,0)", [scope.tenantId, scope.parkId, partialId, employeeId, summaries.get(employeeId)]);
    }
    const partial = await runs.options(scope, author, { inputId: input.id, expectedInputVersion: confirmed.version, attendanceInputBatchId: partialId, page: 2, pageSize: 20 });
    assert.equal(partial.selectedAttendanceBatchId, partialId);
    assert.equal(partial.attendanceBatches.find(batch => batch.id === partialId)?.missingEmployeeCount, 1, "global coverage never derives from the last page");
    assert.equal(partial.total, 23); assert.equal(partial.items.length, 3);
    assert.equal(partial.items.filter(row => row.attendanceCovered === false).length, 1);
    assert.equal(partial.items.find(row => row.employeeCode === "COV-21")?.attendanceCovered, false);
    await assert.rejects(() => runs.options(scope, author, { inputId: input.id, expectedInputVersion: confirmed.version, attendanceInputBatchId: foreignMonthId, page: 1, pageSize: 20 }));
    await assert.rejects(() => runs.options(scope, author, { inputId: input.id, expectedInputVersion: confirmed.version, attendanceInputBatchId: ineffectiveId, page: 1, pageSize: 20 }));
    await assert.rejects(() => runs.options(scope, author, { inputId: input.id, expectedInputVersion: confirmed.version, attendanceInputBatchId: foreignScopeId, page: 1, pageSize: 20 }));
    const unchecked = await runs.options(scope, author, { inputId: input.id, expectedInputVersion: confirmed.version, page: 1, pageSize: 20 });
    assert.equal(unchecked.selectedAttendanceBatchId, null); assert.ok(unchecked.items.every(row => row.attendanceCovered === null));

    await manager.query("UPDATE hr_attendance_payroll_input_batch SET status='superseded' WHERE id=$1", [partialId]);
    const completeId = randomUUID();
    await manager.query("INSERT INTO hr_attendance_payroll_input_batch(id,tenant_id,park_id,period_id,batch_no,batch_type,created_from_summary_version,status) VALUES($1,$2,$3,$4,3,'close',1,'effective')", [completeId, scope.tenantId, scope.parkId, attendancePeriodId]);
    for (const employeeId of employees) await manager.query("INSERT INTO hr_attendance_payroll_input_item(tenant_id,park_id,batch_id,employee_id,source_summary_id,worked_minutes,late_minutes,early_minutes,absence_days,missing_punch_days) VALUES($1,$2,$3,$4,$5,0,0,0,0,0)", [scope.tenantId, scope.parkId, completeId, employeeId, summaries.get(employeeId)]);
    const complete = await runs.options(scope, author, { inputId: input.id, expectedInputVersion: confirmed.version, attendanceInputBatchId: completeId, page: 2, pageSize: 20 });
    assert.equal(complete.attendanceBatches.find(batch => batch.id === completeId)?.missingEmployeeCount, 0);
    assert.ok(complete.items.every(row => row.attendanceCovered === true));
  } finally {
    try { if (runner.isTransactionActive) await runner.rollbackTransaction(); } finally { await runner.release(); await db.destroy(); }
  }
});
