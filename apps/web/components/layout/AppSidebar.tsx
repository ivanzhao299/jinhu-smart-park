"use client";

import { Building2, ChevronDown } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthUser } from "../../lib/auth-context";
import { dashboardMenus, type MenuNode } from "../../lib/menu";
import { hasAnyPermission, hasPermission } from "../../lib/permissions";

export function AppSidebar() {
  const pathname = usePathname();
  const user = useAuthUser();
  const menus = dashboardMenus
    .map((menu) => ({
      ...menu,
      children: menu.children?.filter((child) => hasPermission(user, child.permission))
    }))
    .filter(
      (menu) =>
        (menu.href && hasPermission(user, menu.permission)) ||
        hasAnyPermission(user, menu.children?.map((child) => child.permission ?? "") ?? []) ||
        Boolean(menu.children?.some((child) => !child.permission))
    );

  return (
    <aside className="app-sidebar">
      <div className="brand">
        <span className="brand-mark"><Building2 size={20} /></span>
        <span>金湖科创产业园</span>
      </div>
      <nav className="sidebar-menu">
        {menus.map((menu) => (
          <MenuGroup key={menu.label} menu={menu} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}

function MenuGroup({ menu, pathname }: { menu: MenuNode; pathname: string }) {
  const Icon = menu.icon;
  return (
    <section className="menu-group">
      <div className="menu-group-title">
        {Icon ? <Icon size={16} /> : null}
        <span>{menu.label}</span>
        <ChevronDown size={14} />
      </div>
      <div className="menu-group-items">
        {menu.children?.map((child) => (
          <Link className={`nav-link${pathname === child.href ? " active" : ""}`} href={(child.href ?? "/dashboard") as Route} key={child.href}>
            {child.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
