import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { SafetyStatisticsController } from "./safety-statistics.controller";
import { SafetyStatisticsService } from "./safety-statistics.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyInspectTaskEntity,
      SafetyHazardEntity,
      ParkTenantEntity
    ]),
    DataScopesModule
  ],
  controllers: [SafetyStatisticsController],
  providers: [SafetyStatisticsService]
})
export class SafetyStatisticsModule {}
