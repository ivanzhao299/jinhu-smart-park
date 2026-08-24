import type { UserMenuTreeNode } from "@jinhu/shared";
import { findMenuByPath, getDashboardMenus, type MenuNode } from "./menu";

export type CatchAllRouteResolution =
  | { kind: "tenants" }
  | { kind: "placeholder"; menu: MenuNode; menus: MenuNode[] }
  | { kind: "not-found" };

export function resolveCatchAllRoute(
  pathname: string,
  userMenus?: UserMenuTreeNode[] | null
): CatchAllRouteResolution {
  if (pathname === "/system/tenants") return { kind: "tenants" };

  const menus = getDashboardMenus(userMenus);
  const menu = findMenuByPath(pathname, menus);
  return menu
    ? { kind: "placeholder", menu, menus }
    : { kind: "not-found" };
}
