import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import type { CreateLeasingFollowDto } from "./dto/create-leasing-follow.dto";
import type { CreateLeasingLeadDto } from "./dto/create-leasing-lead.dto";
import type { CreateLeasingVisitDto } from "./dto/create-leasing-visit.dto";
import type { LeasingLeadQueryDto } from "./dto/leasing-lead-query.dto";
import type { UpdateLeasingFollowDto } from "./dto/update-leasing-follow.dto";
import type { UpdateLeasingLeadDto } from "./dto/update-leasing-lead.dto";
import type { UpdateLeasingVisitDto } from "./dto/update-leasing-visit.dto";
import { LeasingFollowEntity } from "./entities/leasing-follow.entity";
import { LeasingLeadEntity } from "./entities/leasing-lead.entity";
import { LeasingVisitEntity } from "./entities/leasing-visit.entity";

const SORT_COLUMNS = new Set([
  "leadCode",
  "customerName",
  "status",
  "source",
  "intentionLevel",
  "followUserName",
  "lastFollowTime",
  "nextFollowTime",
  "expectedCloseDate",
  "updateTime",
  "createTime"
]);

@Injectable()
export class LeasingLeadsService {
  constructor(
    @InjectRepository(LeasingLeadEntity)
    private readonly leadsRepository: Repository<LeasingLeadEntity>,
    @InjectRepository(LeasingFollowEntity)
    private readonly followsRepository: Repository<LeasingFollowEntity>,
    @InjectRepository(LeasingVisitEntity)
    private readonly visitsRepository: Repository<LeasingVisitEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: LeasingLeadQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingLeadEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_lead", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingLeadEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_lead", entity);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateLeasingLeadDto): Promise<LeasingLeadEntity> {
    const leadCode = await this.resolveLeadCode(scope, actor.sub, dto.leadCode);
    await this.assertLeadCodeAvailable(scope, leadCode);
    await this.assertDuplicateLeadAvailable(scope, dto.customerName, dto.contactMobile);
    await this.validateDictionaryValues(scope, dto);
    const followUser = await this.resolveFollowUser(scope, actor, dto.followUserId, dto.followUserName);
    const parkTenantId = await this.resolveParkTenant(scope, dto.parkTenantId);
    const isInPool = dto.isInPool ?? false;
    const entity = this.leadsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: leadCode,
      leadCode,
      customerName: dto.customerName.trim(),
      contactName: dto.contactName.trim(),
      contactMobile: dto.contactMobile.trim(),
      contactEmail: this.emptyToNull(dto.contactEmail),
      source: dto.source ?? "manual",
      channelName: this.emptyToNull(dto.channelName),
      industryCode: this.emptyToNull(dto.industryCode),
      industryDetail: this.emptyToNull(dto.industryDetail),
      demandArea: this.numberToDecimal(dto.demandArea),
      demandPrice: this.numberToDecimal(dto.demandPrice),
      demandUnitType: this.emptyToNull(dto.demandUnitType),
      intentionLevel: this.emptyToNull(dto.intentionLevel),
      followUserId: followUser.id,
      followUserName: followUser.name,
      parkTenantId,
      status: dto.status ?? "10",
      lostReason: this.emptyToNull(dto.lostReason),
      lostRemark: this.emptyToNull(dto.lostRemark),
      lastFollowTime: this.dateToNullable(dto.lastFollowTime),
      nextFollowTime: this.dateToNullable(dto.nextFollowTime),
      expectedCloseDate: dto.expectedCloseDate ?? null,
      isInPool,
      poolEnterTime: isInPool ? this.dateToNullable(dto.poolEnterTime) ?? new Date() : null,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.leadsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_lead", saved);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateLeasingLeadDto): Promise<LeasingLeadEntity> {
    const entity = await this.findOne(scope, id, actor);
    await this.validateDictionaryValues(scope, dto);
    if (dto.leadCode && dto.leadCode !== entity.leadCode) {
      await this.assertLeadCodeAvailable(scope, dto.leadCode, id);
      entity.leadCode = dto.leadCode;
      entity.code = dto.leadCode;
    }
    const nextCustomerName = dto.customerName?.trim() ?? entity.customerName;
    const nextContactMobile = dto.contactMobile?.trim() ?? entity.contactMobile;
    if (nextCustomerName !== entity.customerName || nextContactMobile !== entity.contactMobile) {
      await this.assertDuplicateLeadAvailable(scope, nextCustomerName, nextContactMobile, id);
    }
    if (dto.customerName !== undefined) entity.customerName = dto.customerName.trim();
    if (dto.contactName !== undefined) entity.contactName = dto.contactName.trim();
    if (dto.contactMobile !== undefined) entity.contactMobile = dto.contactMobile.trim();
    if (dto.contactEmail !== undefined) entity.contactEmail = this.emptyToNull(dto.contactEmail);
    if (dto.source !== undefined) entity.source = dto.source;
    if (dto.channelName !== undefined) entity.channelName = this.emptyToNull(dto.channelName);
    if (dto.industryCode !== undefined) entity.industryCode = this.emptyToNull(dto.industryCode);
    if (dto.industryDetail !== undefined) entity.industryDetail = this.emptyToNull(dto.industryDetail);
    if (dto.demandArea !== undefined) entity.demandArea = this.numberToDecimal(dto.demandArea);
    if (dto.demandPrice !== undefined) entity.demandPrice = this.numberToDecimal(dto.demandPrice);
    if (dto.demandUnitType !== undefined) entity.demandUnitType = this.emptyToNull(dto.demandUnitType);
    if (dto.intentionLevel !== undefined) entity.intentionLevel = this.emptyToNull(dto.intentionLevel);
    if (dto.followUserId !== undefined || dto.followUserName !== undefined) {
      const followUser = await this.resolveFollowUser(scope, actor, dto.followUserId, dto.followUserName);
      entity.followUserId = followUser.id;
      entity.followUserName = followUser.name;
    }
    if (dto.parkTenantId !== undefined) entity.parkTenantId = await this.resolveParkTenant(scope, dto.parkTenantId);
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.lostReason !== undefined) entity.lostReason = this.emptyToNull(dto.lostReason);
    if (dto.lostRemark !== undefined) entity.lostRemark = this.emptyToNull(dto.lostRemark);
    if (dto.lastFollowTime !== undefined) entity.lastFollowTime = this.dateToNullable(dto.lastFollowTime);
    if (dto.nextFollowTime !== undefined) entity.nextFollowTime = this.dateToNullable(dto.nextFollowTime);
    if (dto.expectedCloseDate !== undefined) entity.expectedCloseDate = dto.expectedCloseDate;
    if (dto.isInPool !== undefined) {
      entity.isInPool = dto.isInPool;
      entity.poolEnterTime = dto.isInPool ? entity.poolEnterTime ?? this.dateToNullable(dto.poolEnterTime) ?? new Date() : null;
    } else if (dto.poolEnterTime !== undefined) {
      entity.poolEnterTime = this.dateToNullable(dto.poolEnterTime);
    }
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;
    const saved = await this.leadsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_lead", saved);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.leadsRepository.save(entity);
    return { id };
  }

  async listFollows(scope: TenantParkScope, actor: JwtPrincipal, leadId: string): Promise<LeasingFollowEntity[]> {
    await this.findOne(scope, leadId, actor);
    return this.followsRepository
      .createQueryBuilder("follow")
      .where("follow.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("follow.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("follow.lead_id = :leadId", { leadId })
      .andWhere("follow.is_deleted = false")
      .orderBy("follow.follow_time", "DESC")
      .addOrderBy("follow.create_time", "DESC")
      .getMany();
  }

  async createFollow(scope: TenantParkScope, actor: JwtPrincipal, leadId: string, dto: CreateLeasingFollowDto): Promise<LeasingFollowEntity> {
    const lead = await this.findOne(scope, leadId, actor);
    await this.assertDictValue(scope, "leasing_follow_type", dto.followType);
    const attachmentFileIds = await this.resolveAttachmentFileIds(scope, dto.attachmentFileIds);
    const followTime = this.dateToNullable(dto.followTime) ?? new Date();
    const nextFollowTime = this.dateToNullable(dto.nextFollowTime);
    let saved!: LeasingFollowEntity;
    await this.leadsRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(LeasingFollowEntity).save(
        manager.getRepository(LeasingFollowEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leadId: lead.id,
          followTime,
          followUserId: actor.sub,
          followUserName: actor.realName ?? actor.username,
          followType: this.emptyToNull(dto.followType),
          content: dto.content.trim(),
          nextAction: this.emptyToNull(dto.nextAction),
          nextFollowTime,
          attachmentFileIds,
          remark: this.emptyToNull(dto.remark),
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
      lead.lastFollowTime = followTime;
      if (nextFollowTime) {
        lead.nextFollowTime = nextFollowTime;
      }
      lead.updateBy = actor.sub;
      await manager.getRepository(LeasingLeadEntity).save(lead);
    });
    return saved;
  }

  async updateFollow(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leadId: string,
    followId: string,
    dto: UpdateLeasingFollowDto
  ): Promise<LeasingFollowEntity> {
    const lead = await this.findOne(scope, leadId, actor);
    const follow = await this.findFollow(scope, leadId, followId);
    await this.assertDictValue(scope, "leasing_follow_type", dto.followType);
    if (dto.followTime !== undefined) follow.followTime = this.dateToNullable(dto.followTime) ?? follow.followTime;
    if (dto.followType !== undefined) follow.followType = this.emptyToNull(dto.followType);
    if (dto.content !== undefined) follow.content = dto.content.trim();
    if (dto.nextAction !== undefined) follow.nextAction = this.emptyToNull(dto.nextAction);
    if (dto.nextFollowTime !== undefined) follow.nextFollowTime = this.dateToNullable(dto.nextFollowTime);
    if (dto.attachmentFileIds !== undefined) follow.attachmentFileIds = await this.resolveAttachmentFileIds(scope, dto.attachmentFileIds);
    if (dto.remark !== undefined) follow.remark = this.emptyToNull(dto.remark);
    follow.updateBy = actor.sub;
    let saved!: LeasingFollowEntity;
    await this.leadsRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(LeasingFollowEntity).save(follow);
      await this.syncLeadFollowTimes(scope, lead, actor.sub, manager, dto.nextFollowTime !== undefined ? follow.nextFollowTime : undefined);
    });
    return saved;
  }

  async softDeleteFollow(scope: TenantParkScope, actor: JwtPrincipal, leadId: string, followId: string): Promise<{ id: string }> {
    const lead = await this.findOne(scope, leadId, actor);
    const follow = await this.findFollow(scope, leadId, followId);
    follow.isDeleted = true;
    follow.updateBy = actor.sub;
    await this.leadsRepository.manager.transaction(async (manager) => {
      await manager.getRepository(LeasingFollowEntity).save(follow);
      await this.syncLeadFollowTimes(scope, lead, actor.sub, manager);
    });
    return { id: followId };
  }

  async listVisits(scope: TenantParkScope, actor: JwtPrincipal, leadId: string): Promise<LeasingVisitEntity[]> {
    await this.findOne(scope, leadId, actor);
    return this.visitsRepository
      .createQueryBuilder("visit")
      .where("visit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("visit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("visit.lead_id = :leadId", { leadId })
      .andWhere("visit.is_deleted = false")
      .orderBy("visit.visit_time", "DESC")
      .addOrderBy("visit.create_time", "DESC")
      .getMany();
  }

  async createVisit(scope: TenantParkScope, actor: JwtPrincipal, leadId: string, dto: CreateLeasingVisitDto): Promise<LeasingVisitEntity> {
    const lead = await this.findOne(scope, leadId, actor);
    const unitIds = await this.resolveVisitUnitIds(scope, actor, dto.unitIds);
    const photoFileIds = await this.resolveVisitPhotoFileIds(scope, dto.photoFileIds);
    const receptionUser = await this.resolveReceptionUser(scope, actor, dto.receptionUserId, dto.receptionUserName);
    const visitTime = this.dateToNullable(dto.visitTime) ?? new Date();
    let saved!: LeasingVisitEntity;
    await this.leadsRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(LeasingVisitEntity).save(
        manager.getRepository(LeasingVisitEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          leadId: lead.id,
          visitTime,
          visitorCount: dto.visitorCount ?? 1,
          receptionUserId: receptionUser.id,
          receptionUserName: receptionUser.name,
          unitIds,
          visitResult: this.emptyToNull(dto.visitResult),
          photoFileIds,
          remark: this.emptyToNull(dto.remark),
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
      if (dto.advanceStatus) {
        await this.advanceLeadToVisitedStatus(scope, lead, actor.sub, manager);
      }
    });
    return saved;
  }

  async updateVisit(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leadId: string,
    visitId: string,
    dto: UpdateLeasingVisitDto
  ): Promise<LeasingVisitEntity> {
    const lead = await this.findOne(scope, leadId, actor);
    const visit = await this.findVisit(scope, leadId, visitId);
    if (dto.visitTime !== undefined) visit.visitTime = this.dateToNullable(dto.visitTime) ?? visit.visitTime;
    if (dto.visitorCount !== undefined) visit.visitorCount = dto.visitorCount;
    if (dto.receptionUserId !== undefined || dto.receptionUserName !== undefined) {
      const receptionUser = await this.resolveReceptionUser(scope, actor, dto.receptionUserId, dto.receptionUserName);
      visit.receptionUserId = receptionUser.id;
      visit.receptionUserName = receptionUser.name;
    }
    if (dto.unitIds !== undefined) visit.unitIds = await this.resolveVisitUnitIds(scope, actor, dto.unitIds);
    if (dto.visitResult !== undefined) visit.visitResult = this.emptyToNull(dto.visitResult);
    if (dto.photoFileIds !== undefined) visit.photoFileIds = await this.resolveVisitPhotoFileIds(scope, dto.photoFileIds);
    if (dto.remark !== undefined) visit.remark = this.emptyToNull(dto.remark);
    visit.updateBy = actor.sub;
    let saved!: LeasingVisitEntity;
    await this.leadsRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(LeasingVisitEntity).save(visit);
      if (dto.advanceStatus) {
        await this.advanceLeadToVisitedStatus(scope, lead, actor.sub, manager);
      }
    });
    return saved;
  }

  async softDeleteVisit(scope: TenantParkScope, actor: JwtPrincipal, leadId: string, visitId: string): Promise<{ id: string }> {
    await this.findOne(scope, leadId, actor);
    const visit = await this.findVisit(scope, leadId, visitId);
    visit.isDeleted = true;
    visit.updateBy = actor.sub;
    await this.visitsRepository.save(visit);
    return { id: visitId };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<LeasingLeadEntity> {
    return this.leadsRepository
      .createQueryBuilder("lead")
      .where("lead.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("lead.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("lead.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<LeasingLeadEntity> {
    const builder = this.scopedBuilder(scope).andWhere("lead.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Leasing lead not found");
    }
    return entity;
  }

  private async findFollow(scope: TenantParkScope, leadId: string, followId: string): Promise<LeasingFollowEntity> {
    const entity = await this.followsRepository
      .createQueryBuilder("follow")
      .where("follow.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("follow.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("follow.lead_id = :leadId", { leadId })
      .andWhere("follow.id = :followId", { followId })
      .andWhere("follow.is_deleted = false")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Leasing follow not found");
    }
    return entity;
  }

  private async findVisit(scope: TenantParkScope, leadId: string, visitId: string): Promise<LeasingVisitEntity> {
    const entity = await this.visitsRepository
      .createQueryBuilder("visit")
      .where("visit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("visit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("visit.lead_id = :leadId", { leadId })
      .andWhere("visit.id = :visitId", { visitId })
      .andWhere("visit.is_deleted = false")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Leasing visit not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<LeasingLeadEntity>, query: LeasingLeadQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("lead.lead_code ILIKE :keyword")
            .orWhere("lead.customer_name ILIKE :keyword")
            .orWhere("lead.contact_name ILIKE :keyword")
            .orWhere("lead.contact_mobile ILIKE :keyword")
            .orWhere("lead.channel_name ILIKE :keyword");
        })
      ).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.status) builder.andWhere("lead.status = :status", { status: query.status });
    if (query.source) builder.andWhere("lead.source = :source", { source: query.source });
    if (query.intention_level) builder.andWhere("lead.intention_level = :intentionLevel", { intentionLevel: query.intention_level });
    if (query.follow_user_id) builder.andWhere("lead.follow_user_id = :followUserId", { followUserId: query.follow_user_id });
    if (query.is_in_pool !== undefined) builder.andWhere("lead.is_in_pool = :isInPool", { isInPool: query.is_in_pool });
    if (query.start_date) builder.andWhere("lead.create_time >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("lead.create_time < (:endDate::date + interval '1 day')", { endDate: query.end_date });
  }

  private applySort(builder: SelectQueryBuilder<LeasingLeadEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("lead.updateTime", "DESC").addOrderBy("lead.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("lead.updateTime", "DESC").addOrderBy("lead.createTime", "DESC");
      return;
    }
    builder.orderBy(`lead.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<LeasingLeadEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (actor) {
      await Promise.all([
        this.dataScopeService.buildScopeFilter(actor, "park"),
        this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
        this.dataScopeService.buildScopeFilter(actor, "customer_owner")
      ]);
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "customer_owner", "lead", { owner: "follow_user_id" });
  }

  private async resolveLeadCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateNext(scope, actorId, "LEASING_LEAD_CODE");
    return generated.code;
  }

  private async assertLeadCodeAvailable(scope: TenantParkScope, code: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope).andWhere("lead.lead_code = :code", { code });
    if (excludeId) builder.andWhere("lead.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Leasing lead code already exists");
    }
  }

  private async assertDuplicateLeadAvailable(scope: TenantParkScope, customerName: string, contactMobile: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope)
      .andWhere("lead.customer_name = :customerName", { customerName: customerName.trim() })
      .andWhere("lead.contact_mobile = :contactMobile", { contactMobile: contactMobile.trim() });
    if (excludeId) builder.andWhere("lead.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Duplicate leasing lead exists for this customer and mobile");
    }
  }

  private async resolveFollowUser(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    followUserId?: string,
    followUserName?: string
  ): Promise<{ id: string; name: string }> {
    if (!followUserId || !this.canAssignLead(actor)) {
      return { id: actor.sub, name: actor.realName ?? actor.username };
    }
    const user = await this.usersRepository.findOne({
      where: { id: followUserId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!user) {
      throw new NotFoundException("Follow user not found");
    }
    return { id: user.id, name: user.displayName || user.username || followUserName || actor.username };
  }

  private canAssignLead(actor: JwtPrincipal): boolean {
    return Boolean(
      actor.isSuper ||
        actor.permissions.includes("*") ||
        actor.roles?.some((role) => ["SUPER_ADMIN", "OPERATIONS_OWNER", "INVEST_MANAGER"].includes(role))
    );
  }

  private async resolveParkTenant(scope: TenantParkScope, parkTenantId?: string): Promise<string | null> {
    if (!parkTenantId) return null;
    const exists = await this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.id = :parkTenantId", { parkTenantId })
      .andWhere("parkTenant.is_deleted = false")
      .getExists();
    if (!exists) {
      throw new NotFoundException("Park tenant not found");
    }
    return parkTenantId;
  }

  private async validateDictionaryValues(scope: TenantParkScope, dto: Partial<CreateLeasingLeadDto>): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "leasing_lead_status", dto.status),
      this.assertDictValue(scope, "leasing_lead_source", dto.source),
      this.assertDictValue(scope, "leasing_intention_level", dto.intentionLevel),
      this.assertDictValue(scope, "unit_usage_type", dto.demandUnitType),
      this.assertDictValue(scope, "industry_code", dto.industryCode)
    ]);
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, rawValue?: string): Promise<void> {
    const value = rawValue?.trim();
    if (!value) return;
    const exists = await this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictItem.status = :status", { status: "enabled" })
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode })
      .andWhere("dictType.status = :status", { status: "enabled" })
      .andWhere("dictType.is_deleted = false")
      .andWhere("dictItem.item_value = :value", { value })
      .getExists();
    if (!exists) {
      throw new BadRequestException(`${dictCode} value is not enabled`);
    }
  }

  private async resolveAttachmentFileIds(scope: TenantParkScope, fileIds: string[] | undefined): Promise<string[]> {
    const ids = [...new Set((fileIds ?? []).map((fileId) => fileId.trim()).filter(Boolean))];
    if (ids.length === 0) return [];
    const count = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id IN (:...ids)", { ids })
      .andWhere("file.biz_type = :bizType", { bizType: "leasing_follow" })
      .andWhere("file.is_deleted = false")
      .getCount();
    if (count !== ids.length) {
      throw new BadRequestException("attachment_file_ids must be valid leasing_follow files in current scope");
    }
    return ids;
  }

  private async resolveVisitPhotoFileIds(scope: TenantParkScope, fileIds: string[] | undefined): Promise<string[]> {
    const ids = [...new Set((fileIds ?? []).map((fileId) => fileId.trim()).filter(Boolean))];
    if (ids.length === 0) return [];
    const count = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id IN (:...ids)", { ids })
      .andWhere("file.biz_type = :bizType", { bizType: "leasing_visit" })
      .andWhere("file.is_deleted = false")
      .getCount();
    if (count !== ids.length) {
      throw new BadRequestException("photo_file_ids must be valid leasing_visit files in current scope");
    }
    return ids;
  }

  private async resolveVisitUnitIds(scope: TenantParkScope, actor: JwtPrincipal, unitIds: string[] | undefined): Promise<string[]> {
    const ids = [...new Set((unitIds ?? []).map((unitId) => unitId.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new BadRequestException("unit_ids must contain at least one unit");
    }
    const builder = this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.id IN (:...ids)", { ids })
      .andWhere("unit.status = 1")
      .andWhere("unit.is_deleted = false");
    await this.applyUnitLookupDataScope(builder, actor);
    const units = await builder.getMany();
    if (units.length !== ids.length) {
      throw new BadRequestException("unit_ids contain units that do not exist or are outside current scope");
    }
    return ids;
  }

  private async resolveReceptionUser(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    receptionUserId?: string,
    receptionUserName?: string
  ): Promise<{ id: string; name: string }> {
    if (!receptionUserId || !this.canAssignLead(actor)) {
      return { id: actor.sub, name: actor.realName ?? actor.username };
    }
    const user = await this.usersRepository.findOne({
      where: { id: receptionUserId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!user) {
      throw new NotFoundException("Reception user not found");
    }
    return { id: user.id, name: user.displayName || user.username || receptionUserName || actor.username };
  }

  private async advanceLeadToVisitedStatus(
    scope: TenantParkScope,
    lead: LeasingLeadEntity,
    actorId: string,
    manager: EntityManager
  ): Promise<void> {
    const visitedStatus = await this.findLeadStatusByLabel(scope, "已看房");
    if (!visitedStatus) {
      return;
    }
    const currentStatus = await this.findLeadStatusByValue(scope, lead.status);
    const currentOrder = currentStatus?.sortOrder ?? Number(lead.status);
    if (Number.isFinite(currentOrder) && currentOrder >= visitedStatus.sortOrder) {
      return;
    }
    lead.status = visitedStatus.itemValue;
    lead.updateBy = actorId;
    await manager.getRepository(LeasingLeadEntity).save(lead);
  }

  private async findLeadStatusByLabel(scope: TenantParkScope, label: string): Promise<DictItemEntity | null> {
    return this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictItem.status = :status", { status: "enabled" })
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode: "leasing_lead_status" })
      .andWhere("dictType.status = :status", { status: "enabled" })
      .andWhere("dictType.is_deleted = false")
      .andWhere("dictItem.item_label = :label", { label })
      .getOne();
  }

  private async findLeadStatusByValue(scope: TenantParkScope, value: string): Promise<DictItemEntity | null> {
    return this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode: "leasing_lead_status" })
      .andWhere("dictType.is_deleted = false")
      .andWhere("dictItem.item_value = :value", { value })
      .getOne();
  }

  private async applyUnitLookupDataScope(builder: SelectQueryBuilder<UnitEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const filters = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit")
    ]);
    const columns = { park: "park_id", building: "building_id", floor: "floor_id", unit: "id" } as const;
    for (const filter of filters) {
      if (filter.unrestricted) continue;
      const column = columns[filter.dimension as keyof typeof columns];
      if (!column) continue;
      if (filter.allowed_ids.length === 0) {
        builder.andWhere("1 = 0");
        continue;
      }
      const parameterName = `leasingVisitUnitScope${filter.dimension.replace(/_/g, "")}Ids`;
      builder.andWhere(`unit.${column} IN (:...${parameterName})`, { [parameterName]: filter.allowed_ids });
    }
  }

  private async syncLeadFollowTimes(
    scope: TenantParkScope,
    lead: LeasingLeadEntity,
    actorId: string,
    manager: EntityManager,
    nextFollowTime?: Date | null
  ): Promise<void> {
    const latest = await manager
      .getRepository(LeasingFollowEntity)
      .createQueryBuilder("follow")
      .select("MAX(follow.follow_time)", "lastFollowTime")
      .where("follow.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("follow.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("follow.lead_id = :leadId", { leadId: lead.id })
      .andWhere("follow.is_deleted = false")
      .getRawOne<{ lastFollowTime: Date | string | null }>();
    lead.lastFollowTime = latest?.lastFollowTime ? new Date(latest.lastFollowTime) : null;
    if (nextFollowTime !== undefined) {
      lead.nextFollowTime = nextFollowTime;
    }
    lead.updateBy = actorId;
    await manager.getRepository(LeasingLeadEntity).save(lead);
  }

  private numberToDecimal(value: number | undefined): string | null {
    if (value === undefined || value === null) return null;
    return value.toFixed(2);
  }

  private dateToNullable(value: string | undefined): Date | null {
    return value ? new Date(value) : null;
  }

  private emptyToNull(value: string | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
