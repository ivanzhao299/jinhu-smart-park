import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, type ObjectLiteral, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { UserEntity } from "../users/entities/user.entity";
import type { CreateWorkOrderDto } from "../work-orders/dto/create-work-order.dto";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreateIotAlertDto } from "./dto/create-iot-alert.dto";
import type { IotAlertActionDto } from "./dto/iot-alert-action.dto";
import type { IotAlertQueryDto } from "./dto/iot-alert-query.dto";
import type { IotAlertWorkOrderDto } from "./dto/iot-alert-work-order.dto";
import { IotAlertLogEntity } from "./entities/iot-alert-log.entity";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotRealtimeService } from "./iot-realtime.service";
import { IotRuleTriggerService } from "./iot-rule-trigger.service";

const ALERT_ENTITY = "iot_alert";
const DEFAULT_IOT_ALERT_WORK_ORDER_TYPE = "repair";
const WORK_ORDER_SOURCE_IOT_ALERT = "iot_alert";
const ACTIVE_STATUSES = ["active", "10"];
const ACKNOWLEDGED_STATUSES = ["acknowledged", "20"];
const PROCESSING_STATUSES = ["processing", "30"];
const RESOLVED_STATUSES = ["resolved", "35"];
const IGNORABLE_STATUSES = [...ACTIVE_STATUSES, ...ACKNOWLEDGED_STATUSES];
const CLOSED_STATUSES = ["closed", "40"];
const IGNORED_STATUSES = ["ignored", "90"];

export interface IotAlertView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  alertCode: string;
  ruleId: string | null;
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  pointId: string | null;
  metricCode: string;
  metricName: string | null;
  alertLevel: string;
  alertTitle: string;
  alertContent: string | null;
  triggerValue: string | null;
  thresholdValue: string | null;
  triggerPayload: Record<string, unknown>;
  status: string;
  firstTriggerTime: Date;
  lastTriggerTime: Date;
  acknowledgeTime: Date | null;
  acknowledgeBy: string | null;
  acknowledgeByName: string | null;
  handleTime: Date | null;
  handleBy: string | null;
  handleByName: string | null;
  handleNote: string | null;
  closeTime: Date | null;
  closeBy: string | null;
  closeByName: string | null;
  closeReason: string | null;
  workOrderId: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  parkTenantId: string | null;
  createTime: Date;
  updateTime: Date;
}

export interface IotAlertLogView {
  id: string;
  alertId: string;
  action: string;
  beforeStatus: string | null;
  afterStatus: string | null;
  operatorId: string | null;
  operatorName: string | null;
  content: string | null;
  reason: string | null;
  opTime: Date;
}

@Injectable()
export class IotAlertsService {
  constructor(
    @InjectRepository(IotAlertEntity)
    private readonly alertRepository: Repository<IotAlertEntity>,
    @InjectRepository(IotAlertLogEntity)
    private readonly alertLogRepository: Repository<IotAlertLogEntity>,
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly workOrdersService: WorkOrdersService,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly realtimeService: IotRealtimeService,
    private readonly ruleTriggerService: IotRuleTriggerService
  ) {}

  async list(scope: TenantParkScope, query: IotAlertQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<IotAlertView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedAlertBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "iot", ALERT_ENTITY, views);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotAlertView> {
    const entity = await this.findAlert(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "iot", ALERT_ENTITY, this.toView(entity));
  }

  async logs(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotAlertLogView[]> {
    const alert = await this.findAlert(scope, id, actor);
    const rows = await this.alertLogRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.is_deleted = false")
      .andWhere("log.alert_id = :alertId", { alertId: alert.id })
      .orderBy("log.op_time", "DESC")
      .getMany();
    return rows.map((row) => this.toLogView(row));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateIotAlertDto): Promise<IotAlertView> {
    this.assertRequired(dto.device_id, "device_id is required");
    this.assertRequired(dto.alert_type, "alert_type is required");
    this.assertRequired(dto.alert_level, "alert_level is required");
    this.assertRequired(dto.title, "title is required");
    const device = await this.findDevice(scope, dto.device_id, actor);
    const generated = await this.codeRulesService.generateNext(scope, actor.sub, "IOT_ALERT_CODE");
    const now = new Date();
    const payload = {
      source_type: dto.source_type ?? "MANUAL",
      alert_type: dto.alert_type,
      remark: dto.remark ?? null
    };
    const alert = await this.alertRepository.save(
      this.alertRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: generated.code,
        alertCode: generated.code,
        ruleId: null,
        deviceId: device.id,
        deviceCode: device.deviceCode,
        deviceName: device.deviceName,
        pointId: null,
        metricCode: dto.alert_type,
        metricName: null,
        alertLevel: dto.alert_level,
        alertTitle: dto.title,
        alertContent: dto.description ?? null,
        triggerValue: null,
        thresholdValue: null,
        status: "active",
        payload,
        triggerPayload: payload,
        firstTriggerTime: now,
        lastTriggerTime: now,
        buildingId: device.buildingId,
        floorId: device.floorId,
        unitId: device.unitId,
        parkTenantId: device.parkTenantId,
        createBy: actor.sub,
        updateBy: actor.sub
      })
    );
    await this.alertLogRepository.save(
      this.alertLogRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        alertId: alert.id,
        action: "create",
        beforeStatus: null,
        afterStatus: alert.status,
        operatorId: actor.sub,
        operatorName: this.actorName(actor),
        content: dto.description ?? dto.title,
        reason: dto.remark ?? null,
        opTime: now,
        createBy: actor.sub,
        updateBy: actor.sub
      })
    );
    this.realtimeService.publishAlertCreated(alert);
    await this.ruleTriggerService.handleAlertCreatedOrUpdated(scope, alert, actor);
    return this.detail(scope, alert.id, actor);
  }

  async acknowledge(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: IotAlertActionDto): Promise<IotAlertView> {
    return this.transition(scope, actor, id, {
      action: "acknowledge",
      allowed: ACTIVE_STATUSES,
      afterStatus: "acknowledged",
      content: dto.content ?? dto.reason ?? "告警已确认",
      mutate: (alert, now) => {
        alert.ackTime = now;
        alert.ackBy = actor.sub;
        alert.ackByName = this.actorName(actor);
        alert.acknowledgeTime = now;
        alert.acknowledgeBy = actor.sub;
      }
    });
  }

  async process(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: IotAlertActionDto): Promise<IotAlertView> {
    return this.transition(scope, actor, id, {
      action: "process",
      allowed: ACKNOWLEDGED_STATUSES,
      afterStatus: "processing",
      content: dto.content ?? dto.reason ?? "告警进入处理",
      mutate: (alert, now) => {
        alert.handleTime = now;
        alert.handleBy = actor.sub;
        alert.handleByName = this.actorName(actor);
        alert.handleNote = dto.content ?? dto.reason ?? null;
      }
    });
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: IotAlertActionDto): Promise<IotAlertView> {
    const closeReason = dto.close_reason ?? dto.reason;
    this.assertRequired(closeReason, "close_reason is required");
    return this.transition(scope, actor, id, {
      action: "close",
      allowed: [...PROCESSING_STATUSES, ...RESOLVED_STATUSES],
      afterStatus: "closed",
      content: dto.content ?? closeReason!,
      reason: closeReason,
      mutate: (alert, now) => {
        alert.closeTime = now;
        alert.closeBy = actor.sub;
        alert.closeByName = this.actorName(actor);
        alert.closeReason = closeReason!;
      }
    });
  }

  async resolve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: IotAlertActionDto): Promise<IotAlertView> {
    return this.transition(scope, actor, id, {
      action: "resolve",
      allowed: PROCESSING_STATUSES,
      afterStatus: "resolved",
      content: dto.content ?? dto.reason ?? "告警已解除",
      reason: dto.reason ?? null,
      mutate: (alert, now) => {
        alert.handleTime = now;
        alert.handleBy = actor.sub;
        alert.handleByName = this.actorName(actor);
        alert.handleNote = dto.content ?? dto.reason ?? null;
      }
    });
  }

  async ignore(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: IotAlertActionDto): Promise<IotAlertView> {
    const ignoreReason = dto.ignore_reason ?? dto.reason;
    this.assertRequired(ignoreReason, "ignore_reason is required");
    return this.transition(scope, actor, id, {
      action: "ignore",
      allowed: IGNORABLE_STATUSES,
      afterStatus: "ignored",
      content: dto.content ?? ignoreReason!,
      reason: ignoreReason
    });
  }

  async createWorkOrder(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: IotAlertWorkOrderDto
  ): Promise<{ alert: IotAlertView; work_order: WorkOrderEntity }> {
    const alert = await this.findAlert(scope, id, actor);
    if ([...CLOSED_STATUSES, ...IGNORED_STATUSES].includes(alert.status)) {
      throw new BadRequestException("Closed or ignored IoT alerts cannot be converted to work orders");
    }
    if (alert.workOrderId) {
      throw new ConflictException("IoT alert has already been converted to a work order");
    }
    this.assertRequired(dto.title, "title is required");
    this.assertRequired(dto.priority, "priority is required");
    this.assertRequired(dto.urgency, "urgency is required");
    this.assertRequired(dto.description, "description is required");

    const device = await this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.is_deleted = false")
      .andWhere("device.id = :deviceId", { deviceId: alert.deviceId })
      .getOne();
    const assignee = dto.assignee_id ? await this.findScopedUser(scope, dto.assignee_id) : null;
    const workOrderPayload: CreateWorkOrderDto = {
      title: dto.title.trim(),
      wo_type: dto.wo_type?.trim() || DEFAULT_IOT_ALERT_WORK_ORDER_TYPE,
      priority: dto.priority.trim(),
      urgency: dto.urgency.trim(),
      source_type: WORK_ORDER_SOURCE_IOT_ALERT,
      source_id: alert.id,
      park_tenant_id: device?.parkTenantId ?? alert.parkTenantId ?? undefined,
      unit_id: device?.unitId ?? alert.unitId ?? undefined,
      building_id: device?.buildingId ?? alert.buildingId ?? undefined,
      floor_id: device?.floorId ?? alert.floorId ?? undefined,
      location: device?.location ?? undefined,
      reporter_id: actor.sub,
      reporter_name: this.actorName(actor),
      assignee_id: dto.assignee_id,
      assignee_name: assignee?.displayName ?? assignee?.username ?? undefined,
      description: this.buildWorkOrderDescription(alert, dto.description),
      device_id: alert.deviceId,
      remark: `iot_alert:${alert.alertCode}`
    };
    const workOrder = await this.workOrdersService.create(scope, actor, workOrderPayload);
    await this.dataSource.transaction(async (manager) => {
      const alertRepository = manager.getRepository(IotAlertEntity);
      const logRepository = manager.getRepository(IotAlertLogEntity);
      await alertRepository.update(
        { id: alert.id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        { workOrderId: workOrder.id, updateBy: actor.sub }
      );
      await logRepository.save(
        logRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          alertId: alert.id,
          action: "create_workorder",
          beforeStatus: alert.status,
          afterStatus: alert.status,
          operatorId: actor.sub,
          operatorName: this.actorName(actor),
          content: `告警已转工单 ${workOrder.woCode}`,
          reason: dto.description.trim(),
          opTime: new Date(),
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
    });
    const updatedAlert = await this.detail(scope, id, actor);
    this.realtimeService.publishAlertUpdated(updatedAlert);
    return {
      alert: updatedAlert,
      work_order: workOrder
    };
  }

  private async transition(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    options: {
      action: string;
      allowed: string[];
      afterStatus: string;
      content: string;
      reason?: string | null;
      mutate?: (alert: IotAlertEntity, now: Date) => void;
    }
  ): Promise<IotAlertView> {
    await this.findAlert(scope, id, actor);
    await this.dataSource.transaction(async (manager) => {
      const alertRepository = manager.getRepository(IotAlertEntity);
      const logRepository = manager.getRepository(IotAlertLogEntity);
      const alert = await alertRepository
        .createQueryBuilder("alert")
        .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("alert.is_deleted = false")
        .andWhere("alert.id = :id", { id })
        .getOne();
      if (!alert) throw new NotFoundException("IoT alert not found");
      if (!options.allowed.includes(alert.status)) {
        throw new BadRequestException(`IoT alert status ${alert.status} cannot ${options.action}`);
      }
      const beforeStatus = alert.status;
      const now = new Date();
      alert.status = options.afterStatus;
      alert.updateBy = actor.sub;
      options.mutate?.(alert, now);
      await alertRepository.save(alert);
      await logRepository.save(
        logRepository.create({
          tenantId: alert.tenantId,
          parkId: alert.parkId,
          alertId: alert.id,
          action: options.action,
          beforeStatus,
          afterStatus: alert.status,
          operatorId: actor.sub,
          operatorName: this.actorName(actor),
          content: options.content,
          reason: options.reason ?? null,
          opTime: now,
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
    });
    const updatedAlert = await this.detail(scope, id, actor);
    this.realtimeService.publishAlertUpdated(updatedAlert);
    return updatedAlert;
  }

  private scopedAlertBuilder(scope: TenantParkScope): SelectQueryBuilder<IotAlertEntity> {
    return this.alertRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false");
  }

  private async findAlert(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotAlertEntity> {
    const builder = this.scopedAlertBuilder(scope).andWhere("alert.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("IoT alert not found");
    return entity;
  }

  private async findDevice(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotDeviceEntity> {
    const builder = this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.is_deleted = false")
      .andWhere("device.id = :id", { id });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "device");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device", { device: "id" });
    const entity = await builder.getOne();
    if (!entity) throw new BadRequestException("device_id is invalid");
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<IotAlertEntity>, query: IotAlertQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("alert.alert_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("alert.alert_title ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("alert.device_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("alert.device_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("alert.metric_code ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.device_id) builder.andWhere("alert.device_id = :deviceId", { deviceId: query.device_id });
    if (query.metric_code) builder.andWhere("alert.metric_code = :metricCode", { metricCode: query.metric_code });
    if (query.alert_level) builder.andWhere("alert.alert_level = :alertLevel", { alertLevel: query.alert_level });
    if (query.status) builder.andWhere("alert.status = :status", { status: query.status });
    this.applyDateFilter(builder, "alert.last_trigger_time", query.start_date, query.end_date);
  }

  private applyDateFilter(builder: SelectQueryBuilder<IotAlertEntity>, field: string, start?: string, end?: string): void {
    if (start) {
      const startDate = new Date(start);
      if (!Number.isNaN(startDate.getTime())) builder.andWhere(`${field} >= :startDate`, { startDate });
    }
    if (end) {
      const endDate = new Date(end);
      if (!Number.isNaN(endDate.getTime())) builder.andWhere(`${field} <= :endDate`, { endDate });
    }
  }

  private applySort(builder: SelectQueryBuilder<IotAlertEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      alert_code: "alert.alertCode",
      device_code: "alert.deviceCode",
      metric_code: "alert.metricCode",
      alert_level: "alert.alertLevel",
      status: "alert.status",
      first_trigger_time: "alert.firstTriggerTime",
      last_trigger_time: "alert.lastTriggerTime",
      update_time: "alert.updateTime",
      create_time: "alert.createTime"
    };
    this.applyGenericSort(builder, sort, sortMap, "alert.lastTriggerTime", "alert.createTime", "DESC");
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

  private async applyDataScope(builder: SelectQueryBuilder<IotAlertEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "alert");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "alert");
  }

  private toView(entity: IotAlertEntity): IotAlertView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      alertCode: entity.alertCode,
      ruleId: entity.ruleId,
      deviceId: entity.deviceId,
      deviceCode: entity.deviceCode,
      deviceName: entity.deviceName,
      pointId: entity.pointId,
      metricCode: entity.metricCode,
      metricName: entity.metricName,
      alertLevel: entity.alertLevel,
      alertTitle: entity.alertTitle,
      alertContent: entity.alertContent,
      triggerValue: entity.triggerValue,
      thresholdValue: entity.thresholdValue,
      triggerPayload: entity.triggerPayload ?? entity.payload ?? {},
      status: entity.status,
      firstTriggerTime: entity.firstTriggerTime,
      lastTriggerTime: entity.lastTriggerTime,
      acknowledgeTime: entity.acknowledgeTime ?? entity.ackTime,
      acknowledgeBy: entity.acknowledgeBy ?? entity.ackBy,
      acknowledgeByName: entity.ackByName,
      handleTime: entity.handleTime,
      handleBy: entity.handleBy,
      handleByName: entity.handleByName,
      handleNote: entity.handleNote,
      closeTime: entity.closeTime,
      closeBy: entity.closeBy,
      closeByName: entity.closeByName,
      closeReason: entity.closeReason,
      workOrderId: entity.workOrderId,
      buildingId: entity.buildingId,
      floorId: entity.floorId,
      unitId: entity.unitId,
      parkTenantId: entity.parkTenantId,
      createTime: entity.createTime,
      updateTime: entity.updateTime
    };
  }

  private toLogView(entity: IotAlertLogEntity): IotAlertLogView {
    return {
      id: entity.id,
      alertId: entity.alertId,
      action: entity.action,
      beforeStatus: entity.beforeStatus,
      afterStatus: entity.afterStatus,
      operatorId: entity.operatorId,
      operatorName: entity.operatorName,
      content: entity.content,
      reason: entity.reason,
      opTime: entity.opTime
    };
  }

  private actorName(actor: JwtPrincipal): string {
    return actor.realName ?? actor.username ?? actor.sub;
  }

  private async findScopedUser(scope: TenantParkScope, id: string): Promise<UserEntity> {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .where("user.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("user.is_deleted = false")
      .andWhere("user.id = :id", { id })
      .getOne();
    if (!user) throw new BadRequestException("assignee_id is invalid");
    return user;
  }

  private buildWorkOrderDescription(alert: IotAlertEntity, description: string): string {
    return [
      description.trim(),
      `告警编号：${alert.alertCode}`,
      `设备：${alert.deviceCode} ${alert.deviceName}`,
      `指标：${alert.metricCode}`,
      `告警内容：${alert.alertContent ?? "-"}`,
      `触发值：${alert.triggerValue ?? "-"}`
    ].join("\n");
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }
}
