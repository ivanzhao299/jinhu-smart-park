import { SYSTEM_PERMISSIONS, type UserContext, type UserMenuTreeNode } from "@jinhu/shared";
import { hasModule, hasPermission } from "./permissions";

export interface PostLoginDeviceSignals {
  viewportWidth?: number;
  pointerCoarse?: boolean;
  touchPoints?: number;
  userAgent?: string;
}

const ENGINEERING_PERMISSIONS = [
  "ENGINEERING_DASHBOARD_VIEW",
  "ENGINEERING_PROJECT_VIEW",
  "ENGINEERING_PLAN_VIEW",
  "ENGINEERING_DAILY_REPORT_VIEW",
  "ENGINEERING_INSPECTION_VIEW",
  "ENGINEERING_RECTIFICATION_VIEW",
  "ENGINEERING_ACCEPTANCE_VIEW"
];

function hasAnyPermission(user: UserContext | null, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

function findFirstAccessibleMenuHref(
  user: UserContext | null,
  items?: UserMenuTreeNode[],
  inheritedModule?: string
): string | null {
  if (!items) {
    return null;
  }
  for (const item of items) {
    const moduleCode = item.module ?? inheritedModule;
    if (
      item.href &&
      item.href !== "/login" &&
      hasPermission(user, item.permission) &&
      hasModule(user, moduleCode)
    ) {
      return item.href;
    }
    const nested = findFirstAccessibleMenuHref(user, item.children, moduleCode);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function detectPostLoginDeviceSignals(): PostLoginDeviceSignals {
  if (typeof window === "undefined") {
    return {};
  }
  return {
    viewportWidth: window.innerWidth,
    pointerCoarse: window.matchMedia?.("(pointer: coarse)")?.matches ?? false,
    touchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent
  };
}

export function prefersMobileWorkbench(signals: PostLoginDeviceSignals): boolean {
  const userAgent = signals.userAgent?.toLowerCase() ?? "";
  return Boolean(
    (signals.viewportWidth ?? Number.MAX_SAFE_INTEGER) <= 900 ||
      signals.pointerCoarse ||
      (signals.touchPoints ?? 0) > 0 ||
      /iphone|ipad|android|mobile|harmonyos/.test(userAgent)
  );
}

export function resolvePostLoginPath(user: UserContext | null, signals: PostLoginDeviceSignals = detectPostLoginDeviceSignals()): string {
  const firstMenuHref = findFirstAccessibleMenuHref(user, user?.menu_tree ?? user?.menus);
  const hasEngineeringAccess = hasModule(user, "engineering") && hasAnyPermission(user, ENGINEERING_PERMISSIONS);
  const hasOperationsAccess =
    hasModule(user, "safety") && hasPermission(user, SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY);

  if (prefersMobileWorkbench(signals)) {
    if (hasEngineeringAccess) {
      return "/engineering/terminal";
    }
    if (hasOperationsAccess) {
      return "/operations/terminal";
    }
    return firstMenuHref ?? "/dashboard";
  }
  if (firstMenuHref) {
    return firstMenuHref;
  }
  if (hasEngineeringAccess) {
    return "/engineering";
  }
  if (user?.is_super || hasOperationsAccess) {
    return "/dashboard";
  }
  return "/dashboard";
}
