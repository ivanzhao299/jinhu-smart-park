import type { AuthUser, UserContext } from "@jinhu/shared";

export const ENGINEERING_PROJECT_PERMISSIONS = {
  VIEW: "ENGINEERING_PROJECT_VIEW",
  CREATE: "ENGINEERING_PROJECT_CREATE",
  UPDATE: "ENGINEERING_PROJECT_UPDATE",
  DELETE: "ENGINEERING_PROJECT_UPDATE"
} as const;

type PermissionSubject = Pick<AuthUser | UserContext, "permissions" | "is_super"> | null;

export function hasEngineeringProjectPermission(user: PermissionSubject, permission: string): boolean {
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
