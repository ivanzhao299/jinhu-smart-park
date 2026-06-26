import type { AuthUser, UserContext } from "@jinhu/shared";

export const ENGINEERING_RECTIFICATION_PERMISSIONS = {
  VIEW: "ENGINEERING_RECTIFICATION_VIEW",
  ASSIGN: "ENGINEERING_RECTIFICATION_ASSIGN",
  UPDATE: "ENGINEERING_RECTIFICATION_UPDATE",
  SUBMIT: "ENGINEERING_RECTIFICATION_SUBMIT",
  RECHECK: "ENGINEERING_RECTIFICATION_RECHECK",
  CLOSE: "ENGINEERING_RECTIFICATION_CLOSE",
  DELETE: "ENGINEERING_RECTIFICATION_UPDATE"
} as const;

export type EngineeringRectificationPermission =
  (typeof ENGINEERING_RECTIFICATION_PERMISSIONS)[keyof typeof ENGINEERING_RECTIFICATION_PERMISSIONS];

type PermissionSubject = Pick<AuthUser | UserContext, "permissions" | "is_super"> | null;

export function hasEngineeringRectificationPermission(user: PermissionSubject, permission: EngineeringRectificationPermission): boolean {
  if (!permission) return true;
  if (!user) return false;
  const permissions = user.permissions ?? [];
  if (user.is_super || permissions.includes("*")) return true;
  if (!permissions.some((item) => item.startsWith("ENGINEERING_"))) return true;
  return permissions.includes(permission);
}
