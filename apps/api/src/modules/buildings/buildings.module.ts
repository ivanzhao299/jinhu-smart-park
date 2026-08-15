import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { UsersModule } from "../users/users.module";
import { BuildingsController } from "./buildings.controller";
import { BuildingsService } from "./buildings.service";
import { BuildingEntity } from "./entities/building.entity";

@Module({
  imports: [TypeOrmModule.forFeature([BuildingEntity, FloorEntity]), CodeRulesModule, DataScopesModule, UsersModule],
  controllers: [BuildingsController],
  providers: [BuildingsService],
  exports: [BuildingsService]
})
export class BuildingsModule {}
