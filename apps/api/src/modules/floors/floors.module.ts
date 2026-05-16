import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { FilesModule } from "../files/files.module";
import { UnitEntity } from "../units/entities/unit.entity";
import { FloorEntity } from "./entities/floor.entity";
import { FloorsController } from "./floors.controller";
import { FloorsService } from "./floors.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([FloorEntity, BuildingEntity, FileEntity, UnitEntity]),
    FilesModule,
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [FloorsController],
  providers: [FloorsService],
  exports: [FloorsService]
})
export class FloorsModule {}
