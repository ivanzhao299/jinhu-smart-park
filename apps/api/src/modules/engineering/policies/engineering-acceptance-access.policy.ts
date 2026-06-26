import { ForbiddenException, Injectable } from "@nestjs/common";

export const EngineeringAcceptancePermission = {
  VIEW: "ENGINEERING_ACCEPTANCE_VIEW",
  CREATE: "ENGINEERING_ACCEPTANCE_CREATE",
  UPDATE: "ENGINEERING_ACCEPTANCE_UPDATE",
  DELETE: "ENGINEERING_ACCEPTANCE_UPDATE",
  SUBMIT: "ENGINEERING_ACCEPTANCE_SUBMIT",
  REVIEW: "ENGINEERING_ACCEPTANCE_REVIEW",
  CLOSE: "ENGINEERING_ACCEPTANCE_CLOSE"
} as const;

export type EngineeringAcceptancePermissionValue = (typeof EngineeringAcceptancePermission)[keyof typeof EngineeringAcceptancePermission];

export interface EngineeringAcceptancePermissionContext {
  actorPermissions?: string[];
}

@Injectable()
export class EngineeringAcceptanceAccessPolicy {
  assertPermission(permission: EngineeringAcceptancePermissionValue, context: EngineeringAcceptancePermissionContext): void {
    const permissions = context.actorPermissions ?? [];
    if (permissions.includes("*") || !permissions.some((item) => item.startsWith("ENGINEERING_"))) {
      return;
    }
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }
}
