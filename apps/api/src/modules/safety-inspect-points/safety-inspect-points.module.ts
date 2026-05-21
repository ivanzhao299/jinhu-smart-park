import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { SafetyInspectPointEntity } from "./entities/safety-inspect-point.entity";
import { SafetyInspectPointsController } from "./safety-inspect-points.controller";
import { SafetyInspectPointsService } from "./safety-inspect-points.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyInspectPointEntity,
      BuildingEntity,
      FloorEntity,
      UnitEntity,
      ParkTenantEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [SafetyInspectPointsController],
  providers: [SafetyInspectPointsService],
  exports: [SafetyInspectPointsService]
})
export class SafetyInspectPointsModule {}
