import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FilesModule } from "../files/files.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { SafetyEmergencyContactsController } from "./safety-emergency-contacts.controller";
import { SafetyEmergenciesController } from "./safety-emergencies.controller";
import { SafetyEmergencyPlansController } from "./safety-emergency-plans.controller";
import { SafetyEmergencyService } from "./safety-emergency.service";
import { SafetyEmergencyContactEntity } from "./entities/safety-emergency-contact.entity";
import { SafetyEmergencyEventEntity } from "./entities/safety-emergency-event.entity";
import { SafetyEmergencyPlanEntity } from "./entities/safety-emergency-plan.entity";
import { SafetyEmergencyTimelineEntity } from "./entities/safety-emergency-timeline.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyEmergencyContactEntity,
      SafetyEmergencyPlanEntity,
      SafetyEmergencyEventEntity,
      SafetyEmergencyTimelineEntity,
      DictItemEntity,
      BuildingEntity,
      FloorEntity,
      UnitEntity,
      ParkTenantEntity,
      UserEntity,
      SafetyActionLogEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule,
    FilesModule,
    WorkOrdersModule
  ],
  controllers: [SafetyEmergencyContactsController, SafetyEmergencyPlansController, SafetyEmergenciesController],
  providers: [SafetyEmergencyService],
  exports: [SafetyEmergencyService]
})
export class SafetyEmergencyModule {}
