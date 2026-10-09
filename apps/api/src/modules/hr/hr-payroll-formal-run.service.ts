import { lockPayrollPeriodContext } from "./hr-payroll-period-context";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { isUUID, validate } from "class-validator";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { CreateHrPayrollFormalRunDto, HrPayrollFormalRunQueryDto, HrPayrollFormalRunOptionsQueryDto, TransitionHrPayrollFormalRunDto } from "./dto/hr-payroll-formal-run.dto";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { lockPayrollCompensationSegments, requiresPayrollCompensationInputs } from "./hr-payroll-compensation-input";
import { HR_PAYROLL_INSURANCE_REFERENCE_CODES } from "./hr-payroll-insurance-input";
import { assertPayrollInsuranceChoices, lockModernPayrollInsuranceSources } from "./hr-payroll-insurance-source";
import { calculateFormalPayrollWithSources, type FormalPayrollAttendanceSource } from "./hr-payroll-formal-source-calculation";
import { hrMoneyToCents, hrCentsToMoney, normalizeHrMoney } from "./hr-money";
import { HrPayrollFormalInputDetailQueryDto } from "./dto/hr-payroll-formal-input.dto";
import { buildHrSensitiveReadAuditInput } from "./hr-sensitive-read-audit";

@Injectable()
export class HrPayrollFormalRunService {
  constructor(private readonly db: DataSource, private readonly inputs: HrPayrollFormalInputService, private readonly audit: AuditService) {}
  async list(scope: TenantParkScope, actor: JwtPrincipal, query: HrPayrollFormalRunQueryDto) {
    if (!actor.isSuper && !actor.permissions.includes("*") && !actor.permissions.includes(HR_PERMISSIONS.HR_PAYROLL_READ)) throw new ForbiddenException("Payroll list permission required");
    const dto = plainToInstance(HrPayrollFormalRunQueryDto, query);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll list query");
    return this.db.transaction(async manager => {
      const from = `FROM hr_payroll_run r
        JOIN hr_payroll_formal_run_evidence e ON (e.run_id,e.tenant_id,e.park_id)=(r.id,r.tenant_id,r.park_id)
        JOIN hr_payroll_period p ON (p.id,p.tenant_id,p.park_id)=(r.period_id,r.tenant_id,r.park_id)
        JOIN hr_payroll_rule_version v ON (v.id,v.tenant_id,v.park_id)=(e.rule_version_id,e.tenant_id,e.park_id)
        JOIN hr_payroll_rule_set s ON (s.id,s.tenant_id,s.park_id)=(v.rule_set_id,v.tenant_id,v.park_id)
        WHERE r.tenant_id=$1 AND r.park_id=$2 AND NOT r.is_deleted AND NOT p.is_deleted
          AND ($3::text IS NULL OR to_char(p.period_month,'YYYY-MM')=$3) AND ($4::text IS NULL OR r.status=$4)`;
      const params = [scope.tenantId, scope.parkId, dto.month ?? null, dto.status ?? null];
      const rows = await manager.query(`SELECT r.id,r.period_id,r.run_no,r.version,r.status,r.employee_count,r.correction_of_run_id IS NOT NULL AS is_correction,
        to_char(p.period_month,'YYYY-MM') AS month,s.display_name,count(*) OVER()::int AS total ${from}
        ORDER BY p.period_month DESC,r.run_no DESC,r.id LIMIT $5 OFFSET $6`, [...params, dto.pageSize, (dto.page - 1) * dto.pageSize]);
      const total = rows[0]?.total ?? (await manager.query(`SELECT count(*)::int AS total ${from}`, params))[0].total;
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.payroll_run", action: "读取工资核算批次", bizType: "hr_payroll_run", bizId: null,
        path: "/hr/payroll/formal-runs", fieldGroups: ["financial"], projection: "metadata", itemCount: rows.length }), manager);
      return { items: rows.map((row: { id: string; period_id: string; run_no: number; version: number; status: string; employee_count: number; is_correction: boolean; month: string; display_name: string }) => ({
        id: row.id, periodId: row.period_id, runNo: row.run_no, version: row.version, status: row.status, employeeCount: row.employee_count,
        isCorrection: row.is_correction, month: row.month, ruleName: row.display_name,
      })), total: total as number, page: dto.page, page_size: dto.pageSize };
    });
  }
  private requirements(dependencies: string[]) {
    return { compensation: requiresPayrollCompensationInputs(dependencies),
      attendance: dependencies.some(code => ["hr:工作分钟", "hr:迟到分钟", "hr:早退分钟", "hr:缺勤天数", "hr:缺卡天数"].includes(code)),
      insurance: dependencies.some(code => code.startsWith("hr:") && HR_PAYROLL_INSURANCE_REFERENCE_CODES.has(code.slice(3))) };
  }
  async options(scope: TenantParkScope, actor: JwtPrincipal, query: HrPayrollFormalRunOptionsQueryDto) {
    const required = [HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ];
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(permission => actor.permissions.includes(permission))) throw new ForbiddenException("Payroll calculation permission required");
    const dto = plainToInstance(HrPayrollFormalRunOptionsQueryDto, query);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll options query");
    return this.db.transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout='3s'"); await manager.query("SET LOCAL statement_timeout='30s'");
      const prepared = await this.inputs.lockConfirmedInput(manager, scope, actor, dto.inputId, dto.expectedInputVersion);
      const {period,rule} = prepared, employeeIds = prepared.input.employees.map(employee => employee.employeeId);
      const requires = this.requirements([...new Set(rule.definition_evidence.items.flatMap(item => item.dependencies))]);
      const attendance: Array<{id:string;batch_no:number;batch_type:string;covered:number}> = requires.attendance ? await manager.query(`SELECT b.id,b.batch_no,b.batch_type,(SELECT count(DISTINCT i.employee_id)::int FROM hr_attendance_payroll_input_item i WHERE (i.batch_id,i.tenant_id,i.park_id)=(b.id,b.tenant_id,b.park_id) AND NOT i.is_deleted AND i.employee_id=ANY($4::uuid[])) AS covered
        FROM hr_attendance_payroll_input_batch b JOIN hr_attendance_period p ON (p.id,p.tenant_id,p.park_id)=(b.period_id,b.tenant_id,b.park_id)
        WHERE b.tenant_id=$1 AND b.park_id=$2 AND NOT b.is_deleted AND NOT p.is_deleted AND b.status='effective' AND p.status='closed' AND p.period_month=$3::date ORDER BY b.batch_no DESC,b.id`,[scope.tenantId,scope.parkId,`${period.month}-01`,employeeIds]) : [];
      const overlaps = await manager.query(`SELECT count(DISTINCT s.employee_id)::int AS count FROM hr_payslip s JOIN hr_payroll_run r ON (r.id,r.tenant_id,r.park_id)=(s.run_id,s.tenant_id,s.park_id) WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.period_id=$3 AND NOT r.is_deleted AND NOT s.is_deleted AND r.status<>'cancelled' AND s.employee_id=ANY($4::uuid[])`,[scope.tenantId,scope.parkId,period.id,employeeIds]);
      const corrections: Array<{id:string;run_no:number;employee_count:number}> = await manager.query(`SELECT r.id,r.run_no,r.employee_count FROM hr_payroll_run r WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.period_id=$3 AND NOT r.is_deleted AND r.status='confirmed'
        AND NOT EXISTS(SELECT 1 FROM hr_payroll_run successor WHERE successor.tenant_id=r.tenant_id AND successor.park_id=r.park_id AND successor.correction_of_run_id=r.id AND NOT successor.is_deleted AND successor.status<>'cancelled')
        AND (SELECT array_agg(s.employee_id ORDER BY s.employee_id) FROM hr_payslip s WHERE (s.run_id,s.tenant_id,s.park_id)=(r.id,r.tenant_id,r.park_id) AND NOT s.is_deleted)=$4::uuid[] ORDER BY r.run_no DESC,r.id`,[scope.tenantId,scope.parkId,period.id,[...employeeIds].sort()]);
      const selected = employeeIds.slice((dto.page-1)*dto.pageSize,dto.page*dto.pageSize);
      const employees: Array<{id:string;employee_code:string;full_name:string}> = selected.length ? await manager.query("SELECT id,employee_code,full_name FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND NOT is_deleted ORDER BY id",[scope.tenantId,scope.parkId,selected]) : [];
      const insurance: Array<{employee_id:string;id:string;revision_no:number;snapshot_sha256:string}> = requires.insurance && selected.length ? await manager.query(`SELECT r.employee_id,r.id,r.revision_no,p.snapshot_sha256 FROM hr_insurance_owned_revision r JOIN hr_insurance_owned_preview p ON (p.id,p.tenant_id,p.park_id)=(r.preview_id,r.tenant_id,r.park_id)
        WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.period_month=$3::date AND r.employee_id=ANY($4::uuid[]) AND NOT EXISTS(SELECT 1 FROM hr_insurance_owned_revision newer WHERE (newer.tenant_id,newer.park_id,newer.employee_id,newer.period_month)=(r.tenant_id,r.park_id,r.employee_id,r.period_month) AND newer.revision_no>r.revision_no) ORDER BY r.employee_id`,[scope.tenantId,scope.parkId,`${period.month}-01`,selected]) : [];
      const insuranceByEmployee = new Map(insurance.map(source=>[source.employee_id,source]));
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope,actor,{resource:"hr.payroll_run",action:"读取正式核算来源选项",bizType:"hr_payroll_formal_input",bizId:prepared.input.id,path:"/hr/payroll/formal-runs/options",fieldGroups:["identity","payroll_input",...(requires.attendance ? ["attendance" as const] : []),...(requires.insurance ? ["insurance" as const] : [])],projection:"full",itemCount:employees.length}),manager);
      return {inputId:prepared.input.id,inputVersion:prepared.input.version,periodId:period.id,month:period.month,employeeCount:employeeIds.length,requires,
        canCreateBase:!period.correctionWindow && overlaps[0].count===0,overlappingEmployeeCount:overlaps[0].count,
        attendanceBatches:attendance.map(batch=>({id:batch.id,batchNo:batch.batch_no,batchType:batch.batch_type,missingEmployeeCount:employeeIds.length-batch.covered})),
        correctionRuns:corrections.filter(run=>!period.correctionWindow || run.id===period.correctionWindow.originalRunId).map(run=>({id:run.id,runNo:run.run_no,employeeCount:run.employee_count})),
        items:employees.map(employee=>{const source=insuranceByEmployee.get(employee.id);return {employeeId:employee.id,employeeCode:employee.employee_code,fullName:employee.full_name,
          insuranceSource:source ? {employeeId:employee.id,sourceKind:"modern_confirmed" as const,sourceId:source.id,expectedVersion:source.revision_no,expectedHash:source.snapshot_sha256} : null};}),
        total:employeeIds.length,page:dto.page,page_size:dto.pageSize};
    });
  }
  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: HrPayrollFormalInputDetailQueryDto) {
    const required = [HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ];
    const permitted = (permission: string) => actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission);
    if (!required.every(permitted)) throw new ForbiddenException("Payroll detail permission required");
    const dto = plainToInstance(HrPayrollFormalInputDetailQueryDto, query);
    if (!isUUID(id) || (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll detail query");
    return this.db.transaction(async manager => {
      const rows = await manager.query(`SELECT r.id,r.period_id,r.run_no,r.status,r.version,r.create_by,r.employee_count,e.input_id,e.rule_version_id,
        (EXISTS(SELECT 1 FROM hr_payroll_period p JOIN hr_payroll_formal_input i ON i.id=e.input_id AND i.tenant_id=p.tenant_id AND i.park_id=p.park_id
          WHERE p.id=r.period_id AND p.tenant_id=r.tenant_id AND p.park_id=r.park_id AND NOT p.is_deleted
          AND ((p.status='open' AND i.correction_window_id IS NULL) OR (p.status='closed' AND EXISTS(SELECT 1 FROM hr_payroll_correction_window w
            WHERE (w.id,w.period_id,w.tenant_id,w.park_id,w.original_run_id)=(i.correction_window_id,p.id,p.tenant_id,p.park_id,r.correction_of_run_id) AND w.status='open'))))) AS actionable,
        e.snapshot->'totals' AS totals,COALESCE((SELECT jsonb_agg(value ORDER BY ordinality)
          FROM jsonb_array_elements(e.snapshot->'results') WITH ORDINALITY WHERE ordinality>$4 AND ordinality<=$5),'[]'::jsonb) AS results
        FROM hr_payroll_run r JOIN hr_payroll_formal_run_evidence e ON (e.run_id,e.tenant_id,e.park_id)=(r.id,r.tenant_id,r.park_id)
        WHERE r.id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND NOT r.is_deleted`, [id, scope.tenantId, scope.parkId, (dto.page - 1) * dto.pageSize, dto.page * dto.pageSize]);
      if (rows.length !== 1) throw new NotFoundException("Payroll run not found");
      const row = rows[0], selected = row.results as Array<{ employeeId: string; calculation: ReturnType<typeof calculateFormalPayrollWithSources>["calculation"] }>;
      const identities: Array<{ id: string; employee_code: string; full_name: string }> = selected.length ? await manager.query("SELECT id,employee_code,full_name FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND NOT is_deleted", [scope.tenantId, scope.parkId, selected.map(result => result.employeeId)]) : [];
      const byId = new Map(identities.map(employee => [employee.id, employee]));
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.payroll_run", action: "读取正式工资核算明细", bizType: "hr_payroll_run", bizId: id,
        path: "/hr/payroll/formal-runs/:id", fieldGroups: ["financial", "compensation", "identity"], projection: "full", itemCount: selected.length }), manager);
      return { id: row.id as string, periodId: row.period_id as string, runNo: row.run_no as number, version: row.version as number,
        status: row.status as string, inputId: row.input_id as string, ruleVersionId: row.rule_version_id as string,
        employeeCount: row.employee_count as number, totals: row.totals as { grossAmount: string; deductionAmount: string; personalTax: string; netAmount: string },
        canReview: permitted(HR_PERMISSIONS.HR_PAYROLL_REVIEW) && row.actionable === true && row.status === "calculated" && row.create_by !== actor.sub,
        canConfirm: permitted(HR_PERMISSIONS.HR_PAYROLL_CONFIRM) && row.actionable === true && row.status === "reviewing" && row.create_by !== actor.sub,
        items: selected.map(result => ({ employeeId: result.employeeId, employeeCode: byId.get(result.employeeId)?.employee_code ?? null,
          fullName: byId.get(result.employeeId)?.full_name ?? null, ...result.calculation })),
        total: row.employee_count as number, page: dto.page, page_size: dto.pageSize };
    });
  }
  private async attendance(manager: EntityManager, scope: TenantParkScope, month: string, employeeIds: string[], id?: string) {
    if (!id) throw new ConflictException("Required closed attendance batch must be selected");
    const batches = await manager.query(`SELECT b.id FROM hr_attendance_payroll_input_batch b
      JOIN hr_attendance_period p ON (p.id,p.tenant_id,p.park_id)=(b.period_id,b.tenant_id,b.park_id)
      WHERE b.id=$1 AND b.tenant_id=$2 AND b.park_id=$3 AND NOT b.is_deleted AND NOT p.is_deleted
        AND b.status='effective' AND p.status='closed' AND p.period_month=$4::date FOR UPDATE OF b,p`, [id, scope.tenantId, scope.parkId, `${month}-01`]);
    if (batches.length !== 1) throw new ConflictException("Attendance batch is not current, closed or in this month");
    const rows: Array<FormalPayrollAttendanceSource & { employeeId: string }> = await manager.query(`SELECT id,batch_id AS "batchId",employee_id AS "employeeId",
      worked_minutes::text AS "workedMinutes",late_minutes::text AS "lateMinutes",early_minutes::text AS "earlyMinutes",
      absence_days::text AS "absenceDays",missing_punch_days::text AS "missingPunchDays"
      FROM hr_attendance_payroll_input_item WHERE batch_id=$1 AND tenant_id=$2 AND park_id=$3 AND employee_id=ANY($4::uuid[])
        AND NOT is_deleted ORDER BY employee_id,id FOR SHARE`, [id, scope.tenantId, scope.parkId, employeeIds]);
    if (rows.length !== employeeIds.length || new Set(rows.map(row => row.employeeId)).size !== employeeIds.length) throw new ConflictException("Attendance must cover each payroll employee exactly once");
    return new Map(rows.map(({ employeeId, ...row }) => [employeeId, row]));
  }
  async create(scope: TenantParkScope, actor: JwtPrincipal, input: CreateHrPayrollFormalRunDto) {
    const required = [HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ];
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(permission => actor.permissions.includes(permission))) throw new ForbiddenException("Payroll calculation permission required");
    const dto = plainToInstance(CreateHrPayrollFormalRunDto, input);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid formal payroll run selection");
    if (dto.correctionReason !== undefined && !dto.correctionOfRunId) throw new BadRequestException("A correction reason requires the original run");
    try { return await this.db.transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout='3s'");
      await manager.query("SET LOCAL statement_timeout='30s'");
      const prepared = await this.inputs.lockConfirmedInput(manager, scope, actor, dto.inputId, dto.expectedInputVersion);
      const { period, rule } = prepared, roster = prepared.input.employees;
      const employeeIds = roster.map(employee => employee.employeeId);
      if (period.correctionWindow && dto.correctionOfRunId !== period.correctionWindow.originalRunId) throw new ConflictException("Select the original run bound to this correction window");
      if (dto.correctionOfRunId) {
        const original = await manager.query("SELECT id FROM hr_payroll_run WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND period_id=$4 AND status='confirmed' AND NOT is_deleted FOR SHARE", [dto.correctionOfRunId, scope.tenantId, scope.parkId, period.id]);
        if (original.length !== 1) throw new ConflictException("Correction must reference a confirmed run in this period");
        const originals: Array<{ employee_id: string }> = await manager.query("SELECT employee_id FROM hr_payslip WHERE run_id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted ORDER BY employee_id FOR SHARE", [dto.correctionOfRunId, scope.tenantId, scope.parkId]);
        if (JSON.stringify(originals.map(row => row.employee_id)) !== JSON.stringify([...employeeIds].sort())) throw new ConflictException("Correction must preserve the original employee roster");
        const successors = await manager.query("SELECT id FROM hr_payroll_run WHERE correction_of_run_id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted AND status<>'cancelled'", [dto.correctionOfRunId, scope.tenantId, scope.parkId]);
        if (successors.length) throw new ConflictException("An active correction already exists; select the latest confirmed run");
      } else {
        const existing = await manager.query(`SELECT s.employee_id FROM hr_payslip s JOIN hr_payroll_run r ON (r.id,r.tenant_id,r.park_id)=(s.run_id,s.tenant_id,s.park_id)
          WHERE r.period_id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND NOT r.is_deleted AND NOT s.is_deleted
            AND r.status<>'cancelled' AND s.employee_id=ANY($4::uuid[]) LIMIT 1`, [period.id, scope.tenantId, scope.parkId, employeeIds]);
        if (existing.length) throw new ConflictException("Payroll employees already have a run in this period; use correction");
      }
      const dependencies = [...new Set(rule.definition_evidence.items.flatMap(item => item.dependencies))];
      const requirements = this.requirements(dependencies);
      const salary = requirements.compensation ? await lockPayrollCompensationSegments(manager, scope, employeeIds, period.start_date, period.end_date) : new Map();
      const attendanceRequired = requirements.attendance;
      if (!attendanceRequired && dto.attendanceInputBatchId) throw new BadRequestException("This rule does not use attendance inputs");
      const attendance = attendanceRequired ? await this.attendance(manager, scope, period.month, employeeIds, dto.attendanceInputBatchId) : new Map();
      const insuranceRequired = requirements.insurance;
      if (!insuranceRequired && dto.insuranceSources) throw new BadRequestException("This rule does not use insurance inputs");
      if (insuranceRequired) {
        if (!dto.insuranceSources || dto.insuranceSources.some(choice => choice.sourceKind !== "modern_confirmed")) throw new ConflictException("Select current confirmed insurance versions for this payroll month");
        assertPayrollInsuranceChoices(employeeIds, dto.insuranceSources);
      }
      const insurance = insuranceRequired ? await lockModernPayrollInsuranceSources(manager, scope, `${period.month}-01`, dto.insuranceSources!) : new Map();
      const employees: Array<{ id: string; version: number; hireDate: string | null; departureDate: string | null }> = await manager.query("SELECT id,version,to_char(hire_date,'YYYY-MM-DD') AS \"hireDate\",to_char(departure_date,'YYYY-MM-DD') AS \"departureDate\" FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND NOT is_deleted ORDER BY id FOR SHARE", [scope.tenantId, scope.parkId, employeeIds]);
      const byId = new Map(employees.map(employee => [employee.id, employee]));
      const results = roster.map(employeeInput => {
        const employee = byId.get(employeeInput.employeeId);
        if (!employee) throw new ConflictException("Payroll employee is no longer available");
        return { employeeId: employee.id, payslipId: randomUUID(), ...calculateFormalPayrollWithSources(rule.definition, {
          periodStart: period.start_date, periodEnd: period.end_date, employee, input: employeeInput,
          compensations: salary.get(employee.id) ?? [], attendance: attendance.get(employee.id), insurance: insurance.get(employee.id),
        }) };
      });
      const sum = (field: "grossAmount" | "deductionAmount" | "personalTax" | "netAmount") => normalizeHrMoney(hrCentsToMoney(results.reduce((total, row) => total + hrMoneyToCents(row.calculation[field]), 0n)));
      const totals = { grossAmount: sum("grossAmount"), deductionAmount: sum("deductionAmount"), personalTax: sum("personalTax"), netAmount: sum("netAmount") };
      // Recorded run deduction_total includes tax (000243 balance contract).
      // Formal evidence and payslips retain deductions and personal tax separately.
      const withheldTotal = normalizeHrMoney(hrCentsToMoney(hrMoneyToCents(totals.deductionAmount) + hrMoneyToCents(totals.personalTax)));
      const runId = randomUUID();
      const [run] = await manager.query(`INSERT INTO hr_payroll_run(id,tenant_id,park_id,period_id,run_no,correction_of_run_id,status,employee_count,gross_total,deduction_total,net_total,calculated_at,create_by,update_by,formal_input_id)
        SELECT $1::uuid,$2::varchar,$3::varchar,$4::uuid,COALESCE(MAX(run_no),0)+1,$5::uuid,'calculated',$6::integer,$7::numeric,$8::numeric,$9::numeric,now(),$10::uuid,$10::uuid,$11::uuid FROM hr_payroll_run WHERE tenant_id=$2::varchar AND park_id=$3::varchar AND period_id=$4::uuid RETURNING id,run_no`,
        [runId, scope.tenantId, scope.parkId, period.id, dto.correctionOfRunId ?? null, results.length, totals.grossAmount, withheldTotal, totals.netAmount, actor.sub, prepared.input.id]);
      await manager.query(`INSERT INTO hr_payslip(id,tenant_id,park_id,run_id,employee_id,compensation_snapshot,gross_amount,deduction_amount,personal_tax,net_amount,status,create_by,update_by)
        SELECT x.id,$2,$3,$4,x.employee_id,x.snapshot,x.gross,x.deduction,x.tax,x.net,'draft',$5,$5
        FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,employee_id uuid,snapshot jsonb,gross numeric,deduction numeric,tax numeric,net numeric)`,
        [JSON.stringify(results.map(row => ({ id: row.payslipId, employee_id: row.employeeId, snapshot: row.frozenSources, gross: row.calculation.grossAmount, deduction: row.calculation.deductionAmount, tax: row.calculation.personalTax, net: row.calculation.netAmount }))), scope.tenantId, scope.parkId, runId, actor.sub]);
      const items = results.flatMap(row => row.calculation.items.filter(item => item.amount !== null).map(item => ({ payslip_id: row.payslipId, code: item.code, role: item.role, amount: item.amount })));
      await manager.query(`INSERT INTO hr_payslip_item(tenant_id,park_id,payslip_id,item_code,item_name,item_type,amount,source,create_by,update_by)
        SELECT $2,$3,x.payslip_id,x.code,x.code,x.role,x.amount,'formal_rule',$4,$4
        FROM jsonb_to_recordset($1::jsonb) AS x(payslip_id uuid,code text,role text,amount numeric)`, [JSON.stringify(items), scope.tenantId, scope.parkId, actor.sub]);
      await manager.query("INSERT INTO hr_payroll_formal_run_evidence(run_id,tenant_id,park_id,input_id,rule_version_id,snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
        [runId, scope.tenantId, scope.parkId, prepared.input.id, rule.id, JSON.stringify({ period, input: prepared.input, correction: dto.correctionOfRunId ? { originalRunId: dto.correctionOfRunId, reason: dto.correctionReason } : null, rule: { id: rule.id, revisionNo: rule.revision_no, definitionHash: rule.definition_sha256, evidence: rule.definition_evidence }, totals, results })]);
      await this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, realName: actor.realName ?? null, roleCodes: actor.roles,
        module: "人力资源管理", resource: "hr.payroll_run", action: "正式工资核算", bizType: "hr_payroll_run", bizId: runId,
        beforeJson: null, afterJson: { employeeCount: results.length, runNo: run.run_no }, method: "POST", path: "/hr/payroll/formal-runs", success: true, result: "success", requestId: null }, manager);
      return { id: runId, periodId: period.id, runNo: run.run_no as number, version: 1, status: "calculated", employeeCount: results.length, ...totals };
    }); } catch (error) {
      const code = (error as { driverError?: { code?: string }; code?: string })?.driverError?.code ?? (error as { code?: string })?.code;
      if (["23505", "55P03", "40001", "40P01", "P0001"].includes(code ?? "")) throw new ConflictException("Payroll sources changed or conflict; refresh before calculation");
      throw error;
    }
  }
  async transition(scope: TenantParkScope, actor: JwtPrincipal, id: string, action: "review" | "confirm" | "cancel", input: TransitionHrPayrollFormalRunDto) {
    const required = [HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ,
      action === "cancel" ? HR_PERMISSIONS.HR_PAYROLL_MANAGE : action === "review" ? HR_PERMISSIONS.HR_PAYROLL_REVIEW : HR_PERMISSIONS.HR_PAYROLL_CONFIRM];
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(permission => actor.permissions.includes(permission))) throw new ForbiddenException("Payroll review permission required");
    const dto = plainToInstance(TransitionHrPayrollFormalRunDto, input);
    if (!isUUID(id) || !["review", "confirm", "cancel"].includes(action) || (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll review input");
    return this.db.transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout='3s'");
      await manager.query("SET LOCAL statement_timeout='20s'");
      const lookup = await manager.query("SELECT r.period_id,i.correction_window_id FROM hr_payroll_run r LEFT JOIN hr_payroll_formal_input i ON (i.id,i.tenant_id,i.park_id)=(r.formal_input_id,r.tenant_id,r.park_id) WHERE r.id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND NOT r.is_deleted", [id, scope.tenantId, scope.parkId]);
      if (lookup.length !== 1) throw new NotFoundException("Payroll run not found");
      await lockPayrollPeriodContext(manager, scope, lookup[0].period_id, lookup[0].correction_window_id);
      const rows = await manager.query(`SELECT r.id,r.version,r.status,r.create_by,e.snapshot
        FROM hr_payroll_run r JOIN hr_payroll_formal_run_evidence e ON (e.run_id,e.tenant_id,e.park_id)=(r.id,r.tenant_id,r.park_id)
        WHERE r.id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND NOT r.is_deleted FOR UPDATE OF r FOR SHARE OF e`, [id, scope.tenantId, scope.parkId]);
      if (rows.length !== 1) throw new NotFoundException("Formal payroll run not found");
      const run = rows[0];
      if (run.version !== dto.expectedVersion || (action === "cancel" ? !["calculated", "reviewing"].includes(run.status) : run.status !== (action === "review" ? "calculated" : "reviewing"))) throw new ConflictException("Payroll status or version changed; refresh before review");
      if (action !== "cancel" && run.create_by === actor.sub) throw new ForbiddenException("Payroll calculation authors cannot review or confirm their own run");
      const totals = await manager.query("SELECT count(*)::int AS count,COALESCE(sum(gross_amount),0)::text AS gross,COALESCE(sum(deduction_amount),0)::text AS deduction,COALESCE(sum(personal_tax),0)::text AS tax,COALESCE(sum(net_amount),0)::text AS net FROM hr_payslip WHERE run_id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted", [id, scope.tenantId, scope.parkId]);
      const expected = run.snapshot.totals;
      if (totals[0].count !== run.snapshot.results.length || normalizeHrMoney(totals[0].gross) !== expected.grossAmount
        || normalizeHrMoney(totals[0].deduction) !== expected.deductionAmount || normalizeHrMoney(totals[0].tax) !== expected.personalTax
        || normalizeHrMoney(totals[0].net) !== expected.netAmount) throw new ConflictException("Payroll results do not match frozen calculation evidence");
      await manager.query("INSERT INTO hr_payroll_formal_run_action(run_id,tenant_id,park_id,action,actor_id,version_before,reason) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, scope.tenantId, scope.parkId, action, actor.sub, dto.expectedVersion, dto.reason]);
      const status = action === "cancel" ? "cancelled" : action === "review" ? "reviewing" : "confirmed";
      await manager.query(`UPDATE hr_payroll_run SET status=$4::varchar,version=version+1,update_by=$5::uuid,update_time=now(),
        reviewed_at=CASE WHEN $4::varchar='reviewing' THEN now() ELSE reviewed_at END,
        confirmed_at=CASE WHEN $4::varchar='confirmed' THEN now() ELSE confirmed_at END,
        confirmed_by=CASE WHEN $4::varchar='confirmed' THEN $5::uuid ELSE confirmed_by END
        WHERE id=$1 AND tenant_id=$2 AND park_id=$3`, [id, scope.tenantId, scope.parkId, status, actor.sub]);
      if (action === "confirm" || action === "cancel") await manager.query("UPDATE hr_payslip SET status=$5,update_by=$4,update_time=now(),version=version+1 WHERE run_id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted", [id, scope.tenantId, scope.parkId, actor.sub, status]);
      await this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, realName: actor.realName ?? null, roleCodes: actor.roles,
        module: "人力资源管理", resource: "hr.payroll_run", action: action === "cancel" ? "取消未确认工资" : action === "review" ? "复核正式工资" : "确认正式工资", bizType: "hr_payroll_run", bizId: id,
        beforeJson: { status: run.status, version: run.version }, afterJson: { status, version: run.version + 1 }, method: "POST",
        path: `/hr/payroll/formal-runs/:id/${action}`, success: true, result: "success", requestId: null }, manager);
      return { id, status, version: run.version + 1 };
    });
  }
}
