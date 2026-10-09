import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance, type ClassConstructor } from "class-transformer";
import { isUUID, validate } from "class-validator";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { AuditService } from "../audit/audit.service";
import { CloseHrPayrollPeriodDto, CompleteHrPayrollCorrectionWindowDto, OpenHrPayrollCorrectionWindowDto } from "./dto/hr-payroll-period-lifecycle.dto";
import { buildHrSensitiveReadAuditInput } from "./hr-sensitive-read-audit";
import { HrPayrollFormalInputDetailQueryDto } from "./dto/hr-payroll-formal-input.dto";

type PeriodRow = { id: string; month: string; status: string; version: number };
type WindowRow = { id: string; period_id: string; original_run_id: string; original_run_version: number;
  rule_set_id: string; input_head_at_open: number; status: "open" | "completed" | "cancelled"; version: number; completed_run_id: string | null };

/** Period lifecycle and explicit closed-period correction windows. */
@Injectable()
export class HrPayrollPeriodLifecycleService {
  constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

  private authority(actor: JwtPrincipal, capability: string, write = true) {
    const required = write ? [capability, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ] : [capability];
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(permission => actor.permissions.includes(permission))) {
      throw new ForbiddenException("Payroll period permission required");
    }
  }
  private async input<T extends object>(type: ClassConstructor<T>, value: T, id: string) {
    const dto = plainToInstance(type, value);
    if (!isUUID(id) || (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll period action");
    return dto;
  }
  private async transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    try {
      return await this.db.transaction(async manager => {
        await manager.query("SET LOCAL lock_timeout='3s'");
        await manager.query("SET LOCAL statement_timeout='20s'");
        return work(manager);
      });
    } catch (error) {
      const detail = error as { driverError?: { code?: string }; code?: string };
      if (["23505", "55P03", "40001", "40P01", "P0001"].includes(detail.driverError?.code ?? detail.code ?? "")) throw new ConflictException("Payroll period changed; refresh before retrying");
      throw error;
    }
  }
  private async period(manager: EntityManager, scope: TenantParkScope, id: string) {
    const rows: PeriodRow[] = await manager.query("SELECT id,to_char(period_month,'YYYY-MM') AS month,status,version FROM hr_payroll_period WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted FOR UPDATE", [id, scope.tenantId, scope.parkId]);
    if (rows.length !== 1) throw new NotFoundException("Payroll period not found");
    return rows[0]!;
  }
  private projectWindow(row: WindowRow) {
    return { id: row.id, periodId: row.period_id, originalRunId: row.original_run_id, originalRunVersion: row.original_run_version,
      ruleSetId: row.rule_set_id, inputHeadAtOpen: row.input_head_at_open, status: row.status, version: row.version, completedRunId: row.completed_run_id };
  }
  private auditWrite(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, periodId: string, action: string, state: Record<string, unknown>) {
    return this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, realName: actor.realName ?? null, roleCodes: actor.roles,
      module: "人力资源管理", resource: "hr.payroll_period", action, bizType: "hr_payroll_period", bizId: periodId,
      beforeJson: null, afterJson: state, method: "POST", path: "/hr/payroll/periods/:id", success: true, result: "success", requestId: null }, manager);
  }
  async context(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_READ, false);
    if (!isUUID(id)) throw new BadRequestException("Invalid payroll period");
    return this.transaction(async manager => {
      const period = await this.period(manager, scope, id);
      const [counts]: Array<{ confirmed: number; pending: number }> = await manager.query("SELECT count(*) FILTER(WHERE status='confirmed')::int AS confirmed,count(*) FILTER(WHERE status NOT IN('confirmed','cancelled'))::int AS pending FROM hr_payroll_run WHERE period_id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted", [id, scope.tenantId, scope.parkId]);
      const windows: WindowRow[] = await manager.query("SELECT * FROM hr_payroll_correction_window WHERE period_id=$1 AND tenant_id=$2 AND park_id=$3 AND status='open'", [id, scope.tenantId, scope.parkId]);
      const window = windows[0];
      const labels: Array<{ rule_name: string; run_no: number }> = window ? await manager.query(`SELECT s.display_name AS rule_name,r.run_no FROM hr_payroll_rule_set s JOIN hr_payroll_run r ON r.tenant_id=s.tenant_id AND r.park_id=s.park_id
        WHERE s.id=$1 AND r.id=$2 AND s.tenant_id=$3 AND s.park_id=$4`, [window.rule_set_id, window.original_run_id, scope.tenantId, scope.parkId]) : [];
      const results: Array<{ id: string; run_no: number; status: string; version: number }> = window ? await manager.query(`SELECT r.id,r.run_no,r.status,r.version FROM hr_payroll_run r JOIN hr_payroll_formal_input i
        ON (i.id,i.tenant_id,i.park_id)=(r.formal_input_id,r.tenant_id,r.park_id) WHERE i.correction_window_id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND NOT r.is_deleted AND r.status<>'cancelled' ORDER BY r.run_no DESC LIMIT 1`, [window.id, scope.tenantId, scope.parkId]) : [];
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.payroll_period", action: "读取工资关账状态", bizType: "hr_payroll_period", bizId: id,
        path: "/hr/payroll/periods/:id/lifecycle", fieldGroups: ["financial"], projection: "metadata", itemCount: 1 }), manager);
      return { ...period, confirmedRunCount: counts!.confirmed, pendingRunCount: counts!.pending,
        correctionWindow: window ? { ...this.projectWindow(window), ruleName: labels[0]!.rule_name, originalRunNo: labels[0]!.run_no,
          activeResult: results[0] ? { id: results[0].id, runNo: results[0].run_no, status: results[0].status, version: results[0].version } : null } : null };
    });
  }
  async correctionOptions(scope: TenantParkScope, actor: JwtPrincipal, id: string, value: HrPayrollFormalInputDetailQueryDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
    const dto = await this.input(HrPayrollFormalInputDetailQueryDto, value, id);
    return this.transaction(async manager => {
      const period = await this.period(manager, scope, id);
      if (period.status !== "closed") throw new ConflictException("Correction choices require a closed payroll period");
      const rows: Array<{ id: string; run_no: number; version: number; employee_count: number; rule_name: string; total: number }> = await manager.query(`WITH eligible AS (
        SELECT r.id,r.run_no,r.version,r.employee_count,s.display_name AS rule_name FROM hr_payroll_run r
        JOIN hr_payroll_formal_run_evidence e ON (e.run_id,e.tenant_id,e.park_id)=(r.id,r.tenant_id,r.park_id)
        JOIN hr_payroll_rule_version v ON (v.id,v.tenant_id,v.park_id)=(e.rule_version_id,e.tenant_id,e.park_id)
        JOIN hr_payroll_rule_set s ON (s.id,s.tenant_id,s.park_id)=(v.rule_set_id,v.tenant_id,v.park_id)
        WHERE r.period_id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND r.status='confirmed' AND NOT r.is_deleted
        AND NOT EXISTS(SELECT 1 FROM hr_payroll_run successor WHERE (successor.correction_of_run_id,successor.tenant_id,successor.park_id)=(r.id,r.tenant_id,r.park_id) AND NOT successor.is_deleted AND successor.status<>'cancelled'))
        SELECT page.*,totals.total FROM (SELECT count(*)::int AS total FROM eligible) totals LEFT JOIN LATERAL
        (SELECT * FROM eligible ORDER BY run_no DESC,id LIMIT $4 OFFSET $5) page ON true`, [id, scope.tenantId, scope.parkId, dto.pageSize, (dto.page - 1) * dto.pageSize]);
      const items = rows.filter(row => row.id).map(row => ({ id: row.id, runNo: row.run_no, version: row.version, employeeCount: row.employee_count, ruleName: row.rule_name }));
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.payroll_period", action: "读取可更正工资批次", bizType: "hr_payroll_period", bizId: id,
        path: "/hr/payroll/periods/:id/correction-options", fieldGroups: ["financial"], projection: "metadata", itemCount: items.length }), manager);
      return { items, total: rows[0]!.total, page: dto.page, page_size: dto.pageSize };
    });
  }
  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, value: CloseHrPayrollPeriodDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_CONFIRM);
    const dto = await this.input(CloseHrPayrollPeriodDto, value, id);
    return this.transaction(async manager => {
      const period = await this.period(manager, scope, id);
      if (period.status !== "open" || period.version !== dto.expectedVersion) throw new ConflictException("Only the current open payroll period can be closed");
      // Database guard repeats the terminal-run test while this same period lock is held.
      await manager.query("INSERT INTO hr_payroll_period_close(tenant_id,park_id,period_id,period_version,reason,created_by) VALUES($1,$2,$3,$4,$5,$6)", [scope.tenantId, scope.parkId, id, dto.expectedVersion, dto.reason, actor.sub]);
      await manager.query("UPDATE hr_payroll_period SET status='closed',version=version+1,update_by=$4,update_time=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId, actor.sub]);
      await this.auditWrite(manager, scope, actor, id, "工资期间关账", { status: "closed", version: period.version + 1 });
      return { ...period, status: "closed", version: period.version + 1 };
    });
  }
  async openCorrection(scope: TenantParkScope, actor: JwtPrincipal, id: string, value: OpenHrPayrollCorrectionWindowDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
    const dto = await this.input(OpenHrPayrollCorrectionWindowDto, value, id);
    return this.transaction(async manager => {
      const period = await this.period(manager, scope, id);
      if (period.status !== "closed" || period.version !== dto.expectedVersion) throw new ConflictException("Correction requires the current closed payroll period");
      const originals: Array<{ rule_set_id: string }> = await manager.query(`SELECT v.rule_set_id FROM hr_payroll_run r
        JOIN hr_payroll_formal_run_evidence e ON (e.run_id,e.tenant_id,e.park_id)=(r.id,r.tenant_id,r.park_id)
        JOIN hr_payroll_rule_version v ON (v.id,v.tenant_id,v.park_id)=(e.rule_version_id,e.tenant_id,e.park_id)
        WHERE r.id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND r.period_id=$4 AND r.version=$5 AND r.status='confirmed' AND NOT r.is_deleted FOR SHARE OF r`,
      [dto.originalRunId, scope.tenantId, scope.parkId, id, dto.expectedRunVersion]);
      if (originals.length !== 1) throw new ConflictException("Select the current confirmed formal payroll run");
      const [{ head }] = await manager.query("SELECT coalesce(max(revision_no),0)::int AS head FROM hr_payroll_formal_input WHERE period_id=$1 AND rule_set_id=$2 AND tenant_id=$3 AND park_id=$4", [id, originals[0]!.rule_set_id, scope.tenantId, scope.parkId]);
      const [row] = typeormQueryRows<WindowRow>(await manager.query(`INSERT INTO hr_payroll_correction_window(tenant_id,park_id,period_id,original_run_id,original_run_version,rule_set_id,input_head_at_open,reason,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [scope.tenantId, scope.parkId, id, dto.originalRunId, dto.expectedRunVersion, originals[0]!.rule_set_id, head, dto.reason, actor.sub]));
      await this.auditWrite(manager, scope, actor, id, "发起关账后工资更正", { correctionWindowId: row!.id, originalRunId: dto.originalRunId, status: "open" });
      return this.projectWindow(row!);
    });
  }
  private async finish(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CloseHrPayrollPeriodDto, completedRunId: string | null) {
    return this.transaction(async manager => {
      // Resolve scope before taking locks, then consistently lock period before window.
      const identities: Array<{ period_id: string }> = await manager.query("SELECT period_id FROM hr_payroll_correction_window WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId]);
      if (identities.length !== 1) throw new NotFoundException("Payroll correction window not found");
      const period = await this.period(manager, scope, identities[0]!.period_id);
      if (period.status !== "closed") throw new ConflictException("Correction period must remain closed");
      const rows: WindowRow[] = await manager.query("SELECT * FROM hr_payroll_correction_window WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE", [id, scope.tenantId, scope.parkId]);
      if (rows[0]!.status !== "open" || rows[0]!.version !== dto.expectedVersion) throw new ConflictException("Correction window changed or already closed");
      const status = completedRunId ? "completed" : "cancelled";
      const [row] = typeormQueryRows<WindowRow>(await manager.query("UPDATE hr_payroll_correction_window SET status=$4,version=version+1,closed_by=$5,closed_at=now(),close_reason=$6,completed_run_id=$7 WHERE id=$1 AND tenant_id=$2 AND park_id=$3 RETURNING *", [id, scope.tenantId, scope.parkId, status, actor.sub, dto.reason, completedRunId]));
      await this.auditWrite(manager, scope, actor, period.id, completedRunId ? "完成工资更正窗口" : "取消工资更正窗口", { correctionWindowId: id, status, version: row!.version });
      return this.projectWindow(row!);
    });
  }
  async cancelCorrection(scope: TenantParkScope, actor: JwtPrincipal, id: string, value: CloseHrPayrollPeriodDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_CONFIRM);
    return this.finish(scope, actor, id, await this.input(CloseHrPayrollPeriodDto, value, id), null);
  }
  async completeCorrection(scope: TenantParkScope, actor: JwtPrincipal, id: string, value: CompleteHrPayrollCorrectionWindowDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_CONFIRM);
    const dto = await this.input(CompleteHrPayrollCorrectionWindowDto, value, id);
    return this.finish(scope, actor, id, dto, dto.completedRunId);
  }
}
