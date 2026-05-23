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
import { SafetyHazardStatusLogEntity } from "../safety-hazards/entities/safety-hazard-status-log.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { SafetyWorkPermitCheckEntity } from "./entities/safety-work-permit-check.entity";
import { SafetyWorkPermitEntity } from "./entities/safety-work-permit.entity";
import { SafetyWorkPermitLogEntity } from "./entities/safety-work-permit-log.entity";
import { SafetyWorkPermitsController } from "./safety-work-permits.controller";
import { SafetyWorkPermitsService } from "./safety-work-permits.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyWorkPermitEntity,
      SafetyWorkPermitLogEntity,
      BuildingEntity,
      FloorEntity,
      UnitEntity,
      ParkTenantEntity,
      UserEntity,
      DictItemEntity,
      FileEntity,
      SafetyWorkPermitCheckEntity,
      SafetyActionLogEntity,
      SafetyHazardEntity,
      SafetyHazardStatusLogEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule,
    WorkOrdersModule
  ],
  controllers: [SafetyWorkPermitsController],
  providers: [SafetyWorkPermitsService],
  exports: [SafetyWorkPermitsService]
})
export class SafetyWorkPermitsModule {}
