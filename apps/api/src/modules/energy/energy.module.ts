import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { IotDeviceEntity } from "../iot/entities/iot-device.entity";
import { IotModule } from "../iot/iot.module";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { EnergyAlertsController } from "./energy-alerts.controller";
import { EnergyDashboardController } from "./energy-dashboard.controller";
import { EnergyMetersController } from "./energy-meters.controller";
import { EnergyReadingsController } from "./energy-readings.controller";
import { EnergyAlertService } from "./energy-alert.service";
import { EnergyDashboardService } from "./energy-dashboard.service";
import { EnergyMeterService } from "./energy-meter.service";
import { EnergyReadingService } from "./energy-reading.service";
import { EnergyAlertEntity } from "./entities/energy-alert.entity";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";
import { EnergyReadingEntity } from "./entities/energy-reading.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnergyMeterEntity,
      EnergyReadingEntity,
      EnergyAlertEntity,
      IotDeviceEntity,
      UnitEntity,
      BuildingEntity,
      FloorEntity,
      ParkTenantEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule,
    IotModule
  ],
  controllers: [EnergyMetersController, EnergyReadingsController, EnergyAlertsController, EnergyDashboardController],
  providers: [EnergyMeterService, EnergyReadingService, EnergyAlertService, EnergyDashboardService],
  exports: [EnergyMeterService, EnergyReadingService, EnergyAlertService, EnergyDashboardService]
})
export class EnergyModule {}
