import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditModule } from "../audit/audit.module";
import { EngineeringAuditLogger } from "./audit/engineering-audit.logger";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";
import { EngineeringEventPublisher } from "./events/engineering-event.publisher";
import { EngineeringController } from "./engineering.controller";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringService } from "./engineering.service";
import { EngineeringProjectPolicy } from "./policies/engineering-project.policy";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

@Module({
  imports: [TypeOrmModule.forFeature([EngineeringProjectEntity, EngineeringProjectStatusLogEntity]), AuditModule],
  controllers: [EngineeringController],
  providers: [
    EngineeringService,
    EngineeringProjectRepository,
    EngineeringProjectStateMachine,
    EngineeringProjectStatusService,
    EngineeringProjectPolicy,
    EngineeringAuditLogger,
    EngineeringEventPublisher
  ],
  exports: [EngineeringService, EngineeringProjectRepository, EngineeringProjectStateMachine, EngineeringProjectStatusService]
})
export class EngineeringModule {}
