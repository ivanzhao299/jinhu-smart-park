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

const OPERATIONS_PERMISSIONS = [
  SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY,
  SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_READ,
  SYSTEM_PERMISSIONS.WORKORDER_CREATE,
  SYSTEM_PERMISSIONS.WORKORDER_READ
];

function hasAnyPermission(user: UserContext | null, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

function findFirstMenuHref(items?: UserMenuTreeNode[]): string | null {
  if (!items) {
    return null;
  }
  for (const item of items) {
    if (item.href && item.href !== "/login") {
      return item.href;
    }
    const nested = findFirstMenuHref(item.children);
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
  const firstMenuHref = findFirstMenuHref(user?.menu_tree ?? user?.menus);
  const hasEngineeringAccess = hasModule(user, "engineering") && hasAnyPermission(user, ENGINEERING_PERMISSIONS);
  const hasOperationsAccess =
    (hasModule(user, "safety") && hasAnyPermission(user, OPERATIONS_PERMISSIONS)) ||
    (hasModule(user, "workorder") && hasAnyPermission(user, OPERATIONS_PERMISSIONS));

  if (prefersMobileWorkbench(signals)) {
    if (user?.is_super) {
      return "/operations/terminal";
    }
    if (hasEngineeringAccess) {
      return "/engineering/terminal";
    }
    if (hasOperationsAccess) {
      return "/operations/terminal";
    }
    return firstMenuHref ?? "/operations/terminal";
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
