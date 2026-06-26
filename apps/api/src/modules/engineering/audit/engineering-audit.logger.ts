import { Injectable } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import type { EngineeringProjectStatus } from "../domain/engineering-project.enums";
import type { EngineeringProjectAction, EngineeringProjectTransitionContext } from "../domain/engineering-project-state-machine.types";

export interface LogProjectStatusChangedInput {
  tenantId: string;
  parkId: string;
  projectId: string;
  fromStatus: EngineeringProjectStatus;
  toStatus: EngineeringProjectStatus;
  action: EngineeringProjectAction;
  context: EngineeringProjectTransitionContext;
}

@Injectable()
export class EngineeringAuditLogger {
  constructor(private readonly auditService: AuditService) {}

  async logProjectStatusChanged(input: LogProjectStatusChangedInput): Promise<void> {
    await this.auditService.recordOperation({
      tenantId: input.tenantId,
      parkId: input.parkId,
      userId: input.context.actorUserId,
      username: null,
      realName: input.context.actorName ?? null,
      roleCodes: input.context.actorRoleCodes ?? null,
      module: "engineering",
      resource: "engineering_project",
      action: input.action,
      bizType: "engineering_project",
      bizId: input.projectId,
      beforeJson: { status: input.fromStatus },
      afterJson: {
        status: input.toStatus,
        reason: input.context.reason,
        comment: input.context.comment ?? null
      },
      clientIp: input.context.ip ?? null,
      clientUa: input.context.userAgent ?? null,
      method: "STATE",
      path: "epdr://engineering/projects/status",
      success: true,
      requestId: input.context.requestId ?? null
    });
  }
}
