import { ForbiddenException, Injectable } from "@nestjs/common";

export const EngineeringInspectionPermission = {
  VIEW: "ENGINEERING_INSPECTION_VIEW",
  CREATE: "ENGINEERING_INSPECTION_CREATE",
  UPDATE: "ENGINEERING_INSPECTION_UPDATE",
  DELETE: "ENGINEERING_INSPECTION_UPDATE",
  SUBMIT: "ENGINEERING_INSPECTION_SUBMIT",
  ISSUE_VIEW: "ENGINEERING_INSPECTION_VIEW",
  ISSUE_CREATE: "ENGINEERING_INSPECTION_UPDATE",
  ISSUE_UPDATE: "ENGINEERING_INSPECTION_UPDATE",
  ISSUE_DELETE: "ENGINEERING_INSPECTION_UPDATE",
  ISSUE_GENERATE_RECTIFICATION: "ENGINEERING_RECTIFICATION_ASSIGN"
} as const;

export type EngineeringInspectionPermissionValue =
  (typeof EngineeringInspectionPermission)[keyof typeof EngineeringInspectionPermission];

export interface EngineeringInspectionPermissionContext {
  actorPermissions?: string[];
}

@Injectable()
export class EngineeringInspectionAccessPolicy {
  assertPermission(permission: EngineeringInspectionPermissionValue, context: EngineeringInspectionPermissionContext): void {
    const permissions = context.actorPermissions ?? [];
    if (permissions.includes("*")) {
      return;
    }
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }
}
