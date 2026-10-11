import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DataSource, type EntityManager } from "typeorm";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { HrCandidateProfileListDto, SaveHrCandidateProfileDto } from "./dto/hr-candidate-profile.dto";
import { buildHrSensitiveReadAuditInput } from "./hr-sensitive-read-audit";

type Row = Record<string, unknown>;
const businessColumns = { candidateNo: "candidate_no", fullName: "full_name", requisitionId: "requisition_id", source: "source", expectedOnboardDate: "expected_onboard_date" } as const;
const protectedFields = { mobile: "mobile", email: "email", identityNumber: "identity" } as const;
// Transformed DTO instances materialize omitted fields as undefined; JSON null remains an explicit clear.
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key) && (value as Row)[key] !== undefined;

@Injectable()
export class HrCandidateProfileService {
  constructor(private readonly db: DataSource, private readonly sensitive: PartySensitiveDataService, private readonly audit: AuditService) {}
  private can(actor: JwtPrincipal, permission: string) { return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission)); }
  private require(actor: JwtPrincipal, write = false) {
    if (!this.can(actor, HR_PERMISSIONS.HR_CANDIDATE_READ) || (write && !this.can(actor, HR_PERMISSIONS.HR_CANDIDATE_MANAGE))) throw new ForbiddenException("Candidate profile permission is required");
  }
  private first(result: unknown): Row | undefined { return Array.isArray(result) && Array.isArray(result[0]) ? result[0][0] as Row | undefined : Array.isArray(result) ? result[0] as Row | undefined : undefined; }
  private date(value: unknown) { return value == null ? null : value instanceof Date ? `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : String(value).slice(0, 10); }
  private text(value: unknown) { return value == null ? null : String(value); }
  private snapshot(row: Row): Row {
    const result: Row = { id: String(row.id), version: Number(row.version), candidateNo: row.candidateNo, fullName: row.fullName, requisitionId: row.requisitionId, requisitionTitle: row.requisitionTitle, stage: row.stage, source: this.text(row.source), expectedOnboardDate: this.date(row.expectedOnboardDate), latestEvaluation: this.text(row.latestEvaluation), convertedEmployeeId: this.text(row.convertedEmployeeId), updatedAt: new Date(row.updatedAt as string | Date).toISOString() };
    for (const prefix of Object.values(protectedFields)) for (const suffix of ["Encrypted", "Masked", "Fingerprint"]) result[`${prefix}${suffix}`] = this.text(row[`${prefix}${suffix}`]);
    return result;
  }
  private publicSnapshot(row: Row, actor: JwtPrincipal) {
    const full = this.can(actor, HR_PERMISSIONS.HR_CANDIDATE_SENSITIVE_READ);
    const result: Row = {};
    for (const field of ["id", "version", "candidateNo", "fullName", "requisitionId", "requisitionTitle", "stage", "source", "expectedOnboardDate", "latestEvaluation", "convertedEmployeeId", "updatedAt", "mobileMasked", "emailMasked", "identityMasked"]) result[field] = row[field];
    result.sensitiveAvailable = full;
    if (full) for (const [field, prefix] of Object.entries(protectedFields)) result[field] = this.sensitive.decrypt(this.text(row[`${prefix}Encrypted`]));
    return result;
  }
  private async candidate(manager: EntityManager, scope: TenantParkScope, id: string, lock = false) {
    const row = this.first(await manager.query(`SELECT c.id,c.version,c.candidate_no "candidateNo",c.full_name "fullName",c.requisition_id "requisitionId",r.title "requisitionTitle",c.stage,c.source,c.expected_onboard_date::text "expectedOnboardDate",c.latest_evaluation "latestEvaluation",c.converted_employee_id "convertedEmployeeId",c.update_time "updatedAt",c.mobile_encrypted "mobileEncrypted",c.mobile_masked "mobileMasked",c.mobile_fingerprint "mobileFingerprint",c.email_encrypted "emailEncrypted",c.email_masked "emailMasked",c.email_fingerprint "emailFingerprint",c.identity_encrypted "identityEncrypted",c.identity_masked "identityMasked",c.identity_fingerprint "identityFingerprint" FROM hr_candidate c JOIN hr_recruitment_requisition r ON r.id=c.requisition_id AND r.tenant_id=c.tenant_id AND r.park_id=c.park_id WHERE c.id=$1 AND c.tenant_id=$2 AND c.park_id=$3 AND c.is_deleted=false${lock ? " FOR UPDATE OF c" : ""}`, [id, scope.tenantId, scope.parkId]));
    if (!row) throw new NotFoundException("Candidate not found");
    return this.snapshot(row);
  }
  private async readAudit(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, id: string, resource: string, path: string, count: number, metadata = false) {
    await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource, action: "读取候选人资料", bizType: "hr_candidate", bizId: id, path, fieldGroups: metadata ? [] : ["identity", "contact"], projection: metadata ? "metadata" : this.can(actor, HR_PERMISSIONS.HR_CANDIDATE_SENSITIVE_READ) ? "full" : "masked", itemCount: count }), manager);
  }
  async current(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    this.require(actor);
    return this.db.transaction("REPEATABLE READ", async manager => {
      const row = await this.candidate(manager, scope, id);
      const result = this.publicSnapshot(row, actor);
      await this.readAudit(manager, scope, actor, id, "hr.candidate_profile", "/hr/recruitment/candidates/:id/profile", 1);
      return result;
    });
  }
  async history(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: HrCandidateProfileListDto) {
    this.require(actor);
    return this.db.transaction("REPEATABLE READ", async manager => {
      await this.candidate(manager, scope, id);
      const count = this.first(await manager.query("SELECT count(*)::int total FROM hr_candidate_profile_history WHERE tenant_id=$1 AND park_id=$2 AND candidate_id=$3", [scope.tenantId, scope.parkId, id]));
      const rows = await manager.query(`SELECT h.id,h.before_snapshot "before",h.after_snapshot "after",h.change_reason "changeReason",h.occurred_at "occurredAt",COALESCE(NULLIF(u.display_name,''),'系统用户') "actorDisplayName" FROM hr_candidate_profile_history h LEFT JOIN sys_user u ON u.id=h.actor_user_id AND u.tenant_id=h.tenant_id AND u.park_id=h.park_id AND u.is_deleted=false WHERE h.tenant_id=$1 AND h.park_id=$2 AND h.candidate_id=$3 ORDER BY h.after_version DESC,h.id DESC LIMIT $4 OFFSET $5`, [scope.tenantId, scope.parkId, id, query.page_size, (query.page - 1) * query.page_size]) as Row[];
      const items = rows.map(row => ({ id: row.id, before: this.publicSnapshot(row.before as Row, actor), after: this.publicSnapshot(row.after as Row, actor), changeReason: row.changeReason, occurredAt: new Date(row.occurredAt as string | Date).toISOString(), actorDisplayName: row.actorDisplayName }));
      await this.readAudit(manager, scope, actor, id, "hr.candidate_profile_history", "/hr/recruitment/candidates/:id/profile-history", items.length);
      return { items, total: Number(count?.total ?? 0), page: query.page, page_size: query.page_size };
    });
  }
  async requisitionOptions(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: HrCandidateProfileListDto) {
    this.require(actor, true);
    return this.db.transaction("REPEATABLE READ", async manager => {
      const candidate = await this.candidate(manager, scope, id);
      if (candidate.stage === "hired" || candidate.convertedEmployeeId) throw new ConflictException("Hired or converted candidate cannot change requisition");
      const params: unknown[] = [scope.tenantId, scope.parkId];
      const where = ["r.tenant_id=$1", "r.park_id=$2", "r.is_deleted=false", "r.status IN ('draft','open')"];
      if (query.keyword) { params.push(`%${query.keyword}%`); where.push(`(r.requisition_code ILIKE $3 OR r.title ILIKE $3 OR o.org_name ILIKE $3)`); }
      const from = `FROM hr_recruitment_requisition r JOIN sys_org o ON o.id=r.org_id AND o.tenant_id=r.tenant_id AND o.park_id=r.park_id WHERE ${where.join(" AND ")}`;
      const count = this.first(await manager.query(`SELECT count(*)::int total ${from}`, params));
      params.push(query.page_size, (query.page - 1) * query.page_size);
      const items = await manager.query(`SELECT r.id,r.requisition_code "requisitionCode",r.title,o.org_name "orgName",r.status ${from} ORDER BY r.requisition_code,r.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params) as Row[];
      await this.readAudit(manager, scope, actor, id, "hr.candidate_profile_options", "/hr/recruitment/candidates/:id/profile/requisition-options", items.length, true);
      return { items, total: Number(count?.total ?? 0), page: query.page, page_size: query.page_size };
    });
  }
  authorizeWrite(actor: JwtPrincipal, input: SaveHrCandidateProfileDto) {
    this.require(actor, true);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("Candidate profile input is invalid");
    if (Object.keys(protectedFields).some(field => own(input, field)) && !this.can(actor, HR_PERMISSIONS.HR_CANDIDATE_SENSITIVE_READ)) throw new ForbiddenException("Candidate sensitive read permission is required");
  }
  sealReceipt(result: Row) {
    // Persist only encrypted identity/version; replay projects the exact immutable saved snapshot.
    return { format: "hr_candidate_profile_v1", encryptedReceipt: this.sensitive.encrypt(JSON.stringify({ id: result.id, version: result.version })) };
  }
  async replayReceipt(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: SaveHrCandidateProfileDto, cache: unknown) {
    this.authorizeWrite(actor, input);
    const envelope = cache as { format?: unknown; encryptedReceipt?: unknown } | null;
    let receipt: Row;
    try {
      if (envelope?.format !== "hr_candidate_profile_v1" || typeof envelope.encryptedReceipt !== "string") throw new Error("Invalid envelope");
      receipt = JSON.parse(this.sensitive.decrypt(envelope.encryptedReceipt) ?? "null") as Row;
      if (!receipt || receipt.id !== id || receipt.version !== input.expectedVersion + 1) throw new Error("Invalid receipt");
    } catch { throw new ConflictException("Candidate profile receipt is unavailable"); }
    return this.db.transaction("REPEATABLE READ", async manager => {
      await this.candidate(manager, scope, id);
      const history = this.first(await manager.query("SELECT after_snapshot FROM hr_candidate_profile_history WHERE tenant_id=$1 AND park_id=$2 AND candidate_id=$3 AND after_version=$4", [scope.tenantId, scope.parkId, id, receipt.version]));
      const snapshot = history?.after_snapshot as Row | undefined;
      if (!snapshot || snapshot.id !== id || snapshot.version !== receipt.version) throw new ConflictException("Candidate profile receipt is unavailable");
      const result = this.publicSnapshot(snapshot, actor);
      await this.readAudit(manager, scope, actor, id, "hr.candidate_profile_replay", "/hr/recruitment/candidates/:id/profile", 1);
      return result;
    });
  }
  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, input: SaveHrCandidateProfileDto) {
    this.authorizeWrite(actor, input);
    const dto = plainToInstance(SaveHrCandidateProfileDto, input);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Candidate profile input is invalid");
    try {
      return await this.db.transaction(async manager => {
        const before = await this.candidate(manager, scope, id, true);
        if (before.version !== dto.expectedVersion) throw new ConflictException("Candidate changed; reload before saving");
        const params: unknown[] = [id, scope.tenantId, scope.parkId, dto.expectedVersion, actor.sub];
        const assignments: string[] = [];
        const put = (column: string, value: unknown) => { params.push(value); assignments.push(`${column}=$${params.length}`); };
        for (const [field, column] of Object.entries(businessColumns)) {
          if (!own(input, field)) continue;
          const value = dto[field as keyof typeof businessColumns];
          if (value === before[field]) continue;
          if (field === "requisitionId") {
            if (before.stage === "hired" || before.convertedEmployeeId) throw new ConflictException("Hired or converted candidate cannot change requisition");
            const target = this.first(await manager.query("SELECT id FROM hr_recruitment_requisition WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status IN ('draft','open') FOR SHARE", [value, scope.tenantId, scope.parkId]));
            if (!target) throw new NotFoundException("Recruitment requisition not found");
          }
          put(column, value);
        }
        for (const [field, prefix] of Object.entries(protectedFields)) {
          if (!own(input, field)) continue;
          const raw = dto[field as keyof typeof protectedFields];
          const value = raw == null ? null : field === "email" ? raw.trim().toLowerCase() : raw.replace(/\s+/gu, "").toUpperCase();
          if ((value === null && before[`${prefix}Encrypted`] === null && before[`${prefix}Masked`] === null && before[`${prefix}Fingerprint`] === null) || (value !== null && this.sensitive.hash(value) === before[`${prefix}Fingerprint`])) continue;
          const profile = value === null ? null : this.sensitive.identityProfile(value);
          put(`${prefix}_encrypted`, profile?.encrypted ?? null); put(`${prefix}_masked`, profile?.masked ?? null); put(`${prefix}_fingerprint`, profile?.hash ?? null);
        }
        if (!assignments.length) throw new BadRequestException("Candidate profile has no effective changes");
        const saved = this.first(await manager.query(`UPDATE hr_candidate SET ${assignments.join(",")},version=version+1,update_by=$5,update_time=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND version=$4 AND is_deleted=false RETURNING id,version`, params));
        if (!saved) throw new ConflictException("Candidate changed; reload before saving");
        const after = await this.candidate(manager, scope, id);
        await manager.query("INSERT INTO hr_candidate_profile_history(tenant_id,park_id,candidate_id,before_version,after_version,before_snapshot,after_snapshot,change_reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)", [scope.tenantId, scope.parkId, id, before.version, after.version, JSON.stringify(before), JSON.stringify(after), dto.changeReason, actor.sub]);
        await this.audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, module: "人力资源管理", resource: "hr.candidate_profile", action: "更正候选人资料", bizType: "hr_candidate", bizId: id, beforeJson: { version: before.version }, afterJson: { version: after.version }, method: "PUT", path: "/hr/recruitment/candidates/:id/profile", success: true, requestId: null }, manager);
        return this.publicSnapshot(after, actor);
      });
    } catch (error) {
      const pg = error as { code?: string; constraint?: string; driverError?: { code?: string; constraint?: string } };
      const cause = pg.driverError ?? pg;
      if (cause.code === "23505" && cause.constraint === "uq_hr_candidate_no") throw new ConflictException("Candidate number already exists");
      throw error;
    }
  }
}
