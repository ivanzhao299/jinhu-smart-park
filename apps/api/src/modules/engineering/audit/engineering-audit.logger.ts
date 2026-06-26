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

export interface LogEngineeringPlanChangedInput {
  tenantId: string;
  parkId: string;
  projectId: string;
  planId: string;
  action: string;
  actorUserId: string | null;
  actorName?: string | null;
  actorRoleCodes?: string[] | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface LogEngineeringDailyReportChangedInput {
  tenantId: string;
  parkId: string;
  projectId: string;
  dailyReportId: string;
  action: string;
  actorUserId: string | null;
  actorName?: string | null;
  actorRoleCodes?: string[] | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
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

  async logPlanChanged(input: LogEngineeringPlanChangedInput): Promise<void> {
    await this.auditService.recordOperation({
      tenantId: input.tenantId,
      parkId: input.parkId,
      userId: input.actorUserId,
      username: null,
      realName: input.actorName ?? null,
      roleCodes: input.actorRoleCodes ?? null,
      module: "engineering",
      resource: "engineering_plan",
      action: input.action,
      bizType: "engineering_plan",
      bizId: input.planId,
      beforeJson: input.beforeJson ?? null,
      afterJson: {
        projectId: input.projectId,
        ...(input.afterJson ?? {})
      },
      clientIp: input.ip ?? null,
      clientUa: input.userAgent ?? null,
      method: "WRITE",
      path: "epdr://engineering/plans",
      success: true,
      requestId: input.requestId ?? null
    });
  }

  async logDailyReportChanged(input: LogEngineeringDailyReportChangedInput): Promise<void> {
    await this.auditService.recordOperation({
      tenantId: input.tenantId,
      parkId: input.parkId,
      userId: input.actorUserId,
      username: null,
      realName: input.actorName ?? null,
      roleCodes: input.actorRoleCodes ?? null,
      module: "engineering",
      resource: "engineering_daily_report",
      action: input.action,
      bizType: "engineering_daily_report",
      bizId: input.dailyReportId,
      beforeJson: input.beforeJson ?? null,
      afterJson: {
        projectId: input.projectId,
        ...(input.afterJson ?? {})
      },
      clientIp: input.ip ?? null,
      clientUa: input.userAgent ?? null,
      method: "WRITE",
      path: "epdr://engineering/daily-reports",
      success: true,
      requestId: input.requestId ?? null
    });
  }
}
