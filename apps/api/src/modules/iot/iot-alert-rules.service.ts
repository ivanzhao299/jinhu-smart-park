import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateIotAlertRuleDto } from "./dto/create-iot-alert-rule.dto";
import type { IotAlertRuleQueryDto } from "./dto/iot-alert-rule-query.dto";
import type { UpdateIotAlertRuleDto } from "./dto/update-iot-alert-rule.dto";
import { IotAlertRuleEntity } from "./entities/iot-alert-rule.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotPointEntity } from "./entities/iot-point.entity";

const ALERT_RULE_ENTITY = "iot_alert_rule";
const ENABLED_STATUS = "enabled";
const DISABLED_STATUS = "disabled";
const NUMERIC_OPERATORS = new Set(["gt", "gte", "lt", "lte"]);
const TEXT_OPERATORS = new Set(["contains"]);
const COMPARE_OPERATORS = new Set(["eq", "neq"]);
const ALLOWED_OPERATORS = new Set(["gt", "gte", "lt", "lte", "eq", "neq", "contains", "offline"]);

export interface IotAlertRuleView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  ruleCode: string;
  ruleName: string;
  deviceType: string | null;
  deviceId: string | null;
  pointId: string | null;
  metricCode: string;
  operator: string;
  thresholdValue: string | null;
  thresholdText: string | null;
  alertLevel: string;
  alertTitleTemplate: string | null;
  alertContentTemplate: string | null;
  durationSeconds: number | null;
  cooldownSeconds: number | null;
  enabled: boolean;
  status: string;
  remark: string | null;
  createTime: Date;
  updateTime: Date;
}

@Injectable()
export class IotAlertRulesService {
  constructor(
    @InjectRepository(IotAlertRuleEntity)
    private readonly ruleRepository: Repository<IotAlertRuleEntity>,
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotPointEntity)
    private readonly pointRepository: Repository<IotPointEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: IotAlertRuleQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotAlertRuleView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedRuleBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", ALERT_RULE_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotAlertRuleView> {
    const entity = await this.findRule(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", ALERT_RULE_ENTITY, this.toView(entity));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateIotAlertRuleDto): Promise<IotAlertRuleView> {
    this.validateDto(dto);
    const binding = await this.resolveBinding(scope, dto.device_id, dto.point_id, dto.metric_code);
    const generated = dto.rule_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_ALERT_RULE_CODE");
    const ruleCode = dto.rule_code ?? generated?.code ?? "";
    this.assertRequired(ruleCode, "rule_code is required");
    await this.assertRuleCodeAvailable(scope, ruleCode);
    const enabled = dto.enabled ?? dto.status !== DISABLED_STATUS;
    const entity = this.ruleRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: dto.code ?? ruleCode,
      ruleCode,
      ruleName: dto.rule_name,
      deviceType: binding.device?.deviceType ?? dto.device_type ?? null,
      deviceId: binding.device?.id ?? null,
      pointId: binding.point?.id ?? null,
      metricCode: binding.metricCode,
      operator: dto.operator,
      thresholdValue: this.formatNumber(dto.threshold_value),
      thresholdText: dto.threshold_text ?? null,
      alertLevel: dto.alert_level,
      alertTitleTemplate: dto.alert_title_template ?? null,
      alertContentTemplate: dto.alert_content_template ?? null,
      durationSeconds: dto.duration_seconds ?? 0,
      cooldownSeconds: dto.cooldown_seconds ?? 0,
      enabled,
      status: enabled ? ENABLED_STATUS : DISABLED_STATUS,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.ruleRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateIotAlertRuleDto): Promise<IotAlertRuleView> {
    const entity = await this.findRule(scope, id, actor);
    const merged: CreateIotAlertRuleDto = {
      rule_name: dto.rule_name ?? entity.ruleName,
      metric_code: dto.metric_code ?? entity.metricCode,
      operator: dto.operator ?? entity.operator,
      threshold_value: dto.threshold_value ?? (entity.thresholdValue === null ? undefined : Number(entity.thresholdValue)),
      threshold_text: dto.threshold_text === undefined ? entity.thresholdText ?? undefined : dto.threshold_text,
      alert_level: dto.alert_level ?? entity.alertLevel
    };
    this.validateDto(merged);
    const nextRuleCode = dto.rule_code ?? entity.ruleCode;
    if (nextRuleCode !== entity.ruleCode) {
      await this.assertRuleCodeAvailable(scope, nextRuleCode, entity.id);
    }
    const binding = await this.resolveBinding(
      scope,
      dto.device_id === undefined ? entity.deviceId ?? undefined : dto.device_id,
      dto.point_id === undefined ? entity.pointId ?? undefined : dto.point_id,
      dto.metric_code ?? entity.metricCode
    );
    const enabled = dto.enabled ?? (dto.status === undefined ? entity.enabled : dto.status !== DISABLED_STATUS);
    Object.assign(entity, {
      code: dto.code === undefined ? entity.code : dto.code ?? null,
      ruleCode: nextRuleCode,
      ruleName: dto.rule_name ?? entity.ruleName,
      deviceType: binding.device?.deviceType ?? (dto.device_type === undefined ? entity.deviceType : dto.device_type ?? null),
      deviceId: binding.device?.id ?? null,
      pointId: binding.point?.id ?? null,
      metricCode: binding.metricCode,
      operator: dto.operator ?? entity.operator,
      thresholdValue: dto.threshold_value === undefined ? entity.thresholdValue : this.formatNumber(dto.threshold_value),
      thresholdText: dto.threshold_text === undefined ? entity.thresholdText : dto.threshold_text ?? null,
      alertLevel: dto.alert_level ?? entity.alertLevel,
      alertTitleTemplate: dto.alert_title_template === undefined ? entity.alertTitleTemplate : dto.alert_title_template ?? null,
      alertContentTemplate: dto.alert_content_template === undefined ? entity.alertContentTemplate : dto.alert_content_template ?? null,
      durationSeconds: dto.duration_seconds === undefined ? entity.durationSeconds : dto.duration_seconds ?? 0,
      cooldownSeconds: dto.cooldown_seconds === undefined ? entity.cooldownSeconds : dto.cooldown_seconds ?? 0,
      enabled,
      status: enabled ? ENABLED_STATUS : DISABLED_STATUS,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.ruleRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findRule(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.ruleRepository.save(entity);
    return { id };
  }

  async enable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<IotAlertRuleView> {
    return this.setEnabled(scope, actor, id, true);
  }

  async disable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<IotAlertRuleView> {
    return this.setEnabled(scope, actor, id, false);
  }

  private async setEnabled(scope: TenantParkScope, actor: JwtPrincipal, id: string, enabled: boolean): Promise<IotAlertRuleView> {
    const entity = await this.findRule(scope, id, actor);
    entity.enabled = enabled;
    entity.status = enabled ? ENABLED_STATUS : DISABLED_STATUS;
    entity.updateBy = actor.sub;
    const saved = await this.ruleRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  private scopedRuleBuilder(scope: TenantParkScope): SelectQueryBuilder<IotAlertRuleEntity> {
    return this.ruleRepository
      .createQueryBuilder("rule")
      .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rule.is_deleted = false");
  }

  private async findRule(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotAlertRuleEntity> {
    const builder = this.scopedRuleBuilder(scope).andWhere("rule.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("IoT alert rule not found");
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<IotAlertRuleEntity>, query: IotAlertRuleQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("rule.rule_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("rule.rule_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("rule.metric_code ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.device_type) builder.andWhere("rule.device_type = :deviceType", { deviceType: query.device_type });
    if (query.device_id) builder.andWhere("rule.device_id = :deviceId", { deviceId: query.device_id });
    if (query.point_id) builder.andWhere("rule.point_id = :pointId", { pointId: query.point_id });
    if (query.metric_code) builder.andWhere("rule.metric_code = :metricCode", { metricCode: query.metric_code });
    if (query.alert_level) builder.andWhere("rule.alert_level = :alertLevel", { alertLevel: query.alert_level });
    if (query.operator) builder.andWhere("rule.operator = :operator", { operator: query.operator });
    if (query.enabled === "true" || query.enabled === "false") builder.andWhere("rule.enabled = :enabled", { enabled: query.enabled === "true" });
    if (query.status) builder.andWhere("rule.status = :status", { status: query.status });
  }

  private applySort(builder: SelectQueryBuilder<IotAlertRuleEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      rule_code: "rule.ruleCode",
      rule_name: "rule.ruleName",
      metric_code: "rule.metricCode",
      alert_level: "rule.alertLevel",
      enabled: "rule.enabled",
      status: "rule.status",
      update_time: "rule.updateTime",
      create_time: "rule.createTime"
    };
    this.applyGenericSort(builder, sort, sortMap, "rule.updateTime", "rule.createTime", "DESC");
  }

  private applyGenericSort<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    sort: string | undefined,
    sortMap: Record<string, string>,
    defaultField: string,
    tieBreaker: string,
    defaultDirection: "ASC" | "DESC" = "ASC"
  ): void {
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? defaultField, direction as "ASC" | "DESC").addOrderBy(tieBreaker, "DESC");
      return;
    }
    builder.orderBy(defaultField, defaultDirection).addOrderBy(tieBreaker, "DESC");
  }

  private async applyDataScope(builder: SelectQueryBuilder<IotAlertRuleEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "rule");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "rule");
  }

  private async resolveBinding(
    scope: TenantParkScope,
    deviceId: string | undefined,
    pointId: string | undefined,
    metricCode: string
  ): Promise<{ device: IotDeviceEntity | null; point: IotPointEntity | null; metricCode: string }> {
    let device: IotDeviceEntity | null = null;
    let point: IotPointEntity | null = null;
    if (pointId) {
      point = await this.pointRepository.findOne({ where: { id: pointId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!point) throw new BadRequestException("point_id is invalid");
      if ((point.metricCode ?? point.pointCode) !== metricCode) {
        throw new BadRequestException("metric_code must match the selected point");
      }
      if (deviceId && point.deviceId !== deviceId) {
        throw new BadRequestException("point_id does not belong to device_id");
      }
      deviceId = point.deviceId;
    }
    if (deviceId) {
      device = await this.deviceRepository.findOne({ where: { id: deviceId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!device) throw new BadRequestException("device_id is invalid");
    }
    return { device, point, metricCode };
  }

  private validateDto(dto: Pick<CreateIotAlertRuleDto, "rule_name" | "metric_code" | "operator" | "alert_level" | "threshold_value" | "threshold_text">): void {
    this.assertRequired(dto.rule_name, "rule_name is required");
    this.assertRequired(dto.metric_code, "metric_code is required");
    this.assertRequired(dto.operator, "operator is required");
    this.assertRequired(dto.alert_level, "alert_level is required");
    if (!ALLOWED_OPERATORS.has(dto.operator)) {
      throw new BadRequestException("operator is invalid");
    }
    if (NUMERIC_OPERATORS.has(dto.operator) && dto.threshold_value === undefined) {
      throw new BadRequestException("threshold_value is required for numeric comparison");
    }
    if (TEXT_OPERATORS.has(dto.operator) && !dto.threshold_text) {
      throw new BadRequestException("threshold_text is required for text comparison");
    }
    if (COMPARE_OPERATORS.has(dto.operator) && dto.threshold_value === undefined && !dto.threshold_text) {
      throw new BadRequestException("threshold_value or threshold_text is required for equality comparison");
    }
  }

  private async assertRuleCodeAvailable(scope: TenantParkScope, ruleCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedRuleBuilder(scope).andWhere("rule.rule_code = :ruleCode", { ruleCode });
    if (excludeId) builder.andWhere("rule.id <> :excludeId", { excludeId });
    if (await builder.getExists()) {
      throw new ConflictException("IoT alert rule code already exists");
    }
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }

  private formatNumber(value: number | undefined): string | null {
    if (value === undefined || value === null) return null;
    return Number.isFinite(value) ? String(value) : null;
  }

  private toView(entity: IotAlertRuleEntity): IotAlertRuleView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      ruleCode: entity.ruleCode,
      ruleName: entity.ruleName,
      deviceType: entity.deviceType,
      deviceId: entity.deviceId,
      pointId: entity.pointId,
      metricCode: entity.metricCode,
      operator: entity.operator,
      thresholdValue: entity.thresholdValue,
      thresholdText: entity.thresholdText,
      alertLevel: entity.alertLevel,
      alertTitleTemplate: entity.alertTitleTemplate,
      alertContentTemplate: entity.alertContentTemplate,
      durationSeconds: entity.durationSeconds,
      cooldownSeconds: entity.cooldownSeconds,
      enabled: entity.enabled,
      status: entity.status,
      remark: entity.remark,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }
}
