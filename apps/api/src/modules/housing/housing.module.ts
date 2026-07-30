import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FileEntity } from "../files/entities/file.entity";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { PropertyOperationsModule } from "../property-operations/property-operations.module";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import {
  HousingChargePlanEntity,
  HousingHandoverEntity,
  HousingLeaseEntity,
  HousingLeaseOccupantEntity,
  HousingLedgerEntryEntity,
  HousingPurchaseEntity,
  HousingPurchaseItemEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import { HousingController } from "./housing.controller";
import { HousingService } from "./housing.service";
import { HousingWorkbenchQueryService } from "./housing-workbench-query.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HousingLeaseEntity,
      HousingLeaseOccupantEntity,
      HousingChargePlanEntity,
      HousingReceivableEntity,
      HousingLedgerEntryEntity,
      HousingHandoverEntity,
      HousingPurchaseEntity,
      HousingPurchaseItemEntity,
      FileEntity
    ]),
    DataScopesModule,
    PropertyOperationsModule,
    WorkOrdersModule
  ],
  controllers: [HousingController],
  providers: [HousingService, HousingWorkbenchQueryService],
  exports: [HousingService]
})
export class HousingModule {}
