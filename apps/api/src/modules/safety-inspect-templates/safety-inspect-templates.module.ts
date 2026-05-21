import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { SafetyInspectItemEntity } from "./entities/safety-inspect-item.entity";
import { SafetyInspectTemplateEntity } from "./entities/safety-inspect-template.entity";
import { SafetyInspectTemplatesController } from "./safety-inspect-templates.controller";
import { SafetyInspectTemplatesService } from "./safety-inspect-templates.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([SafetyInspectTemplateEntity, SafetyInspectItemEntity, DictItemEntity]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [SafetyInspectTemplatesController],
  providers: [SafetyInspectTemplatesService],
  exports: [SafetyInspectTemplatesService]
})
export class SafetyInspectTemplatesModule {}
