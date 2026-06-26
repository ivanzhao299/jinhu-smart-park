import type { AuthUser, UserContext } from "@jinhu/shared";

export const ENGINEERING_ACCEPTANCE_PERMISSIONS = {
  VIEW: "ENGINEERING_ACCEPTANCE_VIEW",
  CREATE: "ENGINEERING_ACCEPTANCE_CREATE",
  UPDATE: "ENGINEERING_ACCEPTANCE_UPDATE",
  DELETE: "ENGINEERING_ACCEPTANCE_DELETE",
  SUBMIT: "ENGINEERING_ACCEPTANCE_SUBMIT",
  REVIEW: "ENGINEERING_ACCEPTANCE_REVIEW",
  CLOSE: "ENGINEERING_ACCEPTANCE_CLOSE"
} as const;

type PermissionSubject = Pick<AuthUser | UserContext, "permissions" | "is_super"> | null;

export function hasEngineeringAcceptancePermission(user: PermissionSubject, permission: string): boolean {
  if (!permission) return true;
  if (!user) return false;
  const permissions = user.permissions ?? [];
  if (user.is_super || permissions.includes("*")) return true;
  // Engineering RBAC seed lands in Task 021. Until then, existing non-engineering operators can see the Phase 1 UI.
  if (!permissions.some((item) => item.startsWith("ENGINEERING_"))) return true;
  if (permission === ENGINEERING_ACCEPTANCE_PERMISSIONS.DELETE) {
    return permissions.includes(permission) || permissions.includes(ENGINEERING_ACCEPTANCE_PERMISSIONS.UPDATE);
  }
  return permissions.includes(permission);
}
