import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { SafetyHazardStatusLogEntity } from "../safety-hazards/entities/safety-hazard-status-log.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { SafetyInspectPointEntity } from "../safety-inspect-points/entities/safety-inspect-point.entity";
import { SafetyInspectTemplateEntity } from "../safety-inspect-templates/entities/safety-inspect-template.entity";
import { SaaSModuleEntity } from "../saas-modules/entities/saas-module.entity";
import { TenantModuleEntity } from "../saas-modules/entities/tenant-module.entity";
import { UserEntity } from "../users/entities/user.entity";
import { CameraDeviceEntity } from "./entities/camera-device.entity";
import { VideoAlertProcessLogEntity } from "./entities/video-alert-process-log.entity";
import { VideoAlertEntity } from "./entities/video-alert.entity";
import { VideoEvidenceEntity } from "./entities/video-evidence.entity";
import { VideoPlatformConfigEntity } from "./entities/video-platform-config.entity";
import { SafetyVideoEvidencesController } from "./safety-video-evidences.controller";
import { VideoAlertScheduler } from "./video-alert.scheduler";
import { VideoAlertService } from "./video-alert.service";
import { VideoAlertsController } from "./video-alerts.controller";
import { VideoCamerasController } from "./video-cameras.controller";
import { VideoCamerasService } from "./video-cameras.service";
import { VideoEvidenceService } from "./video-evidence.service";
import { VideoEvidencesController } from "./video-evidences.controller";
import { VideoPlatformConfigsController } from "./video-platform-configs.controller";
import { VideoPlatformService } from "./video-platform.service";
import { VideoSecurityDashboardController } from "./video-security-dashboard.controller";
import { VideoSecretService } from "./video-secret.service";
import { VideoStreamService } from "./video-stream.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CameraDeviceEntity,
      VideoAlertEntity,
      VideoAlertProcessLogEntity,
      VideoEvidenceEntity,
      VideoPlatformConfigEntity,
      BuildingEntity,
      FloorEntity,
      UnitEntity,
      SafetyInspectPointEntity,
      SafetyInspectTemplateEntity,
      SafetyInspectTaskEntity,
      SafetyHazardEntity,
      SafetyHazardStatusLogEntity,
      SafetyActionLogEntity,
      SaaSModuleEntity,
      TenantModuleEntity,
      UserEntity
    ]),
    ConfigModule,
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [
    VideoCamerasController,
    VideoPlatformConfigsController,
    VideoEvidencesController,
    SafetyVideoEvidencesController,
    VideoAlertsController,
    VideoSecurityDashboardController
  ],
  providers: [
    VideoCamerasService,
    VideoAlertService,
    VideoAlertScheduler,
    VideoEvidenceService,
    VideoPlatformService,
    VideoSecretService,
    VideoStreamService
  ],
  exports: [VideoCamerasService, VideoAlertService, VideoEvidenceService, VideoPlatformService, VideoStreamService]
})
export class VideoCamerasModule {}
