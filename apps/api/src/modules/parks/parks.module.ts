import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { ParkEntity } from "./entities/park.entity";
import { ParksController } from "./parks.controller";
import { ParksService } from "./parks.service";

@Module({
  imports: [TypeOrmModule.forFeature([ParkEntity]), DataScopesModule],
  controllers: [ParksController],
  providers: [ParksService],
  exports: [ParksService]
})
export class ParksModule {}
