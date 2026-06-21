import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { EnergyAlertEntity } from "../energy/entities/energy-alert.entity";
import { EnergyMeterEntity } from "../energy/entities/energy-meter.entity";
import { EnergyReadingEntity } from "../energy/entities/energy-reading.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SaaSModulesModule } from "../saas-modules/saas-modules.module";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { SafetyHazardsModule } from "../safety-hazards/safety-hazards.module";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { IotAlertLogEntity } from "./entities/iot-alert-log.entity";
import { IotAlertRuleEntity } from "./entities/iot-alert-rule.entity";
import { IotAlertEntity } from "./entities/iot-alert.entity";
import { IotDeviceDataEntity } from "./entities/iot-device-data.entity";
import { IotDeviceHeartbeatEntity } from "./entities/iot-device-heartbeat.entity";
import { IotDeviceLatestEntity } from "./entities/iot-device-latest.entity";
import { IotDeviceMetricEntity } from "./entities/iot-device-metric.entity";
import { IotDeviceEntity } from "./entities/iot-device.entity";
import { IotGatewayEntity } from "./entities/iot-gateway.entity";
import { IotMetricEntity } from "./entities/iot-metric.entity";
import { IotPointEntity } from "./entities/iot-point.entity";
import { IotProtocolConfigEntity } from "./entities/iot-protocol-config.entity";
import { IotRuleExecutionLogEntity } from "./entities/iot-rule-execution-log.entity";
import { IotRuleEntity } from "./entities/iot-rule.entity";
import { SceneExecutionLogEntity } from "./entities/scene-execution-log.entity";
import { SceneInstanceEntity } from "./entities/scene-instance.entity";
import { SceneTemplateEntity } from "./entities/scene-template.entity";
import { IotDeviceSecretService } from "./iot-device-secret.service";
import { IotDashboardController } from "./iot-dashboard.controller";
import { IotDashboardService } from "./iot-dashboard.service";
import { IotDevicesController } from "./iot-devices.controller";
import { IotDevicesService } from "./iot-devices.service";
import { IotGatewaysController } from "./iot-gateways.controller";
import { IotGatewaysService } from "./iot-gateways.service";
import { IotIngestController } from "./iot-ingest.controller";
import { IotIngestService } from "./iot-ingest.service";
import { IotAlertRulesController } from "./iot-alert-rules.controller";
import { IotAlertRulesService } from "./iot-alert-rules.service";
import { IotAlertsController } from "./iot-alerts.controller";
import { IotAlertsService } from "./iot-alerts.service";
import { IotMetricsController } from "./iot-metrics.controller";
import { IotMetricsService } from "./iot-metrics.service";
import { IotMqttController } from "./iot-mqtt.controller";
import { IotMqttService } from "./iot-mqtt.service";
import { IotProtocolConfigsController } from "./iot-protocol-configs.controller";
import { IotProtocolConfigsService } from "./iot-protocol-configs.service";
import { IotRealtimeGateway } from "./iot-realtime.gateway";
import { IotRealtimeService } from "./iot-realtime.service";
import { IotRuleEngineService } from "./iot-rule-engine.service";
import { IotRuleScheduler } from "./iot-rule.scheduler";
import { IotRuleTriggerService } from "./iot-rule-trigger.service";
import { IotRulesController } from "./iot-rules.controller";
import { IotScenesController } from "./iot-scenes.controller";
import { IotRuntimeService } from "./iot-runtime.service";
import { IotStatusScheduler } from "./iot-status.scheduler";
import { MqttIngestService } from "./mqtt-ingest.service";
import { MqttMessageParser } from "./mqtt-message-parser";
import { SceneExecutionService } from "./scene-execution.service";
import { SceneInstancesService } from "./scene-instances.service";
import { SceneTemplatesService } from "./scene-templates.service";
import { UnifiedActionExecutorService } from "./unified-action-executor.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IotGatewayEntity,
      IotDeviceEntity,
      IotDeviceMetricEntity,
      IotMetricEntity,
      IotPointEntity,
      IotDeviceLatestEntity,
      IotDeviceDataEntity,
      IotDeviceHeartbeatEntity,
      IotAlertRuleEntity,
      IotAlertEntity,
      IotAlertLogEntity,
      IotProtocolConfigEntity,
      IotRuleEntity,
      IotRuleExecutionLogEntity,
      SceneTemplateEntity,
      SceneInstanceEntity,
      SceneExecutionLogEntity,
      EnergyMeterEntity,
      EnergyReadingEntity,
      EnergyAlertEntity,
      BuildingEntity,
      FloorEntity,
      UnitEntity,
      ParkTenantEntity,
      UserEntity
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET")
      })
    }),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule,
    SaaSModulesModule,
    WorkOrdersModule,
    SafetyHazardsModule
  ],
  controllers: [
    IotGatewaysController,
    IotDevicesController,
    IotMetricsController,
    IotAlertRulesController,
    IotAlertsController,
    IotIngestController,
    IotMqttController,
    IotDashboardController,
    IotProtocolConfigsController,
    IotRulesController,
    IotScenesController
  ],
  providers: [
    IotGatewaysService,
    IotDevicesService,
    IotDashboardService,
    IotMetricsService,
    IotAlertRulesService,
    IotAlertsService,
    IotDeviceSecretService,
    IotIngestService,
    MqttMessageParser,
    MqttIngestService,
    IotMqttService,
    IotProtocolConfigsService,
    IotRealtimeService,
    IotRealtimeGateway,
    IotRuleEngineService,
    IotRuleTriggerService,
    IotRuleScheduler,
    UnifiedActionExecutorService,
    SceneTemplatesService,
    SceneInstancesService,
    SceneExecutionService,
    IotRuntimeService,
    IotStatusScheduler
  ],
  exports: [
    IotGatewaysService,
    IotDevicesService,
    IotDashboardService,
    IotMetricsService,
    IotAlertRulesService,
    IotAlertsService,
    IotDeviceSecretService,
    IotIngestService,
    MqttMessageParser,
    MqttIngestService,
    IotMqttService,
    IotProtocolConfigsService,
    IotRealtimeService,
    IotRuleEngineService,
    IotRuleTriggerService,
    UnifiedActionExecutorService,
    SceneTemplatesService,
    SceneInstancesService,
    SceneExecutionService,
    IotRuntimeService
  ]
})
export class IotModule {}
