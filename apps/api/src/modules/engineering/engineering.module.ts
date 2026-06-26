import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { DataScopesModule } from "../data-scopes/data-scopes.module";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringController } from "./engineering.controller";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringProjectService } from "./engineering-project.service";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringProjectsController } from "./engineering-projects.controller";
import { EngineeringService } from "./engineering.service";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";
import { EngineeringProjectAccessPolicy } from "./policies/engineering-project-access.policy";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

@Module({
  imports: [TypeOrmModule.forFeature([EngineeringProjectEntity, EngineeringProjectStatusLogEntity]), AuditModule, DataScopesModule],
  controllers: [EngineeringController, EngineeringProjectsController],
  providers: [
    EngineeringService,
    EngineeringProjectService,
    EngineeringProjectRepository,
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService,
    EngineeringProjectAccessPolicy,
    EngineeringDataScopeAdapter,
    EngineeringProjectPolicy,
    EngineeringAuditLogger,
    EngineeringEventPublisher
  ],
  exports: [
    EngineeringService,
    EngineeringProjectService,
    EngineeringProjectRepository,
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService
  ]
})
export class EngineeringModule {}
