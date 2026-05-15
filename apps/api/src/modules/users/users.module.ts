import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { SaaSModulesModule } from "../saas-modules/saas-modules.module";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { RolesModule } from "../roles/roles.module";
import { ParkEntity } from "../parks/entities/park.entity";
import { UserEntity } from "./entities/user.entity";
import { UserParkEntity } from "./entities/user-park.entity";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RoleEntity, UserRoleEntity, UserOrgEntity, UserParkEntity, ParkEntity]),
    RolesModule,
    DataScopesModule,
    FieldPoliciesModule,
    SaaSModulesModule
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}
