import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, DataSource, In, Repository, SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import type { DataScopeFilter } from "../data-scopes/data-scope.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { RoleEntity } from "../roles/entities/role.entity";
import { SafetyInspectPointEntity } from "../safety-inspect-points/entities/safety-inspect-point.entity";
import { SafetyInspectTemplateEntity } from "../safety-inspect-templates/entities/safety-inspect-template.entity";
import { UserEntity } from "../users/entities/user.entity";
import { CreateSafetyInspectPlanDto } from "./dto/create-safety-inspect-plan.dto";
import { SafetyInspectPlanQueryDto } from "./dto/safety-inspect-plan-query.dto";
import { UpdateSafetyInspectPlanDto } from "./dto/update-safety-inspect-plan.dto";
import { SafetyInspectPlanEntity } from "./entities/safety-inspect-plan.entity";

@Injectable()
export class SafetyInspectPlansService {
  constructor(
    @InjectRepository(SafetyInspectPlanEntity)
    private readonly plansRepository: Repository<SafetyInspectPlanEntity>,
    @InjectRepository(SafetyInspectTemplateEntity)
    private readonly templatesRepository: Repository<SafetyInspectTemplateEntity>,
    @InjectRepository(SafetyInspectPointEntity)
    private readonly pointsRepository: Repository<SafetyInspectPointEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly dataSource: DataSource
  ) {}

  async list(
    scope: TenantParkScope,
    query: SafetyInspectPlanQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<SafetyInspectPlanEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", "inspect_plan", items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyInspectPlanEntity> {
    const entity = await this.findOne(scope, id);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", "inspect_plan", entity);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSafetyInspectPlanDto): Promise<SafetyInspectPlanEntity> {
    this.assertRequired(dto.plan_name, "plan_name is required");
    const pointIds = this.normalizeUniqueIds(dto.point_ids);
    const handlerUserIds = this.normalizeUniqueIds(dto.handler_user_ids ?? []);
    const handlerRoleCodes = this.normalizeUniqueStrings(dto.handler_role_codes ?? []);
    const status = dto.status ?? "disabled";
    await this.validatePlanPayload(scope, {
      templateId: dto.template_id,
      pointIds,
      handlerUserIds,
      handlerRoleCodes,
      frequencyType: dto.frequency_type,
      status,
      startDate: dto.start_date,
      endDate: dto.end_date
    });
    const generated = dto.plan_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_INSPECT_PLAN_CODE");
    const planCode = dto.plan_code ?? generated?.code ?? "";
    await this.assertPlanCodeAvailable(scope, planCode);
    const entity = this.plansRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: planCode,
      planCode,
      planName: dto.plan_name,
      templateId: dto.template_id,
      pointIds,
      frequencyType: dto.frequency_type,
      cronExpr: dto.cron_expr ?? null,
      startDate: dto.start_date,
      endDate: dto.end_date ?? null,
      handlerUserIds,
      handlerRoleCodes,
      nextGenerateTime: status === "enabled" ? this.computeNextGenerateTime(dto.start_date, dto.frequency_type) : null,
      lastGenerateTime: null,
      status,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.plansRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateSafetyInspectPlanDto): Promise<SafetyInspectPlanEntity> {
    const entity = await this.findOne(scope, id);
    const nextPlanCode = dto.plan_code ?? entity.planCode;
    const pointIds = dto.point_ids === undefined ? entity.pointIds : this.normalizeUniqueIds(dto.point_ids);
    const handlerUserIds = dto.handler_user_ids === undefined ? entity.handlerUserIds : this.normalizeUniqueIds(dto.handler_user_ids);
    const handlerRoleCodes =
      dto.handler_role_codes === undefined ? entity.handlerRoleCodes : this.normalizeUniqueStrings(dto.handler_role_codes);
    const templateId = dto.template_id ?? entity.templateId;
    const frequencyType = dto.frequency_type ?? entity.frequencyType;
    const startDate = dto.start_date ?? entity.startDate;
    const endDate = dto.end_date === undefined ? entity.endDate ?? undefined : dto.end_date;
    const status = dto.status ?? entity.status;
    await this.validatePlanPayload(scope, { templateId, pointIds, handlerUserIds, handlerRoleCodes, frequencyType, status, startDate, endDate });
    if (nextPlanCode !== entity.planCode) {
      await this.assertPlanCodeAvailable(scope, nextPlanCode, entity.id);
    }
    Object.assign(entity, {
      code: nextPlanCode,
      planCode: nextPlanCode,
      planName: dto.plan_name ?? entity.planName,
      templateId,
      pointIds,
      frequencyType,
      cronExpr: dto.cron_expr === undefined ? entity.cronExpr : dto.cron_expr ?? null,
      startDate,
      endDate: endDate ?? null,
      handlerUserIds,
      handlerRoleCodes,
      nextGenerateTime:
        status === "enabled" && (dto.start_date || dto.frequency_type || entity.nextGenerateTime === null)
          ? this.computeNextGenerateTime(startDate, frequencyType)
          : status === "enabled"
            ? entity.nextGenerateTime
            : null,
      status,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.plansRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id);
    await this.assertNoUnfinishedTasks(scope, id);
    entity.isDeleted = true;
    entity.status = "disabled";
    entity.updateBy = actor.sub;
    await this.plansRepository.save(entity);
    return { id };
  }

  async enable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<SafetyInspectPlanEntity> {
    const entity = await this.findOne(scope, id);
    await this.validatePlanPayload(scope, {
      templateId: entity.templateId,
      pointIds: entity.pointIds,
      handlerUserIds: entity.handlerUserIds,
      handlerRoleCodes: entity.handlerRoleCodes,
      frequencyType: entity.frequencyType,
      status: "enabled",
      startDate: entity.startDate,
      endDate: entity.endDate ?? undefined
    });
    entity.status = "enabled";
    entity.nextGenerateTime = this.computeNextGenerateTime(entity.startDate, entity.frequencyType);
    entity.updateBy = actor.sub;
    const saved = await this.plansRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async disable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<SafetyInspectPlanEntity> {
    const entity = await this.findOne(scope, id);
    await this.assertDictValue(scope, "safety_inspect_plan_status", "disabled");
    entity.status = "disabled";
    entity.nextGenerateTime = null;
    entity.updateBy = actor.sub;
    const saved = await this.plansRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyInspectPlanEntity> {
    return this.plansRepository
      .createQueryBuilder("plan")
      .leftJoinAndSelect("plan.template", "template")
      .where("plan.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("plan.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<SafetyInspectPlanEntity>, query: SafetyInspectPlanQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("plan.plan_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("plan.plan_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("template.template_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.template_id) builder.andWhere("plan.template_id = :templateId", { templateId: query.template_id });
    if (query.frequency_type) builder.andWhere("plan.frequency_type = :frequencyType", { frequencyType: query.frequency_type });
    if (query.status) builder.andWhere("plan.status = :status", { status: query.status });
    if (query.start_date) builder.andWhere("plan.start_date >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("(plan.end_date IS NULL OR plan.end_date <= :endDate)", { endDate: query.end_date });
    if (query.point_id) builder.andWhere("plan.point_ids @> CAST(:pointIdJson AS jsonb)", { pointIdJson: JSON.stringify([query.point_id]) });
    if (query.handler_user_id) {
      builder.andWhere("plan.handler_user_ids @> CAST(:handlerUserIdJson AS jsonb)", { handlerUserIdJson: JSON.stringify([query.handler_user_id]) });
    }
  }

  private applySort(builder: SelectQueryBuilder<SafetyInspectPlanEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      plan_code: "plan.planCode",
      plan_name: "plan.planName",
      frequency_type: "plan.frequencyType",
      status: "plan.status",
      next_generate_time: "plan.nextGenerateTime",
      update_time: "plan.updateTime",
      create_time: "plan.createTime"
    };
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? "plan.updateTime", direction as "ASC" | "DESC");
      return;
    }
    builder.orderBy("plan.updateTime", "DESC");
  }

  private async findOne(scope: TenantParkScope, id: string): Promise<SafetyInspectPlanEntity> {
    const entity = await this.scopedBuilder(scope).andWhere("plan.id = :id", { id }).getOne();
    if (!entity) {
      throw new NotFoundException("Inspect plan not found");
    }
    return entity;
  }

  private async validatePlanPayload(
    scope: TenantParkScope,
    payload: {
      templateId?: string;
      pointIds: string[];
      handlerUserIds: string[];
      handlerRoleCodes: string[];
      frequencyType?: string;
      status: string;
      startDate?: string;
      endDate?: string | null;
    }
  ): Promise<void> {
    this.assertRequired(payload.templateId, "template_id is required");
    this.assertRequired(payload.frequencyType, "frequency_type is required");
    this.assertRequired(payload.startDate, "start_date is required");
    if (payload.pointIds.length === 0) {
      throw new BadRequestException("point_ids must contain at least one inspect point");
    }
    if (payload.handlerUserIds.length === 0 && payload.handlerRoleCodes.length === 0) {
      throw new BadRequestException("handler_user_ids or handler_role_codes is required");
    }
    if (payload.endDate && payload.startDate && new Date(payload.endDate).getTime() < new Date(payload.startDate).getTime()) {
      throw new BadRequestException("end_date must be greater than or equal to start_date");
    }
    await Promise.all([
      this.assertEnabledTemplate(scope, payload.templateId),
      this.assertPoints(scope, payload.pointIds),
      this.assertUsers(scope, payload.handlerUserIds),
      this.assertRoles(scope, payload.handlerRoleCodes),
      this.assertDictValue(scope, "safety_inspect_frequency", payload.frequencyType),
      this.assertDictValue(scope, "safety_inspect_plan_status", payload.status)
    ]);
  }

  private async assertEnabledTemplate(scope: TenantParkScope, templateId?: string): Promise<void> {
    if (!templateId) {
      throw new BadRequestException("template_id is required");
    }
    const template = await this.templatesRepository.findOne({
      where: { id: templateId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!template || template.status !== "enabled") {
      throw new BadRequestException("template_id must reference an enabled inspect template in current park");
    }
  }

  private async assertPoints(scope: TenantParkScope, pointIds: string[]): Promise<void> {
    const count = await this.pointsRepository.count({
      where: { id: In(pointIds), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
    if (count !== pointIds.length) {
      throw new BadRequestException("point_ids contain invalid or disabled inspect points");
    }
  }

  private async assertUsers(scope: TenantParkScope, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const count = await this.usersRepository.count({
      where: { id: In(userIds), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
    if (count !== userIds.length) {
      throw new BadRequestException("handler_user_ids contain invalid users");
    }
  }

  private async assertRoles(scope: TenantParkScope, roleCodes: string[]): Promise<void> {
    if (roleCodes.length === 0) return;
    const count = await this.rolesRepository.count({
      where: { code: In(roleCodes), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
    if (count !== roleCodes.length) {
      throw new BadRequestException("handler_role_codes contain invalid roles");
    }
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, itemValue?: string | null): Promise<void> {
    if (!itemValue) {
      throw new BadRequestException(`${dictCode} value is required`);
    }
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

  private async assertPlanCodeAvailable(scope: TenantParkScope, planCode: string, ignoreId?: string): Promise<void> {
    const builder = this.plansRepository
      .createQueryBuilder("plan")
      .where("plan.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("plan.plan_code = :planCode", { planCode })
      .andWhere("plan.is_deleted = false");
    if (ignoreId) {
      builder.andWhere("plan.id <> :ignoreId", { ignoreId });
    }
    const count = await builder.getCount();
    if (count > 0) {
      throw new ConflictException("Inspect plan code already exists");
    }
  }

  private assertRequired(value: string | undefined, message: string): void {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException(message);
    }
  }

  private normalizeUniqueIds(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  }

  private normalizeUniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  }

  private computeNextGenerateTime(startDate: string, frequencyType: string): Date {
    const next = new Date(`${startDate}T00:00:00.000Z`);
    const now = new Date();
    if (next.getTime() >= now.getTime()) {
      return next;
    }
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (frequencyType === "weekly") cursor.setUTCDate(cursor.getUTCDate() + 7);
    if (frequencyType === "monthly") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    if (frequencyType === "quarterly") cursor.setUTCMonth(cursor.getUTCMonth() + 3);
    if (frequencyType === "yearly") cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    return cursor;
  }

  private async assertNoUnfinishedTasks(scope: TenantParkScope, planId: string): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    try {
      const hasTaskTable = await runner.hasTable("biz_safety_inspect_task");
      if (!hasTaskTable || !(await runner.hasColumn("biz_safety_inspect_task", "plan_id"))) {
        return;
      }
    } finally {
      await runner.release();
    }
    const row = await this.dataSource
      .createQueryBuilder()
      .select("COUNT(1)", "count")
      .from("biz_safety_inspect_task", "task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.plan_id = :planId", { planId })
      .andWhere("task.is_deleted = false")
      .andWhere("task.status NOT IN (:...doneStatuses)", { doneStatuses: ["30", "60", "70", "90", "100", "completed", "closed", "cancelled"] })
      .getRawOne<{ count: string }>();
    if (Number(row?.count ?? 0) > 0) {
      throw new BadRequestException("Inspect plan has unfinished inspection tasks and cannot be deleted");
    }
  }

  private async applyDataScope(builder: SelectQueryBuilder<SafetyInspectPlanEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const parkFilter = await this.dataScopeService.buildScopeFilter(actor, "park");
    this.applyConfiguredIdScopeFilter(builder, "plan", "park_id", parkFilter, "safetyPlanParkScopeIds");
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<SafetyInspectPlanEntity>,
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
