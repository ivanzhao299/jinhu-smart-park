import type { TenantParkScope } from "@jinhu/shared";
import { EngineeringProjectStatus } from "./engineering-project.enums";

export enum EngineeringProjectAction {
  SUBMIT = "SUBMIT",
  APPROVE = "APPROVE",
  CANCEL = "CANCEL",
  START_PLANNING = "START_PLANNING",
  START_EXECUTION = "START_EXECUTION",
  START_INSPECTION = "START_INSPECTION",
  REQUIRE_RECTIFICATION = "REQUIRE_RECTIFICATION",
  START_ACCEPTANCE = "START_ACCEPTANCE",
  ACCEPTANCE_PASSED = "ACCEPTANCE_PASSED",
  ACCEPTANCE_FAILED = "ACCEPTANCE_FAILED",
  MARK_TRANSFER_READY = "MARK_TRANSFER_READY",
  MARK_SETTLEMENT_READY = "MARK_SETTLEMENT_READY",
  CLOSE = "CLOSE",
  ARCHIVE = "ARCHIVE"
}

export interface EngineeringProjectTransitionContext extends TenantParkScope {
  actorUserId: string;
  actorName?: string | null;
  actorRoleCodes?: string[];
  actorPermissions?: string[];
  orgId?: string | null;
  projectId: string;
  reason: string;
  comment?: string | null;
  workflowInstanceId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface EngineeringProjectAvailableAction {
  action: EngineeringProjectAction;
  targetStatus: EngineeringProjectStatus;
  requiredPermission: string;
}

export interface EngineeringProjectTransitionSnapshot {
  projectId: string;
  fromStatus: EngineeringProjectStatus;
  toStatus: EngineeringProjectStatus;
  action: EngineeringProjectAction;
  reason: string;
}

export const ENGINEERING_PROJECT_ACTION_LABELS: Record<EngineeringProjectAction, string> = {
  [EngineeringProjectAction.SUBMIT]: "提交立项",
  [EngineeringProjectAction.APPROVE]: "批准立项",
  [EngineeringProjectAction.CANCEL]: "取消项目",
  [EngineeringProjectAction.START_PLANNING]: "进入计划",
  [EngineeringProjectAction.START_EXECUTION]: "进入施工",
  [EngineeringProjectAction.START_INSPECTION]: "进入巡检",
  [EngineeringProjectAction.REQUIRE_RECTIFICATION]: "要求整改",
  [EngineeringProjectAction.START_ACCEPTANCE]: "进入验收",
  [EngineeringProjectAction.ACCEPTANCE_PASSED]: "验收通过",
  [EngineeringProjectAction.ACCEPTANCE_FAILED]: "验收未通过",
  [EngineeringProjectAction.MARK_TRANSFER_READY]: "标记待移交",
  [EngineeringProjectAction.MARK_SETTLEMENT_READY]: "标记待结算",
  [EngineeringProjectAction.CLOSE]: "关闭项目",
  [EngineeringProjectAction.ARCHIVE]: "归档项目"
};
