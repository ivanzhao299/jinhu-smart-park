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

// The caller owns the pre-migrated disposable database. This spec creates no database,
// applies no migration, and rolls every fixture row back through one outer transaction.
const enabled = process.env.HR_PAYROLL_COMPENSATION_COVERAGE_PG === "1";

test("full-schema compensation coverage keeps roster counts, source scope and policy diagnostics honest", { skip: !enabled }, async () => {
  assert.equal(process.env.HR_PAYROLL_COMPENSATION_COVERAGE_ISOLATED, "yes");
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15432"); assert.ok(process.env.POSTGRES_DB);
  const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15432, username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, synchronize: false, entities: [] });
  await db.initialize(); const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction("SERIALIZABLE");
  try {
    const manager = runner.manager, transactional = { transaction: async <T>(work: (tx: EntityManager) => Promise<T>) => work(manager) } as DataSource;
    const audit = { recordOperationRequired: async () => undefined } as unknown as AuditService;
    const rules = new HrPayrollFormalRuleService(transactional, audit), inputs = new HrPayrollFormalInputService(transactional, rules, audit), runs = new HrPayrollFormalRunService(transactional, inputs, audit);
    const scope: TenantParkScope = { tenantId: `comp-coverage-${randomUUID()}`, parkId: `comp-coverage-${randomUUID()}` };
    const author: JwtPrincipal = { ...scope, sub: randomUUID(), username: "coverage-author", roles: [], permissions: ["*"] }, reviewer = { ...author, sub: randomUUID(), username: "coverage-reviewer" };
    const employees = Array.from({ length: 23 }, () => randomUUID()).sort(), periodId = randomUUID(), planId = randomUUID();
    await manager.query("INSERT INTO hr_payroll_period(id,tenant_id,park_id,period_month,start_date,end_date,status) VALUES($1,$2,$3,'2026-10-01','2026-10-01','2026-10-31','open')", [periodId, scope.tenantId, scope.parkId]);
    for (const [index, id] of employees.entries()) await manager.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,hire_date) VALUES($1,$2,$3,$4,$5,'active','2026-10-01')", [id, scope.tenantId, scope.parkId, `COMP-${index + 1}`, `Compensation ${index + 1}`]);
    await manager.query("INSERT INTO hr_compensation_plan(id,tenant_id,park_id,plan_code,plan_name,effective_from,status,currency) VALUES($1,$2,$3,$4,'Coverage plan','2026-01-01','active','CNY')", [planId, scope.tenantId, scope.parkId, `COV-${randomUUID().slice(0, 8)}`]);
    const insert = (employeeId: string, from: string, through: string | null, deleted = false, tenantId = scope.tenantId, parkId = scope.parkId) => manager.query("INSERT INTO hr_employee_compensation(id,tenant_id,park_id,employee_id,plan_id,effective_from,effective_to,base_salary,status,is_deleted) VALUES($1,$2,$3,$4,$5,$6,$7,100,'active',$8)", [randomUUID(), tenantId, parkId, employeeId, planId, from, through, deleted]);
    for (const [index, id] of employees.entries()) {
      if (index === 20) { await insert(id, "2026-10-01", "2026-10-10"); await insert(id, "2026-10-12", null); }
      else if (index === 21) { await insert(id, "2026-10-01", "2026-10-15"); await insert(id, "2026-10-16", null); }
      else await insert(id, "2026-10-01", null);
    }
    // These legal rows must not enter the scoped, non-deleted metadata selection.
    await insert(employees[0]!, "2026-10-01", null, true); await insert(employees[1]!, "2026-10-01", null, false, `foreign-${randomUUID()}`, `foreign-${randomUUID()}`);
    const definition = { roundingPolicy: "line_items_half_up" as const, compensationPolicy: "calendar_day_prorated" as const, items: [
      { code: "收入", role: "earning" as const, expression: "[人事系统.基本工资]" }, { code: "应发", role: "gross" as const, expression: "[收入]" }, { code: "个税", role: "tax" as const, expression: "0" }, { code: "实发", role: "net" as const, expression: "[应发]-[个税]" },
    ] };
    const set = await rules.createSet(scope, author, { ruleCode: `COMP-${randomUUID().slice(0, 8)}`, displayName: "薪酬覆盖规则" });
    const draft = await rules.createVersion(scope, author, set.id, { expectedHeadRevision: 0, definition, reason: "薪酬覆盖诊断" });
    const submitted = await rules.submitVersion(scope, author, draft.id, { expectedVersion: draft.version }); const approved = await rules.reviewVersion(scope, reviewer, draft.id, { expectedVersion: submitted.version, decision: "approve", effectiveFrom: "2026-10", reason: "独立复核" });
    const input = await inputs.create(scope, author, { periodId, ruleSetId: set.id, ruleVersionId: approved.id, expectedHeadRevision: 0, reason: "23 人薪酬覆盖夹具", employees: employees.map(employeeId => ({ employeeId, expectedEmployeeVersion: 1, directItems: {} })) });
    const confirmed = await inputs.confirm(scope, reviewer, input.id, { expectedVersion: input.version });
    const pageTwo = await runs.options(scope, author, { inputId: input.id, expectedInputVersion: confirmed.version, page: 2, pageSize: 20 });
    assert.equal(pageTwo.total, 23); assert.equal(pageTwo.items.length, 3); assert.deepEqual(pageTwo.compensationCoverage, { coveredCount: 22, missingOrIncompleteCount: 1, overlapCount: 0, incompatiblePolicyCount: 0, invalidMetadataCount: 0, unsupportedCurrencyCount: 0 });
    assert.equal(pageTwo.items.find(row => row.employeeCode === "COMP-21")?.compensationCoverage?.status, "missing_or_incomplete");
    assert.equal(pageTwo.items.find(row => row.employeeCode === "COMP-22")?.compensationCoverage?.status, "covered");

    // The same persisted ranges are deliberately viewed under the stricter approved policy:
    // a contiguous two-source employee is not a valid full-period-single source.
    const singleSourceDefinition = { ...definition, compensationPolicy: "full_period_single" as const };
    const singleSourceSet = await rules.createSet(scope, author, { ruleCode: `SINGLE-${randomUUID().slice(0, 8)}`, displayName: "单一全期薪酬覆盖规则" });
    const singleSourceDraft = await rules.createVersion(scope, author, singleSourceSet.id, { expectedHeadRevision: 0, definition: singleSourceDefinition, reason: "核对单一全期薪酬策略" });
    const singleSourceSubmitted = await rules.submitVersion(scope, author, singleSourceDraft.id, { expectedVersion: singleSourceDraft.version });
    const singleSourceRule = await rules.reviewVersion(scope, reviewer, singleSourceDraft.id, { expectedVersion: singleSourceSubmitted.version, decision: "approve", effectiveFrom: "2026-10", reason: "独立复核" });
    const singleSourceInput = await inputs.create(scope, author, { periodId, ruleSetId: singleSourceSet.id, ruleVersionId: singleSourceRule.id, expectedHeadRevision: 0, reason: "全期单一薪酬来源输入", employees: employees.map(employeeId => ({ employeeId, expectedEmployeeVersion: 1, directItems: {} })) });
    const singleSourceConfirmed = await inputs.confirm(scope, reviewer, singleSourceInput.id, { expectedVersion: singleSourceInput.version });
    const singleSourceOptions = await runs.options(scope, author, { inputId: singleSourceInput.id, expectedInputVersion: singleSourceConfirmed.version, page: 2, pageSize: 20 });
    assert.deepEqual(singleSourceOptions.compensationCoverage, { coveredCount: 21, missingOrIncompleteCount: 1, overlapCount: 0, incompatiblePolicyCount: 1, invalidMetadataCount: 0, unsupportedCurrencyCount: 0 });
    assert.equal(singleSourceOptions.items.find(row => row.employeeCode === "COMP-22")?.compensationCoverage?.status, "incompatible_policy");

    const noSalary = { roundingPolicy: "line_items_half_up" as const, items: [{ code: "收入", role: "earning" as const, expression: null }, { code: "应发", role: "gross" as const, expression: "[收入]" }, { code: "个税", role: "tax" as const, expression: "0" }, { code: "实发", role: "net" as const, expression: "[应发]-[个税]" }] };
    const unusedSet = await rules.createSet(scope, author, { ruleCode: `UNUSED-${randomUUID().slice(0, 8)}`, displayName: "无薪酬来源规则" }); const unusedDraft = await rules.createVersion(scope, author, unusedSet.id, { expectedHeadRevision: 0, definition: noSalary, reason: "不读薪酬来源" }); const unusedSubmitted = await rules.submitVersion(scope, author, unusedDraft.id, { expectedVersion: unusedDraft.version }); const unusedRule = await rules.reviewVersion(scope, reviewer, unusedDraft.id, { expectedVersion: unusedSubmitted.version, decision: "approve", effectiveFrom: "2026-10", reason: "独立复核" });
    const unusedInput = await inputs.create(scope, author, { periodId, ruleSetId: unusedSet.id, ruleVersionId: unusedRule.id, expectedHeadRevision: 0, reason: "无薪酬输入", employees: employees.map(employeeId => ({ employeeId, expectedEmployeeVersion: 1, directItems: { 收入: "1" } })) }); const unusedConfirmed = await inputs.confirm(scope, reviewer, unusedInput.id, { expectedVersion: unusedInput.version });
    const unchecked = await runs.options(scope, author, { inputId: unusedInput.id, expectedInputVersion: unusedConfirmed.version, page: 1, pageSize: 20 }); assert.equal(unchecked.requires.compensation, false); assert.equal(unchecked.compensationCoverage, null); assert.ok(unchecked.items.every(item => item.compensationCoverage === null));
  } finally { try { if (runner.isTransactionActive) await runner.rollbackTransaction(); } finally { await runner.release(); await db.destroy(); } }
});
