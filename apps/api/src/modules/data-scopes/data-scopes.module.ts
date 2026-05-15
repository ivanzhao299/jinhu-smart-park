import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { DataScopeService } from "./data-scope.service";
import { DataScopesController } from "./data-scopes.controller";
import { DataScopeRuleEntity } from "./entities/data-scope-rule.entity";
import { RoleDataScopeEntity } from "./entities/role-data-scope.entity";

@Module({
  imports: [TypeOrmModule.forFeature([DataScopeRuleEntity, RoleDataScopeEntity, RoleEntity, UserRoleEntity])],
  controllers: [DataScopesController],
  providers: [DataScopeService],
  exports: [DataScopeService, TypeOrmModule]
})
export class DataScopesModule {}
