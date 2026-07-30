import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FileEntity } from "../files/entities/file.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { PropertyOperationsModule } from "../property-operations/property-operations.module";
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
    PropertyOperationsModule
  ],
  controllers: [HomestayController],
  providers: [HomestayService],
  exports: [HomestayService]
})
export class HomestayModule {}
