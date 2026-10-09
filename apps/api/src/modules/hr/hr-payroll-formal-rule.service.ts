import { isDeepStrictEqual } from "node:util";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type FormalPayrollBookOption, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance, type ClassConstructor } from "class-transformer";
import { validate } from "class-validator";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { AuditService } from "../audit/audit.service";
import {
  CreateHrPayrollRuleSetDto, CreateHrPayrollRuleVersionDto, HrPayrollEffectiveRuleQueryDto,
  HrPayrollFormalRuleQueryDto, HrPayrollBookOptionsQueryDto, ReviewHrPayrollRuleVersionDto, SubmitHrPayrollRuleVersionDto,
  UpdateHrPayrollRuleVersionDto,
} from "./dto/hr-payroll-formal-rule.dto";
import { buildFormalPayrollDefinitionEvidence, type FormalPayrollDefinition } from "./hr-payroll-formal-calculation";
import { buildHrSensitiveReadAuditInput, recordHrSensitiveRead } from "./hr-sensitive-read-audit";

type SetRow = { id: string; rule_code: string; display_name: string; source_book_id: string | null; head_revision: number; source_book?: FormalPayrollBookOption | null };
const bookProjection = "jsonb_build_object('id',b.id,'bookName',b.book_name,'bookCode',b.source_system||':'||b.legacy_scheme::text,'scheme',b.legacy_scheme)";
export type FormalRuleVersionRow = {
  id: string; rule_set_id: string; revision_no: number; version: number; status: string;
  definition: FormalPayrollDefinition; definition_evidence: ReturnType<typeof buildFormalPayrollDefinitionEvidence>; definition_sha256: string; reason: string;
  created_by: string; authored_by: string; submitted_by: string | null; review_reason: string | null; effective_from: string | null;
};
const versionColumns = "id,rule_set_id,revision_no,version,status,definition,definition_evidence,definition_sha256,reason,created_by,authored_by,submitted_by,review_reason,to_char(effective_from,'YYYY-MM') AS effective_from";

@Injectable()
export class HrPayrollFormalRuleService {
  constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

  private authority(actor: JwtPrincipal, permission = HR_PERMISSIONS.HR_PAYROLL_RULE_READ as string) {
    if (!actor.isSuper && !actor.permissions.includes("*") && !actor.permissions.includes(permission)) throw new ForbiddenException("Payroll rule permission required");
  }
  private async validated<T extends object>(type: ClassConstructor<T>, value: T): Promise<T> {
    const dto = plainToInstance(type, value);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll rule input");
    return dto;
  }
  private project(row: FormalRuleVersionRow) {
    return { id: row.id, ruleSetId: row.rule_set_id, revisionNo: row.revision_no, version: row.version,
      status: row.status, definition: row.definition, reason: row.reason,
      effectiveFrom: row.effective_from, reviewReason: row.review_reason };
  }
  private async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async manager => {
        await manager.query("SET LOCAL lock_timeout='3s'");
        await manager.query("SET LOCAL statement_timeout='15s'");
        return work(manager);
      });
    } catch (error) {
      const code = (error as { driverError?: { code?: string }; code?: string })?.driverError?.code ?? (error as { code?: string })?.code;
      if (["23505", "55P03", "40001", "40P01", "P0001"].includes(code ?? "")) throw new ConflictException("Payroll rule changed or conflicts with another version");
      throw error;
    }
  }
  private auditWrite(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, id: string, action: string, metadata: Record<string, unknown>) {
    return this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, realName: actor.realName ?? null,
      roleCodes: actor.roles, module: "人力资源管理", resource: "hr.payroll_rule", action, bizType: "hr_payroll_rule", bizId: id,
      beforeJson: null, afterJson: metadata, method: "POST", path: "/hr/payroll/rules", success: true, result: "success", requestId: null }, manager);
  }
  private auditRead(scope: TenantParkScope, actor: JwtPrincipal, itemCount: number) {
    return recordHrSensitiveRead(this.audit, scope, actor, { resource: "hr.payroll_rule", action: "读取工资业务规则",
      bizType: "hr_payroll_rule", path: "/hr/payroll/rules", fieldGroups: ["legacy_definition_metadata"], projection: "full", itemCount });
  }

  private assertEvidence(row: FormalRuleVersionRow) {
    if (!isDeepStrictEqual(row.definition_evidence, buildFormalPayrollDefinitionEvidence(row.definition))) {
      throw new ConflictException("Payroll parser or accounting evidence changed; create and review a new rule revision");
    }
  }

  async createSet(scope: TenantParkScope, actor: JwtPrincipal, input: CreateHrPayrollRuleSetDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
    const dto = await this.validated(CreateHrPayrollRuleSetDto, input);
    return this.transaction(async manager => {
      let sourceBook: FormalPayrollBookOption | null = null;
      if (dto.sourceBookId) {
        const source = await manager.query(`SELECT ${bookProjection} AS book FROM hr_payroll_book b WHERE b.id=$1 AND b.tenant_id=$2 AND b.park_id=$3 AND b.is_deleted=false FOR SHARE`, [dto.sourceBookId, scope.tenantId, scope.parkId]);
        if (source.length !== 1) throw new NotFoundException("Payroll book not found");
        sourceBook = source[0].book;
      }
      const row = typeormQueryRows<SetRow>(await manager.query("INSERT INTO hr_payroll_rule_set(tenant_id,park_id,rule_code,display_name,source_book_id,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,rule_code,display_name,source_book_id,head_revision", [scope.tenantId, scope.parkId, dto.ruleCode, dto.displayName, dto.sourceBookId ?? null, actor.sub]))[0]!;
      await this.auditWrite(manager, scope, actor, row.id, "创建工资规则集", { headRevision: 0 });
      return { id: row.id, ruleCode: row.rule_code, displayName: row.display_name, sourceBookId: row.source_book_id, sourceBook, headRevision: row.head_revision };
    });
  }

  async listSets(scope: TenantParkScope, actor: JwtPrincipal, query: HrPayrollFormalRuleQueryDto) {
    this.authority(actor);
    const dto = await this.validated(HrPayrollFormalRuleQueryDto, query);
    const rows: SetRow[] = await this.db.query(`SELECT r.id,r.rule_code,r.display_name,r.source_book_id,r.head_revision,CASE WHEN b.id IS NULL THEN NULL ELSE ${bookProjection} END AS source_book FROM hr_payroll_rule_set r LEFT JOIN hr_payroll_book b ON b.id=r.source_book_id AND b.tenant_id=r.tenant_id AND b.park_id=r.park_id WHERE r.tenant_id=$1 AND r.park_id=$2 ORDER BY r.display_name,r.id LIMIT $3 OFFSET $4`, [scope.tenantId, scope.parkId, dto.pageSize, (dto.page - 1) * dto.pageSize]);
    const [{ total }] = await this.db.query("SELECT count(*)::int AS total FROM hr_payroll_rule_set WHERE tenant_id=$1 AND park_id=$2", [scope.tenantId, scope.parkId]);
    await this.auditRead(scope, actor, rows.length);
    return { items: rows.map(row => ({ id: row.id, ruleCode: row.rule_code, displayName: row.display_name, sourceBookId: row.source_book_id, sourceBook: row.source_book ?? null, headRevision: row.head_revision })), total, page: dto.page, page_size: dto.pageSize };
  }

  async bookOptions(scope: TenantParkScope, actor: JwtPrincipal, query: HrPayrollBookOptionsQueryDto) {
    this.authority(actor);
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
    const dto = await this.validated(HrPayrollBookOptionsQueryDto, query);
    return this.transaction(async manager => {
      // One statement keeps the candidate page and total in the same read snapshot.
      const [result]: Array<{ items: FormalPayrollBookOption[]; total: number }> = await manager.query(`WITH candidates AS (
        SELECT b.* FROM hr_payroll_book b WHERE b.tenant_id=$1 AND b.park_id=$2 AND b.is_deleted=false
        AND NOT EXISTS (SELECT 1 FROM hr_payroll_rule_set r WHERE r.tenant_id=b.tenant_id AND r.park_id=b.park_id AND r.source_book_id=b.id)
        AND ($3='' OR strpos(lower(coalesce(b.book_name,'')),lower($3))>0 OR b.legacy_scheme::text=$3)
      ), page AS (SELECT b.*,${bookProjection} AS book FROM candidates b ORDER BY b.book_name NULLS LAST,b.source_system,b.legacy_scheme,b.id LIMIT $4 OFFSET $5)
      SELECT coalesce((SELECT jsonb_agg(book ORDER BY book_name NULLS LAST,source_system,legacy_scheme,id) FROM page),'[]'::jsonb) AS items,
        (SELECT count(*)::int FROM candidates) AS total`, [scope.tenantId, scope.parkId, dto.keyword ?? "", dto.pageSize, (dto.page - 1) * dto.pageSize]);
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, {
        resource: "hr.payroll_rule", action: "读取可关联工资账套", bizType: "hr_payroll_rule",
        path: "/hr/payroll/rules/book-options", fieldGroups: ["legacy_definition_metadata"], projection: "metadata", itemCount: result!.items.length,
      }), manager);
      return { ...result!, page: dto.page, page_size: dto.pageSize };
    });
  }

  async listVersions(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: HrPayrollFormalRuleQueryDto) {
    this.authority(actor);
    const dto = await this.validated(HrPayrollFormalRuleQueryDto, query);
    const parent = await this.db.query("SELECT id FROM hr_payroll_rule_set WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId]);
    if (parent.length !== 1) throw new NotFoundException("Payroll rules not found");
    const rows: FormalRuleVersionRow[] = await this.db.query(`SELECT ${versionColumns} FROM hr_payroll_rule_version WHERE rule_set_id=$1 AND tenant_id=$2 AND park_id=$3 ORDER BY revision_no DESC LIMIT $4 OFFSET $5`, [id, scope.tenantId, scope.parkId, dto.pageSize, (dto.page - 1) * dto.pageSize]);
    const [{ total }] = await this.db.query("SELECT count(*)::int AS total FROM hr_payroll_rule_version WHERE rule_set_id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId]);
    await this.auditRead(scope, actor, rows.length);
    return { items: rows.map(row => this.project(row)), total, page: dto.page, page_size: dto.pageSize };
  }

  async createVersion(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: CreateHrPayrollRuleVersionDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
    const dto = await this.validated(CreateHrPayrollRuleVersionDto, input);
    const evidence = buildFormalPayrollDefinitionEvidence(dto.definition);
    return this.transaction(async manager => {
      const rows: SetRow[] = await manager.query("SELECT id,head_revision FROM hr_payroll_rule_set WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE", [id, scope.tenantId, scope.parkId]);
      if (rows.length !== 1) throw new NotFoundException("Payroll rules not found");
      if (rows[0]!.head_revision !== dto.expectedHeadRevision) throw new ConflictException("Payroll draft list changed; refresh before creating a version");
      const row = typeormQueryRows<FormalRuleVersionRow>(await manager.query(`INSERT INTO hr_payroll_rule_version(tenant_id,park_id,rule_set_id,revision_no,definition,definition_evidence,definition_sha256,reason,created_by,authored_by) VALUES($1,$2,$3,$4,$5::jsonb,$8::jsonb,repeat('0',64),$6,$7,$7) RETURNING ${versionColumns}`, [scope.tenantId, scope.parkId, id, dto.expectedHeadRevision + 1, JSON.stringify(dto.definition), dto.reason, actor.sub, JSON.stringify(evidence)]))[0]!;
      await this.auditWrite(manager, scope, actor, row.id, "建立工资规则草稿", { revisionNo: row.revision_no });
      return this.project(row);
    });
  }

  private async lockedVersion(manager: EntityManager, scope: TenantParkScope, id: string, expectedVersion: number) {
    const parent = await manager.query("SELECT s.id FROM hr_payroll_rule_set s JOIN hr_payroll_rule_version v ON (v.rule_set_id,v.tenant_id,v.park_id)=(s.id,s.tenant_id,s.park_id) WHERE v.id=$1 AND s.tenant_id=$2 AND s.park_id=$3 FOR UPDATE OF s", [id, scope.tenantId, scope.parkId]);
    if (parent.length !== 1) throw new NotFoundException("Payroll rule version not found");
    const rows: FormalRuleVersionRow[] = await manager.query(`SELECT ${versionColumns} FROM hr_payroll_rule_version WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE`, [id, scope.tenantId, scope.parkId]);
    if (rows[0]!.version !== expectedVersion) throw new ConflictException("Payroll version changed; refresh before saving");
    return rows[0]!;
  }

  async updateVersion(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: UpdateHrPayrollRuleVersionDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
    const dto = await this.validated(UpdateHrPayrollRuleVersionDto, input);
    const evidence = buildFormalPayrollDefinitionEvidence(dto.definition);
    return this.transaction(async manager => {
      const current = await this.lockedVersion(manager, scope, id, dto.expectedVersion);
      if (current.status !== "draft") throw new ConflictException("Only draft rules can be edited; create a new revision");
      const row = typeormQueryRows<FormalRuleVersionRow>(await manager.query(`UPDATE hr_payroll_rule_version SET definition=$4::jsonb,definition_evidence=$7::jsonb,reason=$5,authored_by=$6,version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 RETURNING ${versionColumns}`, [id, scope.tenantId, scope.parkId, JSON.stringify(dto.definition), dto.reason, actor.sub, JSON.stringify(evidence)]))[0]!;
      await this.auditWrite(manager, scope, actor, id, "修改工资规则草稿", { revisionNo: row.revision_no, version: row.version });
      return this.project(row);
    });
  }

  async submitVersion(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: SubmitHrPayrollRuleVersionDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
    const dto = await this.validated(SubmitHrPayrollRuleVersionDto, input);
    return this.transaction(async manager => {
      const current = await this.lockedVersion(manager, scope, id, dto.expectedVersion);
      if (current.status !== "draft") throw new ConflictException("Only draft rules can be submitted");
      this.assertEvidence(current);
      const row = typeormQueryRows<FormalRuleVersionRow>(await manager.query(`UPDATE hr_payroll_rule_version SET status='submitted',submitted_by=$4,version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 RETURNING ${versionColumns}`, [id, scope.tenantId, scope.parkId, actor.sub]))[0]!;
      await this.auditWrite(manager, scope, actor, id, "提交工资规则复核", { revisionNo: row.revision_no, version: row.version });
      return this.project(row);
    });
  }

  async reviewVersion(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: ReviewHrPayrollRuleVersionDto) {
    this.authority(actor, HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW);
    const dto = await this.validated(ReviewHrPayrollRuleVersionDto, input);
    if (dto.decision === "approve" ? !dto.effectiveFrom : dto.effectiveFrom !== undefined) throw new BadRequestException("Approval requires an effective month; rejection has none");
    return this.transaction(async manager => {
      const current = await this.lockedVersion(manager, scope, id, dto.expectedVersion);
      if (current.status !== "submitted") throw new ConflictException("Only submitted rules can be reviewed");
      if ([current.created_by, current.authored_by, current.submitted_by].includes(actor.sub)) throw new ForbiddenException("Rule authors cannot approve or reject their own draft");
      this.assertEvidence(current);
      const row = typeormQueryRows<FormalRuleVersionRow>(await manager.query(`UPDATE hr_payroll_rule_version SET status=$4,effective_from=$5::date,reviewed_by=$6,reviewed_at=now(),review_reason=$7,version=version+1,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 RETURNING ${versionColumns}`, [id, scope.tenantId, scope.parkId, dto.decision === "approve" ? "approved" : "rejected", dto.decision === "approve" ? `${dto.effectiveFrom}-01` : null, actor.sub, dto.reason]))[0]!;
      await this.auditWrite(manager, scope, actor, id, "复核工资规则", { decision: dto.decision, revisionNo: row.revision_no, effectiveFrom: row.effective_from });
      return this.project(row);
    });
  }

  async lockEffectiveVersion(manager: EntityManager, scope: TenantParkScope, ruleSetId: string, month: string, expectedVersionId?: string): Promise<FormalRuleVersionRow> {
    if (!/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/u.test(month)) throw new BadRequestException("Invalid payroll month");
    const parents = await manager.query("SELECT id FROM hr_payroll_rule_set WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE", [ruleSetId, scope.tenantId, scope.parkId]);
    if (parents.length !== 1) throw new NotFoundException("Payroll rules not found");
    const rows: FormalRuleVersionRow[] = await manager.query(`SELECT ${versionColumns} FROM hr_payroll_rule_version WHERE rule_set_id=$1 AND tenant_id=$2 AND park_id=$3 AND status='approved' AND effective_from<=$4::date ORDER BY effective_from DESC LIMIT 1 FOR SHARE`, [ruleSetId, scope.tenantId, scope.parkId, `${month}-01`]);
    if (rows.length !== 1) throw new ConflictException("No approved rule is effective for this month");
    if (expectedVersionId !== undefined && rows[0]!.id !== expectedVersionId) throw new ConflictException("Effective payroll rules changed; refresh inputs");
    this.assertEvidence(rows[0]!);
    return rows[0]!;
  }

  async effective(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: HrPayrollEffectiveRuleQueryDto) {
    this.authority(actor);
    const dto = await this.validated(HrPayrollEffectiveRuleQueryDto, query);
    const row = await this.transaction(manager => this.lockEffectiveVersion(manager, scope, id, dto.month));
    await this.auditRead(scope, actor, 1);
    return this.project(row);
  }
}
