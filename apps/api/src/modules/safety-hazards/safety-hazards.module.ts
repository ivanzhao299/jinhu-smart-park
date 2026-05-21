import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyEmergencyEventEntity } from "../safety-emergency/entities/safety-emergency-event.entity";
import { SafetyEmergencyTimelineEntity } from "../safety-emergency/entities/safety-emergency-timeline.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { SafetyHazardStatusLogEntity } from "./entities/safety-hazard-status-log.entity";
import { SafetyHazardsController } from "./safety-hazards.controller";
import { SafetyHazardsService } from "./safety-hazards.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyHazardEntity,
      SafetyHazardStatusLogEntity,
      SafetyActionLogEntity,
      SafetyEmergencyEventEntity,
      SafetyEmergencyTimelineEntity,
      BuildingEntity,
      FloorEntity,
      UnitEntity,
      ParkTenantEntity,
      FileEntity,
      UserEntity,
      WorkOrderEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule,
    WorkOrdersModule
  ],
  controllers: [SafetyHazardsController],
  providers: [SafetyHazardsService],
  exports: [SafetyHazardsService]
})
export class SafetyHazardsModule {}
