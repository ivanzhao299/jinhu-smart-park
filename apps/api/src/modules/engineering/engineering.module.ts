import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringController } from "./engineering.controller";
import { EngineeringPlanService } from "./engineering-plan.service";
import { EngineeringPlansController } from "./engineering-plans.controller";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringProjectService } from "./engineering-project.service";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringProjectsController } from "./engineering-projects.controller";
import { EngineeringService } from "./engineering.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringPlanAccessPolicy } from "./policies/engineering-plan-access.policy";
import { EngineeringProjectAccessPolicy } from "./policies/engineering-project-access.policy";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

@Module({
  imports: [TypeOrmModule.forFeature([EngineeringProjectEntity, EngineeringProjectStatusLogEntity, EngineeringPlanEntity]), AuditModule, DataScopesModule],
  controllers: [EngineeringController, EngineeringProjectsController, EngineeringPlansController],
  providers: [
    EngineeringService,
    EngineeringProjectService,
    EngineeringProjectRepository,
    EngineeringPlanService,
    EngineeringPlanRepository,
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService,
    EngineeringProjectAccessPolicy,
    EngineeringPlanAccessPolicy,
    EngineeringDataScopeAdapter,
    EngineeringProjectPolicy,
    EngineeringAuditLogger,
    EngineeringEventPublisher
  ],
  exports: [
    EngineeringService,
    EngineeringProjectService,
    EngineeringProjectRepository,
    EngineeringPlanService,
    EngineeringPlanRepository,
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService
  ]
})
export class EngineeringModule {}
