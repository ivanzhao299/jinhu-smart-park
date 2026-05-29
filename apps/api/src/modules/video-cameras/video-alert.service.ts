import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, type EntityManager, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { SafetyHazardStatusLogEntity } from "../safety-hazards/entities/safety-hazard-status-log.entity";
import { SafetyInspectPointEntity } from "../safety-inspect-points/entities/safety-inspect-point.entity";
import { SafetyInspectTemplateEntity } from "../safety-inspect-templates/entities/safety-inspect-template.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { UserEntity } from "../users/entities/user.entity";
import { CreateVideoAlertDto, VIDEO_ALERT_LEVELS, VIDEO_ALERT_SOURCES, VIDEO_ALERT_TYPES } from "./dto/create-video-alert.dto";
import { UpdateVideoAlertDto } from "./dto/update-video-alert.dto";
import {
  AssignVideoAlertDto,
  CreateVideoAlertHazardDto,
  CreateVideoAlertInspectionDto,
  VideoAlertActionDto
} from "./dto/video-alert-action.dto";
import { VideoAlertQueryDto, VideoDashboardQueryDto } from "./dto/video-alert-query.dto";
import { CameraDeviceEntity } from "./entities/camera-device.entity";
import { VideoAlertProcessLogEntity } from "./entities/video-alert-process-log.entity";
import { VideoAlertEntity } from "./entities/video-alert.entity";
import { VideoEvidenceEntity } from "./entities/video-evidence.entity";
import { VideoPlatformConfigEntity } from "./entities/video-platform-config.entity";

const VIDEO_MODULE = "video";
const VIDEO_ALERT_ENTITY = "video_alert";
const ALERT_CODE_RULE = "VIDEO_ALERT_CODE";
const STATUS_PENDING = "PENDING";
const STATUS_ACKNOWLEDGED = "ACKNOWLEDGED";
const STATUS_PROCESSING = "PROCESSING";
const STATUS_RESOLVED = "RESOLVED";
const STATUS_CLOSED = "CLOSED";
const OPEN_ALERT_STATUSES = [STATUS_PENDING, STATUS_ACKNOWLEDGED, STATUS_PROCESSING, STATUS_RESOLVED];
const ACTIVE_ALERT_STATUSES = [STATUS_PENDING, STATUS_ACKNOWLEDGED, STATUS_PROCESSING];

export interface VideoAlertView {
  id: string;
  tenantId: string;
  parkId: string;
  cameraId: string;
  cameraCode: string | null;
  cameraName: string | null;
  cameraStatus: string | null;
  buildingId: string | null;
  floorId: string | null;
  roomId: string | null;
  alertCode: string;
  alertType: string;
  alertLevel: string;
  alertSource: string;
  title: string;
  description: string | null;
  snapshotUrl: string | null;
  videoClipUrl: string | null;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  assignedTo: string | null;
  linkedInspectionId: string | null;
  linkedHazardId: string | null;
  processStatus: string;
  remark: string | null;
  createBy: string | null;
  createTime: Date;
  updateBy: string | null;
  updateTime: Date;
}

export interface VideoAlertLogView {
  id: string;
  alertId: string;
  action: string;
  operatorId: string | null;
  operatorName: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  remark: string | null;
  createTime: Date;
}

@Injectable()
export class VideoAlertService {
  constructor(
    @InjectRepository(VideoAlertEntity)
    private readonly alertsRepository: Repository<VideoAlertEntity>,
    @InjectRepository(VideoAlertProcessLogEntity)
    private readonly alertLogsRepository: Repository<VideoAlertProcessLogEntity>,
    @InjectRepository(CameraDeviceEntity)
    private readonly cameraRepository: Repository<CameraDeviceEntity>,
    @InjectRepository(VideoEvidenceEntity)
    private readonly evidenceRepository: Repository<VideoEvidenceEntity>,
    @InjectRepository(VideoPlatformConfigEntity)
    private readonly platformConfigsRepository: Repository<VideoPlatformConfigEntity>,
    @InjectRepository(SafetyInspectTemplateEntity)
    private readonly templatesRepository: Repository<SafetyInspectTemplateEntity>,
    @InjectRepository(SafetyInspectPointEntity)
    private readonly pointsRepository: Repository<SafetyInspectPointEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly dataSource: DataSource
  ) {}

  async list(scope: TenantParkScope, query: VideoAlertQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<VideoAlertView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedAlertBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyAlertQuery(builder, query);
    this.applyAlertSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const secured = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, VIDEO_MODULE, VIDEO_ALERT_ENTITY, views);
    return { items: secured, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoAlertView & { logs: VideoAlertLogView[] }> {
    const alert = await this.findAlert(scope, id, actor);
    const view = await this.fieldPolicyService.applyFieldPolicies(scope, actor, VIDEO_MODULE, VIDEO_ALERT_ENTITY, this.toView(alert));
    const logs = await this.logs(scope, id, actor);
    return { ...view, logs };
  }

  async logs(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoAlertLogView[]> {
    await this.findAlert(scope, id, actor);
    const rows = await this.alertLogsRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, alertId: id, isDeleted: false },
      order: { createTime: "ASC" }
    });
    return rows.map((row) => this.toLogView(row));
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateVideoAlertDto): Promise<VideoAlertView> {
    this.assertRequired(dto.title, "title is required");
    const camera = await this.findCamera(scope, dto.camera_id, actor);
    const alertCode = (await this.codeRulesService.generateNext(scope, actor.sub, ALERT_CODE_RULE)).code;
    const triggeredAt = this.parseDate(dto.triggered_at) ?? new Date();
    const saved = await this.dataSource.transaction(async (manager) => {
      const alert = manager.getRepository(VideoAlertEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        cameraId: camera.id,
        alertCode,
        alertType: this.normalizeEnum(dto.alert_type, VIDEO_ALERT_TYPES, "alert_type"),
        alertLevel: this.normalizeEnum(dto.alert_level, VIDEO_ALERT_LEVELS, "alert_level"),
        alertSource: this.normalizeEnum(dto.alert_source ?? "MANUAL", VIDEO_ALERT_SOURCES, "alert_source"),
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        snapshotUrl: dto.snapshot_url ?? camera.snapshotUrl ?? null,
        videoClipUrl: dto.video_clip_url ?? null,
        triggeredAt,
        assignedTo: dto.assigned_to ?? null,
        processStatus: STATUS_PENDING,
        remark: dto.remark ?? null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(VideoAlertEntity).save(alert);
      await this.writeAlertLog(scope, actor, manager, result.id, "create", null, STATUS_PENDING, dto.remark ?? "创建视频告警");
      return result;
    });
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateVideoAlertDto): Promise<VideoAlertView> {
    const alert = await this.findAlert(scope, id, actor);
    if (alert.processStatus === STATUS_CLOSED) {
      throw new BadRequestException("Closed alert cannot be updated");
    }
    if (dto.assigned_to) {
      await this.assertUser(scope, dto.assigned_to);
    }
    Object.assign(alert, {
      alertType: dto.alert_type === undefined ? alert.alertType : this.normalizeEnum(dto.alert_type, VIDEO_ALERT_TYPES, "alert_type"),
      alertLevel: dto.alert_level === undefined ? alert.alertLevel : this.normalizeEnum(dto.alert_level, VIDEO_ALERT_LEVELS, "alert_level"),
      title: dto.title ?? alert.title,
      description: dto.description === undefined ? alert.description : dto.description ?? null,
      snapshotUrl: dto.snapshot_url === undefined ? alert.snapshotUrl : dto.snapshot_url ?? null,
      videoClipUrl: dto.video_clip_url === undefined ? alert.videoClipUrl : dto.video_clip_url ?? null,
      assignedTo: dto.assigned_to === undefined ? alert.assignedTo : dto.assigned_to ?? null,
      remark: dto.remark === undefined ? alert.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    await this.alertsRepository.save(alert);
    await this.writeAlertLog(scope, actor, undefined, alert.id, "update", alert.processStatus, alert.processStatus, "更新视频告警");
    return this.detail(scope, id, actor);
  }

  async acknowledge(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: VideoAlertActionDto): Promise<VideoAlertView> {
    const alert = await this.findAlert(scope, id, actor);
    if (alert.processStatus !== STATUS_PENDING) {
      throw new BadRequestException("Only pending alert can be acknowledged");
    }
    return this.transition(scope, actor, alert, "acknowledge", STATUS_ACKNOWLEDGED, dto.remark ?? "告警已确认", (entity, now) => {
      entity.acknowledgedAt = now;
    });
  }

  async assign(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AssignVideoAlertDto): Promise<VideoAlertView> {
    const alert = await this.findAlert(scope, id, actor);
    if (alert.processStatus === STATUS_CLOSED) {
      throw new BadRequestException("Closed alert cannot be assigned");
    }
    await this.assertUser(scope, dto.assigned_to);
    alert.assignedTo = dto.assigned_to;
    alert.updateBy = actor.sub;
    await this.alertsRepository.save(alert);
    await this.writeAlertLog(
      scope,
      actor,
      undefined,
      alert.id,
      "assign",
      alert.processStatus,
      alert.processStatus,
      dto.reason ?? dto.remark ?? "视频告警已指派"
    );
    return this.detail(scope, id, actor);
  }

  async resolve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: VideoAlertActionDto): Promise<VideoAlertView> {
    const alert = await this.findAlert(scope, id, actor);
    if (![STATUS_PENDING, STATUS_ACKNOWLEDGED, STATUS_PROCESSING].includes(alert.processStatus)) {
      throw new BadRequestException("Current alert status cannot be resolved");
    }
    if (dto.assigned_to) {
      await this.assertUser(scope, dto.assigned_to);
    }
    const nextStatus = alert.processStatus === STATUS_ACKNOWLEDGED ? STATUS_PROCESSING : STATUS_RESOLVED;
    const view = await this.transition(scope, actor, alert, nextStatus === STATUS_PROCESSING ? "process" : "resolve", nextStatus, dto.remark ?? "告警进入处理", (entity, now) => {
      entity.assignedTo = dto.assigned_to ?? entity.assignedTo;
      if (nextStatus === STATUS_RESOLVED) {
        entity.resolvedAt = now;
        entity.resolvedBy = actor.sub;
      }
    });
    if (nextStatus === STATUS_PROCESSING) {
      const refreshed = await this.findAlert(scope, id, actor);
      return this.transition(scope, actor, refreshed, "resolve", STATUS_RESOLVED, dto.remark ?? "告警处理完成", (entity, now) => {
        entity.resolvedAt = now;
        entity.resolvedBy = actor.sub;
      });
    }
    return view;
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: VideoAlertActionDto): Promise<VideoAlertView> {
    const reason = (dto.reason ?? dto.remark ?? "").trim();
    if (!reason) {
      throw new BadRequestException("close reason is required");
    }
    const alert = await this.findAlert(scope, id, actor);
    if (alert.processStatus === STATUS_CLOSED) {
      throw new BadRequestException("Alert already closed");
    }
    return this.transition(scope, actor, alert, "close", STATUS_CLOSED, reason, (entity, now) => {
      entity.resolvedAt = entity.resolvedAt ?? now;
      entity.resolvedBy = entity.resolvedBy ?? actor.sub;
    });
  }

  async createInspection(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CreateVideoAlertInspectionDto) {
    const alert = await this.findAlert(scope, id, actor);
    if (alert.linkedInspectionId) {
      throw new ConflictException("Alert already linked to inspection task");
    }
    const template = await this.resolveTemplate(scope, dto.template_id);
    const point = await this.resolvePoint(scope, dto.point_id, alert.camera);
    const handler = dto.handler_id ? await this.assertUser(scope, dto.handler_id) : null;
    const taskCode = (await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_INSPECT_TASK_CODE")).code;
    const now = new Date();
    const saved = await this.dataSource.transaction(async (manager) => {
      const task = manager.getRepository(SafetyInspectTaskEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: taskCode,
        taskCode,
        planId: null,
        templateId: template.id,
        pointId: point.id,
        handlerId: handler?.id ?? actor.sub,
        handlerName: dto.handler_name ?? handler?.displayName ?? actor.realName ?? actor.username,
        planTime: now,
        dueTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        scanOk: false,
        photoFileIds: [],
        result: null,
        status: "10",
        remark: dto.remark ?? `video_alert:${alert.alertCode}`,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const taskResult = await manager.getRepository(SafetyInspectTaskEntity).save(task);
      alert.linkedInspectionId = taskResult.id;
      alert.updateBy = actor.sub;
      await manager.getRepository(VideoAlertEntity).save(alert);
      await this.writeAlertLog(scope, actor, manager, alert.id, "create_inspection", alert.processStatus, alert.processStatus, `生成巡检任务 ${taskResult.taskCode}`);
      return taskResult;
    });
    return { inspection_id: saved.id, task_code: saved.taskCode, alert: await this.detail(scope, id, actor) };
  }

  async createHazard(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CreateVideoAlertHazardDto) {
    const alert = await this.findAlert(scope, id, actor);
    if (alert.linkedHazardId) {
      throw new ConflictException("Alert already linked to hazard");
    }
    const camera = alert.camera ?? await this.findCamera(scope, alert.cameraId, actor);
    const hazardCode = (await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_HAZARD_CODE")).code;
    const saved = await this.dataSource.transaction(async (manager) => {
      const hazard = manager.getRepository(SafetyHazardEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: hazardCode,
        hazardCode,
        title: dto.title?.trim() || alert.title,
        hazardTitle: dto.title?.trim() || alert.title,
        hazardType: dto.hazard_type ?? this.mapAlertTypeToHazardType(alert.alertType),
        riskLevel: dto.risk_level ?? this.mapAlertLevelToRiskLevel(alert.alertLevel),
        sourceType: "video_alert",
        sourceId: alert.id,
        inspectTaskId: null,
        inspectPointId: null,
        parkTenantId: null,
        buildingId: camera.buildingId,
        floorId: camera.floorId,
        unitId: camera.roomId,
        location: camera.installLocation ?? camera.cameraName,
        description: dto.description?.trim() || alert.description || alert.title,
        photoFileIds: [],
        beforePhotoFileIds: [],
        afterPhotoFileIds: [],
        rectifyDeadline: this.parseDate(dto.rectify_deadline),
        overdueFlag: false,
        upgradeFlag: alert.alertLevel === "CRITICAL",
        status: "10",
        remark: dto.remark ?? `video_alert:${alert.alertCode}`,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(hazard);
      alert.linkedHazardId = result.id;
      alert.updateBy = actor.sub;
      await manager.getRepository(VideoAlertEntity).save(alert);
      await this.writeHazardStatusLog(scope, actor, manager, result.id, null, "10", "video_alert", "视频告警生成隐患");
      await this.writeSafetyActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "create_from_video_alert",
        afterStatus: "10",
        content: `视频告警 ${alert.alertCode} 生成隐患`
      });
      await this.writeAlertLog(scope, actor, manager, alert.id, "create_hazard", alert.processStatus, alert.processStatus, `生成隐患 ${result.hazardCode}`);
      return result;
    });
    return { hazard_id: saved.id, hazard_code: saved.hazardCode, alert: await this.detail(scope, id, actor) };
  }

  async detectOffline(scope: TenantParkScope, actor: JwtPrincipal): Promise<{ generated_count: number; skipped_count: number }> {
    const cameras = await this.cameraRepository
      .createQueryBuilder("camera")
      .where("camera.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("camera.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("camera.is_deleted = false")
      .andWhere("camera.is_enabled = true")
      .andWhere("camera.status IN (:...statuses)", { statuses: ["OFFLINE", "UNKNOWN"] })
      .getMany();
    let generatedCount = 0;
    let skippedCount = 0;
    for (const camera of cameras) {
      const exists = await this.hasOpenAlert(scope, camera.id, "CAMERA_OFFLINE");
      if (exists) {
        skippedCount += 1;
        continue;
      }
      await this.create(scope, actor, {
        camera_id: camera.id,
        alert_type: "CAMERA_OFFLINE",
        alert_level: camera.status === "OFFLINE" ? "HIGH" : "MEDIUM",
        alert_source: "DEVICE",
        title: `${camera.cameraName} 摄像头离线`,
        description: `系统检测到摄像头状态为 ${camera.status}`,
        snapshot_url: camera.snapshotUrl ?? undefined,
        remark: "offline scheduler"
      });
      generatedCount += 1;
    }
    return { generated_count: generatedCount, skipped_count: skippedCount };
  }

  async detectPlatformTokenExpired(scope: TenantParkScope, actor: JwtPrincipal): Promise<{ generated_count: number; skipped_count: number }> {
    const now = new Date();
    const configs = await this.platformConfigsRepository
      .createQueryBuilder("config")
      .where("config.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("config.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("config.is_deleted = false")
      .andWhere("(config.status IN (:...badStatuses) OR config.token_expire_at <= :now)", {
        badStatuses: ["EXPIRED", "ERROR"],
        now
      })
      .getMany();
    let generatedCount = 0;
    let skippedCount = 0;
    for (const config of configs) {
      const cameras = await this.cameraRepository
        .createQueryBuilder("camera")
        .where("camera.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("camera.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("camera.is_deleted = false")
        .andWhere("camera.is_enabled = true")
        .andWhere("camera.platform_type = :platformType", { platformType: config.platformType })
        .getMany();
      for (const camera of cameras) {
        const exists = await this.hasOpenAlert(scope, camera.id, "PLATFORM_AUTH_FAILED");
        if (exists) {
          skippedCount += 1;
          continue;
        }
        await this.create(scope, actor, {
          camera_id: camera.id,
          alert_type: "PLATFORM_AUTH_FAILED",
          alert_level: "HIGH",
          alert_source: "PLATFORM",
          title: `${camera.cameraName} 视频平台认证异常`,
          description: `平台 ${config.platformName} 认证状态为 ${config.status}`,
          snapshot_url: camera.snapshotUrl ?? undefined,
          remark: "platform token scheduler"
        });
        generatedCount += 1;
      }
    }
    return { generated_count: generatedCount, skipped_count: skippedCount };
  }

  async overview(scope: TenantParkScope, query: VideoDashboardQueryDto, actor?: JwtPrincipal) {
    const cameraBuilder = this.scopedCameraBuilder(scope);
    await this.applyCameraDataScope(cameraBuilder, scope, actor);
    const cameras = await cameraBuilder.getMany();
    const cameraTotal = cameras.length;
    const onlineCount = cameras.filter((camera) => camera.status === "ONLINE" && camera.isEnabled).length;
    const offlineCount = cameras.filter((camera) => camera.status === "OFFLINE").length;
    const todayStart = this.startOfToday();
    const alertBuilder = this.scopedAlertBuilder(scope);
    await this.applyDataScope(alertBuilder, scope, actor);
    this.applyDashboardQuery(alertBuilder, query);
    const alerts = await alertBuilder.getMany();
    const todayCount = alerts.filter((alert) => alert.triggeredAt >= todayStart).length;
    const highRiskCount = alerts.filter((alert) => ["HIGH", "CRITICAL"].includes(alert.alertLevel) && alert.processStatus !== STATUS_CLOSED).length;
    const activeCount = alerts.filter((alert) => ACTIVE_ALERT_STATUSES.includes(alert.processStatus)).length;
    const evidenceCount = await this.evidenceRepository.count({ where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    return {
      camera_total: cameraTotal,
      online_count: onlineCount,
      offline_count: offlineCount,
      online_rate: cameraTotal === 0 ? 0 : Number((onlineCount / cameraTotal).toFixed(4)),
      today_alert_count: todayCount,
      active_alert_count: activeCount,
      high_risk_alert_count: highRiskCount,
      recent_evidence_count: evidenceCount,
      inspection_link_count: alerts.filter((alert) => Boolean(alert.linkedInspectionId)).length,
      hazard_link_count: alerts.filter((alert) => Boolean(alert.linkedHazardId)).length
    };
  }

  async alertTrends(scope: TenantParkScope, query: VideoDashboardQueryDto, actor?: JwtPrincipal) {
    const builder = this.scopedAlertBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyDashboardQuery(builder, query);
    const rows = await builder
      .select("to_char(date_trunc('day', alert.triggered_at), 'YYYY-MM-DD')", "date")
      .addSelect("COUNT(*)::int", "count")
      .addSelect("SUM(CASE WHEN alert.alert_level IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END)::int", "high_count")
      .groupBy("date_trunc('day', alert.triggered_at)")
      .orderBy("date_trunc('day', alert.triggered_at)", "ASC")
      .getRawMany<{ date: string; count: number; high_count: number }>();
    return rows;
  }

  async deviceStatus(scope: TenantParkScope, actor?: JwtPrincipal) {
    const builder = this.scopedCameraBuilder(scope);
    await this.applyCameraDataScope(builder, scope, actor);
    const rows = await builder
      .select("camera.status", "status")
      .addSelect("COUNT(*)::int", "count")
      .groupBy("camera.status")
      .orderBy("camera.status", "ASC")
      .getRawMany<{ status: string; count: number }>();
    return rows;
  }

  async parkMap(scope: TenantParkScope, actor?: JwtPrincipal) {
    const builder = this.scopedCameraBuilder(scope);
    await this.applyCameraDataScope(builder, scope, actor);
    const rows = await builder
      .select("camera.building_id", "building_id")
      .addSelect("camera.area_id", "area_id")
      .addSelect("COUNT(*)::int", "camera_count")
      .addSelect("SUM(CASE WHEN camera.status = 'ONLINE' THEN 1 ELSE 0 END)::int", "online_count")
      .groupBy("camera.building_id")
      .addGroupBy("camera.area_id")
      .orderBy("camera_count", "DESC")
      .getRawMany<{ building_id: string | null; area_id: string | null; camera_count: number; online_count: number }>();
    return rows;
  }

  async realtimeAlerts(scope: TenantParkScope, query: VideoDashboardQueryDto, actor?: JwtPrincipal) {
    const result = await this.list(scope, {
      page: 1,
      page_size: query.limit ?? 20,
      sort: "-triggered_at",
      alert_level: query.alert_level,
      alert_type: query.alert_type,
      building_id: query.building_id,
      camera_id: query.camera_id
    }, actor);
    return result.items;
  }

  private async transition(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    alert: VideoAlertEntity,
    action: string,
    afterStatus: string,
    remark: string,
    mutate?: (entity: VideoAlertEntity, now: Date) => void
  ): Promise<VideoAlertView> {
    const beforeStatus = alert.processStatus;
    const now = new Date();
    mutate?.(alert, now);
    alert.processStatus = afterStatus;
    alert.updateBy = actor.sub;
    await this.alertsRepository.save(alert);
    await this.writeAlertLog(scope, actor, undefined, alert.id, action, beforeStatus, afterStatus, remark);
    return this.detail(scope, alert.id, actor);
  }

  private scopedAlertBuilder(scope: TenantParkScope): SelectQueryBuilder<VideoAlertEntity> {
    return this.alertsRepository
      .createQueryBuilder("alert")
      .leftJoinAndSelect("alert.camera", "camera")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false");
  }

  private scopedCameraBuilder(scope: TenantParkScope): SelectQueryBuilder<CameraDeviceEntity> {
    return this.cameraRepository
      .createQueryBuilder("camera")
      .where("camera.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("camera.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("camera.is_deleted = false");
  }

  private async findAlert(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoAlertEntity> {
    const builder = this.scopedAlertBuilder(scope).andWhere("alert.id = :id", { id });
    await this.applyDataScope(builder, scope, actor);
    const alert = await builder.getOne();
    if (!alert) throw new NotFoundException("Video alert not found");
    return alert;
  }

  private async findCamera(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<CameraDeviceEntity> {
    const builder = this.scopedCameraBuilder(scope).andWhere("camera.id = :id", { id });
    await this.applyCameraDataScope(builder, scope, actor);
    const camera = await builder.getOne();
    if (!camera) throw new NotFoundException("Camera device not found");
    return camera;
  }

  private async hasOpenAlert(scope: TenantParkScope, cameraId: string, alertType: string): Promise<boolean> {
    return this.alertsRepository
      .createQueryBuilder("alert")
      .where("alert.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("alert.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("alert.is_deleted = false")
      .andWhere("alert.camera_id = :cameraId", { cameraId })
      .andWhere("alert.alert_type = :alertType", { alertType })
      .andWhere("alert.process_status IN (:...statuses)", { statuses: OPEN_ALERT_STATUSES })
      .getExists();
  }

  private async applyDataScope(builder: SelectQueryBuilder<VideoAlertEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "alert");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "camera", { unit: "room_id" });
  }

  private async applyCameraDataScope(builder: SelectQueryBuilder<CameraDeviceEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "camera", { unit: "room_id" });
  }

  private applyAlertQuery(builder: SelectQueryBuilder<VideoAlertEntity>, query: VideoAlertQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("alert.alert_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("alert.title ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("alert.description ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("camera.camera_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("camera.camera_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.alert_type) builder.andWhere("alert.alert_type = :alertType", { alertType: query.alert_type });
    if (query.alert_level) builder.andWhere("alert.alert_level = :alertLevel", { alertLevel: query.alert_level });
    if (query.alert_source) builder.andWhere("alert.alert_source = :alertSource", { alertSource: query.alert_source });
    if (query.process_status) builder.andWhere("alert.process_status = :processStatus", { processStatus: query.process_status });
    if (query.camera_id) builder.andWhere("alert.camera_id = :cameraId", { cameraId: query.camera_id });
    if (query.building_id) builder.andWhere("camera.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("camera.floor_id = :floorId", { floorId: query.floor_id });
    if (query.room_id) builder.andWhere("camera.room_id = :roomId", { roomId: query.room_id });
    const start = this.parseDate(query.start_date);
    if (start) builder.andWhere("alert.triggered_at >= :startDate", { startDate: start });
    const end = this.parseDate(query.end_date);
    if (end) builder.andWhere("alert.triggered_at <= :endDate", { endDate: end });
  }

  private applyDashboardQuery(builder: SelectQueryBuilder<VideoAlertEntity>, query: VideoDashboardQueryDto): void {
    this.applyAlertQuery(builder, {
      page: 1,
      page_size: 20,
      alert_type: query.alert_type,
      alert_level: query.alert_level,
      building_id: query.building_id,
      camera_id: query.camera_id,
      start_date: query.start_date,
      end_date: query.end_date
    });
  }

  private applyAlertSort(builder: SelectQueryBuilder<VideoAlertEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      alert_code: "alert.alertCode",
      alert_type: "alert.alertType",
      alert_level: "alert.alertLevel",
      process_status: "alert.processStatus",
      triggered_at: "alert.triggeredAt",
      update_time: "alert.updateTime",
      create_time: "alert.createTime"
    };
    if (sort) {
      const field = sort.startsWith("-") ? sort.slice(1) : sort;
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      builder.orderBy(sortMap[field] ?? "alert.triggeredAt", direction).addOrderBy("alert.createTime", "DESC");
      return;
    }
    builder.orderBy("alert.triggeredAt", "DESC").addOrderBy("alert.createTime", "DESC");
  }

  private toView(alert: VideoAlertEntity): VideoAlertView {
    const camera = alert.camera;
    return {
      id: alert.id,
      tenantId: alert.tenantId,
      parkId: alert.parkId,
      cameraId: alert.cameraId,
      cameraCode: camera?.cameraCode ?? null,
      cameraName: camera?.cameraName ?? null,
      cameraStatus: camera?.status ?? null,
      buildingId: camera?.buildingId ?? null,
      floorId: camera?.floorId ?? null,
      roomId: camera?.roomId ?? null,
      alertCode: alert.alertCode,
      alertType: alert.alertType,
      alertLevel: alert.alertLevel,
      alertSource: alert.alertSource,
      title: alert.title,
      description: alert.description,
      snapshotUrl: alert.snapshotUrl,
      videoClipUrl: alert.videoClipUrl,
      triggeredAt: alert.triggeredAt,
      acknowledgedAt: alert.acknowledgedAt,
      resolvedAt: alert.resolvedAt,
      resolvedBy: alert.resolvedBy,
      assignedTo: alert.assignedTo,
      linkedInspectionId: alert.linkedInspectionId,
      linkedHazardId: alert.linkedHazardId,
      processStatus: alert.processStatus,
      remark: alert.remark,
      createBy: alert.createBy,
      createTime: alert.createTime,
      updateBy: alert.updateBy,
      updateTime: alert.updateTime
    };
  }

  private toLogView(log: VideoAlertProcessLogEntity): VideoAlertLogView {
    return {
      id: log.id,
      alertId: log.alertId,
      action: log.action,
      operatorId: log.operatorId,
      operatorName: log.operatorName,
      oldStatus: log.oldStatus,
      newStatus: log.newStatus,
      remark: log.remark,
      createTime: log.createTime
    };
  }

  private async writeAlertLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager | undefined,
    alertId: string,
    action: string,
    oldStatus: string | null,
    newStatus: string | null,
    remark: string | null
  ): Promise<void> {
    const repository = (manager ?? this.dataSource.manager).getRepository(VideoAlertProcessLogEntity);
    await repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      alertId,
      action,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      oldStatus,
      newStatus,
      remark,
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private async writeHazardStatusLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    hazardId: string,
    beforeStatus: string | null,
    afterStatus: string,
    action: string,
    reason: string
  ): Promise<void> {
    await manager.getRepository(SafetyHazardStatusLogEntity).save(manager.getRepository(SafetyHazardStatusLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      hazardId,
      beforeStatus,
      afterStatus,
      action,
      reason,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private async writeSafetyActionLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    payload: {
      bizType: string;
      bizId: string | null;
      action: string;
      beforeStatus?: string | null;
      afterStatus?: string | null;
      content?: string | null;
    }
  ): Promise<void> {
    await manager.getRepository(SafetyActionLogEntity).save(manager.getRepository(SafetyActionLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      bizType: payload.bizType,
      bizId: payload.bizId,
      action: payload.action,
      beforeStatus: payload.beforeStatus ?? null,
      afterStatus: payload.afterStatus ?? null,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      reason: null,
      content: payload.content ?? null,
      opTime: new Date(),
      payload: {},
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private async resolveTemplate(scope: TenantParkScope, templateId?: string): Promise<SafetyInspectTemplateEntity> {
    const where = { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" };
    const template = templateId
      ? await this.templatesRepository.findOne({ where: { ...where, id: templateId } })
      : await this.templatesRepository.findOne({ where, order: { createTime: "ASC" } });
    if (!template) throw new BadRequestException("Enabled safety inspection template is required");
    return template;
  }

  private async resolvePoint(scope: TenantParkScope, pointId: string | undefined, camera?: CameraDeviceEntity): Promise<SafetyInspectPointEntity> {
    const where = { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" };
    if (pointId) {
      const point = await this.pointsRepository.findOne({ where: { ...where, id: pointId } });
      if (!point) throw new BadRequestException("Enabled safety inspection point is required");
      return point;
    }
    const builder = this.pointsRepository.createQueryBuilder("point")
      .where("point.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("point.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("point.is_deleted = false")
      .andWhere("point.status = 'enabled'");
    if (camera?.roomId) {
      builder.andWhere("(point.unit_id = :unitId OR point.unit_id IS NULL)", { unitId: camera.roomId });
    }
    const point = await builder.orderBy("point.unit_id", "DESC", "NULLS LAST").addOrderBy("point.create_time", "ASC").getOne();
    if (!point) throw new BadRequestException("Enabled safety inspection point is required");
    return point;
  }

  private async assertUser(scope: TenantParkScope, userId: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { tenantId: scope.tenantId, parkId: scope.parkId, id: userId, isDeleted: false } });
    if (!user) throw new BadRequestException("User does not belong to current tenant and park");
    return user;
  }

  private normalizeEnum<T extends readonly string[]>(value: string, values: T, name: string): T[number] {
    if (!values.includes(value as T[number])) throw new BadRequestException(`${name} is invalid`);
    return value as T[number];
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date value");
    return date;
  }

  private assertRequired(value: string | undefined | null, message: string): void {
    if (!value || !value.trim()) throw new BadRequestException(message);
  }

  private mapAlertLevelToRiskLevel(level: string): string {
    if (level === "CRITICAL" || level === "HIGH") return "30";
    if (level === "MEDIUM") return "20";
    return "10";
  }

  private mapAlertTypeToHazardType(alertType: string): string {
    if (alertType === "AI_FIRE") return "fire";
    if (alertType === "AI_BLOCKED_PASSAGE") return "passage";
    if (alertType === "DEVICE_DISABLED" || alertType === "CAMERA_OFFLINE" || alertType === "VIDEO_LOST") return "other";
    return "other";
  }

  private startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
