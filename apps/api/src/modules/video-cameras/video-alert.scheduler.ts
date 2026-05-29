import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { SaaSModuleEntity } from "../saas-modules/entities/saas-module.entity";
import { TenantModuleEntity } from "../saas-modules/entities/tenant-module.entity";
import { VideoAlertService } from "./video-alert.service";

const SYSTEM_OPERATOR_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class VideoAlertScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VideoAlertScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(TenantModuleEntity)
    private readonly tenantModulesRepository: Repository<TenantModuleEntity>,
    @InjectRepository(SaaSModuleEntity)
    private readonly modulesRepository: Repository<SaaSModuleEntity>,
    private readonly videoAlertService: VideoAlertService
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.VIDEO_ALERT_SCHEDULER_ENABLED === "false") {
      this.logger.log("Video alert scheduler disabled by VIDEO_ALERT_SCHEDULER_ENABLED=false");
      return;
    }
    const interval = Number(process.env.VIDEO_ALERT_SCHEDULER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    this.timer = setInterval(() => void this.run(), Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    try {
      const module = await this.modulesRepository.findOne({ where: { moduleCode: "video", isDeleted: false, status: 1 } });
      if (!module) {
        return;
      }
      const scopes = await this.tenantModulesRepository.find({
        where: { moduleId: module.id, enabled: true, status: "enabled", isDeleted: false }
      });
      for (const scope of scopes) {
        const scoped = { tenantId: scope.tenantId, parkId: scope.parkId };
        const actor = this.systemActor(scope.tenantId, scope.parkId);
        await this.videoAlertService.detectOffline(scoped, actor);
        await this.videoAlertService.detectPlatformTokenExpired(scoped, actor);
      }
    } catch (error) {
      this.logger.warn(`Video alert scheduler skipped: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  private systemActor(tenantId: string, parkId: string): JwtPrincipal {
    return {
      sub: SYSTEM_OPERATOR_ID,
      username: "system",
      realName: "系统",
      tenantId,
      parkId,
      roles: ["SYSTEM"],
      permissions: ["*"],
      dataScope: "all",
      isSuper: true
    };
  }
}
