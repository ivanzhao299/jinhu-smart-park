import { SYSTEM_PERMISSIONS, type UserContext } from "@jinhu/shared";
import { getDashboardAuthorizationMenus } from "./menu";
import { hasAllPermissions, hasModule, hasPermission } from "./permissions";

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
  permissions?: string[];
  module?: string;
  children?: RouteMenuItem[];
}

function hasAnyPermission(user: UserContext | null, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

function findFirstAccessibleMenuHref(
  user: UserContext | null,
  items?: RouteMenuItem[],
  inheritedModule?: string,
  authorizationItems?: RouteMenuItem[]
): string | null {
  if (!items) {
    return null;
  }
  for (const item of items) {
    const moduleCode = item.module ?? inheritedModule;
    const authorizationItem = item.href
      ? findMenuRequirementsByHref(item.href, authorizationItems)
      : undefined;
    if (
      item.href &&
      item.href !== "/login" &&
      hasPermission(user, item.permission) &&
      hasAllPermissions(user, authorizationItem?.permissions ?? []) &&
      hasModule(user, moduleCode)
    ) {
      return item.href;
    }
    const nested = findFirstAccessibleMenuHref(user, item.children, moduleCode, authorizationItems);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function findMenuRequirementsByHref(
  href: string,
  items?: RouteMenuItem[]
): RouteMenuItem | undefined {
  for (const item of items ?? []) {
    if (item.href === href) {
      return item;
    }
    const nested = findMenuRequirementsByHref(href, item.children);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function findFirstPostLoginMenuHref(user: UserContext | null): string | null {
  const userMenus = user?.menu_tree ?? user?.menus;
  return findFirstAccessibleMenuHref(
    user,
    userMenus,
    undefined,
    getDashboardAuthorizationMenus(userMenus)
  );
}

function pathBelongsToMenu(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface MenuPathAccess {
  accessible: boolean;
  hrefLength: number;
}

function resolveMenuPathAccess(
  user: UserContext | null,
  pathname: string,
  items?: RouteMenuItem[],
  inheritedModule?: string
): MenuPathAccess | null {
  if (!items) {
    return null;
  }
  let bestMatch: MenuPathAccess | null = null;
  for (const item of items) {
    const moduleCode = item.module ?? inheritedModule;
    if (item.href && pathBelongsToMenu(pathname, item.href)) {
      const candidate = {
        accessible:
          hasPermission(user, item.permission) &&
          hasAllPermissions(user, item.permissions ?? []) &&
          hasModule(user, moduleCode),
        hrefLength: item.href.length
      };
      if (
        !bestMatch ||
        candidate.hrefLength > bestMatch.hrefLength ||
        (candidate.hrefLength === bestMatch.hrefLength && candidate.accessible)
      ) {
        bestMatch = candidate;
      }
    }
    const nested = resolveMenuPathAccess(user, pathname, item.children, moduleCode);
    if (
      nested &&
      (!bestMatch ||
        nested.hrefLength > bestMatch.hrefLength ||
        (nested.hrefLength === bestMatch.hrefLength && nested.accessible))
    ) {
      bestMatch = nested;
    }
  }
  return bestMatch;
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
  const firstMenuHref = findFirstPostLoginMenuHref(user);
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
  if (user?.is_tenant_bootstrap_admin) {
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
  previousUser: UserContext | null = null,
  signals: PostLoginDeviceSignals = detectPostLoginDeviceSignals()
): string {
  if (pathname === "/dashboard") {
    return pathname;
  }

  const hasEngineeringTerminalAccess =
    hasModule(user, "engineering") && hasPermission(user, "ENGINEERING_DASHBOARD_VIEW");
  const hasOperationsAccess =
    hasModule(user, "safety") && hasPermission(user, SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY);
  if (pathname === "/engineering/terminal") {
    if (hasEngineeringTerminalAccess) {
      return pathname;
    }
    const fallback = resolvePostLoginPath(user, signals);
    return fallback === pathname
      ? findFirstPostLoginMenuHref(user) ?? "/dashboard"
      : fallback;
  }
  if (pathname === "/operations/terminal") {
    return hasOperationsAccess ? pathname : resolvePostLoginPath(user, signals);
  }

  const menuAccess = resolveMenuPathAccess(
    user,
    pathname,
    getDashboardAuthorizationMenus(user?.menu_tree ?? user?.menus)
  );
  if (menuAccess) {
    return menuAccess.accessible ? pathname : resolvePostLoginPath(user, signals);
  }
  const previousMenuAccess = resolveMenuPathAccess(
    previousUser,
    pathname,
    previousUser?.menu_tree ?? previousUser?.menus
  );
  return previousMenuAccess ? resolvePostLoginPath(user, signals) : pathname;
}
