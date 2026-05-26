import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type EntityManager, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { SafetyHazardStatusLogEntity } from "../safety-hazards/entities/safety-hazard-status-log.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { sanitizePlayableUrl } from "./adapters/video-platform-adapter";
import type { CaptureSnapshotDto } from "./dto/capture-snapshot.dto";
import type { CreateCameraInspectionIssueDto } from "./dto/create-camera-inspection-issue.dto";
import type { CreateVideoEvidenceDto } from "./dto/create-video-evidence.dto";
import type { VideoEvidenceQueryDto } from "./dto/video-evidence-query.dto";
import { CameraDeviceEntity } from "./entities/camera-device.entity";
import { VideoEvidenceEntity } from "./entities/video-evidence.entity";
import { VideoStreamService } from "./video-stream.service";

const VIDEO_MODULE = "video";
const VIDEO_EVIDENCE_ENTITY = "video_evidence";
const SOURCE_INSPECTION = "INSPECTION";
const SOURCE_HAZARD = "HAZARD";
const SOURCE_MANUAL = "MANUAL";
const EVIDENCE_SNAPSHOT = "SNAPSHOT";
const STATUS_VALID = "VALID";
const STATUS_INVALID = "INVALID";
const HAZARD_STATUS_CLOSED = "60";

export interface VideoEvidenceView {
  id: string;
  tenantId: string;
  parkId: string;
  cameraId: string;
  cameraCode: string | null;
  cameraName: string | null;
  sourceType: string;
  sourceId: string | null;
  evidenceType: string;
  evidenceUrl: string | null;
  snapshotUrl: string | null;
  clipStartTime: Date | null;
  clipEndTime: Date | null;
  capturedAt: Date;
  capturedBy: string | null;
  description: string | null;
  status: string;
  createBy: string | null;
  createTime: Date;
  updateBy: string | null;
  updateTime: Date;
  camera?: {
    id: string;
    cameraCode: string;
    cameraName: string;
  } | null;
}

@Injectable()
export class VideoEvidenceService {
  constructor(
    @InjectRepository(VideoEvidenceEntity)
    private readonly evidenceRepository: Repository<VideoEvidenceEntity>,
    @InjectRepository(CameraDeviceEntity)
    private readonly cameraRepository: Repository<CameraDeviceEntity>,
    @InjectRepository(SafetyInspectTaskEntity)
    private readonly inspectTaskRepository: Repository<SafetyInspectTaskEntity>,
    @InjectRepository(SafetyHazardEntity)
    private readonly hazardRepository: Repository<SafetyHazardEntity>,
    @InjectRepository(SafetyHazardStatusLogEntity)
    private readonly hazardStatusLogRepository: Repository<SafetyHazardStatusLogEntity>,
    @InjectRepository(SafetyActionLogEntity)
    private readonly safetyActionLogRepository: Repository<SafetyActionLogEntity>,
    private readonly streamService: VideoStreamService,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly dataSource: DataSource
  ) {}

  async list(scope: TenantParkScope, query: VideoEvidenceQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<VideoEvidenceView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedEvidenceBuilder(scope);
    await this.applyCameraDataScope(builder, scope, actor);
    this.applyEvidenceQuery(builder, query);
    this.applyEvidenceSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const views = items.map((item) => this.toView(item));
    const secured = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, VIDEO_MODULE, VIDEO_EVIDENCE_ENTITY, views);
    return { items: secured, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoEvidenceView> {
    const entity = await this.findEvidence(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, VIDEO_MODULE, VIDEO_EVIDENCE_ENTITY, this.toView(entity));
  }

  async sourceList(scope: TenantParkScope, sourceType: string, sourceId: string, actor?: JwtPrincipal): Promise<VideoEvidenceView[]> {
    const normalizedSourceType = this.normalizeSourceType(sourceType);
    await this.assertSource(scope, normalizedSourceType, sourceId, false);
    const result = await this.list(scope, {
      source_type: normalizedSourceType,
      source_id: sourceId,
      page: 1,
      page_size: 200,
      sort: "-captured_at"
    }, actor);
    return result.items;
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateVideoEvidenceDto): Promise<VideoEvidenceView> {
    const camera = await this.findCamera(scope, dto.camera_id, actor);
    const sourceType = this.normalizeSourceType(dto.source_type);
    await this.assertSource(scope, sourceType, dto.source_id ?? null, true);
    const evidenceType = this.normalizeEvidenceType(dto.evidence_type ?? EVIDENCE_SNAPSHOT);
    const saved = await this.evidenceRepository.save(this.evidenceRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      cameraId: camera.id,
      sourceType,
      sourceId: dto.source_id ?? null,
      evidenceType,
      evidenceUrl: dto.evidence_url ?? null,
      snapshotUrl: dto.snapshot_url ?? dto.evidence_url ?? null,
      clipStartTime: this.parseDate(dto.clip_start_time),
      clipEndTime: this.parseDate(dto.clip_end_time),
      capturedAt: this.parseDate(dto.captured_at) ?? new Date(),
      capturedBy: actor.sub,
      description: dto.description ?? null,
      status: STATUS_VALID,
      createBy: actor.sub,
      updateBy: actor.sub
    }));
    return this.detail(scope, saved.id, actor);
  }

  async createForSource(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    sourceType: string,
    sourceId: string,
    dto: Omit<CreateVideoEvidenceDto, "source_type" | "source_id">
  ): Promise<VideoEvidenceView> {
    return this.create(scope, actor, { ...dto, source_type: sourceType, source_id: sourceId });
  }

  async captureSnapshot(scope: TenantParkScope, actor: JwtPrincipal, cameraId: string, dto: CaptureSnapshotDto): Promise<{
    evidence: VideoEvidenceView;
    snapshot_url: string;
    message: string;
  }> {
    await this.findCamera(scope, cameraId, actor);
    const snapshot = await this.streamService.getSnapshotUrl(scope, cameraId, actor);
    if (!snapshot.url) {
      throw new BadRequestException("Camera snapshot url is not configured");
    }
    const sourceType = dto.source_type ? this.normalizeSourceType(dto.source_type) : SOURCE_MANUAL;
    const evidence = await this.create(scope, actor, {
      camera_id: cameraId,
      source_type: sourceType,
      source_id: dto.source_id,
      evidence_type: EVIDENCE_SNAPSHOT,
      evidence_url: snapshot.url,
      snapshot_url: snapshot.url,
      description: dto.description ?? "摄像头截图取证"
    });
    return { evidence, snapshot_url: snapshot.url, message: snapshot.message };
  }

  async createInspectionIssue(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    cameraId: string,
    dto: CreateCameraInspectionIssueDto
  ): Promise<{ hazard_id: string; hazard_code: string; hazard: SafetyHazardEntity }> {
    const camera = await this.findCamera(scope, cameraId, actor);
    this.assertRequired(dto.title, "title is required");
    this.assertRequired(dto.description, "description is required");
    const hazardType = dto.hazard_type ?? "other";
    const riskLevel = dto.risk_level ?? "10";
    const hazardCode = (await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_HAZARD_CODE")).code;
    const saved = await this.dataSource.transaction(async (manager) => {
      const hazard = manager.getRepository(SafetyHazardEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: hazardCode,
        hazardCode,
        title: dto.title.trim(),
        hazardTitle: dto.title.trim(),
        hazardType,
        riskLevel,
        sourceType: "video",
        sourceId: camera.id,
        inspectTaskId: null,
        inspectPointId: null,
        parkTenantId: null,
        buildingId: camera.buildingId,
        floorId: camera.floorId,
        unitId: camera.roomId,
        location: camera.installLocation ?? camera.cameraName,
        description: dto.description.trim(),
        photoFileIds: [],
        beforePhotoFileIds: [],
        afterPhotoFileIds: [],
        overdueFlag: false,
        upgradeFlag: false,
        status: "10",
        remark: `camera:${camera.cameraCode}`,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(hazard);
      await this.writeHazardStatusLog(scope, actor, manager, result.id, null, result.status, "video_issue", "摄像头异常生成巡检问题");
      await this.writeSafetyActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "create_from_camera",
        afterStatus: result.status,
        content: `摄像头 ${camera.cameraCode} 异常生成巡检问题`
      });
      await this.writeSafetyActionLog(scope, actor, manager, {
        bizType: "camera_device",
        bizId: camera.id,
        action: "create_inspection_issue",
        content: `生成隐患 ${result.hazardCode}`
      });
      return result;
    });
    return { hazard_id: saved.id, hazard_code: saved.hazardCode, hazard: saved };
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findEvidence(scope, id, actor);
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.status = STATUS_INVALID;
    entity.updateBy = actor.sub;
    await this.evidenceRepository.save(entity);
    return { id };
  }

  private scopedEvidenceBuilder(scope: TenantParkScope): SelectQueryBuilder<VideoEvidenceEntity> {
    return this.evidenceRepository
      .createQueryBuilder("evidence")
      .leftJoinAndSelect("evidence.camera", "camera")
      .where("evidence.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("evidence.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("evidence.is_deleted = false");
  }

  private async findEvidence(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoEvidenceEntity> {
    const builder = this.scopedEvidenceBuilder(scope).andWhere("evidence.id = :id", { id });
    await this.applyCameraDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Video evidence not found");
    return entity;
  }

  private scopedCameraBuilder(scope: TenantParkScope): SelectQueryBuilder<CameraDeviceEntity> {
    return this.cameraRepository
      .createQueryBuilder("camera")
      .where("camera.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("camera.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("camera.is_deleted = false");
  }

  private async findCamera(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<CameraDeviceEntity> {
    const builder = this.scopedCameraBuilder(scope).andWhere("camera.id = :id", { id });
    await this.applyStandaloneCameraDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Camera device not found");
    if (!entity.isEnabled || entity.status === "DISABLED") {
      throw new BadRequestException("Camera is disabled");
    }
    return entity;
  }

  private async applyCameraDataScope(
    builder: SelectQueryBuilder<VideoEvidenceEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "camera", { unit: "room_id" });
  }

  private async applyStandaloneCameraDataScope(
    builder: SelectQueryBuilder<CameraDeviceEntity>,
    scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "camera", { unit: "room_id" });
  }

  private applyEvidenceQuery(builder: SelectQueryBuilder<VideoEvidenceEntity>, query: VideoEvidenceQueryDto): void {
    if (query.camera_id) builder.andWhere("evidence.camera_id = :cameraId", { cameraId: query.camera_id });
    if (query.source_type) builder.andWhere("evidence.source_type = :sourceType", { sourceType: this.normalizeSourceType(query.source_type) });
    if (query.source_id) builder.andWhere("evidence.source_id = :sourceId", { sourceId: query.source_id });
    if (query.evidence_type) builder.andWhere("evidence.evidence_type = :evidenceType", { evidenceType: this.normalizeEvidenceType(query.evidence_type) });
    if (query.status) builder.andWhere("evidence.status = :status", { status: query.status.trim().toUpperCase() });
  }

  private applyEvidenceSort(builder: SelectQueryBuilder<VideoEvidenceEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      captured_at: "evidence.capturedAt",
      create_time: "evidence.createTime",
      update_time: "evidence.updateTime"
    };
    if (sort) {
      const field = sort.startsWith("-") ? sort.slice(1) : sort;
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      builder.orderBy(sortMap[field] ?? "evidence.capturedAt", direction).addOrderBy("evidence.createTime", "DESC");
      return;
    }
    builder.orderBy("evidence.capturedAt", "DESC").addOrderBy("evidence.createTime", "DESC");
  }

  private async assertSource(scope: TenantParkScope, sourceType: string, sourceId: string | null, forCreate: boolean): Promise<void> {
    if (sourceType === SOURCE_MANUAL) return;
    if (!sourceId) throw new BadRequestException("source_id is required");
    if (sourceType === SOURCE_INSPECTION) {
      const exists = await this.inspectTaskRepository.exists({
        where: { id: sourceId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!exists) throw new BadRequestException("Inspection task does not belong to current tenant and park");
      return;
    }
    if (sourceType === SOURCE_HAZARD) {
      const hazard = await this.hazardRepository.findOne({
        where: { id: sourceId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!hazard) throw new BadRequestException("Hazard does not belong to current tenant and park");
      if (forCreate && hazard.status === HAZARD_STATUS_CLOSED) {
        throw new BadRequestException("Closed hazards cannot add new video evidence");
      }
      return;
    }
    throw new BadRequestException("source_type is invalid");
  }

  private normalizeSourceType(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (![SOURCE_INSPECTION, SOURCE_HAZARD, SOURCE_MANUAL].includes(normalized)) {
      throw new BadRequestException("source_type is invalid");
    }
    return normalized;
  }

  private normalizeEvidenceType(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!["SNAPSHOT", "VIDEO_CLIP", "PREVIEW_LINK"].includes(normalized)) {
      throw new BadRequestException("evidence_type is invalid");
    }
    return normalized;
  }

  private toView(entity: VideoEvidenceEntity): VideoEvidenceView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      cameraId: entity.cameraId,
      cameraCode: entity.camera?.cameraCode ?? null,
      cameraName: entity.camera?.cameraName ?? null,
      sourceType: entity.sourceType,
      sourceId: entity.sourceId,
      evidenceType: entity.evidenceType,
      evidenceUrl: sanitizePlayableUrl(entity.evidenceUrl),
      snapshotUrl: sanitizePlayableUrl(entity.snapshotUrl),
      clipStartTime: entity.clipStartTime,
      clipEndTime: entity.clipEndTime,
      capturedAt: entity.capturedAt,
      capturedBy: entity.capturedBy,
      description: entity.description,
      status: entity.status,
      createBy: entity.createBy,
      createTime: entity.createTime,
      updateBy: entity.updateBy,
      updateTime: entity.updateTime,
      camera: entity.camera ? {
        id: entity.camera.id,
        cameraCode: entity.camera.cameraCode,
        cameraName: entity.camera.cameraName
      } : null
    };
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
    await manager.getRepository(SafetyHazardStatusLogEntity).save(this.hazardStatusLogRepository.create({
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
      bizId?: string | null;
      action: string;
      beforeStatus?: string | null;
      afterStatus?: string | null;
      content?: string | null;
    }
  ): Promise<void> {
    await manager.getRepository(SafetyActionLogEntity).save(this.safetyActionLogRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      bizType: payload.bizType,
      bizId: payload.bizId ?? null,
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

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException("date value is invalid");
    return parsed;
  }

  private assertRequired(value: string | undefined, message: string): void {
    if (!value || value.trim().length === 0) throw new BadRequestException(message);
  }
}
