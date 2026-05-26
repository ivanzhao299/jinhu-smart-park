import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CameraDeviceQueryDto } from "./dto/camera-device-query.dto";
import type { CreateCameraDeviceDto } from "./dto/create-camera-device.dto";
import type { UpdateCameraDeviceDto } from "./dto/update-camera-device.dto";
import type { UpdateCameraStatusDto } from "./dto/update-camera-status.dto";
import { sanitizePlayableUrl } from "./adapters/video-platform-adapter";
import { CameraDeviceEntity } from "./entities/camera-device.entity";

const VIDEO_MODULE = "video";
const CAMERA_ENTITY = "camera_device";
const CAMERA_CODE_RULE = "CAMERA_CODE";
const DEFAULT_STATUS = "UNKNOWN";
const DEFAULT_PLATFORM_TYPE = "LOCAL_RTSP";
const VALID_STATUSES = new Set(["ONLINE", "OFFLINE", "UNKNOWN", "DISABLED"]);

interface LocationRefs {
  buildingId: string | null;
  floorId: string | null;
  roomId: string | null;
}

export interface CameraDeviceView {
  id: string;
  tenantId: string;
  parkId: string;
  code: string | null;
  buildingId: string | null;
  floorId: string | null;
  roomId: string | null;
  areaId: string | null;
  cameraCode: string;
  cameraName: string;
  cameraType: string | null;
  cameraUsage: string;
  brand: string | null;
  model: string | null;
  manufacturer: string | null;
  platformType: string;
  platformDeviceId: string | null;
  ipAddress: string | null;
  port: number | null;
  username: string | null;
  passwordEncrypted: string | null;
  rtspUrl: string | null;
  hlsUrl: string | null;
  webrtcUrl: string | null;
  snapshotUrl: string | null;
  installLocation: string | null;
  longitude: string | null;
  latitude: string | null;
  direction: string | null;
  status: string;
  isRecording: boolean;
  isEnabled: boolean;
  remark: string | null;
  createBy: string | null;
  createTime: Date;
  updateBy: string | null;
  updateTime: Date;
  deletedAt: Date | null;
  isDeleted: boolean;
  version: number;
}

@Injectable()
export class VideoCamerasService {
  constructor(
    @InjectRepository(CameraDeviceEntity)
    private readonly cameraRepository: Repository<CameraDeviceEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitRepository: Repository<UnitEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorRepository: Repository<FloorEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, query: CameraDeviceQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<CameraDeviceView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedCameraBuilder(scope);
    await this.applyDataScope(builder, scope, actor);
    this.applyCameraQuery(builder, query);
    this.applyCameraSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const safeItems = items.map((item) => this.toSafeView(item));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, VIDEO_MODULE, CAMERA_ENTITY, safeItems);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<CameraDeviceView> {
    const entity = await this.findCamera(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, VIDEO_MODULE, CAMERA_ENTITY, this.toSafeView(entity));
  }

  async map(scope: TenantParkScope, query: CameraDeviceQueryDto, actor?: JwtPrincipal): Promise<CameraDeviceView[]> {
    const response = await this.list(scope, { ...query, page: 1, page_size: query.page_size ?? 500, sort: query.sort ?? "camera_code" }, actor);
    return response.items;
  }

  async byLocation(scope: TenantParkScope, query: CameraDeviceQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<CameraDeviceView>> {
    return this.list(scope, { ...query, sort: query.sort ?? "building_id" }, actor);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateCameraDeviceDto): Promise<CameraDeviceView> {
    this.assertRequired(dto.camera_name, "camera_name is required");
    this.assertRequired(dto.camera_usage, "camera_usage is required");
    const generated = dto.camera_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, CAMERA_CODE_RULE);
    const cameraCode = dto.camera_code ?? generated?.code ?? "";
    await this.assertCameraCodeAvailable(scope, cameraCode);
    const refs = await this.resolveLocationRefs(scope, dto);
    const status = this.normalizeStatus(dto.status ?? DEFAULT_STATUS);
    const entity = this.cameraRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: dto.code ?? cameraCode,
      cameraCode,
      cameraName: dto.camera_name,
      cameraType: dto.camera_type ?? null,
      cameraUsage: dto.camera_usage,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      manufacturer: dto.manufacturer ?? null,
      platformType: dto.platform_type ?? DEFAULT_PLATFORM_TYPE,
      platformDeviceId: dto.platform_device_id ?? null,
      ipAddress: dto.ip_address ?? null,
      port: dto.port ?? null,
      username: dto.username ?? null,
      passwordEncrypted: this.normalizePassword(dto.password ?? dto.password_encrypted),
      rtspUrl: dto.rtsp_url ?? null,
      hlsUrl: dto.hls_url ?? null,
      webrtcUrl: dto.webrtc_url ?? null,
      snapshotUrl: dto.snapshot_url ?? null,
      buildingId: refs.buildingId,
      floorId: refs.floorId,
      roomId: refs.roomId,
      areaId: dto.area_id ?? null,
      installLocation: dto.install_location ?? null,
      longitude: this.formatNumber(dto.longitude),
      latitude: this.formatNumber(dto.latitude),
      direction: dto.direction ?? null,
      status,
      isRecording: dto.is_recording ?? false,
      isEnabled: dto.is_enabled ?? status !== "DISABLED",
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.cameraRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateCameraDeviceDto): Promise<CameraDeviceView> {
    const entity = await this.findCamera(scope, id, actor);
    const nextCameraCode = dto.camera_code ?? entity.cameraCode;
    if (nextCameraCode !== entity.cameraCode) {
      await this.assertCameraCodeAvailable(scope, nextCameraCode, entity.id);
    }
    const refs = await this.resolveLocationRefs(scope, {
      building_id: dto.building_id === undefined ? entity.buildingId ?? undefined : dto.building_id,
      floor_id: dto.floor_id === undefined ? entity.floorId ?? undefined : dto.floor_id,
      room_id: dto.room_id === undefined && dto.unit_id === undefined ? entity.roomId ?? undefined : dto.room_id ?? dto.unit_id
    });
    const nextStatus = dto.status === undefined ? entity.status : this.normalizeStatus(dto.status);
    Object.assign(entity, {
      code: dto.code === undefined ? entity.code : dto.code ?? null,
      cameraCode: nextCameraCode,
      cameraName: dto.camera_name ?? entity.cameraName,
      cameraType: dto.camera_type === undefined ? entity.cameraType : dto.camera_type ?? null,
      cameraUsage: dto.camera_usage ?? entity.cameraUsage,
      brand: dto.brand === undefined ? entity.brand : dto.brand ?? null,
      model: dto.model === undefined ? entity.model : dto.model ?? null,
      manufacturer: dto.manufacturer === undefined ? entity.manufacturer : dto.manufacturer ?? null,
      platformType: dto.platform_type ?? entity.platformType,
      platformDeviceId: dto.platform_device_id === undefined ? entity.platformDeviceId : dto.platform_device_id ?? null,
      ipAddress: dto.ip_address === undefined ? entity.ipAddress : dto.ip_address ?? null,
      port: dto.port === undefined ? entity.port : dto.port ?? null,
      username: dto.username === undefined ? entity.username : dto.username ?? null,
      passwordEncrypted: dto.password !== undefined || dto.password_encrypted !== undefined
        ? this.normalizePassword(dto.password ?? dto.password_encrypted)
        : entity.passwordEncrypted,
      rtspUrl: dto.rtsp_url === undefined ? entity.rtspUrl : dto.rtsp_url ?? null,
      hlsUrl: dto.hls_url === undefined ? entity.hlsUrl : dto.hls_url ?? null,
      webrtcUrl: dto.webrtc_url === undefined ? entity.webrtcUrl : dto.webrtc_url ?? null,
      snapshotUrl: dto.snapshot_url === undefined ? entity.snapshotUrl : dto.snapshot_url ?? null,
      buildingId: refs.buildingId,
      floorId: refs.floorId,
      roomId: refs.roomId,
      areaId: dto.area_id === undefined ? entity.areaId : dto.area_id ?? null,
      installLocation: dto.install_location === undefined ? entity.installLocation : dto.install_location ?? null,
      longitude: dto.longitude === undefined ? entity.longitude : this.formatNumber(dto.longitude),
      latitude: dto.latitude === undefined ? entity.latitude : this.formatNumber(dto.latitude),
      direction: dto.direction === undefined ? entity.direction : dto.direction ?? null,
      status: nextStatus,
      isRecording: dto.is_recording === undefined ? entity.isRecording : dto.is_recording,
      isEnabled: dto.is_enabled === undefined ? (nextStatus === "DISABLED" ? false : entity.isEnabled) : dto.is_enabled,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.cameraRepository.save(entity);
    return this.detail(scope, saved.id, actor);
  }

  async updateStatus(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateCameraStatusDto): Promise<CameraDeviceView> {
    const entity = await this.findCamera(scope, id, actor);
    const status = this.normalizeStatus(dto.status);
    entity.status = status;
    entity.isEnabled = dto.is_enabled ?? status !== "DISABLED";
    entity.updateBy = actor.sub;
    await this.cameraRepository.save(entity);
    return this.detail(scope, id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findCamera(scope, id, actor);
    entity.isDeleted = true;
    entity.deletedAt = new Date();
    entity.status = "DISABLED";
    entity.isEnabled = false;
    entity.updateBy = actor.sub;
    await this.cameraRepository.save(entity);
    return { id };
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
    await this.applyDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Camera device not found");
    }
    return entity;
  }

  private applyCameraQuery(builder: SelectQueryBuilder<CameraDeviceEntity>, query: CameraDeviceQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("camera.camera_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("camera.camera_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("camera.brand ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("camera.install_location ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("camera.platform_device_id ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.camera_name) builder.andWhere("camera.camera_name ILIKE :cameraName", { cameraName: `%${query.camera_name}%` });
    if (query.camera_code) builder.andWhere("camera.camera_code ILIKE :cameraCode", { cameraCode: `%${query.camera_code}%` });
    if (query.brand) builder.andWhere("camera.brand ILIKE :brand", { brand: `%${query.brand}%` });
    if (query.platform_type) builder.andWhere("camera.platform_type = :platformType", { platformType: query.platform_type });
    const usage = query.usage ?? query.camera_usage;
    if (usage) builder.andWhere("camera.camera_usage = :usage", { usage });
    if (query.status) builder.andWhere("camera.status = :status", { status: this.normalizeStatus(query.status) });
    if (query.building_id) builder.andWhere("camera.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("camera.floor_id = :floorId", { floorId: query.floor_id });
    const roomId = query.room_id ?? query.unit_id;
    if (roomId) builder.andWhere("camera.room_id = :roomId", { roomId });
    if (query.area_id) builder.andWhere("camera.area_id = :areaId", { areaId: query.area_id });
    if (query.is_enabled !== undefined) builder.andWhere("camera.is_enabled = :isEnabled", { isEnabled: query.is_enabled });
  }

  private applyCameraSort(builder: SelectQueryBuilder<CameraDeviceEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      camera_code: "camera.cameraCode",
      camera_name: "camera.cameraName",
      camera_usage: "camera.cameraUsage",
      usage: "camera.cameraUsage",
      brand: "camera.brand",
      platform_type: "camera.platformType",
      status: "camera.status",
      building_id: "camera.buildingId",
      floor_id: "camera.floorId",
      area_id: "camera.areaId",
      update_time: "camera.updateTime",
      create_time: "camera.createTime"
    };
    if (sort) {
      const field = sort.startsWith("-") ? sort.slice(1) : sort;
      const direction = sort.startsWith("-") ? "DESC" : "ASC";
      builder.orderBy(sortMap[field] ?? "camera.updateTime", direction).addOrderBy("camera.createTime", "DESC");
      return;
    }
    builder.orderBy("camera.updateTime", "DESC").addOrderBy("camera.createTime", "DESC");
  }

  private async applyDataScope(builder: SelectQueryBuilder<CameraDeviceEntity>, scope: TenantParkScope, actor?: JwtPrincipal): Promise<void> {
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "camera", { unit: "room_id" });
  }

  private async resolveLocationRefs(
    scope: TenantParkScope,
    dto: Pick<CreateCameraDeviceDto, "building_id" | "floor_id" | "room_id" | "unit_id">
  ): Promise<LocationRefs> {
    let buildingId = dto.building_id ?? null;
    let floorId = dto.floor_id ?? null;
    const roomId = dto.room_id ?? dto.unit_id ?? null;
    if (roomId) {
      const unit = await this.unitRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: roomId, isDeleted: false }
      });
      if (!unit) {
        throw new BadRequestException("room_id does not belong to current tenant and park");
      }
      if (buildingId && buildingId !== unit.buildingId) {
        throw new BadRequestException("building_id does not match room_id");
      }
      if (floorId && floorId !== unit.floorId) {
        throw new BadRequestException("floor_id does not match room_id");
      }
      buildingId = unit.buildingId;
      floorId = unit.floorId;
    }
    if (buildingId) {
      const building = await this.buildingRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: buildingId, isDeleted: false }
      });
      if (!building) {
        throw new BadRequestException("building_id does not belong to current tenant and park");
      }
    }
    if (floorId) {
      const floor = await this.floorRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, id: floorId, isDeleted: false }
      });
      if (!floor) {
        throw new BadRequestException("floor_id does not belong to current tenant and park");
      }
      if (buildingId && floor.buildingId !== buildingId) {
        throw new BadRequestException("floor_id does not belong to building_id");
      }
      buildingId = buildingId ?? floor.buildingId;
    }
    return { buildingId, floorId, roomId };
  }

  private async assertCameraCodeAvailable(scope: TenantParkScope, cameraCode: string, excludeId?: string): Promise<void> {
    const builder = this.scopedCameraBuilder(scope).andWhere("camera.camera_code = :cameraCode", { cameraCode });
    if (excludeId) {
      builder.andWhere("camera.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("camera_code already exists");
    }
  }

  private normalizeStatus(status: string): string {
    const normalized = status.trim().toUpperCase();
    if (!VALID_STATUSES.has(normalized)) {
      throw new BadRequestException("status is invalid");
    }
    return normalized;
  }

  private normalizePassword(value: string | undefined): string | null {
    if (!value) return null;
    if (value.startsWith("sha256:")) return value;
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new BadRequestException(message);
    }
  }

  private formatNumber(value: number | undefined): string | null {
    return value === undefined ? null : String(value);
  }

  private maskSecret(value: string | null): string | null {
    return value ? "***" : null;
  }

  private toSafeView(entity: CameraDeviceEntity): CameraDeviceView {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      code: entity.code,
      buildingId: entity.buildingId,
      floorId: entity.floorId,
      roomId: entity.roomId,
      areaId: entity.areaId,
      cameraCode: entity.cameraCode,
      cameraName: entity.cameraName,
      cameraType: entity.cameraType,
      cameraUsage: entity.cameraUsage,
      brand: entity.brand,
      model: entity.model,
      manufacturer: entity.manufacturer,
      platformType: entity.platformType,
      platformDeviceId: entity.platformDeviceId,
      ipAddress: entity.ipAddress,
      port: entity.port,
      username: entity.username,
      passwordEncrypted: this.maskSecret(entity.passwordEncrypted),
      rtspUrl: sanitizePlayableUrl(entity.rtspUrl),
      hlsUrl: sanitizePlayableUrl(entity.hlsUrl),
      webrtcUrl: sanitizePlayableUrl(entity.webrtcUrl),
      snapshotUrl: sanitizePlayableUrl(entity.snapshotUrl),
      installLocation: entity.installLocation,
      longitude: entity.longitude,
      latitude: entity.latitude,
      direction: entity.direction,
      status: entity.status,
      isRecording: entity.isRecording,
      isEnabled: entity.isEnabled,
      remark: entity.remark,
      createBy: entity.createBy,
      createTime: entity.createTime,
      updateBy: entity.updateBy,
      updateTime: entity.updateTime,
      deletedAt: entity.deletedAt,
      isDeleted: entity.isDeleted,
      version: entity.version
    };
  }
}
