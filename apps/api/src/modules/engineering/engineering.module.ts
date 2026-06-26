import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringInspectionEntity } from "./entities/engineering-inspection.entity";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringDailyReportService } from "./engineering-daily-report.service";
import { EngineeringDailyReportsController } from "./engineering-daily-reports.controller";
import { EngineeringController } from "./engineering.controller";
import { EngineeringInspectionService } from "./engineering-inspection.service";
import { EngineeringInspectionsController } from "./engineering-inspections.controller";
import { EngineeringPlanService } from "./engineering-plan.service";
import { EngineeringPlansController } from "./engineering-plans.controller";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringProjectService } from "./engineering-project.service";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringProjectsController } from "./engineering-projects.controller";
import { EngineeringRectificationStateMachine } from "./engineering-rectification-state.machine";
import { EngineeringService } from "./engineering.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringDailyReportAccessPolicy } from "./policies/engineering-daily-report-access.policy";
import { EngineeringInspectionAccessPolicy } from "./policies/engineering-inspection-access.policy";
import { EngineeringPlanAccessPolicy } from "./policies/engineering-plan-access.policy";
import { EngineeringProjectAccessPolicy } from "./policies/engineering-project-access.policy";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";
import { EngineeringDailyReportRepository } from "./repositories/engineering-daily-report.repository";
import { EngineeringInspectionRepository } from "./repositories/engineering-inspection.repository";
import { EngineeringIssueRepository } from "./repositories/engineering-issue.repository";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";
import { EngineeringRectificationRepository } from "./repositories/engineering-rectification.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EngineeringProjectEntity,
      EngineeringProjectStatusLogEntity,
      EngineeringPlanEntity,
      EngineeringDailyReportEntity,
      EngineeringInspectionEntity,
      EngineeringIssueEntity,
      EngineeringRectificationEntity
    ]),
    AuditModule,
    DataScopesModule
  ],
  controllers: [
    EngineeringController,
    EngineeringProjectsController,
    EngineeringPlansController,
    EngineeringDailyReportsController,
    EngineeringInspectionsController
  ],
  providers: [
    EngineeringService,
    EngineeringProjectService,
    EngineeringProjectRepository,
    EngineeringPlanService,
    EngineeringPlanRepository,
    EngineeringDailyReportService,
    EngineeringDailyReportRepository,
    EngineeringInspectionService,
    EngineeringInspectionRepository,
    EngineeringIssueRepository,
    EngineeringRectificationRepository,
    EngineeringProjectStateMachine,
    EngineeringRectificationStateMachine,
    EngineeringProjectStatusService,
    EngineeringProjectAccessPolicy,
    EngineeringPlanAccessPolicy,
    EngineeringDailyReportAccessPolicy,
    EngineeringInspectionAccessPolicy,
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
    EngineeringDailyReportService,
    EngineeringDailyReportRepository,
    EngineeringInspectionService,
    EngineeringInspectionRepository,
    EngineeringIssueRepository,
    EngineeringRectificationRepository,
    EngineeringRectificationStateMachine,
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService
  ]
})
export class EngineeringModule {}
