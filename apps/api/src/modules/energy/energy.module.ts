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
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import { EnergyAllocationRulesController } from "./energy-allocation-rules.controller";
import { EnergyAlertsController } from "./energy-alerts.controller";
import { EnergyBillingAdjustmentsController } from "./energy-billing-adjustments.controller";
import { EnergyBillingCyclesController } from "./energy-billing-cycles.controller";
import { EnergyBillingItemsController } from "./energy-billing-items.controller";
import { EnergyDashboardController } from "./energy-dashboard.controller";
import { EnergyMetersController } from "./energy-meters.controller";
import { EnergyReadingsController } from "./energy-readings.controller";
import { EnergyAllocationRuleService } from "./energy-allocation-rule.service";
import { EnergyAlertService } from "./energy-alert.service";
import { EnergyBillingAdjustmentService } from "./energy-billing-adjustment.service";
import { EnergyBillingCycleService } from "./energy-billing-cycle.service";
import { EnergyBillingItemService } from "./energy-billing-item.service";
import { EnergyDashboardService } from "./energy-dashboard.service";
import { EnergyMeterService } from "./energy-meter.service";
import { EnergyReadingService } from "./energy-reading.service";
import { EnergyToReceivableAdapter } from "./energy-to-receivable.adapter";
import { EnergyAllocationRuleEntity } from "./entities/energy-allocation-rule.entity";
import { EnergyAlertEntity } from "./entities/energy-alert.entity";
import { EnergyBillingAdjustmentEntity } from "./entities/energy-billing-adjustment.entity";
import { EnergyBillingCycleEntity } from "./entities/energy-billing-cycle.entity";
import { EnergyBillingItemEntity } from "./entities/energy-billing-item.entity";
import { EnergyMeterEntity } from "./entities/energy-meter.entity";
import { EnergyReadingEntity } from "./entities/energy-reading.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnergyMeterEntity,
      EnergyReadingEntity,
      EnergyAlertEntity,
      EnergyBillingCycleEntity,
      EnergyBillingItemEntity,
      EnergyBillingAdjustmentEntity,
      EnergyAllocationRuleEntity,
      LeasingReceivableEntity,
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
  controllers: [
    EnergyMetersController,
    EnergyReadingsController,
    EnergyAlertsController,
    EnergyDashboardController,
    EnergyBillingCyclesController,
    EnergyBillingItemsController,
    EnergyBillingAdjustmentsController,
    EnergyAllocationRulesController
  ],
  providers: [
    EnergyMeterService,
    EnergyReadingService,
    EnergyAlertService,
    EnergyDashboardService,
    EnergyBillingCycleService,
    EnergyBillingItemService,
    EnergyBillingAdjustmentService,
    EnergyAllocationRuleService,
    EnergyToReceivableAdapter
  ],
  exports: [
    EnergyMeterService,
    EnergyReadingService,
    EnergyAlertService,
    EnergyDashboardService,
    EnergyBillingCycleService,
    EnergyBillingItemService,
    EnergyBillingAdjustmentService,
    EnergyAllocationRuleService
  ]
})
export class EnergyModule {}
