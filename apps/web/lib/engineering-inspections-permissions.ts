import type { AuthUser, UserContext } from "@jinhu/shared";

export const ENGINEERING_INSPECTION_PERMISSIONS = {
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

export type EngineeringInspectionPermission =
  (typeof ENGINEERING_INSPECTION_PERMISSIONS)[keyof typeof ENGINEERING_INSPECTION_PERMISSIONS];

type PermissionSubject = Pick<AuthUser | UserContext, "permissions" | "is_super"> | null;

export function hasEngineeringInspectionPermission(user: PermissionSubject, permission: EngineeringInspectionPermission): boolean {
  if (!permission) return true;
  if (!user) return false;
  const permissions = user?.permissions ?? [];
  if (user.is_super || permissions.includes("*")) return true;
  return permissions.includes(permission);
}
