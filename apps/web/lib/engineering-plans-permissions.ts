import type { AuthUser, UserContext } from "@jinhu/shared";

export const ENGINEERING_PLAN_PERMISSIONS = {
  VIEW: "ENGINEERING_PLAN_VIEW",
  CREATE: "ENGINEERING_PLAN_CREATE",
  UPDATE: "ENGINEERING_PLAN_UPDATE",
  DELETE: "ENGINEERING_PLAN_UPDATE",
  APPROVE: "ENGINEERING_PLAN_APPROVE"
} as const;

type PermissionSubject = Pick<AuthUser | UserContext, "permissions" | "is_super"> | null;

export function hasEngineeringPlanPermission(user: PermissionSubject, permission: string): boolean {
  if (!permission) {
    return true;
  }
  if (!user) {
    return false;
  }
  const permissions = user.permissions ?? [];
  if (user.is_super || permissions.includes("*")) {
    return true;
  }
  return permissions.includes(permission);
}
