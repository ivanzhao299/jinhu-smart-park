import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { IOT_RULE_ACTION_TYPES, type CreateIotRuleDto, type IotRuleActionConfig, type IotRuleActionType } from "./dto/create-iot-rule.dto";
import type { IotRuleExecutionLogQueryDto, IotRuleQueryDto } from "./dto/iot-rule-query.dto";
import type { TestIotRuleDto } from "./dto/test-iot-rule.dto";
import type { UpdateIotRuleDto } from "./dto/update-iot-rule.dto";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotRuleExecutionLogEntity } from "./entities/iot-rule-execution-log.entity";
import { IotRuleEntity } from "./entities/iot-rule.entity";
import { UnifiedActionExecutorService } from "./unified-action-executor.service";

const RULE_ENTITY = "iot_rule";
const RULE_LOG_ENTITY = "iot_rule_execution_log";
const ENABLED_STATUS = "ENABLED";
const DISABLED_STATUS = "DISABLED";
const ALLOWED_ACTION_TYPES = new Set<string>(IOT_RULE_ACTION_TYPES);
const ALERT_LEVEL_ORDER: Record<string, number> = {
  info: 10,
  low: 10,
  warning: 20,
  medium: 20,
  major: 30,
  high: 30,
  critical: 40
};

export interface IotRuleView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  triggerScope: string;
  deviceId: string | null;
  deviceType: string | null;
  areaId: string | null;
  conditionJson: Record<string, unknown>;
  actionJson: Array<Record<string, unknown>>;
  priority: number;
  status: string;
  lastTriggeredAt: Date | null;
  remark: string | null;
  createTime: Date;
  updateTime: Date;
}

export interface IotRuleExecutionLogView {
  id: string;
  tenantId: string;
  parkId: string;
  ruleId: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  actionResult: Array<Record<string, unknown>>;
  executionStatus: string;
  errorMessage: string | null;
  executedAt: Date;
  createTime: Date;
}

export interface IotRuleTriggerPayload extends Record<string, unknown> {
  device_id?: string;
  device_code?: string;
  device_type?: string;
  area_id?: string;
  building_id?: string;
  floor_id?: string;
  unit_id?: string;
  park_tenant_id?: string;
  status?: string;
  alert_level?: string;
  metric_code?: string;
  value?: unknown;
  metrics?: Record<string, unknown>;
}

@Injectable()
export class IotRuleEngineService {
  private readonly logger = new Logger(IotRuleEngineService.name);

  constructor(
    @InjectRepository(IotRuleEntity)
    private readonly ruleRepository: Repository<IotRuleEntity>,
    @InjectRepository(IotRuleExecutionLogEntity)
    private readonly logRepository: Repository<IotRuleExecutionLogEntity>,
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly unifiedActionExecutor: UnifiedActionExecutorService
  ) {}

  async list(scope: TenantParkScope, query: IotRuleQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotRuleView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedRuleBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toRuleView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", RULE_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotRuleView> {
    const entity = await this.findRule(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", RULE_ENTITY, this.toRuleView(entity));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateIotRuleDto): Promise<IotRuleView> {
    this.validateRuleDto(dto);
    await this.validateRuleBinding(scope, dto.trigger_scope ?? "PARK", dto.device_id, dto.device_type);
    const generated = dto.rule_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_RULE_CODE");
    const ruleCode = dto.rule_code ?? generated?.code ?? "";
    this.assertRequired(ruleCode, "rule_code is required");
    await this.assertRuleCodeAvailable(scope, ruleCode);
    const entity = this.ruleRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: dto.code ?? ruleCode,
      ruleCode,
      ruleName: dto.rule_name.trim(),
      ruleType: dto.rule_type,
      triggerScope: dto.trigger_scope ?? "PARK",
      deviceId: dto.device_id ?? null,
      deviceType: dto.device_type ?? null,
      areaId: dto.area_id ?? null,
      conditionJson: dto.condition_json ?? {},
      actionJson: dto.action_json,
      priority: dto.priority ?? 100,
      status: dto.status ?? DISABLED_STATUS,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.ruleRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateIotRuleDto): Promise<IotRuleView> {
    const entity = await this.findRule(scope, id, actor);
    const merged: CreateIotRuleDto = {
      rule_name: dto.rule_name ?? entity.ruleName,
      rule_type: (dto.rule_type ?? entity.ruleType) as CreateIotRuleDto["rule_type"],
      trigger_scope: (dto.trigger_scope ?? entity.triggerScope) as CreateIotRuleDto["trigger_scope"],
      device_id: dto.device_id === undefined ? entity.deviceId ?? undefined : dto.device_id,
      device_type: dto.device_type === undefined ? entity.deviceType ?? undefined : dto.device_type,
      area_id: dto.area_id === undefined ? entity.areaId ?? undefined : dto.area_id,
      condition_json: dto.condition_json ?? entity.conditionJson,
      action_json: dto.action_json ?? entity.actionJson,
      priority: dto.priority ?? entity.priority,
      status: (dto.status ?? entity.status) as CreateIotRuleDto["status"]
    };
    this.validateRuleDto(merged);
    await this.validateRuleBinding(scope, merged.trigger_scope ?? "PARK", merged.device_id, merged.device_type);
    const nextCode = dto.rule_code ?? entity.ruleCode;
    if (nextCode !== entity.ruleCode) {
      await this.assertRuleCodeAvailable(scope, nextCode, entity.id);
    }
    Object.assign(entity, {
      code: dto.code === undefined ? entity.code : dto.code ?? null,
      ruleCode: nextCode,
      ruleName: dto.rule_name ?? entity.ruleName,
      ruleType: dto.rule_type ?? entity.ruleType,
      triggerScope: dto.trigger_scope ?? entity.triggerScope,
      deviceId: dto.device_id === undefined ? entity.deviceId : dto.device_id ?? null,
      deviceType: dto.device_type === undefined ? entity.deviceType : dto.device_type ?? null,
      areaId: dto.area_id === undefined ? entity.areaId : dto.area_id ?? null,
      conditionJson: dto.condition_json ?? entity.conditionJson,
      actionJson: dto.action_json ?? entity.actionJson,
      priority: dto.priority ?? entity.priority,
      status: dto.status ?? entity.status,
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

  async enable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<IotRuleView> {
    return this.setStatus(scope, actor, id, ENABLED_STATUS);
  }

  async disable(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<IotRuleView> {
    return this.setStatus(scope, actor, id, DISABLED_STATUS);
  }

  async test(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: TestIotRuleDto): Promise<IotRuleExecutionLogView> {
    const rule = await this.findRule(scope, id, actor);
    const payload = {
      ...(dto.trigger_payload ?? {}),
      manual_test: true,
      trigger_time: new Date().toISOString()
    };
    const log = await this.executeRule(scope, rule, "MANUAL", payload, actor, true);
    return this.toLogView(log);
  }

  async executionLogs(
    scope: TenantParkScope,
    query: IotRuleExecutionLogQueryDto,
    actor?: JwtPrincipal,
    ruleId?: string
  ): Promise<PaginatedResult<IotRuleExecutionLogView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 50;
    const builder = this.logRepository
      .createQueryBuilder("log")
      .innerJoin(IotRuleEntity, "rule", "rule.id = log.rule_id AND rule.tenant_id = log.tenant_id AND rule.park_id = log.park_id")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.is_deleted = false")
      .andWhere("rule.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "rule");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "rule");
    if (ruleId) builder.andWhere("log.rule_id = :ruleId", { ruleId });
    if (query.rule_id) builder.andWhere("log.rule_id = :queryRuleId", { queryRuleId: query.rule_id });
    if (query.trigger_type) builder.andWhere("log.trigger_type = :triggerType", { triggerType: query.trigger_type });
    if (query.execution_status) builder.andWhere("log.execution_status = :executionStatus", { executionStatus: query.execution_status });
    const start = this.parseDate(query.start_time, "start_time");
    const end = this.parseDate(query.end_time, "end_time");
    if (start) builder.andWhere("log.executed_at >= :start", { start });
    if (end) builder.andWhere("log.executed_at <= :end", { end });
    this.applyLogSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toLogView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", RULE_LOG_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async triggerRules(scope: TenantParkScope, triggerType: string, payload: IotRuleTriggerPayload, actor?: JwtPrincipal): Promise<IotRuleExecutionLogView[]> {
    const ruleType = this.normalizeRuleType(triggerType);
    const builder = this.scopedRuleBuilder(scope)
      .andWhere("rule.rule_type = :ruleType", { ruleType })
      .andWhere("rule.status = :status", { status: ENABLED_STATUS });
    this.applyTriggerScope(builder, payload);
    const rules = await builder.orderBy("rule.priority", "ASC").addOrderBy("rule.updateTime", "DESC").take(200).getMany();
    const logs: IotRuleExecutionLogView[] = [];
    for (const rule of rules) {
      const log = await this.executeRule(scope, rule, ruleType, payload, actor, false);
      logs.push(this.toLogView(log));
    }
    return logs;
  }

  async scanScheduleRules(): Promise<{ scanned_count: number; executed_count: number }> {
    const rules = await this.ruleRepository
      .createQueryBuilder("rule")
      .where("rule.is_deleted = false")
      .andWhere("rule.rule_type = :ruleType", { ruleType: "SCHEDULE" })
      .andWhere("rule.status = :status", { status: ENABLED_STATUS })
      .orderBy("rule.priority", "ASC")
      .take(500)
      .getMany();
    let executed = 0;
    for (const rule of rules) {
      const scope = { tenantId: rule.tenantId, parkId: rule.parkId };
      const log = await this.executeRule(scope, rule, "SCHEDULE", { schedule_time: new Date().toISOString() }, undefined, false);
      if (log.executionStatus === "SUCCESS") executed += 1;
    }
    return { scanned_count: rules.length, executed_count: executed };
  }

  private async setStatus(scope: TenantParkScope, actor: JwtPrincipal, id: string, status: string): Promise<IotRuleView> {
    const entity = await this.findRule(scope, id, actor);
    entity.status = status;
    entity.updateBy = actor.sub;
    const saved = await this.ruleRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  private scopedRuleBuilder(scope: TenantParkScope): SelectQueryBuilder<IotRuleEntity> {
    return this.ruleRepository
      .createQueryBuilder("rule")
      .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rule.is_deleted = false");
  }

  private async findRule(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotRuleEntity> {
    const builder = this.scopedRuleBuilder(scope).andWhere("rule.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("IoT rule not found");
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<IotRuleEntity>, query: IotRuleQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("rule.rule_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("rule.rule_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("rule.device_type ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.rule_type) builder.andWhere("rule.rule_type = :ruleType", { ruleType: query.rule_type });
    if (query.trigger_scope) builder.andWhere("rule.trigger_scope = :triggerScope", { triggerScope: query.trigger_scope });
    if (query.device_id) builder.andWhere("rule.device_id = :deviceId", { deviceId: query.device_id });
    if (query.device_type) builder.andWhere("rule.device_type = :deviceType", { deviceType: query.device_type });
    if (query.area_id) builder.andWhere("rule.area_id = :areaId", { areaId: query.area_id });
    if (query.status) builder.andWhere("rule.status = :status", { status: query.status });
  }

  private applySort(builder: SelectQueryBuilder<IotRuleEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      rule_code: "rule.ruleCode",
      rule_name: "rule.ruleName",
      rule_type: "rule.ruleType",
      trigger_scope: "rule.triggerScope",
      priority: "rule.priority",
      status: "rule.status",
      last_triggered_at: "rule.lastTriggeredAt",
      update_time: "rule.updateTime",
      create_time: "rule.createTime"
    };
    this.applyGenericSort(builder, sort, sortMap, "rule.updateTime", "rule.createTime", "DESC");
  }

  private applyLogSort(builder: SelectQueryBuilder<IotRuleExecutionLogEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      trigger_type: "log.triggerType",
      execution_status: "log.executionStatus",
      executed_at: "log.executedAt",
      create_time: "log.createTime"
    };
    this.applyGenericSort(builder, sort, sortMap, "log.executedAt", "log.createTime", "DESC");
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

  private async applyDataScope(builder: SelectQueryBuilder<IotRuleEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "rule");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "rule");
  }

  private applyTriggerScope(builder: SelectQueryBuilder<IotRuleEntity>, payload: IotRuleTriggerPayload): void {
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("rule.trigger_scope = 'PARK'");
        if (payload.device_id) qb.orWhere("rule.trigger_scope = 'DEVICE' AND rule.device_id = :deviceId", { deviceId: payload.device_id });
        if (payload.device_type) {
          qb.orWhere("rule.trigger_scope = 'DEVICE_TYPE' AND rule.device_type = :deviceType", { deviceType: payload.device_type });
        }
        if (payload.area_id) qb.orWhere("rule.trigger_scope = 'AREA' AND rule.area_id = :areaId", { areaId: payload.area_id });
      })
    );
  }

  private validateRuleDto(dto: Pick<CreateIotRuleDto, "rule_name" | "rule_type" | "trigger_scope" | "device_id" | "device_type" | "action_json">): void {
    this.assertRequired(dto.rule_name, "rule_name is required");
    this.assertRequired(dto.rule_type, "rule_type is required");
    if (!dto.action_json || dto.action_json.length === 0) {
      throw new BadRequestException("action_json is required");
    }
    for (const action of dto.action_json) {
      const type = this.extractActionType(action);
      if (!ALLOWED_ACTION_TYPES.has(type)) {
        throw new BadRequestException(`Unsupported rule action: ${type}`);
      }
      if (type === "CALL_WEBHOOK") this.validateWebhookAction(action);
    }
    const scope = dto.trigger_scope ?? "PARK";
    if (scope === "DEVICE" && !dto.device_id) throw new BadRequestException("device_id is required for DEVICE scope");
    if (scope === "DEVICE_TYPE" && !dto.device_type) throw new BadRequestException("device_type is required for DEVICE_TYPE scope");
  }

  private async validateRuleBinding(scope: TenantParkScope, triggerScope: string, deviceId?: string, deviceType?: string): Promise<void> {
    if (triggerScope === "DEVICE" && deviceId) {
      const device = await this.deviceRepository.findOne({ where: { id: deviceId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!device) throw new BadRequestException("device_id is invalid");
    }
    if (triggerScope === "DEVICE_TYPE") this.assertRequired(deviceType, "device_type is required");
  }

  private validateWebhookAction(action: Record<string, unknown>): void {
    const url = this.readString(action, "url") ?? this.readString(action, "webhook_url");
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException("CALL_WEBHOOK url is invalid");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new BadRequestException("CALL_WEBHOOK url protocol is not allowed");
    }
    const allowedHosts = (process.env.IOT_RULE_WEBHOOK_ALLOWLIST ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.length === 0 || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new BadRequestException("CALL_WEBHOOK url is not in allowlist");
    }
  }

  private async assertRuleCodeAvailable(scope: TenantParkScope, ruleCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedRuleBuilder(scope).andWhere("rule.rule_code = :ruleCode", { ruleCode });
    if (excludeId) builder.andWhere("rule.id <> :excludeId", { excludeId });
    if (await builder.getExists()) throw new BadRequestException("rule_code already exists");
  }

  private async executeRule(
    scope: TenantParkScope,
    rule: IotRuleEntity,
    triggerType: string,
    payload: IotRuleTriggerPayload,
    actor?: JwtPrincipal,
    manualTest = false
  ): Promise<IotRuleExecutionLogEntity> {
    const executedAt = new Date();
    if (!manualTest && !this.conditionMatches(rule.conditionJson, payload, rule.ruleType)) {
      return this.writeExecutionLog(scope, rule, triggerType, payload, [], "SKIPPED", null, executedAt, actor);
    }
    const actionResults: Array<Record<string, unknown>> = [];
    try {
      for (const action of rule.actionJson) {
        const unifiedResult = await this.unifiedActionExecutor.executeAction(
          {
            source_type: "IOT_RULE",
            source_id: rule.id,
            tenant_id: scope.tenantId,
            park_id: scope.parkId,
            actor_user_id: actor?.sub ?? null,
            action_type: this.extractActionType(action),
            action_payload: action,
            context_payload: {
              ...payload,
              rule_id: rule.id,
              rule_code: rule.ruleCode,
              rule_name: rule.ruleName
            }
          },
          actor
        );
        actionResults.push(this.unifiedActionExecutor.toLegacyActionResult(unifiedResult));
      }
      rule.lastTriggeredAt = executedAt;
      rule.updateBy = actor?.sub ?? null;
      await this.ruleRepository.save(rule);
      const executionStatus = this.unifiedActionExecutor.resolveAggregateStatus(actionResults);
      const errorMessage =
        executionStatus === "FAILED"
          ? "规则动作全部执行失败"
          : executionStatus === "PARTIAL_SUCCESS"
            ? "规则部分动作执行失败，请查看动作结果"
            : null;
      return this.writeExecutionLog(scope, rule, triggerType, payload, actionResults, executionStatus, errorMessage, executedAt, actor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`IoT rule ${rule.ruleCode} execution failed: ${message}`);
      return this.writeExecutionLog(scope, rule, triggerType, payload, actionResults, "FAILED", message, executedAt, actor);
    }
  }

  private async writeExecutionLog(
    scope: TenantParkScope,
    rule: IotRuleEntity,
    triggerType: string,
    triggerPayload: IotRuleTriggerPayload,
    actionResult: Array<Record<string, unknown>>,
    executionStatus: string,
    errorMessage: string | null,
    executedAt: Date,
    actor?: JwtPrincipal
  ): Promise<IotRuleExecutionLogEntity> {
    return this.logRepository.save(
      this.logRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        ruleId: rule.id,
        triggerType,
        triggerPayload: this.redactPayload(triggerPayload),
        actionResult,
        executionStatus,
        errorMessage,
        executedAt,
        createBy: actor?.sub ?? null,
        updateBy: actor?.sub ?? null
      })
    );
  }

  private conditionMatches(condition: Record<string, unknown>, payload: IotRuleTriggerPayload, ruleType: string): boolean {
    if (Object.keys(condition).length === 0) return ruleType !== "SCHEDULE";
    const all = this.readConditionArray(condition, "all") ?? this.readConditionArray(condition, "and");
    if (all) return all.every((item) => this.conditionMatches(item, payload, ruleType));
    const any = this.readConditionArray(condition, "any") ?? this.readConditionArray(condition, "or");
    if (any) return any.some((item) => this.conditionMatches(item, payload, ruleType));
    const not = condition.not;
    if (not && typeof not === "object" && !Array.isArray(not)) return !this.conditionMatches(not as Record<string, unknown>, payload, ruleType);
    if (this.hasScheduleCondition(condition)) return this.scheduleConditionMatches(condition);

    const fieldName = this.readString(condition, "field") ?? this.readString(condition, "metric") ?? this.readString(condition, "metric_code");
    const operator = (this.readString(condition, "operator") ?? this.readString(condition, "op") ?? "eq").toLowerCase();
    const expected = condition.value ?? condition.threshold ?? condition.expected;
    if (fieldName) return this.compareValues(this.extractPayloadValue(fieldName, payload), expected, operator, fieldName);
    if (condition.status !== undefined) return this.compareValues(payload.status, condition.status, operator, "status");
    if (condition.alert_level !== undefined) return this.compareValues(payload.alert_level, condition.alert_level, operator, "alert_level");
    return false;
  }

  private extractPayloadValue(fieldName: string, payload: IotRuleTriggerPayload): unknown {
    if (fieldName === payload.metric_code) return payload.value;
    const metrics = payload.metrics;
    if (metrics && Object.hasOwn(metrics, fieldName)) return metrics[fieldName];
    if (Object.hasOwn(payload, fieldName)) return payload[fieldName];
    return undefined;
  }

  private compareValues(actual: unknown, expected: unknown, operator: string, fieldName: string): boolean {
    if (fieldName === "alert_level") {
      const actualLevel = this.alertLevelRank(actual);
      const expectedLevel = this.alertLevelRank(expected);
      if (actualLevel !== null && expectedLevel !== null) return this.compareNumbers(actualLevel, expectedLevel, operator);
    }
    const actualNumber = this.toNumber(actual);
    const expectedNumber = this.toNumber(expected);
    if (actualNumber !== null && expectedNumber !== null) return this.compareNumbers(actualNumber, expectedNumber, operator);
    const actualText = actual === undefined || actual === null ? "" : String(actual);
    const expectedText = expected === undefined || expected === null ? "" : String(expected);
    switch (operator) {
      case "eq":
        return actualText === expectedText;
      case "neq":
        return actualText !== expectedText;
      case "contains":
        return actualText.includes(expectedText);
      case "in":
        return Array.isArray(expected) && expected.map(String).includes(actualText);
      default:
        return false;
    }
  }

  private compareNumbers(actual: number, expected: number, operator: string): boolean {
    switch (operator) {
      case "gt":
        return actual > expected;
      case "gte":
        return actual >= expected;
      case "lt":
        return actual < expected;
      case "lte":
        return actual <= expected;
      case "eq":
        return actual === expected;
      case "neq":
        return actual !== expected;
      default:
        return false;
    }
  }

  private hasScheduleCondition(condition: Record<string, unknown>): boolean {
    return ["time_after", "time_before", "hour", "minute", "always"].some((key) => Object.hasOwn(condition, key));
  }

  private scheduleConditionMatches(condition: Record<string, unknown>): boolean {
    if (condition.always === true) return true;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const after = this.timeStringToMinutes(this.readString(condition, "time_after"));
    const before = this.timeStringToMinutes(this.readString(condition, "time_before"));
    if (after !== null && minutes < after) return false;
    if (before !== null && minutes > before) return false;
    const hour = this.toNumber(condition.hour);
    if (hour !== null && now.getHours() !== hour) return false;
    const minute = this.toNumber(condition.minute);
    if (minute !== null && now.getMinutes() !== minute) return false;
    return after !== null || before !== null || hour !== null || minute !== null;
  }

  private readConditionArray(condition: Record<string, unknown>, key: string): Array<Record<string, unknown>> | null {
    const value = condition[key];
    if (!Array.isArray(value)) return null;
    return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>;
  }

  private extractActionType(action: IotRuleActionConfig): IotRuleActionType {
    const type = this.readString(action, "type") ?? this.readString(action, "action_type") ?? "";
    return type.toUpperCase() as IotRuleActionType;
  }

  private normalizeRuleType(type: string): string {
    const normalized = type.trim().toUpperCase();
    if (["METRIC", "STATUS", "ALERT", "SCHEDULE", "MANUAL"].includes(normalized)) return normalized;
    throw new BadRequestException("rule trigger type is invalid");
  }

  private toRuleView(entity: IotRuleEntity): IotRuleView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      ruleCode: entity.ruleCode,
      ruleName: entity.ruleName,
      ruleType: entity.ruleType,
      triggerScope: entity.triggerScope,
      deviceId: entity.deviceId,
      deviceType: entity.deviceType,
      areaId: entity.areaId,
      conditionJson: entity.conditionJson,
      actionJson: entity.actionJson,
      priority: entity.priority,
      status: entity.status,
      lastTriggeredAt: entity.lastTriggeredAt,
      remark: entity.remark,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }

  private toLogView(entity: IotRuleExecutionLogEntity): IotRuleExecutionLogView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      ruleId: entity.ruleId,
      triggerType: entity.triggerType,
      triggerPayload: entity.triggerPayload,
      actionResult: entity.actionResult,
      executionStatus: entity.executionStatus,
      errorMessage: entity.errorMessage,
      executedAt: entity.executedAt,
      createTime: entity.createTime
    };
  }

  private parseDate(value: string | undefined, field: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} is invalid`);
    return parsed;
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === undefined || value === null || String(value).trim() === "") throw new BadRequestException(message);
  }

  private readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }

  private toNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private alertLevelRank(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    return ALERT_LEVEL_ORDER[String(value).trim().toLowerCase()] ?? null;
  }

  private timeStringToMinutes(value?: string): number | null {
    if (!value) return null;
    const [hourText, minuteText = "0"] = value.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  private redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (/secret|password|token|access_key|raw_payload/i.test(key)) {
        clone[key] = "***";
      } else {
        clone[key] = value;
      }
    }
    return clone;
  }

}
