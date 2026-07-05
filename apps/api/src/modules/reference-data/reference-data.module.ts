import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { OrgEntity } from "../orgs/entities/org.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { ReferenceDataController } from "./reference-data.controller";
import { ReferenceDataService } from "./reference-data.service";

@Module({
  imports: [TypeOrmModule.forFeature([OrgEntity, BuildingEntity, FloorEntity, UnitEntity, ParkTenantEntity, UserEntity])],
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService],
  exports: [ReferenceDataService]
})
export class ReferenceDataModule {}
