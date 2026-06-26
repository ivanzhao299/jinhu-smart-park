import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { EngineeringProjectAction, type EngineeringProjectTransitionContext } from "./domain/engineering-project-state-machine.types";
import type { EngineeringProjectAvailableAction } from "./domain/engineering-project-state-machine.types";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

@Injectable()
export class EngineeringProjectStatusService {
  constructor(
    private readonly projectsRepository: EngineeringProjectRepository,
    private readonly stateMachine: EngineeringProjectStateMachine
  ) {}

  submitProject(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.SUBMIT, context);
  }

  approveProject(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.APPROVE, context);
  }

  cancelProject(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.CANCEL, context);
  }

  startPlanning(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.START_PLANNING, context);
  }

  startExecution(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.START_EXECUTION, context);
  }

  startInspection(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.START_INSPECTION, context);
  }

  requireRectification(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.REQUIRE_RECTIFICATION, context);
  }

  startAcceptance(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.START_ACCEPTANCE, context);
  }

  acceptancePassed(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.ACCEPTANCE_PASSED, context);
  }

  acceptanceFailed(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.ACCEPTANCE_FAILED, context);
  }

  markTransferReady(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.MARK_TRANSFER_READY, context);
  }

  markSettlementReady(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.MARK_SETTLEMENT_READY, context);
  }

  closeProject(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.CLOSE, context);
  }

  archiveProject(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectEntity> {
    return this.transition(projectId, EngineeringProjectAction.ARCHIVE, context);
  }

  async getAvailableActions(projectId: string, context: EngineeringProjectTransitionContext): Promise<EngineeringProjectAvailableAction[]> {
    const project = await this.projectsRepository.findById(this.scopeFromContext(context), projectId);
    return this.stateMachine.getAvailableActions(project.status, context);
  }

  private async transition(
    projectId: string,
    action: EngineeringProjectAction,
    context: EngineeringProjectTransitionContext
  ): Promise<EngineeringProjectEntity> {
    const project = await this.projectsRepository.findById(this.scopeFromContext(context), projectId);
    return this.stateMachine.transition(project, action, context);
  }

  private scopeFromContext(context: EngineeringProjectTransitionContext): TenantParkScope {
    return { tenantId: context.tenantId, parkId: context.parkId };
  }
}
