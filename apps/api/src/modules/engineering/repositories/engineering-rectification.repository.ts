import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { buildEngineeringRectificationCodePrefix, nextEngineeringRectificationCode } from "../domain/engineering-rectification-code.policy";
import { EngineeringIssueSeverity, EngineeringRectificationStatus } from "../domain/engineering-project.enums";
import { EngineeringRectificationEntity } from "../entities/engineering-rectification.entity";

export interface EngineeringRectificationQuery {
  project_id?: string;
  issue_id?: string;
  inspection_id?: string;
  keyword?: string;
  status?: EngineeringRectificationStatus | "";
  severity?: EngineeringIssueSeverity | "";
  responsible_user_id?: string;
  responsible_org_id?: string;
  contractor_org_id?: string;
  deadline_from?: string;
  deadline_to?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export interface CreateEngineeringRectificationInput {
  orgId?: string | null;
  projectId: string;
  issueId?: string | null;
  inspectionId?: string | null;
  rectificationCode?: string;
  rectificationTitle: string;
  description: string;
  severity: EngineeringIssueSeverity;
  responsibleUserId?: string | null;
  responsibleOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  deadline?: string | null;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringRectificationInput {
  rectificationTitle?: string;
  description?: string;
  severity?: EngineeringIssueSeverity;
  responsibleUserId?: string | null;
  responsibleOrgId?: string | null;
  contractorOrgId?: string | null;
  supervisorOrgId?: string | null;
  locationText?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  spaceId?: string | null;
  deadline?: string | null;
  feedback?: string | null;
  recheckComment?: string | null;
  attachmentIds?: string[] | null;
  remark?: string | null;
}

export interface UpdateEngineeringRectificationStatusInput {
  status: EngineeringRectificationStatus;
  startedAt?: Date | null;
  submittedAt?: Date | null;
  submittedBy?: string | null;
  feedback?: string | null;
  recheckedAt?: Date | null;
  recheckedBy?: string | null;
  recheckComment?: string | null;
  closedAt?: Date | null;
  closedBy?: string | null;
}

export interface EngineeringRectificationCountRow<T extends string> {
  key: T;
  count: number;
}

const DEFAULT_SORT_COLUMN = "rectification.deadline";
const SORT_COLUMN_MAP: Record<string, string> = {
  rectification_code: "rectification.rectification_code",
  deadline: "rectification.deadline",
  status: "rectification.status",
  severity: "rectification.severity",
  create_time: "rectification.create_time",
  update_time: "rectification.update_time"
};

@Injectable()
export class EngineeringRectificationRepository {
  constructor(
    @InjectRepository(EngineeringRectificationEntity)
    private readonly repository: Repository<EngineeringRectificationEntity>
  ) {}

  async createRectification(
    scope: TenantParkScope,
    actorId: string | null,
    input: CreateEngineeringRectificationInput
  ): Promise<EngineeringRectificationEntity> {
    const rectificationCode = input.rectificationCode ?? (await this.generateRectificationCode(scope.tenantId));
    if (await this.existsByCode(scope, rectificationCode)) {
      throw new ConflictException("Engineering rectification code already exists");
    }
    const entity = this.repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      orgId: input.orgId ?? null,
      projectId: input.projectId,
      issueId: input.issueId ?? null,
      inspectionId: input.inspectionId ?? null,
      rectificationCode,
      rectificationTitle: input.rectificationTitle,
      description: input.description,
      severity: input.severity,
      status: EngineeringRectificationStatus.PENDING,
      responsibleUserId: input.responsibleUserId ?? null,
      responsibleOrgId: input.responsibleOrgId ?? null,
      contractorOrgId: input.contractorOrgId ?? null,
      supervisorOrgId: input.supervisorOrgId ?? null,
      locationText: input.locationText ?? null,
      buildingId: input.buildingId ?? null,
      floorId: input.floorId ?? null,
      spaceId: input.spaceId ?? null,
      deadline: input.deadline ?? null,
      startedAt: null,
      submittedAt: null,
      submittedBy: null,
      feedback: null,
      recheckedAt: null,
      recheckedBy: null,
      recheckComment: null,
      closedAt: null,
      closedBy: null,
      attachmentIds: input.attachmentIds ?? null,
      remark: input.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.repository.save(entity);
  }

  async findById(
    scope: TenantParkScope,
    id: string,
    applyScope?: (builder: SelectQueryBuilder<EngineeringRectificationEntity>) => Promise<void> | void
  ): Promise<EngineeringRectificationEntity> {
    const builder = this.createScopedQueryBuilder(scope).andWhere("rectification.id = :id", { id });
    await applyScope?.(builder);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Engineering rectification not found");
    return entity;
  }

  async findByIssueId(scope: TenantParkScope, issueId: string): Promise<EngineeringRectificationEntity | null> {
    return this.createScopedQueryBuilder(scope).andWhere("rectification.issue_id = :issueId", { issueId }).getOne();
  }

  async paginateRectifications(
    scope: TenantParkScope,
    query: EngineeringRectificationQuery,
    applyScope?: (builder: SelectQueryBuilder<EngineeringRectificationEntity>) => Promise<void> | void
  ): Promise<PaginatedResult<EngineeringRectificationEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.createScopedQueryBuilder(scope);
    this.applyQuery(builder, query);
    await applyScope?.(builder);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total, page, page_size: pageSize };
  }

  async updateRectification(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringRectificationInput
  ): Promise<EngineeringRectificationEntity> {
    const entity = await this.findById(scope, id);
    Object.assign(entity, { ...input, updateBy: actorId });
    return this.repository.save(entity);
  }

  async updateStatus(
    scope: TenantParkScope,
    actorId: string | null,
    id: string,
    input: UpdateEngineeringRectificationStatusInput
  ): Promise<EngineeringRectificationEntity> {
    const entity = await this.findById(scope, id);
    Object.assign(entity, { ...input, updateBy: actorId });
    return this.repository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string | null, id: string): Promise<{ id: string }> {
    const entity = await this.findById(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.repository.save(entity);
    return { id };
  }

  async existsByCode(scope: Pick<TenantParkScope, "tenantId">, rectificationCode: string): Promise<boolean> {
    return this.repository.exists({ where: { tenantId: scope.tenantId, rectificationCode, isDeleted: false } });
  }

  async countByStatus(scope: TenantParkScope): Promise<EngineeringRectificationCountRow<EngineeringRectificationStatus>[]> {
    const rows = await this.createScopedQueryBuilder(scope)
      .select("rectification.status", "key")
      .addSelect("COUNT(rectification.id)", "count")
      .groupBy("rectification.status")
      .orderBy("rectification.status", "ASC")
      .getRawMany<{ key: EngineeringRectificationStatus; count: string }>();
    return rows.map((row) => ({ key: row.key, count: Number(row.count) }));
  }

  async findOverdueCandidates(
    scope: TenantParkScope,
    today: string,
    applyScope?: (builder: SelectQueryBuilder<EngineeringRectificationEntity>) => Promise<void> | void
  ): Promise<EngineeringRectificationEntity[]> {
    const builder = this.createScopedQueryBuilder(scope)
      .andWhere("rectification.deadline IS NOT NULL")
      .andWhere("rectification.deadline < :today", { today })
      .andWhere("rectification.status NOT IN (:...closedStatuses)", {
        closedStatuses: [EngineeringRectificationStatus.CLOSED, EngineeringRectificationStatus.PASSED, EngineeringRectificationStatus.OVERDUE]
      })
      .orderBy("rectification.deadline", "ASC");
    await applyScope?.(builder);
    return builder.getMany();
  }

  async generateRectificationCode(tenantId: string, date: Date = new Date()): Promise<string> {
    const prefix = buildEngineeringRectificationCodePrefix(date);
    const row = await this.repository
      .createQueryBuilder("rectification")
      .select("rectification.rectification_code", "rectificationCode")
      .where("rectification.tenant_id = :tenantId", { tenantId })
      .andWhere("rectification.rectification_code LIKE :prefix", { prefix: `${prefix}%` })
      .andWhere("rectification.is_deleted = false")
      .orderBy("rectification.rectification_code", "DESC")
      .limit(1)
      .getRawOne<{ rectificationCode?: string }>();
    return nextEngineeringRectificationCode(date, row?.rectificationCode ?? null);
  }

  createScopedQueryBuilder(scope: TenantParkScope): SelectQueryBuilder<EngineeringRectificationEntity> {
    return this.repository
      .createQueryBuilder("rectification")
      .where("rectification.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rectification.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rectification.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<EngineeringRectificationEntity>, query: EngineeringRectificationQuery): void {
    if (query.project_id) builder.andWhere("rectification.project_id = :projectId", { projectId: query.project_id });
    if (query.issue_id) builder.andWhere("rectification.issue_id = :issueId", { issueId: query.issue_id });
    if (query.inspection_id) builder.andWhere("rectification.inspection_id = :inspectionId", { inspectionId: query.inspection_id });
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("rectification.rectification_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("rectification.rectification_title ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("rectification.description ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.status) builder.andWhere("rectification.status = :status", { status: query.status });
    if (query.severity) builder.andWhere("rectification.severity = :severity", { severity: query.severity });
    if (query.responsible_user_id) builder.andWhere("rectification.responsible_user_id = :responsibleUserId", { responsibleUserId: query.responsible_user_id });
    if (query.responsible_org_id) builder.andWhere("rectification.responsible_org_id = :responsibleOrgId", { responsibleOrgId: query.responsible_org_id });
    if (query.contractor_org_id) builder.andWhere("rectification.contractor_org_id = :contractorOrgId", { contractorOrgId: query.contractor_org_id });
    if (query.deadline_from) builder.andWhere("rectification.deadline >= :deadlineFrom", { deadlineFrom: query.deadline_from });
    if (query.deadline_to) builder.andWhere("rectification.deadline <= :deadlineTo", { deadlineTo: query.deadline_to });
  }

  private applySort(builder: SelectQueryBuilder<EngineeringRectificationEntity>, sort?: string): void {
    if (!sort) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "ASC").addOrderBy("rectification.create_time", "DESC");
      return;
    }
    const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction as "ASC" | "DESC").addOrderBy("rectification.create_time", "DESC");
  }
}
