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
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkOrderLogEntity } from "./entities/work-order-log.entity";
import { WorkOrderSlaRuleEntity } from "./entities/work-order-sla-rule.entity";
import { WorkOrderEntity } from "./entities/work-order.entity";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkOrderEntity,
      WorkOrderLogEntity,
      WorkOrderSlaRuleEntity,
      ParkTenantEntity,
      UnitEntity,
      BuildingEntity,
      FloorEntity,
      FileEntity,
      UserEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService]
})
export class WorkOrdersModule {}
