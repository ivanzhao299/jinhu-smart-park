"use client";

import { Building2, ChevronDown } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthUser } from "../../lib/auth-context";
import { dashboardMenus, type MenuNode } from "../../lib/menu";
import { hasAccess, hasAnyPermission, hasModule } from "../../lib/permissions";

export function AppSidebar() {
  const pathname = usePathname();
  const user = useAuthUser();
  const menus = dashboardMenus
    .map((menu) => ({
      ...menu,
      children: menu.children?.filter((child) => hasAccess(user, child.permission, child.module ?? menu.module))
    }))
    .filter(
      (menu) =>
        hasModule(user, menu.module) &&
        ((menu.href && hasAccess(user, menu.permission, menu.module)) ||
          hasAnyPermission(user, menu.children?.map((child) => child.permission ?? "") ?? []) ||
          Boolean(menu.children?.some((child) => !child.permission)))
    );

  return (
    <aside className="app-sidebar">
      <div className="brand">
        <span className="brand-mark"><Building2 size={20} /></span>
        <span>数字运营 SaaS</span>
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
        {menu.children?.map((child) => {
          const isActive = pathname === child.href || (pathname === "/assets/rooms" && child.href === "/assets/units");
          return (
            <Link className={`nav-link${isActive ? " active" : ""}`} href={(child.href ?? "/dashboard") as Route} key={child.href}>
              {child.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
