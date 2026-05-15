import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { FloorEntity } from "../floors/entities/floor.entity";
import { BuildingsController } from "./buildings.controller";
import { BuildingsService } from "./buildings.service";
import { BuildingEntity } from "./entities/building.entity";

@Module({
  imports: [TypeOrmModule.forFeature([BuildingEntity, FloorEntity]), CodeRulesModule],
  controllers: [BuildingsController],
  providers: [BuildingsService],
  exports: [BuildingsService]
})
export class BuildingsModule {}
