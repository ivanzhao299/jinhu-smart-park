import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { FieldPoliciesController } from "./field-policies.controller";
import { FieldPolicyService } from "./field-policy.service";
import { FieldPolicyEntity } from "./entities/field-policy.entity";
import { RoleFieldPolicyEntity } from "./entities/role-field-policy.entity";

@Module({
  imports: [TypeOrmModule.forFeature([FieldPolicyEntity, RoleFieldPolicyEntity, RoleEntity, UserRoleEntity])],
  controllers: [FieldPoliciesController],
  providers: [FieldPolicyService],
  exports: [FieldPolicyService, TypeOrmModule]
})
export class FieldPoliciesModule {}
