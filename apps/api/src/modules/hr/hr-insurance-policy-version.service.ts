import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { isUUID, validate } from "class-validator";
import { createHash } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { AuditService } from "../audit/audit.service";
import { CreateHrInsurancePolicyVersionDto } from "./dto/hr-insurance-policy-version.dto";
import { HrInsurancePolicyQueryDto } from "./dto/hr-insurance-preview.dto";
import { HR_INSURANCE_ENGINE_VERSION, normalizeInsurancePolicyFactors } from "./hr-insurance-calculation";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

interface VersionRow {
  id: string; request_sha256: string; created_by: string;
  policy_code: string; policy_name: string; variant_no: number; version_no: number;
  effective_from: string; effective_through: string; definition_sha256: string;
  created_at: Date; definition?: Record<string, unknown>;
}
interface SourceFactor {
  id: string; version: number; insurance_kind: Parameters<typeof normalizeInsurancePolicyFactors>[0][number]["insuranceKind"];
  base_rate: string | null; employer_rate: string | null; employee_rate: string | null; supplement_rate: string | null;
  base_fixed_amount: string | null; employer_fixed_amount: string | null; employee_fixed_amount: string | null; supplement_fixed_amount: string | null;
}
const columns = "id,request_sha256,created_by,policy_code,policy_name,variant_no,version_no,to_char(effective_from,'YYYY-MM') AS effective_from,to_char(effective_through,'YYYY-MM') AS effective_through,definition_sha256,created_at";
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class HrInsurancePolicyVersionService {
  constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

  private authority(actor: JwtPrincipal, write = false) {
    const required: string[] = [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ];
    if (write) required.push(HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE);
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(p => actor.permissions.includes(p))) throw new ForbiddenException("HR_INSURANCE_POLICY_VERSION_FORBIDDEN");
  }

  private project(row: VersionRow) {
    return { id: row.id, policyCode: row.policy_code, policyName: row.policy_name, variantNo: row.variant_no, versionNo: row.version_no,
      effectiveFrom: row.effective_from, effectiveThrough: row.effective_through, definitionHash: row.definition_sha256,
      createdAt: row.created_at.toISOString(), mode: "immutable_definition" as const, activated: false as const };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateHrInsurancePolicyVersionDto) {
    this.authority(actor, true);
    dto = plainToInstance(CreateHrInsurancePolicyVersionDto, dto);
    if ((await validate(dto)).length || dto.effectiveFrom > dto.effectiveThrough || !dto.policyName.trim() || !dto.reason.trim()) throw new BadRequestException("HR_INSURANCE_POLICY_VERSION_INPUT_INVALID");
    const fromSource = dto.sourcePolicyId !== undefined;
    if (fromSource ? !dto.sourcePolicyId || !dto.expectedSourceVersion || dto.items !== undefined : dto.expectedSourceVersion !== undefined || !dto.items) throw new BadRequestException("HR_INSURANCE_POLICY_VERSION_ONE_ORIGIN_REQUIRED");
    const manualItems = fromSource ? null : normalizeInsurancePolicyFactors(dto.items!);
    const request = { tenantId: scope.tenantId, parkId: scope.parkId, createdBy: actor.sub, policyCode: dto.policyCode,
      policyName: dto.policyName.trim(), variantNo: dto.variantNo, effectiveFrom: dto.effectiveFrom, effectiveThrough: dto.effectiveThrough,
      reason: dto.reason.trim(), sourcePolicyId: dto.sourcePolicyId ?? null, expectedSourceVersion: dto.expectedSourceVersion ?? null, items: manualItems };
    const requestHash = sha(request);
    try {
      return await this.db.transaction("READ COMMITTED", async manager => {
        await manager.query("SET LOCAL lock_timeout='2s'");
        await manager.query("SET LOCAL statement_timeout='15s'");
        // Serialize business retries independently of the HTTP response cache.
        await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["insurance-version-request", scope.tenantId, scope.parkId, dto.requestId])]);
        const existing: VersionRow[] = await manager.query(`SELECT ${columns} FROM hr_insurance_policy_version WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3`, [scope.tenantId, scope.parkId, dto.requestId]);
        if (existing.length) {
          const row = existing[0]!;
          if (row.created_by !== actor.sub || row.request_sha256 !== requestHash) throw new ConflictException("HR_INSURANCE_POLICY_VERSION_REQUEST_CONFLICT");
          await this.auditWrite(manager, scope, actor, row, true);
          return { ...this.project(row), replayed: true };
        }
        await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["insurance-version-family", scope.tenantId, scope.parkId, dto.policyCode, dto.variantNo])]);
        let origin: Record<string, unknown> = { kind: "manual" };
        let items = manualItems;
        if (fromSource) {
          // Parent UPDATE lock also blocks FK child insert phantoms while factors are frozen.
          const parents: Array<{ id: string; version: number }> = await manager.query("SELECT id,version FROM hr_insurance_policy WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE", [dto.sourcePolicyId, scope.tenantId, scope.parkId]);
          if (parents.length !== 1) throw new NotFoundException("HR_INSURANCE_POLICY_VERSION_SOURCE_NOT_FOUND");
          if (parents[0]!.version !== dto.expectedSourceVersion) throw new ConflictException("HR_INSURANCE_POLICY_VERSION_SOURCE_CHANGED");
          const factors: SourceFactor[] = await manager.query("SELECT id,version,insurance_kind,base_rate,employer_rate,employee_rate,supplement_rate,base_fixed_amount,employer_fixed_amount,employee_fixed_amount,supplement_fixed_amount FROM hr_insurance_policy_item WHERE policy_id=$1 AND tenant_id=$2 AND park_id=$3 AND variant_no=$4 AND is_deleted=false ORDER BY insurance_kind,id FOR SHARE", [dto.sourcePolicyId, scope.tenantId, scope.parkId, dto.variantNo]);
          items = normalizeInsurancePolicyFactors(factors.map(f => ({ insuranceKind: f.insurance_kind, factors: {
            base: { rate: f.base_rate, fixedAmount: f.base_fixed_amount }, employer: { rate: f.employer_rate, fixedAmount: f.employer_fixed_amount },
            employee: { rate: f.employee_rate, fixedAmount: f.employee_fixed_amount }, supplement: { rate: f.supplement_rate, fixedAmount: f.supplement_fixed_amount },
          } })));
          origin = { kind: "imported_reference", policyId: dto.sourcePolicyId, policyVersion: dto.expectedSourceVersion, variantNo: dto.variantNo, factorsHash: sha(factors) };
        }
        const versionNo = (await manager.query("SELECT coalesce(max(version_no),0)+1 AS next FROM hr_insurance_policy_version WHERE tenant_id=$1 AND park_id=$2 AND policy_code=$3 AND variant_no=$4", [scope.tenantId, scope.parkId, dto.policyCode, dto.variantNo]))[0].next as number;
        const definition = { formatVersion: 1, engineVersion: HR_INSURANCE_ENGINE_VERSION, tenantId: scope.tenantId, parkId: scope.parkId,
          createdBy: actor.sub, policyCode: request.policyCode, policyName: request.policyName, variantNo: dto.variantNo, versionNo,
          effectiveFrom: dto.effectiveFrom, effectiveThrough: dto.effectiveThrough, reason: request.reason, origin, items };
        const inserted = typeormQueryRows<VersionRow>(await manager.query(`INSERT INTO hr_insurance_policy_version(tenant_id,park_id,request_id,request_sha256,policy_code,policy_name,variant_no,version_no,effective_from,effective_through,created_by,definition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12::jsonb) RETURNING ${columns}`, [scope.tenantId, scope.parkId, dto.requestId, requestHash, dto.policyCode, request.policyName, dto.variantNo, versionNo, `${dto.effectiveFrom}-01`, `${dto.effectiveThrough}-01`, actor.sub, JSON.stringify(definition)]));
        if (inserted.length !== 1) throw new ConflictException("HR_INSURANCE_POLICY_VERSION_CREATE_CONFLICT");
        await this.auditWrite(manager, scope, actor, inserted[0]!, false);
        return { ...this.project(inserted[0]!), replayed: false };
      });
    } catch (error) {
      const code = (error as { driverError?: { code?: string }; code?: string })?.driverError?.code ?? (error as { code?: string })?.code;
      if (["23505", "55P03", "40001", "40P01"].includes(code ?? "")) throw new ConflictException("HR_INSURANCE_POLICY_VERSION_CONCURRENT_CONFLICT");
      throw error;
    }
  }

  async list(scope: TenantParkScope, actor: JwtPrincipal, query: HrInsurancePolicyQueryDto) {
    this.authority(actor);
    query = plainToInstance(HrInsurancePolicyQueryDto, query);
    if ((await validate(query)).length) throw new BadRequestException("HR_INSURANCE_POLICY_VERSION_QUERY_INVALID");
    const params = [scope.tenantId, scope.parkId, `%${query.keyword?.trim() ?? ""}%`];
    const total = (await this.db.query("SELECT count(*)::int AS n FROM hr_insurance_policy_version WHERE tenant_id=$1 AND park_id=$2 AND (policy_code ILIKE $3 OR policy_name ILIKE $3)", params))[0].n as number;
    const rows: VersionRow[] = await this.db.query(`SELECT ${columns} FROM hr_insurance_policy_version WHERE tenant_id=$1 AND park_id=$2 AND (policy_code ILIKE $3 OR policy_name ILIKE $3) ORDER BY policy_code,variant_no,version_no DESC,id LIMIT $4 OFFSET $5`, [...params, query.page_size, (query.page - 1) * query.page_size]);
    await this.auditRead(scope, actor, rows.length, "/hr/insurance/policy-versions");
    return { items: rows.map(row => this.project(row)), total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    this.authority(actor);
    if (!isUUID(id)) throw new BadRequestException("HR_INSURANCE_POLICY_VERSION_ID_INVALID");
    const rows: VersionRow[] = await this.db.query(`SELECT ${columns},definition FROM hr_insurance_policy_version WHERE tenant_id=$1 AND park_id=$2 AND id=$3`, [scope.tenantId, scope.parkId, id]);
    if (rows.length !== 1) throw new NotFoundException("HR_INSURANCE_POLICY_VERSION_NOT_FOUND");
    await this.auditRead(scope, actor, 1, `/hr/insurance/policy-versions/${id}`);
    const row = rows[0]!;
    return { ...this.project(row), engineVersion: row.definition!.engineVersion, items: row.definition!.items, reason: row.definition!.reason, originKind: (row.definition!.origin as { kind: string }).kind };
  }

  private auditRead(scope: TenantParkScope, actor: JwtPrincipal, itemCount: number, path: string) {
    return recordHrSensitiveRead(this.audit, scope, actor, { resource: "hr.insurance_policy_version", action: "读取社保政策版本", bizType: "hr_insurance_policy_version", path, fieldGroups: ["insurance"], projection: "full", itemCount });
  }

  private auditWrite(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, row: VersionRow, replayed: boolean) {
    return this.audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, username: actor.username,
      realName: actor.realName ?? null, roleCodes: actor.roles, module: "人力资源管理", resource: "hr.insurance_policy_version", action: "保存不可变社保政策版本",
      bizType: "hr_insurance_policy_version", bizId: row.id, beforeJson: null, afterJson: { definitionHash: row.definition_sha256, versionNo: row.version_no, replayed, activated: false },
      method: "POST", path: "/hr/insurance/policy-versions", success: true, result: "success", requestId: null }, manager);
  }
}
