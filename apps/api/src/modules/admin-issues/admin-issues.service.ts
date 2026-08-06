import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { randomUUID } from "node:crypto";
import type { FindOptionsWhere, Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AdminIssueQueryDto, AdminIssueRunnerResultDto, ClaimAdminIssueDto, CreateAdminIssueDto, TriageAdminIssueDto } from "./dto/admin-issue.dto";
import { AdminIssueReportEntity } from "./entities/admin-issue-report.entity";

@Injectable()
export class AdminIssuesService {
  constructor(@InjectRepository(AdminIssueReportEntity) private readonly repository: Repository<AdminIssueReportEntity>) {}

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateAdminIssueDto) {
    const issue = this.repository.create({
      tenantId: scope.tenantId, parkId: scope.parkId, issueNo: this.issueNo(),
      title: dto.title, description: dto.description, severity: dto.severity,
      route: dto.route, url: dto.url ?? null, moduleCode: dto.module_code ?? null,
      reporterId: actor.sub, reporterName: actor.realName || actor.username,
      clientContext: this.safeContext(dto.client_context), status: "OPEN", runnerStatus: "NONE",
      acceptanceCriteria: null, approvedBy: null, approvedAt: null, runnerId: null,
      leaseToken: null, leaseExpiresAt: null, implementationCommit: null, changedFiles: [],
      validationEvidence: {}, releaseEvidence: {}, resolutionSummary: null,
      createBy: actor.sub, updateBy: actor.sub, remark: null
    });
    return this.repository.save(issue);
  }

  listMine(scope: TenantParkScope, actor: JwtPrincipal, query: AdminIssueQueryDto) {
    return this.listWhere(scope, query, { reporterId: actor.sub });
  }

  list(scope: TenantParkScope, query: AdminIssueQueryDto) {
    return this.listWhere(scope, query, {});
  }

  async detail(scope: TenantParkScope, issueNo: string, actor?: JwtPrincipal) {
    const issue = await this.find(scope, issueNo);
    if (actor && issue.reporterId !== actor.sub && !actor.permissions.includes("admin_issue:read") && !actor.isSuper) {
      throw new NotFoundException("问题记录不存在");
    }
    return issue;
  }

  async triage(scope: TenantParkScope, actor: JwtPrincipal, issueNo: string, dto: TriageAdminIssueDto) {
    const issue = await this.find(scope, issueNo);
    if (["RELEASED", "CLOSED"].includes(issue.status)) throw new ConflictException("已发布或关闭的问题不能重新分类");
    if (dto.status === "APPROVED" && !dto.acceptance_criteria?.trim() && !issue.acceptanceCriteria) {
      throw new BadRequestException("批准 Runner 修复前必须填写验收标准");
    }
    issue.status = dto.status;
    issue.moduleCode = dto.module_code ?? issue.moduleCode;
    issue.acceptanceCriteria = dto.acceptance_criteria ?? issue.acceptanceCriteria;
    issue.remark = dto.note ?? issue.remark;
    issue.updateBy = actor.sub;
    if (dto.status === "APPROVED") {
      issue.runnerStatus = "READY";
      issue.approvedBy = actor.sub;
      issue.approvedAt = new Date();
    } else if (dto.status === "REJECTED") {
      issue.runnerStatus = "NONE";
    }
    return this.repository.save(issue);
  }

  async ready(scope: TenantParkScope, limit = 10) {
    return this.repository.createQueryBuilder("issue")
      .where("issue.tenant_id = :tenantId AND issue.park_id = :parkId AND issue.is_deleted = false", scope)
      .andWhere("((issue.status = 'APPROVED' AND issue.runner_status = 'READY') OR (issue.status = 'IN_PROGRESS' AND issue.runner_status = 'CLAIMED' AND issue.lease_expires_at <= now()))")
      .orderBy("issue.create_time", "ASC")
      .take(Math.min(Math.max(limit, 1), 25))
      .getMany();
  }

  claim(scope: TenantParkScope, actor: JwtPrincipal, issueNo: string, dto: ClaimAdminIssueDto) {
    return this.repository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(AdminIssueReportEntity);
      const issue = await repo.createQueryBuilder("issue").setLock("pessimistic_write")
        .where("issue.tenant_id = :tenantId AND issue.park_id = :parkId AND issue.issue_no = :issueNo AND issue.is_deleted = false", { ...scope, issueNo })
        .getOne();
      if (!issue) throw new NotFoundException("问题记录不存在");
      const expiredClaim = issue.status === "IN_PROGRESS" && issue.runnerStatus === "CLAIMED" && Boolean(issue.leaseExpiresAt && issue.leaseExpiresAt <= new Date());
      if (!expiredClaim && (issue.status !== "APPROVED" || issue.runnerStatus !== "READY")) throw new ConflictException("问题不在可领取状态");
      issue.status = "IN_PROGRESS"; issue.runnerStatus = "CLAIMED"; issue.runnerId = dto.runner_id;
      issue.leaseToken = randomUUID(); issue.leaseExpiresAt = new Date(Date.now() + 15 * 60_000); issue.updateBy = actor.sub;
      return repo.save(issue);
    });
  }

  async recordResult(scope: TenantParkScope, actor: JwtPrincipal, issueNo: string, dto: AdminIssueRunnerResultDto) {
    const issue = await this.find(scope, issueNo);
    if (issue.leaseToken !== dto.lease_token || !issue.leaseExpiresAt || issue.leaseExpiresAt <= new Date()) throw new ConflictException("Runner 租约无效或已过期");
    if (["WAITING_REVIEW", "SUCCEEDED"].includes(dto.runner_status)) {
      if (!dto.implementation_commit || !dto.changed_files?.length || !this.hasPassedEvidence(dto.validation_evidence)) {
        throw new BadRequestException("完成回写必须包含实现提交、变更文件和通过的验证证据");
      }
    }
    if (dto.runner_status === "SUCCEEDED" && !this.hasPassedEvidence(dto.release_evidence)) {
      throw new BadRequestException("发布完成必须包含 CI、部署和生产检查通过证据");
    }
    issue.runnerStatus = dto.runner_status;
    issue.status = dto.runner_status === "SUCCEEDED" ? "RELEASED" : dto.runner_status === "WAITING_REVIEW" ? "VERIFIED" : "IN_PROGRESS";
    issue.implementationCommit = dto.implementation_commit ?? issue.implementationCommit;
    issue.changedFiles = (dto.changed_files ?? issue.changedFiles).slice(0, 200);
    issue.validationEvidence = dto.validation_evidence ?? issue.validationEvidence;
    issue.releaseEvidence = dto.release_evidence ?? issue.releaseEvidence;
    issue.resolutionSummary = dto.summary; issue.updateBy = actor.sub;
    issue.leaseToken = null; issue.leaseExpiresAt = null;
    return this.repository.save(issue);
  }

  private async listWhere(scope: TenantParkScope, query: AdminIssueQueryDto, extra: FindOptionsWhere<AdminIssueReportEntity>): Promise<PaginatedResult<AdminIssueReportEntity>> {
    const where: FindOptionsWhere<AdminIssueReportEntity> = { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, ...(query.status ? { status: query.status as AdminIssueReportEntity["status"] } : {}), ...extra };
    const [items, total] = await this.repository.findAndCount({ where, order: { createTime: "DESC" }, skip: (query.page - 1) * query.page_size, take: query.page_size });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  private async find(scope: TenantParkScope, issueNo: string) {
    const issue = await this.repository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, issueNo, isDeleted: false } });
    if (!issue) throw new NotFoundException("问题记录不存在");
    return issue;
  }

  private issueNo() { return `SP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`; }
  private safeContext(value?: Record<string, unknown>) {
    const text = JSON.stringify(value ?? {});
    if (text.length <= 20_000) return JSON.parse(text) as Record<string, unknown>;
    return { truncated: true, preview: text.slice(0, 19_500) };
  }
  private hasPassedEvidence(value?: Record<string, unknown>) { return value?.status === "PASS" || value?.conclusion === "SUCCESS"; }
}
