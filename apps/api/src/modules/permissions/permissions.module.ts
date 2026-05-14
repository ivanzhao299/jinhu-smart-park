import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PermissionEntity } from "./entities/permission.entity";
import { RolePermissionEntity } from "./entities/role-permission.entity";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";

@Module({
  imports: [TypeOrmModule.forFeature([PermissionEntity, RolePermissionEntity])],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService]
})
export class PermissionsModule {}
