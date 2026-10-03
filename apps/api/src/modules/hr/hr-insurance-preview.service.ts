import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { createHash } from "node:crypto";
import { isUUID } from "class-validator";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { CreateHrInsuranceReferencePreviewDto, HrInsurancePolicyQueryDto } from "./dto/hr-insurance-preview.dto";
import { calculateInsurancePreview, HR_INSURANCE_KINDS, normalizeInsurancePolicyFactors, type InsuranceCalculationItem } from "./hr-insurance-calculation";
import { HR_INSURANCE_SOURCE_FACTOR_COLUMNS, insuranceSourceFactorItems, insuranceSourceFactorsHash, type InsuranceSourceFactor } from "./hr-insurance-policy-source";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

interface PolicyRow { id: string; policy_code: string; policy_name: string | null; version: number; status: string; }
interface FactorRow {
  id: string; version: number; insurance_kind: InsuranceCalculationItem["insuranceKind"];
  base_rate: string | null; employer_rate: string | null; employee_rate: string | null; supplement_rate: string | null;
  base_fixed_amount: string | null; employer_fixed_amount: string | null; employee_fixed_amount: string | null; supplement_fixed_amount: string | null;
}

@Injectable()
export class HrInsurancePreviewService {
  constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

  private assertAuthority(actor: JwtPrincipal) {
    const required = [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ];
    if (!actor.isSuper && !actor.permissions.includes("*") && !required.every(p => actor.permissions.includes(p))) throw new ForbiddenException("HR_INSURANCE_REFERENCE_PREVIEW_FORBIDDEN");
  }

  async listPolicies(scope: TenantParkScope, actor: JwtPrincipal, query: HrInsurancePolicyQueryDto) {
    this.assertAuthority(actor);
    if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 1000000 || !Number.isSafeInteger(query.page_size) || query.page_size < 1 || query.page_size > 100 || (query.keyword !== undefined && (typeof query.keyword !== "string" || query.keyword.length > 100))) throw new BadRequestException("HR_INSURANCE_POLICY_QUERY_INVALID");
    const keyword = `%${query.keyword?.trim() ?? ""}%`;
    const params = [scope.tenantId, scope.parkId, keyword];
    const counts: Array<{ total: number }> = await this.db.query("SELECT count(*)::int AS total FROM hr_insurance_policy p WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.is_deleted=false AND (p.policy_code ILIKE $3 OR p.policy_name ILIKE $3)", params);
    const rows: Array<PolicyRow & { variants: number[] }> = await this.db.query(`SELECT p.id,p.policy_code,p.policy_name,p.version,p.status,
      ARRAY(SELECT DISTINCT i.variant_no FROM hr_insurance_policy_item i WHERE i.policy_id=p.id AND i.tenant_id=p.tenant_id AND i.park_id=p.park_id AND i.is_deleted=false AND i.variant_no IN(1,2) ORDER BY i.variant_no) AS variants
      FROM hr_insurance_policy p WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.is_deleted=false AND (p.policy_code ILIKE $3 OR p.policy_name ILIKE $3)
      ORDER BY p.policy_code,p.id LIMIT $4 OFFSET $5`, [...params, query.page_size, (query.page - 1) * query.page_size]);
    await recordHrSensitiveRead(this.audit, scope, actor, { resource: "hr.insurance_policy", action: "读取社保参考政策目录", bizType: "hr_insurance_policy", path: "/hr/insurance/policies", fieldGroups: ["insurance"], projection: "metadata", itemCount: rows.length });
    return { items: rows.map(p => ({ id: p.id, code: p.policy_code, name: p.policy_name, version: p.version, status: p.status, availableVariants: p.variants })), total: counts[0]?.total ?? 0, page: query.page, page_size: query.page_size, insuranceKinds: [...HR_INSURANCE_KINDS] };
  }

  async policyDefinition(scope: TenantParkScope, actor: JwtPrincipal, id: string, expectedVersion: number) {
    this.assertAuthority(actor);
    if (!isUUID(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 2147483647) throw new BadRequestException("HR_INSURANCE_POLICY_DEFINITION_INPUT_INVALID");
    const result = await this.db.transaction("REPEATABLE READ", async manager => {
      await manager.query("SET TRANSACTION READ ONLY");
      await manager.query("SET LOCAL lock_timeout='2s'");
      await manager.query("SET LOCAL statement_timeout='15s'");
      const parents: Array<PolicyRow & { scope_description: string | null }> = await manager.query(
        "SELECT id,policy_code,policy_name,version,status,scope_description FROM hr_insurance_policy WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false", [id, scope.tenantId, scope.parkId]);
      if (parents.length !== 1) throw new NotFoundException("HR_INSURANCE_PREVIEW_SOURCE_NOT_FOUND");
      const parent = parents[0]!;
      if (parent.version !== expectedVersion) throw new ConflictException("HR_INSURANCE_POLICY_DEFINITION_SOURCE_CHANGED");
      const variants = [];
      for (const variantNo of [1, 2]) {
        const rows: InsuranceSourceFactor[] = await manager.query(
          `SELECT ${HR_INSURANCE_SOURCE_FACTOR_COLUMNS} FROM hr_insurance_policy_item WHERE policy_id=$1 AND tenant_id=$2 AND park_id=$3 AND variant_no=$4 AND is_deleted=false ORDER BY insurance_kind,id`, [id, scope.tenantId, scope.parkId, variantNo]);
        if (!rows.length) continue;
        const items = insuranceSourceFactorItems(rows);
        let copyEligible = true;
        try { normalizeInsurancePolicyFactors(items); } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
          copyEligible = false;
        }
        variants.push({ variantNo, items, copyEligible, factorsHash: insuranceSourceFactorsHash(rows) });
      }
      return { id: parent.id, code: parent.policy_code, name: parent.policy_name, version: parent.version, status: parent.status,
        scopeDescription: parent.scope_description, variants, mode: "historical_definition" as const, activated: false as const };
    });
    await recordHrSensitiveRead(this.audit, scope, actor, { resource: "hr.insurance_policy", action: "读取历史社保政策定义", bizType: "hr_insurance_policy", bizId: id, path: `/hr/insurance/policies/${id}`, fieldGroups: ["insurance"], projection: "full", itemCount: result.variants.reduce((n,v) => n+v.items.length,0) });
    return result;
  }

  async referencePreview(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateHrInsuranceReferencePreviewDto) {
    this.assertAuthority(actor);
    // Revalidate direct service calls, not only HTTP DTOs.
    if (!Number.isSafeInteger(dto.periodYear) || dto.periodYear < 1900 || dto.periodYear > 2100 || !Number.isSafeInteger(dto.periodMonth) || dto.periodMonth < 1 || dto.periodMonth > 12 || ![1, 2].includes(dto.variantNo)) throw new BadRequestException("HR_INSURANCE_PREVIEW_PERIOD_OR_VARIANT_INVALID");
    if (!Array.isArray(dto.bases) || dto.bases.length !== 6 || dto.bases.some(b => !b || !HR_INSURANCE_KINDS.includes(b.insuranceKind)) || new Set(dto.bases.map(b => b.insuranceKind)).size !== 6) throw new BadRequestException("HR_INSURANCE_PREVIEW_SIX_BASES_REQUIRED");
    const preview = await this.db.transaction(async manager => {
      const employees: Array<{ id: string; version: number }> = await manager.query(
        "SELECT id,version FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE",
        [dto.employeeId, scope.tenantId, scope.parkId]);
      if (employees.length !== 1) throw new NotFoundException("HR_INSURANCE_PREVIEW_SOURCE_NOT_FOUND");
      const policies: PolicyRow[] = await manager.query(
        "SELECT id,policy_code,policy_name,version,status FROM hr_insurance_policy WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE",
        [dto.policyId, scope.tenantId, scope.parkId]);
      if (policies.length !== 1) throw new NotFoundException("HR_INSURANCE_PREVIEW_SOURCE_NOT_FOUND");
      const policy = policies[0]!;
      if (policy.version !== dto.expectedPolicyVersion) throw new ConflictException("HR_INSURANCE_POLICY_VERSION_CHANGED");
      const factors: FactorRow[] = await manager.query(
        "SELECT id,version,insurance_kind,base_rate,employer_rate,employee_rate,supplement_rate,base_fixed_amount,employer_fixed_amount,employee_fixed_amount,supplement_fixed_amount FROM hr_insurance_policy_item WHERE policy_id=$1 AND tenant_id=$2 AND park_id=$3 AND variant_no=$4 AND is_deleted=false ORDER BY insurance_kind,id FOR SHARE",
        [dto.policyId, scope.tenantId, scope.parkId, dto.variantNo]);
      const bases = new Map(dto.bases.map(b => [b.insuranceKind, b.contributionBase]));
      const result = calculateInsurancePreview({ policyVersion: policy.version, includeFund: dto.includeFund, items: factors.map(f => ({
        insuranceKind: f.insurance_kind, contributionBase: bases.get(f.insurance_kind) ?? null,
        factors: {
          base: { rate: f.base_rate, fixedAmount: f.base_fixed_amount },
          employer: { rate: f.employer_rate, fixedAmount: f.employer_fixed_amount },
          employee: { rate: f.employee_rate, fixedAmount: f.employee_fixed_amount },
          supplement: { rate: f.supplement_rate, fixedAmount: f.supplement_fixed_amount },
        },
      })) });
      const inputHash = createHash("sha256").update(JSON.stringify({
        tenantId: scope.tenantId, parkId: scope.parkId, employee: employees[0],
        policyId: policy.id, policyVersion: policy.version, policyStatus: policy.status,
        variantNo: dto.variantNo, periodYear: dto.periodYear, periodMonth: dto.periodMonth,
        includeFund: dto.includeFund, engineVersion: result.engineVersion,
        bases: result.items.map(item => ({ insuranceKind: item.insuranceKind, contributionBase: item.contributionBase })), factors,
      })).digest("hex");
      return {
        mode: "reference_only" as const, confirmationEligible: false as const,
        inputHash, employeeId: dto.employeeId, periodYear: dto.periodYear, periodMonth: dto.periodMonth,
        policy: { id: policy.id, code: policy.policy_code, name: policy.policy_name, version: policy.version, status: policy.status, variantNo: dto.variantNo },
        calculation: result,
      };
    });
    // No calculation/base values or personal rows are copied into the audit payload.
    await this.audit.recordOperationRequired({
      tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, username: actor.username,
      realName: actor.realName ?? null, roleCodes: actor.roles, module: "人力资源管理",
      resource: "hr.insurance_reference_preview", action: "社保参考试算", bizType: "hr_insurance_policy", bizId: dto.policyId,
      beforeJson: null, afterJson: { inputHash: preview.inputHash, mode: preview.mode, fieldGroups: ["financial", "insurance"], itemCount: 6 },
      method: "POST", path: "/hr/insurance/reference-preview", success: true, result: "success", requestId: null,
    });
    return preview;
  }
}
