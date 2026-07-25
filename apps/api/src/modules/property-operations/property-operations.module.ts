import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AssetUnitEntity } from "../assets/entities/asset-unit.entity";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
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
import { PropertyOperationsController } from "./property-operations.controller";
import { PropertyOperationsService } from "./property-operations.service";
import { PropertyUnitAccessService } from "./property-unit-access.service";

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
    DataScopesModule
  ],
  controllers: [PropertyOperationsController, PropertyOccupanciesController, PartiesController],
  providers: [
    PropertyOperationsService,
    PropertyOccupanciesService,
    PartiesService,
    PartySensitiveDataService,
    PropertyUnitAccessService
  ],
  exports: [PropertyOperationsService, PropertyOccupanciesService, PartiesService, PropertyUnitAccessService]
})
export class PropertyOperationsModule {}
