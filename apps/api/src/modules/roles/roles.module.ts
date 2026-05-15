import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RoleFieldPermissionEntity } from "../permissions/entities/role-field-permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, PermissionEntity, RolePermissionEntity, RoleFieldPermissionEntity, UserRoleEntity]), DataScopesModule, FieldPoliciesModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService]
})
export class RolesModule {}
