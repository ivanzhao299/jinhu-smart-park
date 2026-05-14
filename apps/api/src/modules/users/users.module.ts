import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { RolesModule } from "../roles/roles.module";
import { UserEntity } from "./entities/user.entity";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity, UserRoleEntity, UserOrgEntity]), RolesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}
