import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { plainToInstance, type ClassConstructor } from "class-transformer";
import { isUUID, validate } from "class-validator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { AuditService } from "../audit/audit.service";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";
import { evaluatePayrollFormula } from "./hr-payroll-formula-dsl";
import { ConfirmHrPayrollFormalInputDto, CreateHrPayrollFormalInputDto, HrPayrollFormalEmployeeInputDto, HrPayrollFormalInputQueryDto, HrPayrollFormalInputDetailQueryDto, HrPayrollFormalPreparationQueryDto, UpdateHrPayrollFormalInputDto } from "./dto/hr-payroll-formal-input.dto";
import { buildHrSensitiveReadAuditInput } from "./hr-sensitive-read-audit";
import { resolvePayrollEligibility } from "./hr-payroll-eligibility";

type InputRow = { id: string; period_id: string; rule_set_id: string; rule_version_id: string; revision_no: number; version: number; status: string; employees: HrPayrollFormalEmployeeInputDto[]; reason: string; created_by: string; authored_by: string; snapshot_sha256: string };
type PeriodRow = { id: string; month: string; start_date: string; end_date: string; status: string };

@Injectable()
export class HrPayrollFormalInputService {
  constructor(private readonly db: DataSource, private readonly rules: HrPayrollFormalRuleService, private readonly audit: AuditService) {}
  private authority(actor: JwtPrincipal, confirm = false) {
    const required = [HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ,
      confirm ? HR_PERMISSIONS.HR_PAYROLL_REVIEW : HR_PERMISSIONS.HR_PAYROLL_MANAGE];
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(permission => actor.permissions.includes(permission))) throw new ForbiddenException("Payroll input permission required");
  }
  private readAuthority(actor: JwtPrincipal, detail = false) {
    const required = detail ? [HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ] : [HR_PERMISSIONS.HR_PAYROLL_READ];
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(permission => actor.permissions.includes(permission))) throw new ForbiddenException("Payroll input read permission required");
  }
  private readAudit(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, count: number, detail: boolean, id?: string) {
    return this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, {
      resource: "hr.payroll_input", action: detail ? "读取工资项目输入明细" : "读取工资输入批次",
      bizType: "hr_payroll_formal_input", bizId: id ?? null, path: id ? `/hr/payroll/inputs/${id}` : "/hr/payroll/inputs",
      fieldGroups: detail ? ["financial", "payroll_input", "identity"] : ["payroll_input"], projection: detail ? "full" : "metadata", itemCount: count,
    }), manager);
  }
  private async dto<T extends object>(type: ClassConstructor<T>, input: T) {
    const dto = plainToInstance(type, input);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll input");
    return dto;
  }
  private async transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    try { return await this.db.transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout='3s'");
      await manager.query("SET LOCAL statement_timeout='20s'");
      return work(manager);
    }); } catch (error) {
      const code = (error as { driverError?: { code?: string }; code?: string })?.driverError?.code ?? (error as { code?: string })?.code;
      if (["23505", "55P03", "40001", "40P01", "P0001"].includes(code ?? "")) throw new ConflictException("Payroll inputs changed; refresh before saving");
      throw error;
    }
  }
  private async period(manager: EntityManager, scope: TenantParkScope, id: string): Promise<PeriodRow> {
    const rows = await manager.query("SELECT id,to_char(period_month,'YYYY-MM') AS month,to_char(start_date,'YYYY-MM-DD') AS start_date,to_char(end_date,'YYYY-MM-DD') AS end_date,status FROM hr_payroll_period WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE", [id, scope.tenantId, scope.parkId]);
    if (rows.length !== 1) throw new NotFoundException("Payroll period not found");
    if (rows[0].status !== "open") throw new ConflictException("Payroll period is closed");
    return rows[0];
  }
  private async employeeInputs(manager: EntityManager, scope: TenantParkScope, period: PeriodRow, ruleSetId: string, ruleVersionId: string, employees: HrPayrollFormalEmployeeInputDto[]) {
    const rule = await this.rules.lockEffectiveVersion(manager, scope, ruleSetId, period.month, ruleVersionId);
    const direct = rule.definition.items.filter(item => item.expression === null).map(item => item.code).sort();
    if (new Set(employees.map(employee => employee.employeeId)).size !== employees.length) throw new BadRequestException("Duplicate payroll employees");
    const employeeRows: Array<{ id: string; version: number; hire_date: string | null; departure_date: string | null }> = await manager.query("SELECT id,version,to_char(hire_date,'YYYY-MM-DD') AS hire_date,to_char(departure_date,'YYYY-MM-DD') AS departure_date FROM hr_employee WHERE id=ANY($1::uuid[]) AND tenant_id=$2 AND park_id=$3 AND is_deleted=false ORDER BY id FOR SHARE", [employees.map(employee => employee.employeeId), scope.tenantId, scope.parkId]);
    if (employeeRows.length !== employees.length) throw new NotFoundException("Payroll employee not found");
    const byId = new Map(employeeRows.map(employee => [employee.id, employee]));
    const result: HrPayrollFormalEmployeeInputDto[] = [];
    for (const input of [...employees].sort((a, b) => a.employeeId.localeCompare(b.employeeId))) {
      const employee = byId.get(input.employeeId)!;
      if (employee.version !== input.expectedEmployeeVersion) throw new ConflictException("Payroll employee changed; refresh roster");
      const exception = input.eligibilityReason?.trim();
      resolvePayrollEligibility({ periodStart: period.start_date, periodEnd: period.end_date,
        hireDate: employee.hire_date, departureDate: employee.departure_date,
        settlementStart: input.settlementStart, settlementEnd: input.settlementEnd, eligibilityReason: exception });
      const codes = Object.keys(input.directItems).sort();
      if (JSON.stringify(codes) !== JSON.stringify(direct)) throw new BadRequestException("Direct inputs must cover exactly the approved direct projects");
      const directItems: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const code of codes) {
        const value = input.directItems[code];
        if (typeof value !== "string" || !/^-?\d{1,16}(?:\.\d{1,4})?$/u.test(value)) throw new BadRequestException("Payroll values must be exact decimal strings");
        directItems[code] = evaluatePayrollFormula({ type: "reference", domain: "payroll", code: "input" }, { "payroll:input": value });
      }
      result.push({ employeeId: input.employeeId, expectedEmployeeVersion: employee.version, directItems,
        ...(exception ? { eligibilityReason: exception } : {}),
        ...(input.settlementStart !== undefined ? { settlementStart: input.settlementStart, settlementEnd: input.settlementEnd } : {}) });
    }
    return result;
  }
  private project(row: InputRow) {
    return { id: row.id, periodId: row.period_id, ruleSetId: row.rule_set_id, ruleVersionId: row.rule_version_id,
      revisionNo: row.revision_no, version: row.version, status: row.status, employees: row.employees, reason: row.reason };
  }
  private auditWrite(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, row: InputRow, action: string) {
    return this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, realName: actor.realName ?? null,
      roleCodes: actor.roles, module: "人力资源管理", resource: "hr.payroll_input", action, bizType: "hr_payroll_formal_input", bizId: row.id,
      beforeJson: null, afterJson: { revisionNo: row.revision_no, employeeCount: row.employees.length, status: row.status },
      method: "POST", path: "/hr/payroll/inputs", success: true, result: "success", requestId: null }, manager);
  }
  /** Formal run consumer: caller keeps this transaction open through source reads and run persistence. */
  async lockConfirmedInput(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, id: string, expectedVersion: number) {
    this.authority(actor);
    if (!isUUID(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new BadRequestException("Invalid confirmed payroll input selection");
    const selected: InputRow[] = await manager.query("SELECT * FROM hr_payroll_formal_input WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId]);
    if (selected.length !== 1) throw new NotFoundException("Payroll input not found");
    const period = await this.period(manager, scope, selected[0]!.period_id);
    const rule = await this.rules.lockEffectiveVersion(manager, scope, selected[0]!.rule_set_id, period.month, selected[0]!.rule_version_id);
    const rows: InputRow[] = await manager.query("SELECT * FROM hr_payroll_formal_input WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR SHARE", [id, scope.tenantId, scope.parkId]);
    const row = rows[0]!;
    if (row.status !== "confirmed" || row.version !== expectedVersion) throw new ConflictException("Payroll input is not confirmed or its selected version changed");
    const latest: Array<{ id: string }> = await manager.query("SELECT id FROM hr_payroll_formal_input WHERE period_id=$1 AND rule_set_id=$2 AND tenant_id=$3 AND park_id=$4 AND status='confirmed' ORDER BY revision_no DESC LIMIT 1 FOR SHARE", [row.period_id, row.rule_set_id, scope.tenantId, scope.parkId]);
    if (latest[0]?.id !== row.id) throw new ConflictException("A newer confirmed payroll input exists; refresh selection");
    // Recheck live employee versions and exact project coverage before freezing any payroll result.
    const employees = await this.employeeInputs(manager, scope, period, row.rule_set_id, row.rule_version_id, row.employees);
    return { period, rule, input: { id: row.id, revisionNo: row.revision_no, version: row.version,
      snapshotSha256: row.snapshot_sha256, employees } };
  }
  async list(scope: TenantParkScope, actor: JwtPrincipal, input: HrPayrollFormalInputQueryDto) {
    this.readAuthority(actor);
    const dto = await this.dto(HrPayrollFormalInputQueryDto, input);
    return this.transaction(async manager => {
      const periods = await manager.query("SELECT id FROM hr_payroll_period WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false", [dto.periodId, scope.tenantId, scope.parkId]);
      if (periods.length !== 1) throw new NotFoundException("Payroll period not found");
      const params = [scope.tenantId, scope.parkId, dto.periodId, dto.ruleSetId ?? null];
      const rows: Array<InputRow & { display_name: string; employee_count: number; total: number }> = await manager.query(`SELECT i.id,i.period_id,i.rule_set_id,i.rule_version_id,i.revision_no,i.version,i.status,
        s.display_name,jsonb_array_length(i.employees) AS employee_count,count(*) OVER()::int AS total
        FROM hr_payroll_formal_input i JOIN hr_payroll_rule_set s ON (s.id,s.tenant_id,s.park_id)=(i.rule_set_id,i.tenant_id,i.park_id)
        WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.period_id=$3 AND ($4::uuid IS NULL OR i.rule_set_id=$4)
        ORDER BY s.display_name,i.revision_no DESC,i.id LIMIT $5 OFFSET $6`, [...params, dto.pageSize, (dto.page - 1) * dto.pageSize]);
      const total = rows[0]?.total ?? (await manager.query("SELECT count(*)::int AS total FROM hr_payroll_formal_input WHERE tenant_id=$1 AND park_id=$2 AND period_id=$3 AND ($4::uuid IS NULL OR rule_set_id=$4)", params))[0].total;
      await this.readAudit(manager, scope, actor, rows.length, false);
      return { items: rows.map(row => ({ id: row.id, periodId: row.period_id, ruleSetId: row.rule_set_id, ruleVersionId: row.rule_version_id,
        displayName: row.display_name, revisionNo: row.revision_no, version: row.version, status: row.status, employeeCount: row.employee_count })), total, page: dto.page, page_size: dto.pageSize };
    });
  }
  /** Read-only preparation: all statuses remain candidates; settlement exceptions are explicit. */
  async preparation(scope: TenantParkScope, actor: JwtPrincipal, input: HrPayrollFormalPreparationQueryDto) {
    this.authority(actor);
    if (!actor.isSuper && !actor.permissions.includes("*") && !actor.permissions.includes(HR_PERMISSIONS.HR_PAYROLL_RULE_READ)) throw new ForbiddenException("Payroll rule read permission required");
    const dto = await this.dto(HrPayrollFormalPreparationQueryDto, input);
    return this.transaction(async manager => {
      const period = await this.period(manager, scope, dto.periodId);
      const rule = await this.rules.lockEffectiveVersion(manager, scope, dto.ruleSetId, period.month);
      const sets = await manager.query("SELECT display_name FROM hr_payroll_rule_set WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [dto.ruleSetId, scope.tenantId, scope.parkId]);
      const heads = await manager.query("SELECT coalesce(max(revision_no),0)::int AS head FROM hr_payroll_formal_input WHERE period_id=$1 AND rule_set_id=$2 AND tenant_id=$3 AND park_id=$4", [dto.periodId, dto.ruleSetId, scope.tenantId, scope.parkId]);
      const params = [scope.tenantId, scope.parkId, dto.keyword ?? ""];
      const predicate = "tenant_id=$1 AND park_id=$2 AND is_deleted=false AND ($3='' OR position(lower($3) in lower(full_name))>0 OR position(lower($3) in lower(employee_code))>0)";
      const rows: Array<{id:string;version:number;employee_code:string;full_name:string;hire_date:string|null;departure_date:string|null;total:number}> = await manager.query(`SELECT id,version,employee_code,full_name,to_char(hire_date,'YYYY-MM-DD') AS hire_date,to_char(departure_date,'YYYY-MM-DD') AS departure_date,count(*) OVER()::int AS total FROM hr_employee WHERE ${predicate} ORDER BY employee_code,id LIMIT $4 OFFSET $5`, [...params, dto.pageSize, (dto.page-1)*dto.pageSize]);
      const total = rows[0]?.total ?? (await manager.query(`SELECT count(*)::int AS total FROM hr_employee WHERE ${predicate}`, params))[0].total;
      const items = rows.map(employee => {
        let eligibility: {eligibleStart:string;eligibleEnd:string;basis:"employment_dates"}|null = null;
        try {
          const window = resolvePayrollEligibility({periodStart:period.start_date,periodEnd:period.end_date,hireDate:employee.hire_date,departureDate:employee.departure_date});
          eligibility = {...window,basis:"employment_dates"};
        } catch (error) { if (!(error instanceof BadRequestException)) throw error; }
        return {employeeId:employee.id,expectedEmployeeVersion:employee.version,employeeCode:employee.employee_code,fullName:employee.full_name,
          hireDate:employee.hire_date,departureDate:employee.departure_date,eligibility,requiresSettlementWindow:eligibility===null};
      });
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, {resource:"hr.payroll_input",action:"读取当期工资准备",bizType:"hr_payroll_formal_input",bizId:null,path:"/hr/payroll/inputs/preparation",fieldGroups:["identity","payroll_input"],projection:"full",itemCount:items.length}),manager);
      return {period:{id:period.id,month:period.month,startDate:period.start_date,endDate:period.end_date},
        rule:{id:rule.id,ruleSetId:dto.ruleSetId,displayName:sets[0].display_name,definition:rule.definition},expectedHeadRevision:heads[0].head,
        items,total,page:dto.page,page_size:dto.pageSize};
    });
  }
  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: HrPayrollFormalInputDetailQueryDto) {
    this.readAuthority(actor, true);
    const dto = await this.dto(HrPayrollFormalInputDetailQueryDto, input);
    return this.transaction(async manager => {
      const rows: InputRow[] = await manager.query("SELECT * FROM hr_payroll_formal_input WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId]);
      if (rows.length !== 1) throw new NotFoundException("Payroll input not found");
      const row = rows[0]!;
      const [availability] = await manager.query("SELECT p.status='open' AND p.is_deleted=false AND $4=(SELECT max(i.revision_no) FROM hr_payroll_formal_input i WHERE i.period_id=$1 AND i.rule_set_id=$5 AND i.tenant_id=$2 AND i.park_id=$3) AS actionable FROM hr_payroll_period p WHERE p.id=$1 AND p.tenant_id=$2 AND p.park_id=$3",[row.period_id,scope.tenantId,scope.parkId,row.revision_no,row.rule_set_id]);
      const granted=(permission:string)=>actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission);
      const actionable=row.status==="draft" && availability?.actionable===true;
      const selected = row.employees.slice((dto.page - 1) * dto.pageSize, dto.page * dto.pageSize);
      const identities: Array<{ id: string; employee_code: string; full_name: string }> = selected.length ? await manager.query("SELECT id,employee_code,full_name FROM hr_employee WHERE id=ANY($1::uuid[]) AND tenant_id=$2 AND park_id=$3 AND is_deleted=false", [selected.map(employee => employee.employeeId), scope.tenantId, scope.parkId]) : [];
      const byId = new Map(identities.map(employee => [employee.id, employee]));
      await this.readAudit(manager, scope, actor, selected.length, true, id);
      return { ...this.project(row), canEdit: actionable && granted(HR_PERMISSIONS.HR_PAYROLL_MANAGE), canConfirm: actionable && granted(HR_PERMISSIONS.HR_PAYROLL_REVIEW) && ![row.created_by,row.authored_by].includes(actor.sub), employees: selected.map(employee => ({ ...employee, employeeCode: byId.get(employee.employeeId)?.employee_code ?? null,
        fullName: byId.get(employee.employeeId)?.full_name ?? null })), total: row.employees.length, page: dto.page, page_size: dto.pageSize };
    });
  }
  async create(scope: TenantParkScope, actor: JwtPrincipal, input: CreateHrPayrollFormalInputDto) {
    this.authority(actor);
    const dto = await this.dto(CreateHrPayrollFormalInputDto, input);
    return this.transaction(async manager => {
      const period = await this.period(manager, scope, dto.periodId);
      const employees = await this.employeeInputs(manager, scope, period, dto.ruleSetId, dto.ruleVersionId, dto.employees);
      const [{ head }] = await manager.query("SELECT coalesce(max(revision_no),0)::int AS head FROM hr_payroll_formal_input WHERE tenant_id=$1 AND park_id=$2 AND period_id=$3 AND rule_set_id=$4", [scope.tenantId, scope.parkId, dto.periodId, dto.ruleSetId]);
      if (head !== dto.expectedHeadRevision) throw new ConflictException("Payroll input list changed; refresh");
      const row = typeormQueryRows<InputRow>(await manager.query("INSERT INTO hr_payroll_formal_input(tenant_id,park_id,period_id,rule_set_id,rule_version_id,revision_no,employees,snapshot_sha256,reason,created_by,authored_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,repeat('0',64),$8,$9,$9) RETURNING *", [scope.tenantId, scope.parkId, dto.periodId, dto.ruleSetId, dto.ruleVersionId, head + 1, JSON.stringify(employees), dto.reason, actor.sub]))[0]!;
      await this.auditWrite(manager, scope, actor, row, "保存工资项目输入");
      return this.project(row);
    });
  }
  private async lock(manager: EntityManager, scope: TenantParkScope, id: string, expectedVersion: number) {
    const identity = await manager.query("SELECT period_id FROM hr_payroll_formal_input WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId]);
    if (identity.length !== 1) throw new NotFoundException("Payroll input not found");
    const period = await this.period(manager, scope, identity[0].period_id);
    const rows: InputRow[] = await manager.query("SELECT * FROM hr_payroll_formal_input WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE", [id, scope.tenantId, scope.parkId]);
    if (rows[0]!.version !== expectedVersion || rows[0]!.status !== "draft") throw new ConflictException("Only the current draft can be changed; confirmed inputs require a new revision");
    const [{ head }] = await manager.query("SELECT max(revision_no)::int AS head FROM hr_payroll_formal_input WHERE tenant_id=$1 AND park_id=$2 AND period_id=$3 AND rule_set_id=$4", [scope.tenantId, scope.parkId, rows[0]!.period_id, rows[0]!.rule_set_id]);
    if (head !== rows[0]!.revision_no) throw new ConflictException("A newer payroll input revision exists; use the current draft");
    return { row: rows[0]!, period };
  }
  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: UpdateHrPayrollFormalInputDto) {
    this.authority(actor);
    const dto = await this.dto(UpdateHrPayrollFormalInputDto, input);
    return this.transaction(async manager => {
      const { row, period } = await this.lock(manager, scope, id, dto.expectedVersion);
      const employees = await this.employeeInputs(manager, scope, period, row.rule_set_id, row.rule_version_id, dto.employees);
      const saved = typeormQueryRows<InputRow>(await manager.query("UPDATE hr_payroll_formal_input SET employees=$4::jsonb,reason=$5,authored_by=$6,version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 RETURNING *", [id, scope.tenantId, scope.parkId, JSON.stringify(employees), dto.reason, actor.sub]))[0]!;
      await this.auditWrite(manager, scope, actor, saved, "修改工资项目输入");
      return this.project(saved);
    });
  }
  async confirm(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: ConfirmHrPayrollFormalInputDto) {
    this.authority(actor, true);
    const dto = await this.dto(ConfirmHrPayrollFormalInputDto, input);
    return this.transaction(async manager => {
      const { row, period } = await this.lock(manager, scope, id, dto.expectedVersion);
      if ([row.created_by, row.authored_by].includes(actor.sub)) throw new ForbiddenException("Input authors cannot confirm their own inputs");
      await this.employeeInputs(manager, scope, period, row.rule_set_id, row.rule_version_id, row.employees);
      const saved = typeormQueryRows<InputRow>(await manager.query("UPDATE hr_payroll_formal_input SET status='confirmed',confirmed_by=$4,confirmed_at=now(),version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 RETURNING *", [id, scope.tenantId, scope.parkId, actor.sub]))[0]!;
      await this.auditWrite(manager, scope, actor, saved, "确认工资项目输入");
      return this.project(saved);
    });
  }
}
