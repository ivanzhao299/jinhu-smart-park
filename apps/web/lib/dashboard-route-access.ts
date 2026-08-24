import { hasAccess, hasPermission } from "./permissions";

type AuthorizationSubject = NonNullable<Parameters<typeof hasAccess>[0]>;

interface RouteAccessRequirement {
  permission?: string;
  module?: string;
}

export type DashboardRouteDenial = "permission" | "module" | null;

export function resolveDashboardRouteDenial(
  user: AuthorizationSubject,
  requiredMenus: RouteAccessRequirement[]
): DashboardRouteDenial {
  if (requiredMenus.length === 0) return null;
  if (requiredMenus.some((menu) => hasAccess(user, menu.permission, menu.module))) return null;
  if (!requiredMenus.some((menu) => hasPermission(user, menu.permission))) return "permission";
  return "module";
}

export function dashboardRouteDenialHref(
  denial: Exclude<DashboardRouteDenial, null>
): "/403" | "/403?reason=module" {
  return denial === "module" ? "/403?reason=module" : "/403";
}
