import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { WorkOrderLogEntity } from "../work-orders/entities/work-order-log.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { UserMessageEntity } from "./entities/user-message.entity";
import { WorkflowController } from "./workflow.controller";
import { WorkflowService } from "./workflow.service";

@Module({
  imports: [TypeOrmModule.forFeature([WorkOrderEntity, WorkOrderLogEntity, SafetyInspectTaskEntity, UserMessageEntity])],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService]
})
export class WorkflowModule {}
