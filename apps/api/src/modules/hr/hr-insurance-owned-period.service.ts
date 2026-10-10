import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_INSURANCE_OWNED_PERMISSIONS, HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance, type ClassConstructor } from "class-transformer";
import { isUUID, validate } from "class-validator";
import { createHash } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { CloseHrInsuranceOwnedPeriodDto, ConfirmHrInsuranceOwnedPeriodDto, CorrectHrInsuranceOwnedPeriodDto, CreateHrInsuranceOwnedPreviewDto, HrInsuranceOwnedPeriodListQueryDto } from "./dto/hr-insurance-owned-period.dto";
import { HrInsurancePolicyQueryDto } from "./dto/hr-insurance-preview.dto";
import { calculateInsurancePreview, HR_INSURANCE_KINDS, type InsuranceCalculationItem } from "./hr-insurance-calculation";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

type CommandTable = "hr_insurance_owned_preview" | "hr_insurance_owned_revision" | "hr_insurance_owned_close";
type PreviewRow = { id: string; employee_id: string; employee_version: number; policy_version_id: string;
  period_month: string; include_fund: boolean; created_by: string; request_sha256: string;
  expires_at: Date; snapshot_sha256: string; result: ReturnType<typeof calculateInsurancePreview> };
type RevisionRow = { id: string; employee_id: string; period_month: string; revision_no: number;
  preview_id: string; previous_revision_id: string | null; snapshot_sha256: string;
  result: ReturnType<typeof calculateInsurancePreview>; closed?: boolean };
const previewColumns = "id,employee_id,employee_version,policy_version_id,to_char(period_month,'YYYY-MM') AS period_month,include_fund,created_by,request_sha256,expires_at,snapshot_sha256,result";
const revisionColumns = "r.id,r.employee_id,to_char(r.period_month,'YYYY-MM') AS period_month,r.revision_no,r.preview_id,r.previous_revision_id,p.snapshot_sha256,p.result";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class HrInsuranceOwnedPeriodService {
  constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

  private authority(actor: JwtPrincipal, capability?: string) {
    const required: string[] = [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ];
    if (capability) required.push(capability);
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(p => actor.permissions.includes(p))) throw new ForbiddenException("HR_INSURANCE_OWNED_FORBIDDEN");
  }

  private async input<T extends object>(type: ClassConstructor<T>, value: T): Promise<T> {
    const dto = plainToInstance(type, value);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("HR_INSURANCE_OWNED_INPUT_INVALID");
    return dto;
  }

  private previewProjection(row: PreviewRow) {
    return { id: row.id, employeeId: row.employee_id, employeeVersion: row.employee_version,
      policyVersionId: row.policy_version_id, periodMonth: row.period_month, includeFund: row.include_fund,
      previewHash: row.snapshot_sha256, expiresAt: row.expires_at.toISOString(), calculation: row.result,
      mode: "owned_preview" as const, confirmationRequiresRevalidation: true as const };
  }

  private revisionProjection(row: RevisionRow) {
    return { id: row.id, employeeId: row.employee_id, periodMonth: row.period_month, revisionNo: row.revision_no,
      previewId: row.preview_id, previousRevisionId: row.previous_revision_id, previewHash: row.snapshot_sha256,
      calculation: row.result, sourceKind: "modern_confirmed" as const };
  }

  private async command<T>(scope: TenantParkScope, actor: JwtPrincipal, table: CommandTable,
    requestId: string, request: object, operation: (manager: EntityManager, requestHash: string, existingId?: string) => Promise<T>) {
    const requestHash = digest({ ...request, tenantId: scope.tenantId, parkId: scope.parkId, actorId: actor.sub });
    try {
      return await this.db.transaction("READ COMMITTED", async manager => {
        await manager.query("SET LOCAL lock_timeout='2s'");
        await manager.query("SET LOCAL statement_timeout='15s'");
        await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["insurance-owned-request", table, scope.tenantId, scope.parkId, requestId])]);
        // Table name is an internal closed union, never an HTTP input.
        const rows: Array<{ id: string; created_by: string; request_sha256: string }> = await manager.query(
          `SELECT id,created_by,request_sha256 FROM ${table} WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3`, [scope.tenantId, scope.parkId, requestId]);
        if (rows.length && (rows[0]!.created_by !== actor.sub || rows[0]!.request_sha256 !== requestHash)) throw new ConflictException("HR_INSURANCE_OWNED_REQUEST_CONFLICT");
        return operation(manager, requestHash, rows[0]?.id);
      });
    } catch (error) {
      const detail = (error as { driverError?: { code?: string; message?: string }; code?: string; message?: string });
      const code = detail.driverError?.code ?? detail.code;
      const message = detail.driverError?.message ?? detail.message ?? "";
      if (["23505", "55P03", "40001", "40P01"].includes(code ?? "")) throw new ConflictException("HR_INSURANCE_OWNED_CONCURRENT_CONFLICT");
      if (code === "P0001" && /^HR_INSURANCE_OWNED_[A-Z_]+$/u.test(message)) throw new ConflictException(message);
      throw error;
    }
  }

  async preview(scope: TenantParkScope, actor: JwtPrincipal, value: CreateHrInsuranceOwnedPreviewDto) {
    this.authority(actor, HR_INSURANCE_OWNED_PERMISSIONS.PREVIEW_CREATE);
    const dto = await this.input(CreateHrInsuranceOwnedPreviewDto, value);
    const bases = HR_INSURANCE_KINDS.map(insuranceKind => {
      const raw = dto.bases.find(item => item.insuranceKind === insuranceKind)!.contributionBase;
      const [whole, fraction = ""] = raw.split(".");
      return { insuranceKind, contributionBase: `${BigInt(whole!)}.${fraction.padEnd(2, "0")}` };
    });
    const request = { ...dto, bases };
    return this.command(scope, actor, "hr_insurance_owned_preview", dto.requestId, request, async (manager, requestHash, existingId) => {
      if (existingId) {
        const rows: PreviewRow[] = await manager.query(`SELECT ${previewColumns} FROM hr_insurance_owned_preview WHERE id=$1 AND tenant_id=$2 AND park_id=$3`, [existingId, scope.tenantId, scope.parkId]);
        await this.auditWrite(manager, scope, actor, "preview", existingId, rows[0]!.snapshot_sha256, true);
        return { ...this.previewProjection(rows[0]!), replayed: true };
      }
      const people: Array<{ id: string; version: number; employment_status: string }> = await manager.query(
        "SELECT id,version,employment_status FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted FOR SHARE", [dto.employeeId, scope.tenantId, scope.parkId]);
      if (!people.length) throw new NotFoundException("HR_INSURANCE_OWNED_SOURCE_NOT_FOUND");
      if (people[0]!.version !== dto.expectedEmployeeVersion || !["active", "probation"].includes(people[0]!.employment_status)) throw new ConflictException("HR_INSURANCE_OWNED_EMPLOYEE_CHANGED_OR_INELIGIBLE");
      const policies: Array<{ version_no: number; definition_sha256: string; effective_from: string; effective_through: string; definition: { items: Array<Omit<InsuranceCalculationItem, "contributionBase">> } }> = await manager.query(
        "SELECT version_no,definition_sha256,to_char(effective_from,'YYYY-MM') AS effective_from,to_char(effective_through,'YYYY-MM') AS effective_through,definition FROM hr_insurance_policy_version WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR SHARE", [dto.policyVersionId, scope.tenantId, scope.parkId]);
      if (!policies.length) throw new NotFoundException("HR_INSURANCE_OWNED_SOURCE_NOT_FOUND");
      const policy = policies[0]!;
      if (policy.definition_sha256 !== dto.expectedDefinitionHash || dto.periodMonth < policy.effective_from || dto.periodMonth > policy.effective_through) throw new ConflictException("HR_INSURANCE_OWNED_POLICY_OR_PERIOD_INVALID");
      const result = calculateInsurancePreview({ policyVersion: policy.version_no, includeFund: dto.includeFund,
        items: bases.map(base => ({ ...base, factors: policy.definition.items.find(item => item.insuranceKind === base.insuranceKind)!.factors })) });
      const snapshot = { formatVersion: 1, employeeId: dto.employeeId, employeeVersion: dto.expectedEmployeeVersion,
        policyVersionId: dto.policyVersionId, definitionHash: dto.expectedDefinitionHash, periodMonth: dto.periodMonth, includeFund: dto.includeFund, bases };
      const rows = typeormQueryRows<PreviewRow>(await manager.query(`INSERT INTO hr_insurance_owned_preview(tenant_id,park_id,request_id,request_sha256,employee_id,employee_version,policy_version_id,policy_definition_sha256,period_month,include_fund,created_by,input_snapshot,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12::jsonb,$13::jsonb) RETURNING ${previewColumns}`,
        [scope.tenantId, scope.parkId, dto.requestId, requestHash, dto.employeeId, dto.expectedEmployeeVersion, dto.policyVersionId, dto.expectedDefinitionHash, `${dto.periodMonth}-01`, dto.includeFund, actor.sub, JSON.stringify(snapshot), JSON.stringify(result)]));
      await this.auditWrite(manager, scope, actor, "preview", rows[0]!.id, rows[0]!.snapshot_sha256, false);
      return { ...this.previewProjection(rows[0]!), replayed: false };
    });
  }

  async confirm(scope: TenantParkScope, actor: JwtPrincipal, dto: ConfirmHrInsuranceOwnedPeriodDto) {
    this.authority(actor, HR_INSURANCE_OWNED_PERMISSIONS.CONFIRM);
    return this.saveRevision(scope, actor, await this.input(ConfirmHrInsuranceOwnedPeriodDto, dto));
  }

  async correct(scope: TenantParkScope, actor: JwtPrincipal, dto: CorrectHrInsuranceOwnedPeriodDto) {
    this.authority(actor, HR_INSURANCE_OWNED_PERMISSIONS.CORRECT);
    return this.saveRevision(scope, actor, await this.input(CorrectHrInsuranceOwnedPeriodDto, dto));
  }

  private async revision(manager: EntityManager, scope: TenantParkScope, id: string): Promise<RevisionRow> {
    const rows: RevisionRow[] = await manager.query(`SELECT ${revisionColumns} FROM hr_insurance_owned_revision r JOIN hr_insurance_owned_preview p ON p.id=r.preview_id AND p.tenant_id=r.tenant_id AND p.park_id=r.park_id WHERE r.id=$1 AND r.tenant_id=$2 AND r.park_id=$3`, [id, scope.tenantId, scope.parkId]);
    if (!rows.length) throw new NotFoundException("HR_INSURANCE_OWNED_SOURCE_NOT_FOUND");
    return rows[0]!;
  }

  private saveRevision(scope: TenantParkScope, actor: JwtPrincipal, dto: ConfirmHrInsuranceOwnedPeriodDto | CorrectHrInsuranceOwnedPeriodDto) {
    const correction = dto instanceof CorrectHrInsuranceOwnedPeriodDto;
    const request = { ...dto, reason: dto.reason.trim(), action: correction ? "correct" : "confirm" };
    return this.command(scope, actor, "hr_insurance_owned_revision", dto.requestId, request, async (manager, requestHash, existingId) => {
      if (existingId) {
        const row = await this.revision(manager, scope, existingId);
        await this.auditWrite(manager, scope, actor, request.action, row.id, row.snapshot_sha256, true);
        return { ...this.revisionProjection(row), replayed: true };
      }
      const previews: PreviewRow[] = await manager.query(`SELECT ${previewColumns} FROM hr_insurance_owned_preview WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND created_by=$4 FOR SHARE`, [dto.previewId, scope.tenantId, scope.parkId, actor.sub]);
      if (!previews.length) throw new NotFoundException("HR_INSURANCE_OWNED_SOURCE_NOT_FOUND");
      const preview = previews[0]!;
      if (preview.snapshot_sha256 !== dto.expectedPreviewHash) throw new ConflictException("HR_INSURANCE_OWNED_PREVIEW_CHANGED");
      let previousId: string | null = null, revisionNo = 1;
      if (correction) {
        const change = dto as CorrectHrInsuranceOwnedPeriodDto;
        const previous = await this.revision(manager, scope, change.previousRevisionId);
        if (previous.employee_id !== preview.employee_id || previous.period_month !== preview.period_month || previous.revision_no !== change.expectedPeriodVersion) throw new ConflictException("HR_INSURANCE_OWNED_PERIOD_CHANGED");
        previousId = previous.id; revisionNo = previous.revision_no + 1;
      }
      // SQL serializes the family and rechecks expiry, actor, employee, source and closed predecessor.
      const inserted = typeormQueryRows<{ id: string }>(await manager.query("INSERT INTO hr_insurance_owned_revision(tenant_id,park_id,employee_id,period_month,revision_no,preview_id,previous_revision_id,request_id,request_sha256,created_by,reason) VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11) RETURNING id", [scope.tenantId, scope.parkId, preview.employee_id, `${preview.period_month}-01`, revisionNo, preview.id, previousId, dto.requestId, requestHash, actor.sub, request.reason]));
      const row = await this.revision(manager, scope, inserted[0]!.id);
      await this.auditWrite(manager, scope, actor, request.action, row.id, row.snapshot_sha256, false);
      return { ...this.revisionProjection(row), replayed: false };
    });
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, value: CloseHrInsuranceOwnedPeriodDto) {
    this.authority(actor, HR_INSURANCE_OWNED_PERMISSIONS.CLOSE);
    const dto = await this.input(CloseHrInsuranceOwnedPeriodDto, value);
    return this.command(scope, actor, "hr_insurance_owned_close", dto.requestId, { ...dto, reason: dto.reason.trim() }, async (manager, requestHash, existingId) => {
      if (existingId) {
        const rows: Array<{ revision_id: string }> = await manager.query("SELECT revision_id FROM hr_insurance_owned_close WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [existingId, scope.tenantId, scope.parkId]);
        const row = await this.revision(manager, scope, rows[0]!.revision_id);
        await this.auditWrite(manager, scope, actor, "close", existingId, row.snapshot_sha256, true);
        return { id: existingId, revisionId: row.id, revisionNo: row.revision_no, status: "closed" as const, replayed: true };
      }
      const row = await this.revision(manager, scope, dto.revisionId);
      if (row.revision_no !== dto.expectedPeriodVersion) throw new ConflictException("HR_INSURANCE_OWNED_PERIOD_CHANGED");
      const inserted = typeormQueryRows<{ id: string }>(await manager.query("INSERT INTO hr_insurance_owned_close(tenant_id,park_id,revision_id,request_id,request_sha256,created_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [scope.tenantId, scope.parkId, row.id, dto.requestId, requestHash, actor.sub, dto.reason.trim()]));
      await this.auditWrite(manager, scope, actor, "close", inserted[0]!.id, row.snapshot_sha256, false);
      return { id: inserted[0]!.id, revisionId: row.id, revisionNo: row.revision_no, status: "closed" as const, replayed: false };
    });
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    this.authority(actor);
    if (!isUUID(id)) throw new BadRequestException("HR_INSURANCE_OWNED_ID_INVALID");
    return this.db.transaction("REPEATABLE READ", async manager => {
      const row = await this.revision(manager, scope, id);
      const state: Array<{ closed: boolean; current: boolean }> = await manager.query("SELECT EXISTS(SELECT 1 FROM hr_insurance_owned_close WHERE tenant_id=$1 AND park_id=$2 AND revision_id=$3) AS closed,NOT EXISTS(SELECT 1 FROM hr_insurance_owned_revision WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$4 AND period_month=$5::date AND revision_no>$6) AS current", [scope.tenantId, scope.parkId, row.id, row.employee_id, `${row.period_month}-01`, row.revision_no]);
      await this.auditRead(manager, scope, actor, 1, id);
      return { ...this.revisionProjection(row), status: state[0]!.closed ? "closed" : "confirmed", current: state[0]!.current };
    });
  }

  async list(scope: TenantParkScope, actor: JwtPrincipal, value: HrInsuranceOwnedPeriodListQueryDto) {
    this.authority(actor);
    const query = await this.input(HrInsuranceOwnedPeriodListQueryDto, value);
    return this.db.transaction("REPEATABLE READ", async manager => {
      const params: unknown[] = [scope.tenantId, scope.parkId, `%${query.keyword?.trim() ?? ""}%`];
      const predicates = ["r.tenant_id=$1", "r.park_id=$2", "NOT e.is_deleted", "(e.employee_code ILIKE $3 OR e.full_name ILIKE $3)"];
      const current = "NOT EXISTS(SELECT 1 FROM hr_insurance_owned_revision next WHERE next.tenant_id=r.tenant_id AND next.park_id=r.park_id AND next.employee_id=r.employee_id AND next.period_month=r.period_month AND next.revision_no>r.revision_no)";
      const closed = "EXISTS(SELECT 1 FROM hr_insurance_owned_close c WHERE c.tenant_id=r.tenant_id AND c.park_id=r.park_id AND c.revision_id=r.id)";
      if (query.period_month) { params.push(`${query.period_month}-01`); predicates.push(`r.period_month=$${params.length}::date`); }
      if (query.status) predicates.push(query.status === "closed" ? closed : `NOT ${closed}`);
      // Current/history always probes every later revision, independent of the status filter above.
      if (query.revision) predicates.push(query.revision === "current" ? current : `NOT ${current}`);
      const filter = predicates.join(" AND ");
      const from = "hr_insurance_owned_revision r JOIN hr_insurance_owned_preview p ON p.id=r.preview_id AND p.tenant_id=r.tenant_id AND p.park_id=r.park_id JOIN hr_employee e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id AND e.park_id=r.park_id";
      const total = (await manager.query(`SELECT count(*)::int AS n FROM ${from} WHERE ${filter}`, params))[0].n as number;
      const limitIndex = params.length + 1, offsetIndex = params.length + 2;
      const rows: Array<RevisionRow & { employee_code: string; full_name: string; closed: boolean; current: boolean }> = await manager.query(`SELECT ${revisionColumns},e.employee_code,e.full_name,${closed} AS closed,${current} AS current FROM ${from} WHERE ${filter} ORDER BY r.period_month DESC,e.employee_code,r.revision_no DESC,r.id LIMIT $${limitIndex} OFFSET $${offsetIndex}`, [...params, query.page_size, (query.page - 1) * query.page_size]);
      await this.auditRead(manager, scope, actor, rows.length);
      return { items: rows.map(row => ({ ...this.revisionProjection(row), employeeCode: row.employee_code, fullName: row.full_name, status: row.closed ? "closed" : "confirmed", current: row.current })), total, page: query.page, page_size: query.page_size };
    });
  }

  async employeeOptions(scope: TenantParkScope, actor: JwtPrincipal, value: HrInsurancePolicyQueryDto) {
    this.authority(actor, HR_INSURANCE_OWNED_PERMISSIONS.PREVIEW_CREATE);
    const query = await this.input(HrInsurancePolicyQueryDto, value);
    return this.db.transaction("REPEATABLE READ", async manager => {
      const params = [scope.tenantId, scope.parkId, `%${query.keyword?.trim() ?? ""}%`];
      const filter = "tenant_id=$1 AND park_id=$2 AND NOT is_deleted AND (employee_code ILIKE $3 OR full_name ILIKE $3)";
      const total = (await manager.query(`SELECT count(*)::int n FROM hr_employee WHERE ${filter}`, params))[0].n as number;
      const items: Array<{ id: string; employeeCode: string; fullName: string; version: number; employmentStatus: string; previewEligible: boolean }> = await manager.query(`SELECT id,employee_code AS "employeeCode",full_name AS "fullName",version,employment_status AS "employmentStatus",employment_status IN ('active','probation') AS "previewEligible" FROM hr_employee WHERE ${filter} ORDER BY employee_code,id LIMIT $4 OFFSET $5`, [...params, query.page_size, (query.page - 1) * query.page_size]);
      await this.audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, username: actor.username,
        realName: actor.realName ?? null, roleCodes: actor.roles, module: "人力资源管理", resource: "hr.insurance_owned_period", action: "读取社保期间选人",
        bizType: "hr_employee", bizId: null, beforeJson: null, afterJson: { fieldGroups: ["identity", "employment"], itemCount: items.length },
        method: "GET", path: "/hr/insurance/owned-periods/employees", success: true, result: "success", requestId: null }, manager);
      return { items, total, page: query.page, page_size: query.page_size };
    });
  }

  private auditRead(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, itemCount: number, id?: string) {
    // Use the required writer directly so the sensitive read commits with its transaction.
    return this.audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, username: actor.username, realName: actor.realName ?? null, roleCodes: actor.roles,
      module: "人力资源管理", resource: "hr.insurance_owned_period", action: "读取现代社保期间", bizType: "hr_insurance_owned_revision", bizId: id ?? null,
      beforeJson: null, afterJson: { fieldGroups: ["insurance", "financial"], projection: "full", itemCount }, method: "GET", path: id ? `/hr/insurance/owned-periods/${id}` : "/hr/insurance/owned-periods", success: true, result: "success", requestId: null }, manager);
  }

  private auditWrite(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, action: string, id: string, hash: string, replayed: boolean) {
    return this.audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, username: actor.username,
      realName: actor.realName ?? null, roleCodes: actor.roles, module: "人力资源管理", resource: "hr.insurance_owned_period", action,
      bizType: "hr_insurance_owned_period", bizId: id, beforeJson: null, afterJson: { snapshotHash: hash, replayed, fieldGroups: ["insurance", "financial"] },
      method: "POST", path: `/hr/insurance/owned-periods/${action}`, success: true, result: "success", requestId: null }, manager);
  }
}
