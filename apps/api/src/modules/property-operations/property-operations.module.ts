import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AssetUnitEntity } from "../assets/entities/asset-unit.entity";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { PropertyIdentityModule } from "../property-identity/property-identity.module";
import { PropertyApprovalModule } from "../property-approvals/property-approval.module";
import { UnitEntity } from "../units/entities/unit.entity";
import { PartiesController } from "./parties.controller";
import { PartiesService } from "./parties.service";
import { PartyRoleEntity } from "./entities/party-role.entity";
import { PartyEntity } from "./entities/party.entity";
import { PropertyModeTransitionLogEntity } from "./entities/property-mode-transition-log.entity";
import { PropertyOccupancyEntity } from "./entities/property-occupancy.entity";
import { PropertyOperationConfigEntity } from "./entities/property-operation-config.entity";
import { PartySensitiveDataService } from "./party-sensitive-data.service";
import { PropertyOccupanciesController } from "./property-occupancies.controller";
import { PropertyOccupanciesService } from "./property-occupancies.service";
import {
  PropertyModeTransitionListController,
  PropertyOperationListController,
  PropertyOperationsController
} from "./property-operations.controller";
import { PropertyOperationsService } from "./property-operations.service";
import { PropertyUnitAccessService } from "./property-unit-access.service";
import { PropertyFoundationApprovalAdapter } from "./property-foundation-approval.adapter";
import { PropertyOccupancyAdapter } from "./property-occupancy.adapter";
import { PROPERTY_OCCUPANCY_PORT } from "./property-occupancy.port";
import { AssetSpaceMappingModule } from "../assets/asset-space-mapping.module";
import { RentalStatusProjectionService } from "./rental-status-projection.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UnitEntity,
      AssetUnitEntity,
      PropertyOperationConfigEntity,
      PropertyModeTransitionLogEntity,
      PropertyOccupancyEntity,
      PartyEntity,
      PartyRoleEntity
    ]),
    DataScopesModule,
    PropertyIdentityModule,
    PropertyApprovalModule,
    AssetSpaceMappingModule,
    AuditModule
  ],
  controllers: [
    PropertyOperationsController,
    PropertyOperationListController,
    PropertyModeTransitionListController,
    PropertyOccupanciesController,
    PartiesController
  ],
  providers: [
    PropertyOperationsService,
    PropertyOccupanciesService,
    PropertyOccupancyAdapter,
    { provide: PROPERTY_OCCUPANCY_PORT, useExisting: PropertyOccupancyAdapter },
    PartiesService,
    PartySensitiveDataService,
    PropertyUnitAccessService,
    PropertyFoundationApprovalAdapter,
    RentalStatusProjectionService
  ],
  exports: [PropertyOperationsService, PROPERTY_OCCUPANCY_PORT, PartiesService, PropertyUnitAccessService,
    RentalStatusProjectionService]
})
export class PropertyOperationsModule {}
