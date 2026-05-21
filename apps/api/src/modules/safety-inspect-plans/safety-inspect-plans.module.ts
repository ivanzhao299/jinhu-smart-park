import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { RoleEntity } from "../roles/entities/role.entity";
import { SafetyInspectPointEntity } from "../safety-inspect-points/entities/safety-inspect-point.entity";
import { SafetyInspectTemplateEntity } from "../safety-inspect-templates/entities/safety-inspect-template.entity";
import { UserEntity } from "../users/entities/user.entity";
import { SafetyInspectPlanEntity } from "./entities/safety-inspect-plan.entity";
import { SafetyInspectPlansController } from "./safety-inspect-plans.controller";
import { SafetyInspectPlansService } from "./safety-inspect-plans.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyInspectPlanEntity,
      SafetyInspectTemplateEntity,
      SafetyInspectPointEntity,
      UserEntity,
      RoleEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [SafetyInspectPlansController],
  providers: [SafetyInspectPlansService],
  exports: [SafetyInspectPlansService]
})
export class SafetyInspectPlansModule {}
