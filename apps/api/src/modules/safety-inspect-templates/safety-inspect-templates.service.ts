import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, DataSource, Repository, SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import type { DataScopeFilter } from "../data-scopes/data-scope.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { CreateSafetyInspectItemDto } from "./dto/create-safety-inspect-item.dto";
import { CreateSafetyInspectTemplateDto } from "./dto/create-safety-inspect-template.dto";
import { SafetyInspectTemplateQueryDto } from "./dto/safety-inspect-template-query.dto";
import { UpdateSafetyInspectItemDto } from "./dto/update-safety-inspect-item.dto";
import { UpdateSafetyInspectTemplateDto } from "./dto/update-safety-inspect-template.dto";
import { SafetyInspectItemEntity } from "./entities/safety-inspect-item.entity";
import { SafetyInspectTemplateEntity } from "./entities/safety-inspect-template.entity";

@Injectable()
export class SafetyInspectTemplatesService {
  constructor(
    @InjectRepository(SafetyInspectTemplateEntity)
    private readonly templatesRepository: Repository<SafetyInspectTemplateEntity>,
    @InjectRepository(SafetyInspectItemEntity)
    private readonly itemsRepository: Repository<SafetyInspectItemEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly dataSource: DataSource
  ) {}

  async list(
    scope: TenantParkScope,
    query: SafetyInspectTemplateQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<SafetyInspectTemplateEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedTemplateBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", "inspect_template", items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyInspectTemplateEntity> {
    const entity = await this.findTemplate(scope, id, true);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", "inspect_template", entity);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSafetyInspectTemplateDto): Promise<SafetyInspectTemplateEntity> {
    this.assertRequired(dto.template_name, "template_name is required");
    const templateType = dto.template_type ?? "comprehensive";
    const status = dto.status ?? "enabled";
    await this.validateTemplateDictionaries(scope, templateType, status);
    const generated = dto.template_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_INSPECT_TEMPLATE_CODE");
    const templateCode = dto.template_code ?? generated?.code ?? "";
    await this.assertTemplateCodeAvailable(scope, templateCode);
    const entity = this.templatesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: templateCode,
      templateCode,
      templateName: dto.template_name,
      templateType,
      description: dto.description ?? null,
      status,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.templatesRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateSafetyInspectTemplateDto
  ): Promise<SafetyInspectTemplateEntity> {
    const entity = await this.findTemplate(scope, id);
    const nextTemplateCode = dto.template_code ?? entity.templateCode;
    const nextTemplateType = dto.template_type ?? entity.templateType;
    const nextStatus = dto.status ?? entity.status;
    await this.validateTemplateDictionaries(scope, nextTemplateType, nextStatus);
    if (nextTemplateCode !== entity.templateCode) {
      await this.assertTemplateCodeAvailable(scope, nextTemplateCode, entity.id);
    }
    Object.assign(entity, {
      code: nextTemplateCode,
      templateCode: nextTemplateCode,
      templateName: dto.template_name ?? entity.templateName,
      templateType: nextTemplateType,
      description: dto.description === undefined ? entity.description : dto.description ?? null,
      status: nextStatus,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.templatesRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDeleteTemplate(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findTemplate(scope, id);
    await this.assertNoEnabledPlans(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.templatesRepository.save(entity);
    return { id };
  }

  async listItems(scope: TenantParkScope, templateId: string, actor?: JwtPrincipal): Promise<SafetyInspectItemEntity[]> {
    await this.findTemplate(scope, templateId);
    const items = await this.itemsRepository
      .createQueryBuilder("item")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.template_id = :templateId", { templateId })
      .andWhere("item.is_deleted = false")
      .orderBy("item.sortNo", "ASC")
      .addOrderBy("item.createTime", "ASC")
      .getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", "inspect_item", items);
  }

  async createItem(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    templateId: string,
    dto: CreateSafetyInspectItemDto
  ): Promise<SafetyInspectItemEntity> {
    const template = await this.findTemplate(scope, templateId);
    this.assertRequired(dto.item_name, "item_name is required");
    const itemType = dto.item_type ?? "normal_abnormal";
    const status = dto.status ?? "enabled";
    await this.validateItemDictionaries(scope, itemType, dto.hazard_type, dto.default_risk_level, status);
    const itemCode = dto.item_code ?? await this.generateItemCode(scope, template);
    await this.assertItemCodeAvailable(scope, templateId, itemCode);
    const entity = this.itemsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      templateId,
      itemCode,
      itemName: dto.item_name,
      itemType,
      hazardType: dto.hazard_type ?? null,
      defaultRiskLevel: dto.default_risk_level ?? null,
      required: dto.required ?? true,
      sortNo: dto.sort_no ?? 0,
      standardDesc: dto.standard_desc ?? null,
      status,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.itemsRepository.save(entity);
    return this.findItem(scope, templateId, saved.id, actor);
  }

  async updateItem(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    templateId: string,
    itemId: string,
    dto: UpdateSafetyInspectItemDto
  ): Promise<SafetyInspectItemEntity> {
    await this.findTemplate(scope, templateId);
    const entity = await this.findItem(scope, templateId, itemId);
    const nextItemCode = dto.item_code ?? entity.itemCode;
    const nextItemType = dto.item_type ?? entity.itemType;
    const nextHazardType = dto.hazard_type === undefined ? entity.hazardType ?? undefined : dto.hazard_type;
    const nextRiskLevel = dto.default_risk_level === undefined ? entity.defaultRiskLevel ?? undefined : dto.default_risk_level;
    const nextStatus = dto.status ?? entity.status;
    await this.validateItemDictionaries(scope, nextItemType, nextHazardType, nextRiskLevel, nextStatus);
    if (nextItemCode && nextItemCode !== entity.itemCode) {
      await this.assertItemCodeAvailable(scope, templateId, nextItemCode, entity.id);
    }
    Object.assign(entity, {
      itemCode: nextItemCode ?? entity.itemCode,
      itemName: dto.item_name ?? entity.itemName,
      itemType: nextItemType,
      hazardType: dto.hazard_type === undefined ? entity.hazardType : dto.hazard_type ?? null,
      defaultRiskLevel: dto.default_risk_level === undefined ? entity.defaultRiskLevel : dto.default_risk_level ?? null,
      required: dto.required ?? entity.required,
      sortNo: dto.sort_no ?? entity.sortNo,
      standardDesc: dto.standard_desc === undefined ? entity.standardDesc : dto.standard_desc ?? null,
      status: nextStatus,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.itemsRepository.save(entity);
    return this.findItem(scope, templateId, saved.id, actor);
  }

  async softDeleteItem(scope: TenantParkScope, actor: JwtPrincipal, templateId: string, itemId: string): Promise<{ id: string }> {
    await this.findTemplate(scope, templateId);
    const entity = await this.findItem(scope, templateId, itemId);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.itemsRepository.save(entity);
    return { id: itemId };
  }

  private scopedTemplateBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyInspectTemplateEntity> {
    return this.templatesRepository
      .createQueryBuilder("template")
      .where("template.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("template.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("template.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<SafetyInspectTemplateEntity>, query: SafetyInspectTemplateQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("template.template_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("template.template_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("template.description ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.template_type) builder.andWhere("template.template_type = :templateType", { templateType: query.template_type });
    if (query.status) builder.andWhere("template.status = :status", { status: query.status });
  }

  private applySort(builder: SelectQueryBuilder<SafetyInspectTemplateEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      template_code: "template.templateCode",
      template_name: "template.templateName",
      template_type: "template.templateType",
      update_time: "template.updateTime",
      create_time: "template.createTime"
    };
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? "template.updateTime", direction as "ASC" | "DESC");
      return;
    }
    builder.orderBy("template.updateTime", "DESC");
  }

  private async findTemplate(scope: TenantParkScope, id: string, withItems = false): Promise<SafetyInspectTemplateEntity> {
    const builder = this.scopedTemplateBuilder(scope).andWhere("template.id = :id", { id });
    if (withItems) {
      builder
        .leftJoinAndSelect("template.items", "item", "item.is_deleted = false")
        .addOrderBy("item.sortNo", "ASC")
        .addOrderBy("item.createTime", "ASC");
    }
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Inspect template not found");
    }
    return entity;
  }

  private async findItem(
    scope: TenantParkScope,
    templateId: string,
    itemId: string,
    actor?: JwtPrincipal
  ): Promise<SafetyInspectItemEntity> {
    const entity = await this.itemsRepository
      .createQueryBuilder("item")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.template_id = :templateId", { templateId })
      .andWhere("item.id = :itemId", { itemId })
      .andWhere("item.is_deleted = false")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Inspect item not found");
    }
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", "inspect_item", entity);
  }

  private async validateTemplateDictionaries(scope: TenantParkScope, templateType: string, status: string): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "safety_inspect_template_type", templateType),
      this.assertDictValue(scope, "safety_inspect_template_status", status)
    ]);
  }

  private async validateItemDictionaries(
    scope: TenantParkScope,
    itemType: string,
    hazardType?: string | null,
    defaultRiskLevel?: string | null,
    status?: string | null
  ): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "safety_inspect_item_type", itemType),
      hazardType ? this.assertDictValue(scope, "safety_hazard_type", hazardType) : Promise.resolve(),
      defaultRiskLevel ? this.assertDictValue(scope, "safety_risk_level", defaultRiskLevel) : Promise.resolve(),
      status ? this.assertDictValue(scope, "safety_inspect_template_status", status) : Promise.resolve()
    ]);
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, itemValue: string): Promise<void> {
    const item = await this.dictItemsRepository
      .createQueryBuilder("item")
      .innerJoin("item.dictType", "dictType")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.is_deleted = false")
      .andWhere("item.status = :status", { status: "enabled" })
      .andWhere("dictType.dict_code = :dictCode", { dictCode })
      .andWhere("item.item_value = :itemValue", { itemValue })
      .getOne();
    if (!item) {
      throw new BadRequestException(`${dictCode} value is invalid`);
    }
  }

  private async assertTemplateCodeAvailable(scope: TenantParkScope, templateCode: string, ignoreId?: string): Promise<void> {
    const builder = this.templatesRepository
      .createQueryBuilder("template")
      .where("template.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("template.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("template.template_code = :templateCode", { templateCode })
      .andWhere("template.is_deleted = false");
    if (ignoreId) {
      builder.andWhere("template.id <> :ignoreId", { ignoreId });
    }
    const count = await builder.getCount();
    if (count > 0) {
      throw new ConflictException("Inspect template code already exists");
    }
  }

  private async assertItemCodeAvailable(scope: TenantParkScope, templateId: string, itemCode: string, ignoreId?: string): Promise<void> {
    const builder = this.itemsRepository
      .createQueryBuilder("item")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.template_id = :templateId", { templateId })
      .andWhere("item.item_code = :itemCode", { itemCode })
      .andWhere("item.is_deleted = false");
    if (ignoreId) {
      builder.andWhere("item.id <> :ignoreId", { ignoreId });
    }
    const count = await builder.getCount();
    if (count > 0) {
      throw new ConflictException("Inspect item code already exists");
    }
  }

  private async generateItemCode(scope: TenantParkScope, template: SafetyInspectTemplateEntity): Promise<string> {
    const count = await this.itemsRepository
      .createQueryBuilder("item")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.template_id = :templateId", { templateId: template.id })
      .getCount();
    return `${template.templateCode}-${String(count + 1).padStart(3, "0")}`;
  }

  private assertRequired(value: string | undefined, message: string): void {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException(message);
    }
  }

  private async assertNoEnabledPlans(scope: TenantParkScope, templateId: string): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    try {
      const hasPlanTable = await runner.hasTable("biz_safety_inspect_plan");
      if (!hasPlanTable || !(await runner.hasColumn("biz_safety_inspect_plan", "template_id"))) {
        return;
      }
    } finally {
      await runner.release();
    }
    const row = await this.dataSource
      .createQueryBuilder()
      .select("COUNT(1)", "count")
      .from("biz_safety_inspect_plan", "plan")
      .where("plan.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("plan.template_id = :templateId", { templateId })
      .andWhere("plan.is_deleted = false")
      .andWhere("plan.status IN (:...enabledStatuses)", { enabledStatuses: ["enabled", "active", "10", "20"] })
      .getRawOne<{ count: string }>();
    if (Number(row?.count ?? 0) > 0) {
      throw new BadRequestException("Inspect template has enabled inspection plans and cannot be deleted");
    }
  }

  private async applyDataScope(builder: SelectQueryBuilder<SafetyInspectTemplateEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const parkFilter = await this.dataScopeService.buildScopeFilter(actor, "park");
    this.applyConfiguredIdScopeFilter(builder, "template", "park_id", parkFilter, "safetyTemplateParkScopeIds");
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<SafetyInspectTemplateEntity>,
    alias: string,
    column: string,
    filter: DataScopeFilter,
    parameterName: string
  ): void {
    if (filter.unrestricted) return;
    if (filter.allowed_ids.length > 0) {
      builder.andWhere(`${alias}.${column} IN (:...${parameterName})`, { [parameterName]: filter.allowed_ids });
      return;
    }
    if (filter.scope_types.includes("custom")) {
      builder.andWhere("1 = 0");
    }
  }
}
