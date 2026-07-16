import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrgEntity } from "../orgs/entities/org.entity";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { WorkOrdersModule } from "../work-orders/work-orders.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { AiWorkPlansController } from "./ai-work-plans.controller";
import { LocalNaturalLanguageWorkPlanner } from "./ai-work-plan-parser";
import { AiWorkPlansService } from "./ai-work-plans.service";
import { AiAssignmentDecisionEntity } from "./entities/ai-assignment-decision.entity";
import { AiWorkPlanTaskEntity } from "./entities/ai-work-plan-task.entity";
import { AiWorkPlanEntity } from "./entities/ai-work-plan.entity";
import { WorkforceDirectoryService } from "./workforce-directory.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiWorkPlanEntity,
      AiWorkPlanTaskEntity,
      AiAssignmentDecisionEntity,
      OrgEntity,
      UserOrgEntity,
      UserEntity,
      WorkOrderEntity
    ]),
    WorkOrdersModule,
    WorkflowModule
  ],
  controllers: [AiWorkPlansController],
  providers: [AiWorkPlansService, LocalNaturalLanguageWorkPlanner, WorkforceDirectoryService],
  exports: [AiWorkPlansService]
})
export class AiWorkPlansModule {}
