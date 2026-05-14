import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, PermissionEntity, RolePermissionEntity, UserRoleEntity])],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService]
})
export class RolesModule {}
