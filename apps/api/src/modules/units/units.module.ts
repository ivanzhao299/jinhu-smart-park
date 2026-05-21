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
import { SafetyHazardsModule } from "../safety-hazards/safety-hazards.module";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { UnitEntity } from "./entities/unit.entity";
import { UnitStatusLogEntity } from "./entities/unit-status-log.entity";
import { UnitsController } from "./units.controller";
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
    SafetyHazardsModule
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService]
})
export class UnitsModule {}
