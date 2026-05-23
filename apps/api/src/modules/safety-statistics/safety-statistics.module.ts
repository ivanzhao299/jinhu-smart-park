import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyEmergencyEventEntity } from "../safety-emergency/entities/safety-emergency-event.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { SafetyWorkPermitCheckEntity } from "../safety-work-permits/entities/safety-work-permit-check.entity";
import { SafetyWorkPermitEntity } from "../safety-work-permits/entities/safety-work-permit.entity";
import { SafetyStatisticsController } from "./safety-statistics.controller";
import { SafetyStatisticsService } from "./safety-statistics.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyInspectTaskEntity,
      SafetyHazardEntity,
      ParkTenantEntity,
      SafetyEmergencyEventEntity,
      SafetyWorkPermitEntity,
      SafetyWorkPermitCheckEntity
    ]),
    DataScopesModule
  ],
  controllers: [SafetyStatisticsController],
  providers: [SafetyStatisticsService]
})
export class SafetyStatisticsModule {}
