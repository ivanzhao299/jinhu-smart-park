import { EngineeringRectificationStatus } from "./engineering-project.enums";

export enum EngineeringRectificationAction {
  START = "START",
  SUBMIT = "SUBMIT",
  START_RECHECK = "START_RECHECK",
  PASS = "PASS",
  REJECT = "REJECT",
  CLOSE = "CLOSE",
  MARK_OVERDUE = "MARK_OVERDUE"
}

export interface EngineeringRectificationTransitionContext {
  tenantId: string;
  parkId: string;
  actorUserId: string;
  actorName?: string | null;
  actorRoleCodes?: string[] | null;
  actorPermissions?: string[];
  projectId: string;
  rectificationId: string;
  reason: string;
  comment?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface EngineeringRectificationAvailableAction {
  action: EngineeringRectificationAction;
  fromStatus: EngineeringRectificationStatus;
  toStatus: EngineeringRectificationStatus;
}
