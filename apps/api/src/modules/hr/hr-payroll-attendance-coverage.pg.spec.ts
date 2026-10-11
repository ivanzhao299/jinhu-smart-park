import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import { parsePayrollFormula } from "./hr-payroll-formula-dsl";
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
import { HR_ENTITIES } from "./entities/hr.entities";
import { HrService } from "./hr.service";

// This test never creates a database, applies migrations, or commits fixture rows.  The caller
// supplies the already-migrated isolated schema and this outer transaction is always rolled back.
const enabled = process.env.HR_PAYROLL_ATTENDANCE_COVERAGE_PG === "1";

test("full-schema selected attendance coverage keeps global counts and rejects non-current batches", { skip: !enabled }, async () => {
  assert.equal(process.env.HR_PAYROLL_ATTENDANCE_COVERAGE_ISOLATED, "yes");
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.equal(process.env.POSTGRES_PORT, "15432");
  assert.ok(process.env.POSTGRES_DB, "POSTGRES_DB must name the existing isolated database");
  const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15432, username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, synchronize: false, entities: HR_ENTITIES });
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
    // New reference must treat a present row with an unavailable quantity as uncovered.
    const leaveDefinition=structuredClone(definition);leaveDefinition.items[1]!.expression="[人事系统.批准请假分钟]/60";
    const leaveSet=await rules.createSet(scope,author,{ruleCode:`LEAVE-${randomUUID().slice(0,8)}`,displayName:"封账请假事实规则"});
    const leaveDraft=await rules.createVersion(scope,author,leaveSet.id,{expectedHeadRevision:0,definition:leaveDefinition,reason:"验证批准请假实际分钟"});
    const leaveSubmitted=await rules.submitVersion(scope,author,leaveDraft.id,{expectedVersion:leaveDraft.version});
    const leaveApproved=await rules.reviewVersion(scope,reviewer,leaveDraft.id,{expectedVersion:leaveSubmitted.version,decision:"approve",effectiveFrom:"2026-10",reason:"独立复核数量来源"});
    const leaveInput=await inputs.create(scope,author,{periodId,ruleSetId:leaveSet.id,ruleVersionId:leaveApproved.id,expectedHeadRevision:0,reason:"封账请假来源核对",employees:employees.map(employeeId=>({employeeId,expectedEmployeeVersion:1,directItems:{收入:"100.0000"}}))});
    const leaveConfirmed=await inputs.confirm(scope,reviewer,leaveInput.id,{expectedVersion:leaveInput.version});
    const leaveQuery={inputId:leaveInput.id,expectedInputVersion:leaveConfirmed.version,attendanceInputBatchId:completeId,page:2,pageSize:20};
    const missingLeave=await runs.options(scope,author,leaveQuery);assert.equal(missingLeave.attendanceBatches.find(b=>b.id===completeId)?.missingEmployeeCount,23);assert.ok(missingLeave.items.every(row=>row.attendanceCovered===false));
    await assert.rejects(()=>runs.create(scope,author,{inputId:leaveInput.id,expectedInputVersion:leaveConfirmed.version,attendanceInputBatchId:completeId}),/attendance source value/);
    await manager.query("UPDATE hr_attendance_payroll_input_item SET approved_leave_minutes=120 WHERE batch_id=$1",[completeId]);
    const available=await runs.options(scope,author,leaveQuery);assert.equal(available.attendanceBatches.find(b=>b.id===completeId)?.missingEmployeeCount,0);assert.ok(available.items.every(row=>row.attendanceCovered===true));
    const run=await runs.create(scope,author,{inputId:leaveInput.id,expectedInputVersion:leaveConfirmed.version,attendanceInputBatchId:completeId});
    const result=await manager.query("SELECT net_amount::text,compensation_snapshot FROM hr_payslip WHERE run_id=$1 ORDER BY employee_id",[run.id]);assert.equal(result.length,23);assert.equal(result[0].net_amount,"98.00");assert.equal(result[0].compensation_snapshot.attendance.approvedLeaveMinutes,"120");
    await runs.transition(scope, author, run.id, "cancel", { expectedVersion: run.version, reason: "关闭合成核对夹具运行" });
    for (const [code, column, field] of [["批准加班区间分钟", "approved_overtime_ms", "approvedOvertimeMs"], ["批准出差区间分钟", "approved_business_trip_ms", "approvedBusinessTripMs"], ["批准出差申报天数", "approved_business_trip_declared_days", "approvedBusinessTripDeclaredDays"]] as const) {
      const intervalDefinition = structuredClone(definition); intervalDefinition.items[1]!.expression = `[人事系统.${code}]`;
      const intervalSet = await rules.createSet(scope, author, { ruleCode: `INT-${randomUUID().slice(0,8)}`, displayName: "区间冻结来源规则" });
      const intervalDraft = await rules.createVersion(scope, author, intervalSet.id, { expectedHeadRevision: 0, definition: intervalDefinition, reason: "明确区间数量依赖" });
      const intervalSubmitted = await rules.submitVersion(scope, author, intervalDraft.id, { expectedVersion: intervalDraft.version });
      const intervalApproved = await rules.reviewVersion(scope, reviewer, intervalDraft.id, { expectedVersion: intervalSubmitted.version, decision: "approve", effectiveFrom: "2026-10", reason: "独立复核区间数量" });
      const intervalInput = await inputs.create(scope, author, { periodId, ruleSetId: intervalSet.id, ruleVersionId: intervalApproved.id, expectedHeadRevision: 0, reason: "区间来源覆盖核对", employees: employees.map(employeeId => ({ employeeId, expectedEmployeeVersion: 1, directItems: { 收入: "100.0000" } })) });
      const intervalConfirmed = await inputs.confirm(scope, reviewer, intervalInput.id, { expectedVersion: intervalInput.version });
      const intervalQuery = { inputId: intervalInput.id, expectedInputVersion: intervalConfirmed.version, attendanceInputBatchId: completeId, page: 2, pageSize: 20 };
      const unavailable = await runs.options(scope, author, intervalQuery);
      assert.equal(unavailable.attendanceBatches.find(batch => batch.id === completeId)?.missingEmployeeCount, 23);
      assert.ok(unavailable.items.every(row => row.attendanceCovered === false));
      await assert.rejects(() => runs.create(scope, author, { inputId: intervalInput.id, expectedInputVersion: intervalConfirmed.version, attendanceInputBatchId: completeId }), /attendance source value/);
      // Fixture-only source update in the rolled-back isolated transaction; production uses appended corrections.
      await manager.query(`UPDATE hr_attendance_payroll_input_item SET ${column}=${field === "approvedBusinessTripDeclaredDays" ? 1 : 60000} WHERE batch_id=$1`, [completeId]);
      const covered = await runs.options(scope, author, intervalQuery);
      assert.equal(covered.attendanceBatches.find(batch => batch.id === completeId)?.missingEmployeeCount, 0);
      const intervalRun = await runs.create(scope, author, { inputId: intervalInput.id, expectedInputVersion: intervalConfirmed.version, attendanceInputBatchId: completeId });
      const slips = await manager.query("SELECT net_amount::text,compensation_snapshot FROM hr_payslip WHERE run_id=$1 ORDER BY employee_id", [intervalRun.id]);
      assert.equal(slips.length, 23); assert.equal(slips[0].net_amount, "99.00");
      assert.equal(slips[0].compensation_snapshot.attendance[field], field === "approvedBusinessTripDeclaredDays" ? "1" : "60000");
      await runs.transition(scope, author, intervalRun.id, "cancel", { expectedVersion: intervalRun.version, reason: "关闭合成区间夹具运行" });
    }
    // One actual service flow: approved requests -> daily facts -> month -> close -> formal payslip.
    // All inputs are synthetic; the outer transaction always rolls back.
    const flowScope = { tenantId: `flow-${randomUUID()}`, parkId: `flow-${randomUUID()}` };
    const flowAuthor = { ...author, ...flowScope }, flowReviewer = { ...reviewer, ...flowScope };
    const employeeId = randomUUID(), payrollPeriodId = randomUUID();
    await manager.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status,hire_date) VALUES($1,$2,$3,'FLOW-1','合成区间全链员工','active','2026-10-01')", [employeeId, flowScope.tenantId, flowScope.parkId]);
    await manager.query("INSERT INTO hr_payroll_period(id,tenant_id,park_id,period_month,start_date,end_date,status) VALUES($1,$2,$3,'2026-10-01','2026-10-01','2026-10-31','open')", [payrollPeriodId, flowScope.tenantId, flowScope.parkId]);
    for (const [type, start, end] of [["overtime", "2026-10-01T23:00:00+08:00", "2026-10-02T01:00:00+08:00"], ["business_trip", "2026-10-01T09:00:00+08:00", "2026-10-01T12:00:00+08:00"]]) {
      await manager.query("INSERT INTO hr_attendance_request(tenant_id,park_id,employee_id,request_no,request_type,start_at,end_at,duration_minutes,reason,status) VALUES($1,$2,$3,$4,$5,$6,$7,1,'全链合成依据','approved')", [flowScope.tenantId, flowScope.parkId, employeeId, `FLOW-${type}`, type, start, end]);
    }
    await manager.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,'flow-allocator','Synthetic','disabled-fixture')",[flowAuthor.sub,flowScope.tenantId,flowScope.parkId]);
    const hrArgs = Array(32).fill(undefined); hrArgs[26] = manager.getRepository(HR_ENTITIES.find(entity=>entity.name==="HrAttendanceRequestEntity")!); hrArgs[30] = { transaction: transactional.transaction, getRepository: manager.getRepository.bind(manager), query: manager.query.bind(manager) }; hrArgs[31] = audit;
    const hr = Reflect.construct(HrService, hrArgs) as HrService;
    const [trip] = await manager.query("SELECT id FROM hr_attendance_request WHERE tenant_id=$1 AND park_id=$2 AND request_type='business_trip'",[flowScope.tenantId,flowScope.parkId]);
    await hr.amendBusinessTripDeclaredDays(flowScope,flowAuthor,trip.id,{expectedVersion:1,declaredDays:1,reason:"明确合成申报数量"});
    await hr.allocateBusinessTripMonth(flowScope,flowAuthor,trip.id,{expectedVersion:2,reason:"明确合成月份归属",allocations:[{month:"2026-10",days:1}]});
    for (const workDate of ["2026-10-01", "2026-10-02"]) await hr.recalculateAttendanceDay(flowScope, flowAuthor, { employeeId, workDate, ruleVersion: "flow-v1" });
    const attendancePeriod = await hr.createAttendancePeriod(flowScope, flowAuthor, { periodMonth: "2026-10-01" });
    await hr.calculateAttendancePeriod(flowScope, flowAuthor, attendancePeriod.id); await hr.closeAttendancePeriod(flowScope, flowAuthor, attendancePeriod.id);
    const frozenInput = await hr.payrollAttendanceInputs(flowScope, flowAuthor, attendancePeriod.id);
    assert.equal(frozenInput.items[0]!.approvedBusinessTripDeclaredDays,"1");
    assert.equal(frozenInput.items[0]!.approvedOvertimeMs, "7200000"); assert.equal(frozenInput.items[0]!.approvedBusinessTripMs, "10800000");
    const flowDefinition = structuredClone(definition); flowDefinition.items[0]!.expression = "[人事系统.批准加班区间分钟]+[人事系统.批准出差区间分钟]+[人事系统.批准出差申报天数]"; flowDefinition.items[1]!.expression = "0";
    const flowSet = await rules.createSet(flowScope, flowAuthor, { ruleCode: "FLOW-INTERVAL", displayName: "全链合成区间规则" });
    const flowDraft = await rules.createVersion(flowScope, flowAuthor, flowSet.id, { expectedHeadRevision: 0, definition: flowDefinition, reason: "仅验证明确数量数据流" });
    const flowSubmitted = await rules.submitVersion(flowScope, flowAuthor, flowDraft.id, { expectedVersion: flowDraft.version });
    const flowApproved = await rules.reviewVersion(flowScope, flowReviewer, flowDraft.id, { expectedVersion: flowSubmitted.version, decision: "approve", effectiveFrom: "2026-10", reason: "独立复核合成数量规则" });
    const flowInput = await inputs.create(flowScope, flowAuthor, { periodId: payrollPeriodId, ruleSetId: flowSet.id, ruleVersionId: flowApproved.id, expectedHeadRevision: 0, reason: "验证批准来源到工资冻结", employees: [{ employeeId, expectedEmployeeVersion: 1, directItems: {} }] });
    const flowConfirmed = await inputs.confirm(flowScope, flowReviewer, flowInput.id, { expectedVersion: flowInput.version });
    const flowRun = await runs.create(flowScope, flowAuthor, { inputId: flowInput.id, expectedInputVersion: flowConfirmed.version, attendanceInputBatchId: frozenInput.batchId });
    const [flowSlip] = await manager.query("SELECT net_amount::text,compensation_snapshot FROM hr_payslip WHERE run_id=$1", [flowRun.id]);
    assert.equal(flowSlip.net_amount, "301.00"); assert.equal(flowSlip.compensation_snapshot.attendance.approvedOvertimeMs, "7200000"); assert.equal(flowSlip.compensation_snapshot.attendance.approvedBusinessTripMs, "10800000");
    await verifyAllocatedTripReconciliation(manager,flowScope,flowAuthor,employeeId,frozenInput.batchId);
  } finally {
    try { if (runner.isTransactionActive) await runner.rollbackTransaction(); } finally { await runner.release(); await db.destroy(); }
  }
});

/** Synthetic legacy comparison fixture uses the actual closed input produced above. */
async function verifyAllocatedTripReconciliation(manager:EntityManager,scope:TenantParkScope,actor:JwtPrincipal,employeeId:string,attendanceInputBatchId:string) {
  const ids={actor:actor.sub,employee:employeeId,plan:randomUUID(),insurancePeriod:randomUUID(),book:randomUUID(),definition:randomUUID(),item:randomUUID(),formula:randomUUID(),bookPeriod:randomUUID(),legacyBatch:randomUUID(),snapshot:randomUUID(),snapshotItem:randomUUID(),policy:randomUUID()};
  const legacyFormulaId=100000+Number.parseInt(ids.formula.slice(0,6),16)%800000;
  const parsed=parsePayrollFormula("[人事系统.批准出差申报天数]");assert.equal(parsed.parserVersion,"jinhu-payroll-dsl-v5");
  const q=(sql:string,params:unknown[]=[])=>manager.query(sql,params);
  await q("INSERT INTO hr_compensation_plan(id,tenant_id,park_id,plan_code,plan_name,effective_from,status) VALUES($1,$2,$3,$4,'PG核对方案','2026-10-01','active')",[ids.plan,scope.tenantId,scope.parkId,`PG-${ids.plan.slice(0,8)}`]);
  await q("INSERT INTO hr_employee_compensation(tenant_id,park_id,employee_id,plan_id,effective_from,base_salary,allowance_amount,variable_target,status) VALUES($1,$2,$3,$4,'2026-10-01',120,5,0,'active')",[scope.tenantId,scope.parkId,ids.employee,ids.plan]);
  await q("INSERT INTO hr_employee_insurance_period(id,tenant_id,park_id,employee_id,period_year,period_month,legacy_id,status) VALUES($1,$2,$3,$4,2026,10,$5,'historical')",[ids.insurancePeriod,scope.tenantId,scope.parkId,ids.employee,100000+Number.parseInt(ids.insurancePeriod.slice(0,6),16)%800000]);
  await q("INSERT INTO hr_payroll_book(id,tenant_id,park_id,legacy_scheme,book_name,source_hash,status) VALUES($1,$2,$3,31,'PG服务核对账套',$4,'approved')",[ids.book,scope.tenantId,scope.parkId,"a".repeat(64)]);
  await q("INSERT INTO hr_payroll_item_definition(id,tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,$2,$3,$4,'实发工资','NET')",[ids.definition,scope.tenantId,scope.parkId,ids.book]);
  await q("INSERT INTO hr_payroll_item_version(id,tenant_id,park_id,item_definition_id,version_no,display_name,value_type,legacy_item_type,legacy_add_or_sub,item_category,decimal_scale,source_hash) VALUES($1,$2,$3,$4,1,'实发工资','decimal','decimal','summary','summary',4,$5)",[ids.item,scope.tenantId,scope.parkId,ids.definition,"b".repeat(64)]);
  await q("INSERT INTO hr_payroll_formula_version(id,tenant_id,park_id,book_id,item_version_id,legacy_formula_id,version_no,raw_expression,expression_hash,parser_version,parse_status,dsl_ast,dependency_codes,calculation_order,reviewed_by,reviewed_at,review_reason) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,'approved_for_simulation',$10,$11,1,$12,now(),'PG fixture')",[ids.formula,scope.tenantId,scope.parkId,ids.book,ids.item,legacyFormulaId,"[人事系统.批准出差申报天数]","c".repeat(64),parsed.parserVersion,JSON.stringify(parsed.ast),JSON.stringify(parsed.dependencies),ids.actor]);
  await q("INSERT INTO hr_payroll_book_period(id,tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES($1,$2,$3,$4,'2026-10-01',1,$5)",[ids.bookPeriod,scope.tenantId,scope.parkId,ids.book,"d".repeat(64)]);
  await q("INSERT INTO hr_payroll_legacy_batch(id,tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,quarantined_row_count,status) VALUES($1,$2,$3,$4,$5,$6,$7,1,1,0,'unpublished')",[ids.legacyBatch,scope.tenantId,scope.parkId,`PG-${ids.legacyBatch.slice(0,8)}`,"e".repeat(64),"f".repeat(64),"1".repeat(64)]);
  await q("INSERT INTO hr_payroll_legacy_snapshot(id,tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,net_amount,source_hash) VALUES($1,$2,$3,$4,$5,$6,'salary31',$7,$8,'mapped',100,$9)",[ids.snapshot,scope.tenantId,scope.parkId,ids.legacyBatch,ids.bookPeriod,ids.employee,"2".repeat(64),"3".repeat(64),"4".repeat(64)]);
  await q("INSERT INTO hr_payroll_legacy_snapshot_item(id,tenant_id,park_id,snapshot_id,item_version_id,legacy_column_name,value_type,is_source_null,raw_value,decimal_value,source_hash) VALUES($1,$2,$3,$4,$5,'实发工资','decimal',false,'100',100,$6)",[ids.snapshotItem,scope.tenantId,scope.parkId,ids.snapshot,ids.item,"5".repeat(64)]);
  await q("UPDATE hr_payroll_legacy_batch SET status='published',published_at=now(),published_by=$1 WHERE id=$2",[ids.actor,ids.legacyBatch]);
  await q("INSERT INTO hr_payroll_reconciliation_policy_version(id,tenant_id,park_id,book_id,net_item_version_id,version_no,tolerance_amount,status,reviewed_by,review_reason,create_by,update_by) VALUES($1,$2,$3,$4,$5,1,0.01,'approved',$6,'PG fixture',$6,$6)",[ids.policy,scope.tenantId,scope.parkId,ids.book,ids.item,ids.actor]);
  await q("INSERT INTO hr_payroll_reconciliation_policy_current(tenant_id,park_id,book_id,policy_version_id,update_by) VALUES($1,$2,$3,$4,$5)",[scope.tenantId,scope.parkId,ids.book,ids.policy,ids.actor]);
  const tx={transaction:async<T>(work:(tx:EntityManager)=>Promise<T>)=>work(manager)} as DataSource;
  const history=new HrPayrollHistoryService(tx,{recordOperationRequired:async()=>undefined} as unknown as AuditService);
  const run=await history.simulateReconciliation(scope,actor,{legacyBatchId:ids.legacyBatch,attendanceInputBatchId});
  const [result]=await q("SELECT new_total FROM hr_payroll_reconciliation_result WHERE run_id=$1",[run.id]);assert.equal(result.new_total,"1.0000");
  const [evidence]=await q("SELECT parser_version,frozen_employee_version FROM hr_payroll_reconciliation_run WHERE id=$1",[run.id]);assert.equal(evidence.parser_version,"jinhu-payroll-dsl-v5");
}
