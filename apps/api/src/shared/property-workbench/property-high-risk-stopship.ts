import { ConflictException, ForbiddenException } from "@nestjs/common";
import { TRACK_A_HIGH_RISK_ACTION_IDS } from "@jinhu/shared";

export const PROPERTY_APPROVAL_REQUIRED_MESSAGE =
  "PROPERTY_APPROVAL_REQUIRED: High-risk property action is disabled until approval enforcement is available";

export const PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE =
  "Required permissions are missing for high-risk property action";

export type PropertyHighRiskActionId =
  (typeof TRACK_A_HIGH_RISK_ACTION_IDS)[number];

export interface PropertyHighRiskPermissionActor {
  isSuper?: boolean;
  permissions: readonly string[];
}

const TRACK_A_HIGH_RISK_ACTION_ID_SET = new Set<string>(
  TRACK_A_HIGH_RISK_ACTION_IDS
);

export function isPropertyHighRiskActionId(
  actionId: unknown
): actionId is PropertyHighRiskActionId {
  return typeof actionId === "string"
    && TRACK_A_HIGH_RISK_ACTION_ID_SET.has(actionId);
}

export function assertPropertyHighRiskActionPermissions(
  actor: PropertyHighRiskPermissionActor,
  requiredPermissions: readonly string[]
): void {
  if (
    actor.isSuper
    || actor.permissions.includes("*")
    || requiredPermissions.every((permission) =>
      actor.permissions.includes(permission)
    )
  ) {
    return;
  }
  throw new ForbiddenException(PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE);
}

export function assertPropertyHighRiskActionApprovalRequired(
  actionId: unknown
): void {
  if (!isPropertyHighRiskActionId(actionId)) {
    throw new ConflictException(PROPERTY_APPROVAL_REQUIRED_MESSAGE);
  }
  throw new ConflictException(PROPERTY_APPROVAL_REQUIRED_MESSAGE);
}
