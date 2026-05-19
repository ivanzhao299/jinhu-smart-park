import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { ParkEntity } from "../parks/entities/park.entity";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { PlanEntity } from "../saas-modules/entities/plan.entity";
import { SaaSModuleEntity } from "../saas-modules/entities/saas-module.entity";
import { TenantModuleEntity } from "../saas-modules/entities/tenant-module.entity";
import { UserEntity } from "../users/entities/user.entity";
import { UserParkEntity } from "../users/entities/user-park.entity";
import { TenantEntity } from "./entities/tenant.entity";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      ParkEntity,
      OrgEntity,
      UserEntity,
      UserParkEntity,
      UserOrgEntity,
      RoleEntity,
      UserRoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      PlanEntity,
      SaaSModuleEntity,
      TenantModuleEntity
    ])
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TypeOrmModule, TenantsService]
})
export class TenantsModule {}
