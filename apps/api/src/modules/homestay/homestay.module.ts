import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FileEntity } from "../files/entities/file.entity";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { PropertyOperationsModule } from "../property-operations/property-operations.module";
import { PropertyApprovalModule } from "../property-approvals/property-approval.module";
import { PropertyIdentityModule } from "../property-identity/property-identity.module";
import {
  HomestayBookingActionLogEntity,
  HomestayBookingEntity,
  HomestayBookingGuestEntity,
  HomestayBookingNightEntity,
  HomestayLedgerEntryEntity,
  HomestayRateConfigEntity,
  HomestayRateOverrideEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import { HomestayController } from "./homestay.controller";
import { HomestayService } from "./homestay.service";
import { HomestayWorkbenchQueryService } from "./homestay-workbench-query.service";
import { HomestayApprovalAdapter } from "./homestay-approval.adapter";
import {
  HOMESTAY_TURNOVER_TASK_RESOLVER,
  HomestayTurnoverTaskResolver
} from "./homestay-task.adapter";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HomestayRateConfigEntity,
      HomestayRateOverrideEntity,
      HomestayBookingEntity,
      HomestayBookingNightEntity,
      HomestayBookingGuestEntity,
      HomestayStayCredentialEntity,
      HomestayLedgerEntryEntity,
      HomestayTurnoverTaskEntity,
      HomestayBookingActionLogEntity,
      FileEntity,
      WorkOrderEntity
    ]),
    DataScopesModule,
    PropertyOperationsModule,
    PropertyApprovalModule,
    PropertyIdentityModule
  ],
  controllers: [HomestayController],
  providers: [HomestayService, HomestayWorkbenchQueryService, HomestayApprovalAdapter,
    HomestayTurnoverTaskResolver,
    { provide: HOMESTAY_TURNOVER_TASK_RESOLVER, useExisting: HomestayTurnoverTaskResolver }],
  exports: [HomestayService, HOMESTAY_TURNOVER_TASK_RESOLVER]
})
export class HomestayModule {}
