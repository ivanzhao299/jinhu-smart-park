import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FileEntity } from "../files/entities/file.entity";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { PropertyOperationsModule } from "../property-operations/property-operations.module";
import { PropertyApprovalModule } from "../property-approvals/property-approval.module";
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
import { HousingDashboardQueryService } from "./housing-dashboard-query.service";
import { HousingTenantService } from "./housing-tenant.service";
import { HousingLeaseQueryService } from "./housing-lease-query.service";
import { HousingLeaseCommandService } from "./housing-lease-command.service";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { HousingBillingCommandService } from "./housing-billing-command.service";
import { HousingFinanceCommandService } from "./housing-finance-command.service";
import { HousingWorkbenchQueryService } from "./housing-workbench-query.service";
import { HousingApprovalAdapter } from "./housing-approval.adapter";
import {
  createHousingTaskResolvers,
  HOUSING_BILLING_TASK_RESOLVER,
  HOUSING_HANDOVER_TASK_RESOLVER,
  HOUSING_LEASE_TASK_RESOLVER,
  HOUSING_PURCHASE_TASK_RESOLVER
} from "./housing-task.adapter";

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
    PropertyApprovalModule,
    WorkOrdersModule
  ],
  controllers: [HousingController],
  providers: [
    HousingService,
    HousingDashboardQueryService,
    HousingTenantService,
    HousingLeaseQueryService,
    HousingTransactionSupportService,
    HousingReceivableWriterService,
    HousingLeaseCommandService,
    HousingBillingCommandService,
    HousingFinanceCommandService,
    HousingWorkbenchQueryService,
    HousingApprovalAdapter,
    { provide: HOUSING_LEASE_TASK_RESOLVER, useFactory: () => createHousingTaskResolvers().lease },
    { provide: HOUSING_HANDOVER_TASK_RESOLVER, useFactory: () => createHousingTaskResolvers().handover },
    { provide: HOUSING_BILLING_TASK_RESOLVER, useFactory: () => createHousingTaskResolvers().billing },
    { provide: HOUSING_PURCHASE_TASK_RESOLVER, useFactory: () => createHousingTaskResolvers().purchase }
  ],
  exports: [
    HousingService,
    HOUSING_LEASE_TASK_RESOLVER,
    HOUSING_HANDOVER_TASK_RESOLVER,
    HOUSING_BILLING_TASK_RESOLVER,
    HOUSING_PURCHASE_TASK_RESOLVER
  ]
})
export class HousingModule {}
