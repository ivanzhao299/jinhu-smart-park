import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringDailyReportService } from "./engineering-daily-report.service";
import { EngineeringDailyReportsController } from "./engineering-daily-reports.controller";
import { EngineeringController } from "./engineering.controller";
import { EngineeringPlanService } from "./engineering-plan.service";
import { EngineeringPlansController } from "./engineering-plans.controller";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringProjectService } from "./engineering-project.service";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringProjectsController } from "./engineering-projects.controller";
import { EngineeringService } from "./engineering.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringDailyReportAccessPolicy } from "./policies/engineering-daily-report-access.policy";
import { EngineeringPlanAccessPolicy } from "./policies/engineering-plan-access.policy";
import { EngineeringProjectAccessPolicy } from "./policies/engineering-project-access.policy";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";
import { EngineeringDailyReportRepository } from "./repositories/engineering-daily-report.repository";
import { EngineeringPlanRepository } from "./repositories/engineering-plan.repository";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([EngineeringProjectEntity, EngineeringProjectStatusLogEntity, EngineeringPlanEntity, EngineeringDailyReportEntity]),
    AuditModule,
    DataScopesModule
  ],
  controllers: [EngineeringController, EngineeringProjectsController, EngineeringPlansController, EngineeringDailyReportsController],
  providers: [
    EngineeringService,
    EngineeringProjectService,
    EngineeringProjectRepository,
    EngineeringPlanService,
    EngineeringPlanRepository,
    EngineeringDailyReportService,
    EngineeringDailyReportRepository,
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService,
    EngineeringProjectAccessPolicy,
    EngineeringPlanAccessPolicy,
    EngineeringDailyReportAccessPolicy,
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
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService
  ]
})
export class EngineeringModule {}
