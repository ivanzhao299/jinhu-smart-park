import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CodeRulesModule } from "../code-rules/code-rules.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPoliciesModule } from "../field-policies/field-policies.module";
import { FileEntity } from "../files/entities/file.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { SafetyHazardStatusLogEntity } from "../safety-hazards/entities/safety-hazard-status-log.entity";
import { SafetyInspectPlanEntity } from "../safety-inspect-plans/entities/safety-inspect-plan.entity";
import { SafetyInspectPointEntity } from "../safety-inspect-points/entities/safety-inspect-point.entity";
import { SafetyInspectItemEntity } from "../safety-inspect-templates/entities/safety-inspect-item.entity";
import { SafetyInspectTemplateEntity } from "../safety-inspect-templates/entities/safety-inspect-template.entity";
import { UserEntity } from "../users/entities/user.entity";
import { SafetyActionLogEntity } from "./entities/safety-action-log.entity";
import { SafetyHazardEntity } from "./entities/safety-hazard.entity";
import { SafetyInspectTaskResultEntity } from "./entities/safety-inspect-task-result.entity";
import { SafetyInspectTaskEntity } from "./entities/safety-inspect-task.entity";
import { SafetyInspectRuntimeService } from "./safety-inspect-runtime.service";
import { SafetyInspectRuntimeController } from "./safety-inspect-runtime.controller";
import { SafetyInspectScheduler } from "./safety-inspect.scheduler";
import { SafetyInspectTasksController } from "./safety-inspect-tasks.controller";
import { SafetyInspectTasksService } from "./safety-inspect-tasks.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyInspectTaskEntity,
      SafetyInspectTaskResultEntity,
      SafetyHazardEntity,
      SafetyHazardStatusLogEntity,
      SafetyActionLogEntity,
      SafetyInspectPlanEntity,
      SafetyInspectTemplateEntity,
      SafetyInspectItemEntity,
      SafetyInspectPointEntity,
      FileEntity,
      UserEntity,
      UserRoleEntity,
      DictItemEntity
    ]),
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule
  ],
  controllers: [SafetyInspectTasksController, SafetyInspectRuntimeController],
  providers: [SafetyInspectTasksService, SafetyInspectRuntimeService, SafetyInspectScheduler],
  exports: [SafetyInspectTasksService, SafetyInspectRuntimeService]
})
export class SafetyInspectTasksModule {}
