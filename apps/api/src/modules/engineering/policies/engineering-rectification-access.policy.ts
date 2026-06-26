import { ForbiddenException, Injectable } from "@nestjs/common";

export const EngineeringRectificationPermission = {
  VIEW: "ENGINEERING_RECTIFICATION_VIEW",
  ASSIGN: "ENGINEERING_RECTIFICATION_ASSIGN",
  UPDATE: "ENGINEERING_RECTIFICATION_UPDATE",
  SUBMIT: "ENGINEERING_RECTIFICATION_SUBMIT",
  RECHECK: "ENGINEERING_RECTIFICATION_RECHECK",
  CLOSE: "ENGINEERING_RECTIFICATION_CLOSE",
  DELETE: "ENGINEERING_RECTIFICATION_UPDATE"
} as const;

export type EngineeringRectificationPermissionValue =
  (typeof EngineeringRectificationPermission)[keyof typeof EngineeringRectificationPermission];

export interface EngineeringRectificationPermissionContext {
  actorPermissions?: string[];
}

@Injectable()
export class EngineeringRectificationAccessPolicy {
  assertPermission(permission: EngineeringRectificationPermissionValue, context: EngineeringRectificationPermissionContext): void {
    const permissions = context.actorPermissions ?? [];
    if (permissions.includes("*")) {
      return;
    }
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }
}
