import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { DictTypeEntity } from "../dicts/entities/dict-type.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { FilesModule } from "../files/files.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { IotModule } from "../iot/iot.module";
import { SafetyEmergencyModule } from "../safety-emergency/safety-emergency.module";
import { SafetyHazardsModule } from "../safety-hazards/safety-hazards.module";
import { SafetyWorkPermitsModule } from "../safety-work-permits/safety-work-permits.module";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { UnitEntity } from "./entities/unit.entity";
import { UnitStatusLogEntity } from "./entities/unit-status-log.entity";
import { UnitsController } from "./units.controller";
import { UnitsQueryService } from "./units-query.service";
import { UnitsService } from "./units.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([UnitEntity, UnitStatusLogEntity, BuildingEntity, FloorEntity, FileEntity, DictTypeEntity, DictItemEntity]),
    FilesModule,
    AuditModule,
    DataScopesModule,
    FieldPoliciesModule,
    CodeRulesModule,
    WorkOrdersModule,
    SafetyHazardsModule,
    SafetyEmergencyModule,
    SafetyWorkPermitsModule,
    IotModule
  ],
  controllers: [UnitsController],
  providers: [UnitsService, UnitsQueryService],
  exports: [UnitsService]
})
export class UnitsModule {}
