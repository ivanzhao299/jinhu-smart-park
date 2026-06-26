import { ForbiddenException, Injectable } from "@nestjs/common";

export const EngineeringPlanPermission = {
  VIEW: "ENGINEERING_PLAN_VIEW",
  CREATE: "ENGINEERING_PLAN_CREATE",
  UPDATE: "ENGINEERING_PLAN_UPDATE",
  DELETE: "ENGINEERING_PLAN_UPDATE",
  APPROVE: "ENGINEERING_PLAN_APPROVE"
} as const;

export type EngineeringPlanPermissionValue = (typeof EngineeringPlanPermission)[keyof typeof EngineeringPlanPermission];

export interface EngineeringPlanPermissionContext {
  actorPermissions?: string[];
}

@Injectable()
export class EngineeringPlanAccessPolicy {
  assertPermission(permission: EngineeringPlanPermissionValue, context: EngineeringPlanPermissionContext): void {
    const permissions = context.actorPermissions ?? [];
    if (permissions.includes("*")) {
      return;
    }
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }
}
