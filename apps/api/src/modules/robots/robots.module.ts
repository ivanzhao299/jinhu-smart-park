import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { IotDeviceEntity } from "../iot/entities/iot-device.entity";
import { IotProtocolConfigEntity } from "../iot/entities/iot-protocol-config.entity";
import { IotModule } from "../iot/iot.module";
import { SaaSModulesModule } from "../saas-modules/saas-modules.module";
import { EzvizCleaningRobotAdapter } from "./adapters/ezviz-cleaning-robot.adapter";
import { RobotCommandLogEntity } from "./entities/robot-command-log.entity";
import { RobotsController } from "./robots.controller";
import { RobotsService } from "./robots.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([IotDeviceEntity, IotProtocolConfigEntity, RobotCommandLogEntity]),
    CodeRulesModule,
    DataScopesModule,
    SaaSModulesModule,
    IotModule
  ],
  controllers: [RobotsController],
  providers: [RobotsService, EzvizCleaningRobotAdapter],
  exports: [RobotsService]
})
export class RobotsModule {}
