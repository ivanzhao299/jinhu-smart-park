import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, type Repository, type SelectQueryBuilder } from "typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import type { AssignLeasingLeadDto } from "./dto/assign-leasing-lead.dto";
import type { ChangeLeasingLeadStatusDto } from "./dto/change-leasing-lead-status.dto";
import type { ConvertLeasingLeadToParkTenantDto } from "./dto/convert-leasing-lead-to-park-tenant.dto";
import type { CreateLeasingFollowDto } from "./dto/create-leasing-follow.dto";
import type { CreateLeasingLeadDto } from "./dto/create-leasing-lead.dto";
import type { CreateLeasingQuoteDto } from "./dto/create-leasing-quote.dto";
import type { CreateLeasingVisitDto } from "./dto/create-leasing-visit.dto";
import type { LeasingLeadStatusLogQueryDto } from "./dto/leasing-lead-status-log-query.dto";
import type { LeasingLeadQueryDto } from "./dto/leasing-lead-query.dto";
import type { LeasingFunnelStatisticsQueryDto } from "./dto/leasing-funnel-statistics-query.dto";
import type { ApproveLeasingQuoteDto, RejectLeasingQuoteDto, SubmitLeasingQuoteDto } from "./dto/leasing-quote-action.dto";
import type { MoveLeasingLeadToPoolDto } from "./dto/move-leasing-lead-to-pool.dto";
import type { UpdateLeasingFollowDto } from "./dto/update-leasing-follow.dto";
import type { UpdateLeasingLeadDto } from "./dto/update-leasing-lead.dto";
import type { UpdateLeasingQuoteDto } from "./dto/update-leasing-quote.dto";
import type { UpdateLeasingVisitDto } from "./dto/update-leasing-visit.dto";
import { LeasingFollowEntity } from "./entities/leasing-follow.entity";
import { LeasingLeadStatusLogEntity } from "./entities/leasing-lead-status-log.entity";
import { LeasingLeadEntity } from "./entities/leasing-lead.entity";
import { LeasingQuoteEntity, type LeasingQuoteApproveRecord } from "./entities/leasing-quote.entity";
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

const LEAD_STATUS_NEW = "10";
const LEAD_STATUS_INVALID = "90";
const LEAD_STATUS_LOST = "91";
const LEAD_STATUS_MOVED_IN = "78";
const PARK_TENANT_STATUS_RENTING = "20";
const PARK_TENANT_SOURCE_LEAD_CONVERT = "lead_convert";
const LEAD_STATUS_VISITED_AND_AFTER = ["40", "50", "60", "70", "75", "78"];
const LEAD_STATUS_QUOTED_AND_AFTER = ["50", "60", "70", "75", "78"];
const LEAD_STATUS_NEGOTIATING_AND_AFTER = ["60", "70", "75", "78"];
const LEAD_STATUS_SIGNED_AND_AFTER = ["75", "78"];
const LEAD_STATUS_VALID_EXCLUDED = ["90", "91"];
const VISITED_STATUS_SQL = LEAD_STATUS_VISITED_AND_AFTER.map((status) => `'${status}'`).join(", ");
const QUOTED_STATUS_SQL = LEAD_STATUS_QUOTED_AND_AFTER.map((status) => `'${status}'`).join(", ");
const NEGOTIATING_STATUS_SQL = LEAD_STATUS_NEGOTIATING_AND_AFTER.map((status) => `'${status}'`).join(", ");
const SIGNED_STATUS_SQL = LEAD_STATUS_SIGNED_AND_AFTER.map((status) => `'${status}'`).join(", ");
const VALID_EXCLUDED_STATUS_SQL = LEAD_STATUS_VALID_EXCLUDED.map((status) => `'${status}'`).join(", ");
const HIGH_ORDER_LEAD_STATUSES = new Set(["75", "78"]);
const ALLOWED_LEAD_STATUS_TRANSITIONS = new Map<string, string[]>([
  ["10", ["20", "90", "91"]],
  ["20", ["30", "80", "91"]],
  ["30", ["40", "91"]],
  ["40", ["50", "91"]],
  ["50", ["60", "91"]],
  ["60", ["70", "91"]],
  ["70", ["75", "91"]],
  ["75", ["78"]],
  ["80", ["20", "91"]]
]);

export interface LeasingFunnelStatistics {
  summary: {
    total_leads: number;
    valid_leads: number;
    visited_count: number;
    quoted_count: number;
    negotiating_count: number;
    signed_count: number;
    signed_area: number;
    lost_count: number;
    visit_rate: number;
    quote_rate: number;
    sign_rate: number;
  };
  by_status: Array<{ status: string; status_name: string; count: number }>;
  by_source: Array<{ source: string | null; source_name: string; count: number }>;
  lost_reasons: Array<{ lost_reason: string; lost_reason_name: string; count: number }>;
  by_follow_user: Array<{ follow_user_id: string | null; follow_user_name: string; count: number; signed_count: number }>;
}

export interface ConvertLeasingLeadToParkTenantResult {
  lead_id: string;
  lead_code: string;
  park_tenant_id: string;
  created: boolean;
  status: string;
  park_tenant: ParkTenantEntity;
}

interface FunnelSummaryRaw {
  total_leads: string | number | null;
  valid_leads: string | number | null;
  visited_count: string | number | null;
  quoted_count: string | number | null;
  negotiating_count: string | number | null;
  signed_count: string | number | null;
  signed_area: string | number | null;
  lost_count: string | number | null;
}

@Injectable()
export class LeasingLeadsService {
  constructor(
    @InjectRepository(LeasingLeadEntity)
    private readonly leadsRepository: Repository<LeasingLeadEntity>,
    @InjectRepository(LeasingLeadStatusLogEntity)
    private readonly leadStatusLogsRepository: Repository<LeasingLeadStatusLogEntity>,
    @InjectRepository(LeasingFollowEntity)
    private readonly followsRepository: Repository<LeasingFollowEntity>,
    @InjectRepository(LeasingVisitEntity)
    private readonly visitsRepository: Repository<LeasingVisitEntity>,
    @InjectRepository(LeasingQuoteEntity)
    private readonly quotesRepository: Repository<LeasingQuoteEntity>,
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

  async listPool(scope: TenantParkScope, query: LeasingLeadQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<LeasingLeadEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyPoolDataScope(builder, scope, actor);
    this.applyQuery(builder, { ...query, is_in_pool: true });
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_lead", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async funnelStatistics(scope: TenantParkScope, query: LeasingFunnelStatisticsQueryDto, actor?: JwtPrincipal): Promise<LeasingFunnelStatistics> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyFunnelQuery(builder, query);

    const [statusLabels, sourceLabels, lostReasonLabels] = await Promise.all([
      this.dictLabelMap(scope, "leasing_lead_status"),
      this.dictLabelMap(scope, "leasing_lead_source"),
      this.dictLabelMap(scope, "leasing_lost_reason")
    ]);

    const summaryRaw = await builder
      .clone()
      .select("COUNT(*)", "total_leads")
      .addSelect(`COUNT(*) FILTER (WHERE lead.status NOT IN (${VALID_EXCLUDED_STATUS_SQL}))`, "valid_leads")
      .addSelect(`COUNT(*) FILTER (WHERE lead.status IN (${VISITED_STATUS_SQL}))`, "visited_count")
      .addSelect(`COUNT(*) FILTER (WHERE lead.status IN (${QUOTED_STATUS_SQL}))`, "quoted_count")
      .addSelect(`COUNT(*) FILTER (WHERE lead.status IN (${NEGOTIATING_STATUS_SQL}))`, "negotiating_count")
      .addSelect(`COUNT(*) FILTER (WHERE lead.status IN (${SIGNED_STATUS_SQL}))`, "signed_count")
      .addSelect(`COALESCE(SUM(CASE WHEN lead.status IN (${SIGNED_STATUS_SQL}) THEN COALESCE(lead.demand_area, 0) ELSE 0 END), 0)`, "signed_area")
      .addSelect("COUNT(*) FILTER (WHERE lead.status = :lostStatus)", "lost_count")
      .setParameter("lostStatus", LEAD_STATUS_LOST)
      .getRawOne<FunnelSummaryRaw>();

    const totalLeads = this.rawNumber(summaryRaw?.total_leads);
    const summary = {
      total_leads: totalLeads,
      valid_leads: this.rawNumber(summaryRaw?.valid_leads),
      visited_count: this.rawNumber(summaryRaw?.visited_count),
      quoted_count: this.rawNumber(summaryRaw?.quoted_count),
      negotiating_count: this.rawNumber(summaryRaw?.negotiating_count),
      signed_count: this.rawNumber(summaryRaw?.signed_count),
      signed_area: this.rawNumber(summaryRaw?.signed_area),
      lost_count: this.rawNumber(summaryRaw?.lost_count),
      visit_rate: totalLeads > 0 ? this.rawNumber(summaryRaw?.visited_count) / totalLeads : 0,
      quote_rate: totalLeads > 0 ? this.rawNumber(summaryRaw?.quoted_count) / totalLeads : 0,
      sign_rate: totalLeads > 0 ? this.rawNumber(summaryRaw?.signed_count) / totalLeads : 0
    };

    const byStatusRows = await builder
      .clone()
      .select("lead.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("lead.status")
      .orderBy("lead.status", "ASC")
      .getRawMany<{ status: string; count: string | number }>();

    const bySourceRows = await builder
      .clone()
      .select("lead.source", "source")
      .addSelect("COUNT(*)", "count")
      .groupBy("lead.source")
      .orderBy("COUNT(*)", "DESC")
      .getRawMany<{ source: string | null; count: string | number }>();

    const lostReasonRows = await builder
      .clone()
      .select("lead.lost_reason", "lost_reason")
      .addSelect("COUNT(*)", "count")
      .andWhere("lead.status = :lostStatus", { lostStatus: LEAD_STATUS_LOST })
      .andWhere("lead.lost_reason IS NOT NULL")
      .andWhere("lead.lost_reason <> ''")
      .groupBy("lead.lost_reason")
      .orderBy("COUNT(*)", "DESC")
      .getRawMany<{ lost_reason: string; count: string | number }>();

    const byFollowUserRows = await builder
      .clone()
      .select("lead.follow_user_id", "follow_user_id")
      .addSelect("lead.follow_user_name", "follow_user_name")
      .addSelect("COUNT(*)", "count")
      .addSelect(`COUNT(*) FILTER (WHERE lead.status IN (${SIGNED_STATUS_SQL}))`, "signed_count")
      .groupBy("lead.follow_user_id")
      .addGroupBy("lead.follow_user_name")
      .orderBy("COUNT(*)", "DESC")
      .getRawMany<{ follow_user_id: string | null; follow_user_name: string | null; count: string | number; signed_count: string | number }>();

    return {
      summary,
      by_status: byStatusRows.map((item) => ({
        status: item.status,
        status_name: statusLabels.get(item.status) ?? item.status,
        count: this.rawNumber(item.count)
      })),
      by_source: bySourceRows.map((item) => ({
        source: item.source,
        source_name: item.source ? sourceLabels.get(item.source) ?? item.source : "未填写",
        count: this.rawNumber(item.count)
      })),
      lost_reasons: lostReasonRows.map((item) => ({
        lost_reason: item.lost_reason,
        lost_reason_name: lostReasonLabels.get(item.lost_reason) ?? item.lost_reason,
        count: this.rawNumber(item.count)
      })),
      by_follow_user: byFollowUserRows.map((item) => ({
        follow_user_id: item.follow_user_id,
        follow_user_name: item.follow_user_name ?? "未分配",
        count: this.rawNumber(item.count),
        signed_count: this.rawNumber(item.signed_count)
      }))
    };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateLeasingLeadDto): Promise<LeasingLeadEntity> {
    if (dto.status && dto.status !== LEAD_STATUS_NEW) {
      throw new BadRequestException("New leasing lead status must be 10");
    }
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
      status: LEAD_STATUS_NEW,
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
    if (dto.status !== undefined && dto.status !== entity.status) {
      throw new BadRequestException("Please use change-status endpoint to update leasing lead status");
    }
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

  async assign(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AssignLeasingLeadDto): Promise<LeasingLeadEntity> {
    this.assertCanAssignLead(actor);
    if (!dto.reason.trim()) {
      throw new BadRequestException("assign reason is required");
    }
    const entity = await this.findOne(scope, id, actor);
    const followUser = await this.resolveAssignableUser(scope, dto.follow_user_id);
    entity.followUserId = followUser.id;
    entity.followUserName = followUser.name;
    entity.isInPool = false;
    entity.poolEnterTime = null;
    entity.updateBy = actor.sub;
    const saved = await this.leadsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_lead", saved);
  }

  async reclaim(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<LeasingLeadEntity> {
    const entity = await this.findPoolLead(scope, id);
    entity.followUserId = actor.sub;
    entity.followUserName = actor.realName ?? actor.username;
    entity.isInPool = false;
    entity.poolEnterTime = null;
    entity.updateBy = actor.sub;
    const saved = await this.leadsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_lead", saved);
  }

  async moveToPool(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: MoveLeasingLeadToPoolDto): Promise<LeasingLeadEntity> {
    if (!dto.reason.trim()) {
      throw new BadRequestException("move-to-pool reason is required");
    }
    const entity = await this.findOne(scope, id, actor);
    entity.isInPool = true;
    entity.poolEnterTime = new Date();
    entity.updateBy = actor.sub;
    const saved = await this.leadsRepository.save(entity);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_lead", saved);
  }

  async changeStatus(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: ChangeLeasingLeadStatusDto
  ): Promise<{ id: string; lead_code: string; before_status: string; after_status: string; status_update_time: string }> {
    const entity = await this.findOne(scope, id, actor);
    const beforeStatus = entity.status;
    const afterStatus = dto.after_status;
    const reason = this.emptyToNull(dto.reason);
    const lostReason = this.emptyToNull(dto.lost_reason);
    const lostRemark = this.emptyToNull(dto.lost_remark);

    if (beforeStatus === afterStatus) {
      throw new BadRequestException("Leasing lead status is unchanged");
    }

    await this.validateLeadStatusChange(scope, actor, beforeStatus, afterStatus, reason, lostReason);

    const now = new Date();
    await this.leadsRepository.manager.transaction(async (manager) => {
      entity.status = afterStatus;
      entity.lostReason = afterStatus === LEAD_STATUS_LOST ? lostReason : null;
      entity.lostRemark = afterStatus === LEAD_STATUS_LOST ? lostRemark : null;
      entity.updateBy = actor.sub;
      await manager.getRepository(LeasingLeadEntity).save(entity);
      await this.recordLeadStatusLog(manager, scope, entity.id, beforeStatus, afterStatus, this.statusChangeReason(afterStatus, reason, lostReason), actor, now, "招商线索状态流转");
    });

    return {
      id: entity.id,
      lead_code: entity.leadCode,
      before_status: beforeStatus,
      after_status: afterStatus,
      status_update_time: now.toISOString()
    };
  }

  async convertToParkTenant(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: ConvertLeasingLeadToParkTenantDto
  ): Promise<ConvertLeasingLeadToParkTenantResult> {
    const lead = await this.findOne(scope, id, actor);
    if (lead.parkTenantId) {
      throw new ConflictException("Leasing lead has already been converted to park tenant");
    }

    await this.validateConvertToParkTenantDictionaries(scope, dto);
    const unifiedCreditCode = this.emptyToNull(dto.unified_credit_code);
    const existingParkTenant = unifiedCreditCode ? await this.findParkTenantByUnifiedCreditCode(scope, unifiedCreditCode) : null;
    const parkTenantCode = existingParkTenant ? existingParkTenant.parkTenantCode : await this.resolveConvertedParkTenantCode(scope, actor.sub);
    if (!existingParkTenant) {
      await this.assertConvertedParkTenantCodeAvailable(scope, parkTenantCode);
    }

    const nextLeadStatus = dto.after_status === "keep" ? lead.status : LEAD_STATUS_MOVED_IN;
    let parkTenant = existingParkTenant;
    let created = false;
    const beforeStatus = lead.status;
    const now = new Date();

    await this.leadsRepository.manager.transaction(async (manager) => {
      if (!parkTenant) {
        parkTenant = manager.getRepository(ParkTenantEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          code: parkTenantCode,
          parkTenantCode,
          companyName: dto.company_name.trim(),
          unifiedCreditCode,
          legalPerson: this.emptyToNull(dto.legal_person),
          legalPersonId: null,
          contactName: this.emptyToNull(dto.contact_name) ?? lead.contactName,
          contactMobile: this.emptyToNull(dto.contact_mobile) ?? lead.contactMobile,
          contactEmail: lead.contactEmail,
          industryCode: this.emptyToNull(dto.industry_code) ?? lead.industryCode,
          industryDetail: lead.industryDetail,
          businessScope: null,
          tenantType: this.emptyToNull(dto.tenant_type),
          riskLevel: this.emptyToNull(dto.risk_level),
          riskTags: [],
          checkInDate: null,
          checkOutDate: null,
          status: PARK_TENANT_STATUS_RENTING,
          sourceType: PARK_TENANT_SOURCE_LEAD_CONVERT,
          remark: this.emptyToNull(dto.remark),
          createBy: actor.sub,
          updateBy: actor.sub
        });
        parkTenant = await manager.getRepository(ParkTenantEntity).save(parkTenant);
        created = true;
      }

      lead.parkTenantId = parkTenant.id;
      lead.updateBy = actor.sub;
      if (nextLeadStatus !== lead.status) {
        lead.status = nextLeadStatus;
      }
      await manager.getRepository(LeasingLeadEntity).save(lead);

      if (nextLeadStatus !== beforeStatus) {
        await this.recordLeadStatusLog(
          manager,
          scope,
          lead.id,
          beforeStatus,
          nextLeadStatus,
          "线索转为园区租户企业",
          actor,
          now,
          "招商线索转租户企业自动推进状态"
        );
      }
    });

    if (!parkTenant) {
      throw new BadRequestException("Park tenant conversion failed");
    }

    const securedParkTenant = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "park_tenant", parkTenant);
    return {
      lead_id: lead.id,
      lead_code: lead.leadCode,
      park_tenant_id: parkTenant.id,
      created,
      status: lead.status,
      park_tenant: securedParkTenant
    };
  }

  async listStatusLogs(scope: TenantParkScope, actor: JwtPrincipal, leadId: string, query: LeasingLeadStatusLogQueryDto): Promise<PaginatedResult<LeasingLeadStatusLogEntity>> {
    await this.findOne(scope, leadId, actor);
    const [items, total] = await this.leadStatusLogsRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.lead_id = :leadId", { leadId })
      .andWhere("log.is_deleted = false")
      .orderBy("log.op_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async listFollows(scope: TenantParkScope, actor: JwtPrincipal, leadId: string): Promise<LeasingFollowEntity[]> {
    await this.findOne(scope, leadId, actor);
    const follows = await this.followsRepository
      .createQueryBuilder("follow")
      .where("follow.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("follow.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("follow.lead_id = :leadId", { leadId })
      .andWhere("follow.is_deleted = false")
      .orderBy("follow.follow_time", "DESC")
      .addOrderBy("follow.create_time", "DESC")
      .getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_follow", follows);
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
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_follow", saved);
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
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_follow", saved);
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
        await this.advanceLeadToVisitedStatus(scope, lead, actor, manager);
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
        await this.advanceLeadToVisitedStatus(scope, lead, actor, manager);
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

  async listQuotes(scope: TenantParkScope, actor: JwtPrincipal, leadId: string): Promise<LeasingQuoteEntity[]> {
    await this.findOne(scope, leadId, actor);
    const quotes = await this.quotesRepository
      .createQueryBuilder("quote")
      .leftJoinAndSelect("quote.unit", "unit")
      .where("quote.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("quote.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("quote.lead_id = :leadId", { leadId })
      .andWhere("quote.is_deleted = false")
      .orderBy("quote.create_time", "DESC")
      .getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "leasing_quote", quotes);
  }

  async createQuote(scope: TenantParkScope, actor: JwtPrincipal, leadId: string, dto: CreateLeasingQuoteDto): Promise<LeasingQuoteEntity> {
    const lead = await this.findOne(scope, leadId, actor);
    const unit = await this.resolveQuoteUnit(scope, actor, dto.unitId);
    await this.validateQuoteDictionaryValues(scope, dto.paymentPeriod, dto.quoteStatus);
    const status = dto.quoteStatus ?? "10";
    const entity = this.quotesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leadId: lead.id,
      unitId: unit.id,
      quotePrice: this.numberToDecimalRequired(dto.quotePrice),
      quotePeriod: this.emptyToNull(dto.quotePeriod),
      freeRentMonths: this.numberToDecimal(dto.freeRentMonths) ?? "0.00",
      depositMonths: this.numberToDecimal(dto.depositMonths) ?? "0.00",
      paymentPeriod: this.emptyToNull(dto.paymentPeriod),
      propertyFeePrice: this.numberToDecimal(dto.propertyFeePrice) ?? "0.00",
      quoteStatus: status,
      approveRecords: [],
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.quotesRepository.save(entity);
    saved.unit = unit;
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_quote", saved);
  }

  async updateQuote(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    leadId: string,
    quoteId: string,
    dto: UpdateLeasingQuoteDto
  ): Promise<LeasingQuoteEntity> {
    await this.findOne(scope, leadId, actor);
    const quote = await this.findQuote(scope, quoteId, actor, leadId);
    if (dto.unitId !== undefined) {
      const unit = await this.resolveQuoteUnit(scope, actor, dto.unitId);
      quote.unitId = unit.id;
      quote.unit = unit;
    }
    await this.validateQuoteDictionaryValues(scope, dto.paymentPeriod, dto.quoteStatus);
    if (dto.quotePrice !== undefined) quote.quotePrice = this.numberToDecimalRequired(dto.quotePrice);
    if (dto.quotePeriod !== undefined) quote.quotePeriod = this.emptyToNull(dto.quotePeriod);
    if (dto.freeRentMonths !== undefined) quote.freeRentMonths = this.numberToDecimal(dto.freeRentMonths) ?? "0.00";
    if (dto.depositMonths !== undefined) quote.depositMonths = this.numberToDecimal(dto.depositMonths) ?? "0.00";
    if (dto.paymentPeriod !== undefined) quote.paymentPeriod = this.emptyToNull(dto.paymentPeriod);
    if (dto.propertyFeePrice !== undefined) quote.propertyFeePrice = this.numberToDecimal(dto.propertyFeePrice) ?? "0.00";
    if (dto.quoteStatus !== undefined) quote.quoteStatus = dto.quoteStatus;
    if (dto.remark !== undefined) quote.remark = this.emptyToNull(dto.remark);
    quote.updateBy = actor.sub;
    const saved = await this.quotesRepository.save(quote);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_quote", saved);
  }

  async softDeleteQuote(scope: TenantParkScope, actor: JwtPrincipal, leadId: string, quoteId: string): Promise<{ id: string }> {
    await this.findOne(scope, leadId, actor);
    const quote = await this.findQuote(scope, quoteId, actor, leadId);
    quote.isDeleted = true;
    quote.updateBy = actor.sub;
    await this.quotesRepository.save(quote);
    return { id: quoteId };
  }

  async submitQuote(scope: TenantParkScope, actor: JwtPrincipal, quoteId: string, dto: SubmitLeasingQuoteDto): Promise<LeasingQuoteEntity> {
    const quote = await this.findQuote(scope, quoteId, actor);
    if (["40", "90"].includes(quote.quoteStatus)) {
      throw new BadRequestException("Quote cannot be submitted in current status");
    }
    const fromStatus = quote.quoteStatus;
    quote.quoteStatus = "30";
    quote.submitTime = new Date();
    quote.approveRecords = this.appendQuoteApproveRecord(quote, actor, "submit", fromStatus, "30", dto.opinion);
    quote.updateBy = actor.sub;
    const saved = await this.quotesRepository.save(quote);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_quote", saved);
  }

  async approveQuote(scope: TenantParkScope, actor: JwtPrincipal, quoteId: string, dto: ApproveLeasingQuoteDto): Promise<LeasingQuoteEntity> {
    const quote = await this.findQuote(scope, quoteId, actor);
    if (quote.quoteStatus === "40") {
      throw new BadRequestException("Quote has already been approved");
    }
    const lead = await this.findOne(scope, quote.leadId, actor);
    const fromStatus = quote.quoteStatus;
    quote.quoteStatus = "40";
    quote.approveTime = new Date();
    quote.approveBy = actor.sub;
    quote.rejectReason = null;
    quote.approveRecords = this.appendQuoteApproveRecord(quote, actor, "approve", fromStatus, "40", dto.opinion);
    quote.updateBy = actor.sub;
    let saved!: LeasingQuoteEntity;
    await this.leadsRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(LeasingQuoteEntity).save(quote);
      await this.advanceLeadToQuotedStatus(scope, lead, actor, manager);
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_quote", saved);
  }

  async rejectQuote(scope: TenantParkScope, actor: JwtPrincipal, quoteId: string, dto: RejectLeasingQuoteDto): Promise<LeasingQuoteEntity> {
    const quote = await this.findQuote(scope, quoteId, actor);
    const fromStatus = quote.quoteStatus;
    quote.quoteStatus = "50";
    quote.approveTime = new Date();
    quote.approveBy = actor.sub;
    quote.rejectReason = dto.rejectReason.trim();
    quote.approveRecords = this.appendQuoteApproveRecord(quote, actor, "reject", fromStatus, "50", dto.rejectReason, dto.rejectReason);
    quote.updateBy = actor.sub;
    const saved = await this.quotesRepository.save(quote);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "leasing_quote", saved);
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

  private async findPoolLead(scope: TenantParkScope, id: string): Promise<LeasingLeadEntity> {
    const entity = await this.scopedBuilder(scope)
      .andWhere("lead.id = :id", { id })
      .andWhere("lead.is_in_pool = true")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Leasing lead pool item not found");
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

  private async findQuote(scope: TenantParkScope, quoteId: string, actor: JwtPrincipal, leadId?: string): Promise<LeasingQuoteEntity> {
    const builder = this.quotesRepository
      .createQueryBuilder("quote")
      .leftJoinAndSelect("quote.unit", "unit")
      .where("quote.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("quote.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("quote.id = :quoteId", { quoteId })
      .andWhere("quote.is_deleted = false");
    if (leadId) {
      builder.andWhere("quote.lead_id = :leadId", { leadId });
    }
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Leasing quote not found");
    }
    await this.findOne(scope, entity.leadId, actor);
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

  private applyFunnelQuery(builder: SelectQueryBuilder<LeasingLeadEntity>, query: LeasingFunnelStatisticsQueryDto): void {
    if (query.start_date) builder.andWhere("lead.create_time >= :funnelStartDate", { funnelStartDate: query.start_date });
    if (query.end_date) builder.andWhere("lead.create_time < (:funnelEndDate::date + interval '1 day')", { funnelEndDate: query.end_date });
    if (query.follow_user_id) builder.andWhere("lead.follow_user_id = :funnelFollowUserId", { funnelFollowUserId: query.follow_user_id });
    if (query.source) builder.andWhere("lead.source = :funnelSource", { funnelSource: query.source });
    if (query.industry_code) builder.andWhere("lead.industry_code = :funnelIndustryCode", { funnelIndustryCode: query.industry_code });
  }

  private async dictLabelMap(scope: TenantParkScope, dictCode: string): Promise<Map<string, string>> {
    const items = await this.dictItemsRepository
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
      .orderBy("dictItem.sort_order", "ASC")
      .getMany();
    return new Map(items.map((item) => [item.itemValue, item.itemLabel]));
  }

  private rawNumber(value: string | number | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
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

  private async applyPoolDataScope(builder: SelectQueryBuilder<LeasingLeadEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (!actor) {
      return;
    }
    await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "customer_owner")
    ]);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "lead", { park: "park_id" });
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

  private async resolveAssignableUser(scope: TenantParkScope, userId: string): Promise<{ id: string; name: string }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!user) {
      throw new NotFoundException("Follow user not found");
    }
    return { id: user.id, name: user.displayName || user.username };
  }

  private assertCanAssignLead(actor: JwtPrincipal): void {
    if (!this.canAssignLead(actor)) {
      throw new ForbiddenException("Only investment managers or operations owners can assign leasing leads");
    }
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

  private async validateConvertToParkTenantDictionaries(scope: TenantParkScope, dto: ConvertLeasingLeadToParkTenantDto): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "park_tenant_status", PARK_TENANT_STATUS_RENTING),
      this.assertDictValue(scope, "park_tenant_source_type", PARK_TENANT_SOURCE_LEAD_CONVERT),
      this.assertDictValue(scope, "park_tenant_type", dto.tenant_type),
      this.assertDictValue(scope, "park_tenant_risk_level", dto.risk_level),
      this.assertDictValue(scope, "industry_code", dto.industry_code),
      dto.after_status === "keep" ? Promise.resolve() : this.assertDictValue(scope, "leasing_lead_status", LEAD_STATUS_MOVED_IN)
    ]);
  }

  private async findParkTenantByUnifiedCreditCode(scope: TenantParkScope, unifiedCreditCode: string): Promise<ParkTenantEntity | null> {
    return this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.unified_credit_code = :unifiedCreditCode", { unifiedCreditCode })
      .andWhere("parkTenant.is_deleted = false")
      .getOne();
  }

  private async resolveConvertedParkTenantCode(scope: TenantParkScope, actorId: string): Promise<string> {
    const generated = await this.codeRulesService.generateNext(scope, actorId, "PARK_TENANT_CODE");
    return generated.code;
  }

  private async assertConvertedParkTenantCodeAvailable(scope: TenantParkScope, code: string): Promise<void> {
    const exists = await this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.park_tenant_code = :code", { code })
      .andWhere("parkTenant.is_deleted = false")
      .getExists();
    if (exists) {
      throw new ConflictException("Park tenant code already exists");
    }
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

  private async resolveQuoteUnit(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<UnitEntity> {
    const builder = this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.id = :unitId", { unitId })
      .andWhere("unit.status = 1")
      .andWhere("unit.is_deleted = false");
    await this.applyUnitLookupDataScope(builder, actor);
    const unit = await builder.getOne();
    if (!unit) {
      throw new BadRequestException("unit_id does not exist or is outside current scope");
    }
    return unit;
  }

  private async validateQuoteDictionaryValues(scope: TenantParkScope, paymentPeriod?: string, quoteStatus?: string): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "leasing_payment_period", paymentPeriod),
      this.assertDictValue(scope, "leasing_quote_status", quoteStatus)
    ]);
  }

  private async validateLeadStatusChange(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    beforeStatus: string,
    afterStatus: string,
    reason: string | null,
    lostReason: string | null
  ): Promise<void> {
    await this.assertDictValue(scope, "leasing_lead_status", afterStatus);
    if (afterStatus === LEAD_STATUS_LOST) {
      if (!lostReason) {
        throw new BadRequestException("lost_reason is required when leasing lead is lost");
      }
      await this.assertDictValue(scope, "leasing_lost_reason", lostReason);
    }
    if (afterStatus === LEAD_STATUS_INVALID && !reason) {
      throw new BadRequestException("reason is required when leasing lead is invalid");
    }
    if (HIGH_ORDER_LEAD_STATUSES.has(afterStatus) && !this.hasPermission(actor, SYSTEM_PERMISSIONS.LEASING_LEAD_CONFIRM_SIGN)) {
      throw new ForbiddenException("leasing_lead:confirm_sign permission is required");
    }

    const allowedTargets = ALLOWED_LEAD_STATUS_TRANSITIONS.get(beforeStatus) ?? [];
    if (allowedTargets.includes(afterStatus)) {
      return;
    }
    if (!this.hasPermission(actor, SYSTEM_PERMISSIONS.LEASING_LEAD_FORCE_CHANGE_STATUS)) {
      throw new BadRequestException("Leasing lead status transition is not allowed");
    }
    if (!reason) {
      throw new BadRequestException("reason is required for force status change");
    }
  }

  private statusChangeReason(afterStatus: string, reason: string | null, lostReason: string | null): string {
    if (reason) return reason;
    if (afterStatus === LEAD_STATUS_LOST && lostReason) return lostReason;
    return "状态流转";
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission);
  }

  private async recordLeadStatusLog(
    manager: EntityManager,
    scope: TenantParkScope,
    leadId: string,
    beforeStatus: string,
    afterStatus: string,
    reason: string,
    actor: Pick<JwtPrincipal, "sub" | "username" | "realName">,
    opTime: Date,
    remark: string
  ): Promise<void> {
    await manager.getRepository(LeasingLeadStatusLogEntity).save(
      manager.getRepository(LeasingLeadStatusLogEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leadId,
        beforeStatus,
        afterStatus,
        reason,
        operatorId: actor.sub,
        operatorName: actor.realName ?? actor.username,
        opTime,
        createBy: actor.sub,
        updateBy: actor.sub,
        remark
      })
    );
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
    actor: JwtPrincipal,
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
    if (!this.isAllowedLeadStatusTransition(lead.status, visitedStatus.itemValue)) {
      return;
    }
    const beforeStatus = lead.status;
    lead.status = visitedStatus.itemValue;
    lead.updateBy = actor.sub;
    await manager.getRepository(LeasingLeadEntity).save(lead);
    await this.recordLeadStatusLog(manager, scope, lead.id, beforeStatus, visitedStatus.itemValue, "看房记录推进", actor, new Date(), "看房记录自动推进线索状态");
  }

  private async advanceLeadToQuotedStatus(
    scope: TenantParkScope,
    lead: LeasingLeadEntity,
    actor: JwtPrincipal,
    manager: EntityManager
  ): Promise<void> {
    const quotedStatus = await this.findLeadStatusByLabel(scope, "已报价");
    if (!quotedStatus) {
      return;
    }
    const currentStatus = await this.findLeadStatusByValue(scope, lead.status);
    const currentOrder = currentStatus?.sortOrder ?? Number(lead.status);
    if (Number.isFinite(currentOrder) && currentOrder >= quotedStatus.sortOrder) {
      return;
    }
    if (!this.isAllowedLeadStatusTransition(lead.status, quotedStatus.itemValue)) {
      return;
    }
    const beforeStatus = lead.status;
    lead.status = quotedStatus.itemValue;
    lead.updateBy = actor.sub;
    await manager.getRepository(LeasingLeadEntity).save(lead);
    await this.recordLeadStatusLog(manager, scope, lead.id, beforeStatus, quotedStatus.itemValue, "报价审批通过推进", actor, new Date(), "报价审批自动推进线索状态");
  }

  private appendQuoteApproveRecord(
    quote: LeasingQuoteEntity,
    actor: JwtPrincipal,
    action: LeasingQuoteApproveRecord["action"],
    fromStatus: string,
    toStatus: string,
    opinion?: string | null,
    rejectReason?: string | null
  ): LeasingQuoteApproveRecord[] {
    const records = Array.isArray(quote.approveRecords) ? quote.approveRecords : [];
    return [
      ...records,
      {
        action,
        operatorId: actor.sub,
        operatorName: actor.realName ?? actor.username,
        opTime: new Date().toISOString(),
        fromStatus,
        toStatus,
        opinion: this.emptyToNull(opinion ?? undefined),
        rejectReason: this.emptyToNull(rejectReason ?? undefined),
        priceWarning: this.quotePriceWarning(quote)
      }
    ];
  }

  private quotePriceWarning(quote: LeasingQuoteEntity): string | null {
    const quotePrice = Number(quote.quotePrice);
    const refPrice = Number(quote.unit?.refPrice);
    if (!Number.isFinite(quotePrice) || !Number.isFinite(refPrice) || refPrice <= 0) {
      return null;
    }
    if (quotePrice < refPrice * 0.8) {
      return "报价低于房源参考价 20% 以上，需运营负责人或高层重点审批";
    }
    if (quotePrice < refPrice * 0.9) {
      return "报价低于房源参考价 10% 以上，需招商主管或运营负责人审批";
    }
    return null;
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

  private isAllowedLeadStatusTransition(beforeStatus: string, afterStatus: string): boolean {
    return ALLOWED_LEAD_STATUS_TRANSITIONS.get(beforeStatus)?.includes(afterStatus) ?? false;
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

  private numberToDecimalRequired(value: number): string {
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
