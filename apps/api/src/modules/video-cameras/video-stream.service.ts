import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type Repository, type SelectQueryBuilder } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { DataScopeService } from "../data-scopes/data-scope.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CloudseeAdapter } from "./adapters/cloudsee.adapter";
import { DahuaAdapter } from "./adapters/dahua.adapter";
import { EzvizAdapter } from "./adapters/ezviz.adapter";
import { HikvisionAdapter } from "./adapters/hikvision.adapter";
import { LocalRtspAdapter } from "./adapters/local-rtsp.adapter";
import { OtherAdapter } from "./adapters/other.adapter";
import type { VideoPlaybackWindow, VideoPlatformAdapter, VideoStatusResult, VideoStreamResult } from "./adapters/video-platform-adapter";
import type { VideoPlaybackQueryDto } from "./dto/video-playback-query.dto";
import { CameraDeviceEntity } from "./entities/camera-device.entity";
import { VideoPlatformConfigEntity } from "./entities/video-platform-config.entity";

const LOCAL_PLATFORM = "LOCAL_RTSP";

@Injectable()
export class VideoStreamService {
  private readonly adapters: Map<string, VideoPlatformAdapter>;

  constructor(
    @InjectRepository(CameraDeviceEntity)
    private readonly cameraRepository: Repository<CameraDeviceEntity>,
    @InjectRepository(VideoPlatformConfigEntity)
    private readonly platformRepository: Repository<VideoPlatformConfigEntity>,
    private readonly dataScopeService: DataScopeService
  ) {
    const adapterList: VideoPlatformAdapter[] = [
      new LocalRtspAdapter(),
      new HikvisionAdapter(),
      new DahuaAdapter(),
      new EzvizAdapter(),
      new CloudseeAdapter(),
      new OtherAdapter()
    ];
    this.adapters = new Map(adapterList.map((adapter) => [adapter.platformType, adapter]));
  }

  async getPreviewUrl(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoStreamResult> {
    const { camera, config, adapter } = await this.resolveCameraAdapter(scope, id, actor);
    return adapter.getPreviewUrl(camera, config);
  }

  async getSnapshotUrl(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoStreamResult> {
    const { camera, config, adapter } = await this.resolveCameraAdapter(scope, id, actor);
    return adapter.getSnapshotUrl(camera, config);
  }

  async getPlaybackUrl(scope: TenantParkScope, id: string, query: VideoPlaybackQueryDto, actor?: JwtPrincipal): Promise<VideoStreamResult> {
    const { camera, config, adapter } = await this.resolveCameraAdapter(scope, id, actor);
    const window: VideoPlaybackWindow = { startTime: query.start_time, endTime: query.end_time };
    return adapter.getPlaybackUrl(camera, config, window);
  }

  async checkDeviceStatus(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<VideoStatusResult> {
    const { camera, config, adapter } = await this.resolveCameraAdapter(scope, id, actor);
    return adapter.checkDeviceStatus(camera, config);
  }

  private async resolveCameraAdapter(
    scope: TenantParkScope,
    id: string,
    actor?: JwtPrincipal
  ): Promise<{ camera: CameraDeviceEntity; config: VideoPlatformConfigEntity | null; adapter: VideoPlatformAdapter }> {
    const camera = await this.findCamera(scope, id, actor);
    if (!camera.isEnabled || camera.status === "DISABLED") {
      throw new BadRequestException("Camera is disabled");
    }
    const platformType = camera.platformType || LOCAL_PLATFORM;
    const adapter = this.adapters.get(platformType) ?? this.adapters.get("OTHER");
    if (!adapter) {
      throw new BadRequestException("Video platform adapter is not available");
    }
    const config = await this.resolvePlatformConfig(scope, platformType);
    return { camera, config, adapter };
  }

  private async resolvePlatformConfig(scope: TenantParkScope, platformType: string): Promise<VideoPlatformConfigEntity | null> {
    if (platformType === LOCAL_PLATFORM) {
      return null;
    }
    const config = await this.platformRepository
      .createQueryBuilder("config")
      .where("config.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("config.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("config.platform_type = :platformType", { platformType })
      .andWhere("config.is_deleted = false")
      .orderBy("config.update_time", "DESC")
      .getOne();
    if (!config) {
      throw new BadRequestException("Video platform config is not configured");
    }
    if (config.status !== "ACTIVE") {
      throw new BadRequestException("Video platform config is not active");
    }
    return config;
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
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "park", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "building", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "floor", "camera");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "unit", "camera", { unit: "room_id" });
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Camera device not found");
    }
    return entity;
  }
}
