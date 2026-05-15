import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { UnitsModule } from "../units/units.module";
import { AssetBuildingEntity } from "./entities/asset-building.entity";
import { AssetFloorEntity } from "./entities/asset-floor.entity";
import { AssetParkEntity } from "./entities/asset-park.entity";
import { AssetUnitEntity } from "./entities/asset-unit.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AssetParkEntity, AssetBuildingEntity, AssetFloorEntity, AssetUnitEntity]), UnitsModule, DataScopesModule, FieldPoliciesModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService]
})
export class AssetsModule {}
