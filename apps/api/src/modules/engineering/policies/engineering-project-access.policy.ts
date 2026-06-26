import { ForbiddenException, Injectable } from "@nestjs/common";

export const EngineeringProjectPermission = {
  VIEW: "ENGINEERING_PROJECT_VIEW",
  CREATE: "ENGINEERING_PROJECT_CREATE",
  UPDATE: "ENGINEERING_PROJECT_UPDATE",
  DELETE: "ENGINEERING_PROJECT_UPDATE"
} as const;

export type EngineeringProjectPermissionValue = (typeof EngineeringProjectPermission)[keyof typeof EngineeringProjectPermission];

export interface EngineeringActorPermissionContext {
  actorPermissions?: string[];
}

@Injectable()
export class EngineeringProjectAccessPolicy {
  assertPermission(permission: EngineeringProjectPermissionValue, context: EngineeringActorPermissionContext): void {
    const permissions = context.actorPermissions ?? [];
    if (permissions.includes("*") || !permissions.some((item) => item.startsWith("ENGINEERING_"))) {
      return;
    }
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }
}
