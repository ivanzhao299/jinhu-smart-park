import { SYSTEM_PERMISSIONS, type UserContext } from "@jinhu/shared";
import { getDashboardAuthorizationMenus } from "./menu";
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

interface RouteMenuItem {
  href?: string;
  permission?: string;
  module?: string;
  children?: RouteMenuItem[];
}

function hasAnyPermission(user: UserContext | null, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

function findFirstAccessibleMenuHref(
  user: UserContext | null,
  items?: RouteMenuItem[],
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

function pathBelongsToMenu(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveMenuPathAccess(
  user: UserContext | null,
  pathname: string,
  items?: RouteMenuItem[],
  inheritedModule?: string
): boolean | null {
  if (!items) {
    return null;
  }
  let matched = false;
  for (const item of items) {
    const moduleCode = item.module ?? inheritedModule;
    if (item.href && pathBelongsToMenu(pathname, item.href)) {
      matched = true;
      if (hasPermission(user, item.permission) && hasModule(user, moduleCode)) {
        return true;
      }
    }
    const nested = resolveMenuPathAccess(user, pathname, item.children, moduleCode);
    if (nested === true) {
      return true;
    }
    matched ||= nested === false;
  }
  return matched ? false : null;
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
  if (hasPermission(user, "*")) {
    return "/dashboard";
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

export function resolvePostParkSwitchPath(
  user: UserContext | null,
  pathname: string,
  signals: PostLoginDeviceSignals = detectPostLoginDeviceSignals()
): string {
  if (pathname === "/dashboard") {
    return pathname;
  }

  const hasEngineeringAccess = hasModule(user, "engineering") && hasAnyPermission(user, ENGINEERING_PERMISSIONS);
  const hasOperationsAccess =
    hasModule(user, "safety") && hasPermission(user, SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY);
  if (pathname === "/engineering/terminal") {
    return hasEngineeringAccess ? pathname : resolvePostLoginPath(user, signals);
  }
  if (pathname === "/operations/terminal") {
    return hasOperationsAccess ? pathname : resolvePostLoginPath(user, signals);
  }

  const menuAccess = resolveMenuPathAccess(
    user,
    pathname,
    getDashboardAuthorizationMenus(user?.menu_tree ?? user?.menus)
  );
  return menuAccess === false ? resolvePostLoginPath(user, signals) : pathname;
}
