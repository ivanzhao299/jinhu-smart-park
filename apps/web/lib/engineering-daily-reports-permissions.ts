import type { AuthUser, UserContext } from "@jinhu/shared";

export const ENGINEERING_DAILY_REPORT_PERMISSIONS = {
  VIEW: "ENGINEERING_DAILY_REPORT_VIEW",
  CREATE: "ENGINEERING_DAILY_REPORT_CREATE",
  UPDATE: "ENGINEERING_DAILY_REPORT_UPDATE",
  DELETE: "ENGINEERING_DAILY_REPORT_DELETE",
  SUBMIT: "ENGINEERING_DAILY_REPORT_SUBMIT",
  REVIEW: "ENGINEERING_DAILY_REPORT_REVIEW"
} as const;

type PermissionSubject = Pick<AuthUser | UserContext, "permissions" | "is_super"> | null;

export function hasEngineeringDailyReportPermission(user: PermissionSubject, permission: string): boolean {
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
  // Engineering RBAC seed lands in Task 021. Until then, existing non-engineering operators can see the Phase 1 UI.
  if (!permissions.some((item) => item.startsWith("ENGINEERING_"))) {
    return true;
  }
  if (permission === ENGINEERING_DAILY_REPORT_PERMISSIONS.DELETE) {
    return permissions.includes(permission) || permissions.includes(ENGINEERING_DAILY_REPORT_PERMISSIONS.UPDATE);
  }
  if (permission === ENGINEERING_DAILY_REPORT_PERMISSIONS.SUBMIT) {
    return (
      permissions.includes(permission) ||
      permissions.includes(ENGINEERING_DAILY_REPORT_PERMISSIONS.CREATE) ||
      permissions.includes(ENGINEERING_DAILY_REPORT_PERMISSIONS.UPDATE)
    );
  }
  return permissions.includes(permission);
}
