import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { LeasingContractEntity } from "../leasing-contracts/entities/leasing-contract.entity";
import type { ChangeParkTenantRiskDto } from "./dto/change-park-tenant-risk.dto";
import type { CreateParkTenantDto } from "./dto/create-park-tenant.dto";
import type { ParkTenantQueryDto } from "./dto/park-tenant-query.dto";
import type { UpdateParkTenantDto } from "./dto/update-park-tenant.dto";
import { ParkTenantContactEntity } from "./entities/park-tenant-contact.entity";
import { ParkTenantQualificationEntity } from "./entities/park-tenant-qualification.entity";
import { ParkTenantRiskLogEntity } from "./entities/park-tenant-risk-log.entity";
import { ParkTenantEntity } from "./entities/park-tenant.entity";

const SORT_COLUMNS = new Set([
  "parkTenantCode",
  "companyName",
  "unifiedCreditCode",
  "tenantType",
  "riskLevel",
  "status",
  "checkInDate",
  "updateTime",
  "createTime"
]);

@Injectable()
export class ParkTenantsService {
  constructor(
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(ParkTenantRiskLogEntity)
    private readonly riskLogsRepository: Repository<ParkTenantRiskLogEntity>,
    @InjectRepository(ParkTenantContactEntity)
    private readonly contactsRepository: Repository<ParkTenantContactEntity>,
    @InjectRepository(ParkTenantQualificationEntity)
    private readonly qualificationsRepository: Repository<ParkTenantQualificationEntity>,
    @InjectRepository(LeasingContractEntity)
    private readonly contractsRepository: Repository<LeasingContractEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: ParkTenantQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<ParkTenantEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<ParkTenantEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "park_tenant", entity);
  }

  async tenant360(scope: TenantParkScope, id: string, actor: JwtPrincipal) {
    const profile = await this.detail(scope, id, actor);
    const [contactsRaw, qualificationsRaw, riskLogsRaw, contractsRaw] = await Promise.all([
      this.contactsRepository
        .createQueryBuilder("contact")
        .where("contact.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("contact.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("contact.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("contact.is_deleted = false")
        .orderBy("contact.is_primary", "DESC")
        .addOrderBy("contact.create_time", "ASC")
        .getMany(),
      this.qualificationsRepository
        .createQueryBuilder("qualification")
        .leftJoinAndSelect("qualification.file", "file")
        .where("qualification.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("qualification.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("qualification.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("qualification.is_deleted = false")
        .orderBy("qualification.expire_date", "ASC", "NULLS LAST")
        .addOrderBy("qualification.create_time", "DESC")
        .getMany(),
      this.riskLogsRepository
        .createQueryBuilder("riskLog")
        .where("riskLog.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("riskLog.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("riskLog.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("riskLog.is_deleted = false")
        .orderBy("riskLog.op_time", "DESC")
        .addOrderBy("riskLog.create_time", "DESC")
        .getMany(),
      this.contractsRepository
        .createQueryBuilder("contract")
        .where("contract.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("contract.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("contract.park_tenant_id = :parkTenantId", { parkTenantId: id })
        .andWhere("contract.is_deleted = false")
        .orderBy("contract.start_date", "DESC")
        .addOrderBy("contract.create_time", "DESC")
        .getMany()
    ]);
    const [contacts, qualifications, riskLogs, contracts] = await Promise.all([
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_contact", contactsRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_qualification", qualificationsRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_risk_log", riskLogsRaw),
      this.fieldPolicyService.applyFieldPoliciesToList(
        scope,
        actor,
        "leasing",
        "leasing_contract",
        contractsRaw.map((contract) => ({
          id: contract.id,
          contract_code: contract.contractCode,
          contract_name: contract.contractName,
          start_date: contract.startDate,
          end_date: contract.endDate,
          total_amount: contract.totalAmount,
          status: contract.status
        }))
      )
    ]);
    return {
      profile: this.toTenant360Profile(profile),
      contacts,
      qualifications: this.sanitizeQualificationFiles(qualifications),
      riskLogs,
      relatedUnits: [],
      contracts: {
        available: true,
        items: contracts,
        summary: {
          contract_count: contractsRaw.length,
          active_contract_count: contractsRaw.filter((contract) => contract.status === "75").length
        }
      },
      receivables: { available: false, summary: null },
      workorders: { available: false, summary: null },
      hazards: { available: false, summary: null },
      energy: { available: false, summary: null }
    };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateParkTenantDto): Promise<ParkTenantEntity> {
    const parkTenantCode = await this.resolveParkTenantCode(scope, actor.sub, dto.parkTenantCode);
    await this.assertParkTenantCodeAvailable(scope, parkTenantCode);
    const unifiedCreditCode = this.emptyToNull(dto.unifiedCreditCode);
    if (unifiedCreditCode) {
      await this.assertUnifiedCreditCodeAvailable(scope, unifiedCreditCode);
    }
    const entity = this.parkTenantsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: parkTenantCode,
      parkTenantCode,
      companyName: dto.companyName.trim(),
      unifiedCreditCode,
      legalPerson: this.emptyToNull(dto.legalPerson),
      legalPersonId: this.emptyToNull(dto.legalPersonId),
      contactName: this.emptyToNull(dto.contactName),
      contactMobile: this.emptyToNull(dto.contactMobile),
      contactEmail: this.emptyToNull(dto.contactEmail),
      industryCode: this.emptyToNull(dto.industryCode),
      industryDetail: this.emptyToNull(dto.industryDetail),
      businessScope: this.emptyToNull(dto.businessScope),
      tenantType: this.emptyToNull(dto.tenantType),
      riskLevel: this.emptyToNull(dto.riskLevel),
      riskTags: this.normalizeRiskTags(dto.riskTags),
      checkInDate: dto.checkInDate ?? null,
      checkOutDate: dto.checkOutDate ?? null,
      status: dto.status ?? "10",
      sourceType: dto.sourceType ?? "manual",
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.parkTenantsRepository.save(entity);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateParkTenantDto): Promise<ParkTenantEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (dto.parkTenantCode && dto.parkTenantCode !== entity.parkTenantCode) {
      await this.assertParkTenantCodeAvailable(scope, dto.parkTenantCode, id);
      entity.parkTenantCode = dto.parkTenantCode;
      entity.code = dto.parkTenantCode;
    }
    if (dto.unifiedCreditCode !== undefined) {
      const nextCreditCode = this.emptyToNull(dto.unifiedCreditCode);
      if (nextCreditCode && nextCreditCode !== entity.unifiedCreditCode) {
        await this.assertUnifiedCreditCodeAvailable(scope, nextCreditCode, id);
      }
      entity.unifiedCreditCode = nextCreditCode;
    }
    if (dto.companyName !== undefined) entity.companyName = dto.companyName.trim();
    if (dto.legalPerson !== undefined) entity.legalPerson = this.emptyToNull(dto.legalPerson);
    if (dto.legalPersonId !== undefined) entity.legalPersonId = this.emptyToNull(dto.legalPersonId);
    if (dto.contactName !== undefined) entity.contactName = this.emptyToNull(dto.contactName);
    if (dto.contactMobile !== undefined) entity.contactMobile = this.emptyToNull(dto.contactMobile);
    if (dto.contactEmail !== undefined) entity.contactEmail = this.emptyToNull(dto.contactEmail);
    if (dto.industryCode !== undefined) entity.industryCode = this.emptyToNull(dto.industryCode);
    if (dto.industryDetail !== undefined) entity.industryDetail = this.emptyToNull(dto.industryDetail);
    if (dto.businessScope !== undefined) entity.businessScope = this.emptyToNull(dto.businessScope);
    if (dto.tenantType !== undefined) entity.tenantType = this.emptyToNull(dto.tenantType);
    if (dto.riskLevel !== undefined) entity.riskLevel = this.emptyToNull(dto.riskLevel);
    if (dto.riskTags !== undefined) entity.riskTags = this.normalizeRiskTags(dto.riskTags);
    if (dto.checkInDate !== undefined) entity.checkInDate = dto.checkInDate;
    if (dto.checkOutDate !== undefined) entity.checkOutDate = dto.checkOutDate;
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.sourceType !== undefined) entity.sourceType = dto.sourceType;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;
    return this.parkTenantsRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.parkTenantsRepository.save(entity);
    return { id };
  }

  async changeRiskLevel(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ChangeParkTenantRiskDto): Promise<ParkTenantEntity> {
    const entity = await this.findOne(scope, id, actor);
    const riskLevel = await this.resolveRiskLevel(scope, dto.risk_level);
    const afterRiskTags = this.normalizeRiskTags(dto.risk_tags);
    if (riskLevel.sortOrder === 40 && afterRiskTags.length === 0) {
      throw new BadRequestException("risk_tags is required for high risk tenants");
    }

    const beforeRiskLevel = entity.riskLevel;
    const beforeRiskTags = [...(entity.riskTags ?? [])];
    entity.riskLevel = riskLevel.itemValue;
    entity.riskTags = afterRiskTags;
    entity.updateBy = actor.sub;

    await this.parkTenantsRepository.manager.transaction(async (manager) => {
      await manager.getRepository(ParkTenantEntity).save(entity);
      await manager.getRepository(ParkTenantRiskLogEntity).save(
        manager.getRepository(ParkTenantRiskLogEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          parkTenantId: entity.id,
          beforeRiskLevel,
          afterRiskLevel: riskLevel.itemValue,
          beforeRiskTags,
          afterRiskTags,
          reason: dto.reason.trim(),
          operatorId: actor.sub,
          operatorName: actor.realName ?? actor.username,
          opTime: new Date(),
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
    });

    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "park_tenant", entity);
  }

  async riskLogs(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<ParkTenantRiskLogEntity[]> {
    await this.findOne(scope, id, actor);
    return this.riskLogsRepository
      .createQueryBuilder("riskLog")
      .where("riskLog.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("riskLog.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("riskLog.park_tenant_id = :parkTenantId", { parkTenantId: id })
      .andWhere("riskLog.is_deleted = false")
      .orderBy("riskLog.op_time", "DESC")
      .addOrderBy("riskLog.create_time", "DESC")
      .getMany();
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<ParkTenantEntity> {
    return this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<ParkTenantEntity> {
    const builder = this.scopedBuilder(scope).andWhere("parkTenant.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<ParkTenantEntity>, query: ParkTenantQueryDto): void {
    if (query.keyword?.trim()) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("parkTenant.park_tenant_code ILIKE :keyword")
            .orWhere("parkTenant.company_name ILIKE :keyword")
            .orWhere("parkTenant.unified_credit_code ILIKE :keyword")
            .orWhere("parkTenant.contact_name ILIKE :keyword")
            .orWhere("parkTenant.contact_mobile ILIKE :keyword");
        })
      ).setParameter("keyword", `%${query.keyword.trim()}%`);
    }
    if (query.status) builder.andWhere("parkTenant.status = :status", { status: query.status });
    if (query.tenant_type) builder.andWhere("parkTenant.tenant_type = :tenantType", { tenantType: query.tenant_type });
    if (query.risk_level) builder.andWhere("parkTenant.risk_level = :riskLevel", { riskLevel: query.risk_level });
    if (query.industry_code) builder.andWhere("parkTenant.industry_code = :industryCode", { industryCode: query.industry_code });
  }

  private applySort(builder: SelectQueryBuilder<ParkTenantEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("parkTenant.updateTime", "DESC").addOrderBy("parkTenant.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("parkTenant.updateTime", "DESC").addOrderBy("parkTenant.createTime", "DESC");
      return;
    }
    builder.orderBy(`parkTenant.${field}`, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<ParkTenantEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    if (actor) {
      await Promise.all([
        this.dataScopeService.buildScopeFilter(actor, "park"),
        this.dataScopeService.buildScopeFilter(actor, "tenant_company")
      ]);
    }
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "tenant_company", "parkTenant", { tenantCompany: "id" });
  }

  private async resolveParkTenantCode(scope: TenantParkScope, actorId: string, code?: string): Promise<string> {
    const providedCode = code?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateNext(scope, actorId, "PARK_TENANT_CODE");
    return generated.code;
  }

  private async assertParkTenantCodeAvailable(scope: TenantParkScope, code: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope).andWhere("parkTenant.park_tenant_code = :code", { code });
    if (excludeId) builder.andWhere("parkTenant.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Park tenant code already exists");
    }
  }

  private async assertUnifiedCreditCodeAvailable(scope: TenantParkScope, unifiedCreditCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedBuilder(scope).andWhere("parkTenant.unified_credit_code = :unifiedCreditCode", { unifiedCreditCode });
    if (excludeId) builder.andWhere("parkTenant.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("Unified credit code already exists");
    }
  }

  private normalizeRiskTags(tags: string[] | undefined): string[] {
    return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  }

  private async resolveRiskLevel(scope: TenantParkScope, rawRiskLevel: string): Promise<Pick<DictItemEntity, "itemValue" | "sortOrder">> {
    const riskLevel = rawRiskLevel.trim();
    if (!riskLevel) {
      throw new BadRequestException("risk_level is required");
    }
    const item = await this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictItem.status = :status", { status: "enabled" })
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode: "park_tenant_risk_level" })
      .andWhere("dictType.status = :status", { status: "enabled" })
      .andWhere("dictType.is_deleted = false")
      .andWhere(new Brackets((qb) => {
        qb.where("dictItem.item_value = :riskLevel").orWhere("CAST(dictItem.sort_order AS text) = :riskLevel");
      }))
      .setParameter("riskLevel", riskLevel)
      .getOne();
    if (!item) {
      throw new BadRequestException("risk_level is not in park_tenant_risk_level dictionary");
    }
    return { itemValue: item.itemValue, sortOrder: item.sortOrder };
  }

  private emptyToNull(value: string | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private toTenant360Profile(profile: Partial<ParkTenantEntity>) {
    return {
      id: profile.id,
      code: profile.code ?? null,
      parkTenantCode: profile.parkTenantCode,
      companyName: profile.companyName,
      unifiedCreditCode: profile.unifiedCreditCode ?? null,
      legalPerson: profile.legalPerson ?? null,
      legalPersonId: profile.legalPersonId ?? null,
      contactName: profile.contactName ?? null,
      contactMobile: profile.contactMobile ?? null,
      contactEmail: profile.contactEmail ?? null,
      industryCode: profile.industryCode ?? null,
      industryDetail: profile.industryDetail ?? null,
      businessScope: profile.businessScope ?? null,
      tenantType: profile.tenantType ?? null,
      riskLevel: profile.riskLevel ?? null,
      riskTags: profile.riskTags ?? [],
      checkInDate: profile.checkInDate ?? null,
      checkOutDate: profile.checkOutDate ?? null,
      status: profile.status,
      sourceType: profile.sourceType,
      remark: profile.remark ?? null,
      createTime: profile.createTime,
      updateTime: profile.updateTime
    };
  }

  private sanitizeQualificationFiles(qualifications: ParkTenantQualificationEntity[]): ParkTenantQualificationEntity[] {
    return qualifications.map((qualification) => {
      const record = qualification as ParkTenantQualificationEntity & Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, "fileId")) {
        record.file = null;
      }
      return record;
    });
  }
}
