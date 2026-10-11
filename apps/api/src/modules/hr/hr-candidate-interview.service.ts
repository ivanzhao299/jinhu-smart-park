import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { buildHrSensitiveReadAuditInput } from "./hr-sensitive-read-audit";
import type { HrCandidateInterviewListDto, SaveHrCandidateInterviewDto } from "./dto/hr-candidate-interview.dto";

type InterviewRow = Record<string, unknown>;
const statuses = new Set(["scheduled", "completed", "cancelled"]);
const outcomes = new Set(["pending", "pass", "fail", "hold"]);

@Injectable()
export class HrCandidateInterviewService {
  constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

  private can(actor: JwtPrincipal, permission: string) { return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission)); }
  private require(actor: JwtPrincipal, permission: string) { if (!this.can(actor, permission)) throw new ForbiddenException(`${permission} permission is required`); }
  private first(result: unknown): InterviewRow | undefined { return Array.isArray(result) && Array.isArray(result[0]) ? result[0][0] as InterviewRow | undefined : Array.isArray(result) ? result[0] as InterviewRow | undefined : undefined; }

  private async lockCandidate(manager: EntityManager, scope: TenantParkScope, candidateId: string, lock = true) {
    const candidate = this.first(await manager.query(`SELECT id FROM hr_candidate WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false${lock ? " FOR UPDATE" : ""}`, [candidateId, scope.tenantId, scope.parkId]));
    if (!candidate) throw new NotFoundException("Candidate not found");
  }

  private validate(dto: SaveHrCandidateInterviewDto) {
    if (!statuses.has(dto.status) || !outcomes.has(dto.outcome)) throw new BadRequestException("Interview status or outcome is invalid");
    const start = Date.parse(dto.startsAt), end = Date.parse(dto.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new BadRequestException("Interview end time must be after start time");
    const notes = dto.resultNotes === null ? null : dto.resultNotes.trim();
    const cancellation = dto.cancellationReason === null ? null : dto.cancellationReason.trim();
    if (dto.status === "scheduled" && (dto.outcome !== "pending" || notes !== null || cancellation !== null)) throw new BadRequestException("Scheduled interview requires pending outcome and no result or cancellation reason");
    if (dto.status === "completed" && (dto.outcome === "pending" || !notes || cancellation !== null)) throw new BadRequestException("Completed interview requires a non-pending outcome and result notes");
    if (dto.status === "cancelled" && (dto.outcome !== "pending" || !cancellation || notes !== null)) throw new BadRequestException("Cancelled interview requires a cancellation reason and pending outcome");
  }

  private projection(alias: string) {
    return `${alias}.id,${alias}.candidate_id "candidateId",${alias}.version,${alias}.round_label "roundLabel",${alias}.starts_at "startsAt",${alias}.ends_at "endsAt",${alias}.location,${alias}.interviewer_name "interviewerName",${alias}.status,${alias}.outcome,${alias}.result_notes "resultNotes",${alias}.cancellation_reason "cancellationReason",${alias}.updated_at "updatedAt"`;
  }

  private historyProjection(alias: string) {
    return `${alias}.id,${alias}.interview_id "interviewId",${alias}.candidate_id "candidateId",${alias}.version,${alias}.round_label "roundLabel",${alias}.starts_at "startsAt",${alias}.ends_at "endsAt",${alias}.location,${alias}.interviewer_name "interviewerName",${alias}.status,${alias}.outcome,${alias}.result_notes "resultNotes",${alias}.cancellation_reason "cancellationReason",${alias}.occurred_at "occurredAt",COALESCE(NULLIF(u.display_name,''),'系统用户') "actorDisplayName"`;
  }

  async list(scope: TenantParkScope, actor: JwtPrincipal, candidateId: string, query: HrCandidateInterviewListDto) {
    this.require(actor, HR_PERMISSIONS.HR_CANDIDATE_READ);
    return this.db.transaction("REPEATABLE READ", async manager => {
      await this.lockCandidate(manager, scope, candidateId, false);
      const count = this.first(await manager.query("SELECT count(*)::int total FROM hr_candidate_interview WHERE tenant_id=$1 AND park_id=$2 AND candidate_id=$3", [scope.tenantId, scope.parkId, candidateId]));
      const items = await manager.query(`SELECT ${this.projection("i")} FROM hr_candidate_interview i WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.candidate_id=$3 ORDER BY i.starts_at DESC,i.id DESC LIMIT $4 OFFSET $5`, [scope.tenantId, scope.parkId, candidateId, query.page_size, (query.page - 1) * query.page_size]) as InterviewRow[];
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.candidate_interview", action: "读取候选人面试", bizType: "hr_candidate", bizId: candidateId, path: "/hr/recruitment/candidates/:id/interviews", fieldGroups: [], projection: "metadata", itemCount: items.length }), manager);
      return { items, total: Number(count?.total ?? 0), page: query.page, page_size: query.page_size };
    });
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, candidateId: string, interviewId: string) {
    this.require(actor, HR_PERMISSIONS.HR_CANDIDATE_READ);
    return this.db.transaction("REPEATABLE READ", async manager => {
      await this.lockCandidate(manager, scope, candidateId, false);
      const interview = this.first(await manager.query(`SELECT ${this.projection("i")} FROM hr_candidate_interview i WHERE i.id=$1 AND i.tenant_id=$2 AND i.park_id=$3 AND i.candidate_id=$4`, [interviewId, scope.tenantId, scope.parkId, candidateId]));
      if (!interview) throw new NotFoundException("Candidate interview not found");
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.candidate_interview", action: "读取候选人面试详情", bizType: "hr_candidate_interview", bizId: interviewId, path: "/hr/recruitment/candidates/:id/interviews/:interviewId", fieldGroups: [], projection: "metadata", itemCount: 1 }), manager);
      return interview;
    });
  }

  async history(scope: TenantParkScope, actor: JwtPrincipal, candidateId: string, interviewId: string, query: HrCandidateInterviewListDto) {
    this.require(actor, HR_PERMISSIONS.HR_CANDIDATE_READ);
    return this.db.transaction("REPEATABLE READ", async manager => {
      await this.lockCandidate(manager, scope, candidateId, false);
      const exists = this.first(await manager.query("SELECT id FROM hr_candidate_interview WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND candidate_id=$4", [interviewId, scope.tenantId, scope.parkId, candidateId]));
      if (!exists) throw new NotFoundException("Candidate interview not found");
      const count = this.first(await manager.query("SELECT count(*)::int total FROM hr_candidate_interview_history WHERE tenant_id=$1 AND park_id=$2 AND candidate_id=$3 AND interview_id=$4", [scope.tenantId, scope.parkId, candidateId, interviewId]));
      const items = await manager.query(`SELECT ${this.historyProjection("h")} FROM hr_candidate_interview_history h LEFT JOIN sys_user u ON u.id=h.actor_user_id AND u.tenant_id=h.tenant_id AND u.park_id=h.park_id AND u.is_deleted=false WHERE h.tenant_id=$1 AND h.park_id=$2 AND h.candidate_id=$3 AND h.interview_id=$4 ORDER BY h.version DESC,h.id DESC LIMIT $5 OFFSET $6`, [scope.tenantId, scope.parkId, candidateId, interviewId, query.page_size, (query.page - 1) * query.page_size]) as InterviewRow[];
      await this.audit.recordOperationRequired(buildHrSensitiveReadAuditInput(scope, actor, { resource: "hr.candidate_interview_history", action: "读取候选人面试历史", bizType: "hr_candidate_interview", bizId: interviewId, path: "/hr/recruitment/candidates/:id/interviews/:interviewId/history", fieldGroups: [], projection: "metadata", itemCount: items.length }), manager);
      return { items, total: Number(count?.total ?? 0), page: query.page, page_size: query.page_size };
    });
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, candidateId: string, dto: SaveHrCandidateInterviewDto) {
    this.require(actor, HR_PERMISSIONS.HR_CANDIDATE_MANAGE);
    this.validate(dto);
    if (dto.expectedVersion !== 0 || dto.status !== "scheduled") throw new BadRequestException("New interview must be scheduled with expectedVersion 0");
    return this.db.transaction(async manager => {
      await this.lockCandidate(manager, scope, candidateId);
      const saved = this.first(await manager.query(`INSERT INTO hr_candidate_interview(tenant_id,park_id,candidate_id,version,round_label,starts_at,ends_at,location,interviewer_name,status,outcome,result_notes,cancellation_reason,updated_by) VALUES($1,$2,$3,1,$4,$5::timestamptz,$6::timestamptz,$7,$8,$9,$10,$11,$12,$13) RETURNING ${this.projection("hr_candidate_interview")}`, [scope.tenantId, scope.parkId, candidateId, dto.roundLabel, dto.startsAt, dto.endsAt, dto.location, dto.interviewerName, dto.status, dto.outcome, dto.resultNotes, dto.cancellationReason, actor.sub]));
      if (!saved) throw new ConflictException("Candidate interview could not be created");
      await this.appendHistory(manager, scope, actor, saved);
      await this.audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, module: "人力资源管理", resource: "hr.candidate_interview", action: "安排候选人面试", bizType: "hr_candidate_interview", bizId: String(saved.id), beforeJson: null, afterJson: saved, method: "POST", path: "/hr/recruitment/candidates/:id/interviews", success: true, requestId: null }, manager);
      return saved;
    });
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, candidateId: string, interviewId: string, dto: SaveHrCandidateInterviewDto) {
    this.require(actor, HR_PERMISSIONS.HR_CANDIDATE_MANAGE);
    this.validate(dto);
    if (dto.expectedVersion < 1) throw new BadRequestException("Interview expectedVersion must be at least 1");
    return this.db.transaction(async manager => {
      await this.lockCandidate(manager, scope, candidateId);
      const previous = this.first(await manager.query(`SELECT ${this.projection("i")} FROM hr_candidate_interview i WHERE i.id=$1 AND i.tenant_id=$2 AND i.park_id=$3 AND i.candidate_id=$4 FOR UPDATE`, [interviewId, scope.tenantId, scope.parkId, candidateId]));
      if (!previous) throw new NotFoundException("Candidate interview not found");
      if (Number(previous.version) !== dto.expectedVersion) throw new ConflictException("Candidate interview changed; reload before saving");
      const oldStatus = String(previous.status);
      if ((oldStatus === "completed" || oldStatus === "cancelled") && dto.status !== oldStatus) throw new ConflictException("Completed or cancelled interview cannot change status");
      const saved = this.first(await manager.query(`UPDATE hr_candidate_interview SET version=version+1,round_label=$5,starts_at=$6::timestamptz,ends_at=$7::timestamptz,location=$8,interviewer_name=$9,status=$10,outcome=$11,result_notes=$12,cancellation_reason=$13,updated_by=$14,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND candidate_id=$4 AND version=$15 RETURNING ${this.projection("hr_candidate_interview")}`, [interviewId, scope.tenantId, scope.parkId, candidateId, dto.roundLabel, dto.startsAt, dto.endsAt, dto.location, dto.interviewerName, dto.status, dto.outcome, dto.resultNotes, dto.cancellationReason, actor.sub, dto.expectedVersion]));
      if (!saved) throw new ConflictException("Candidate interview changed; reload before saving");
      await this.appendHistory(manager, scope, actor, saved);
      await this.audit.recordOperationRequired({ tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, module: "人力资源管理", resource: "hr.candidate_interview", action: "维护候选人面试", bizType: "hr_candidate_interview", bizId: interviewId, beforeJson: previous, afterJson: saved, method: "PUT", path: "/hr/recruitment/candidates/:id/interviews/:interviewId", success: true, requestId: null }, manager);
      return saved;
    });
  }

  private async appendHistory(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, row: InterviewRow) {
    await manager.query("INSERT INTO hr_candidate_interview_history(tenant_id,park_id,interview_id,candidate_id,version,round_label,starts_at,ends_at,location,interviewer_name,status,outcome,result_notes,cancellation_reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11,$12,$13,$14,$15)", [scope.tenantId, scope.parkId, row.id, row.candidateId, row.version, row.roundLabel, row.startsAt, row.endsAt, row.location, row.interviewerName, row.status, row.outcome, row.resultNotes, row.cancellationReason, actor.sub]);
  }
}
