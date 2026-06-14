"use client";

import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SYSTEM_MENU_ITEMS } from "@jinhu/shared";
import { getAuthUser, hasPermission } from "../lib/authz";

interface SystemShellProps {
  children: React.ReactNode;
}

export function SystemShell({ children }: SystemShellProps) {
  const pathname = usePathname();
  const user = getAuthUser();
  const visibleMenus = SYSTEM_MENU_ITEMS.filter((item) => hasPermission(user, item.permission));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <img alt="金湖科创产业园" className="brand-mark-image" src="/brand/jinhupark-logo.svg" />
          </span>
          <span>系统管理</span>
        </div>
        <ul className="nav-list">
          {visibleMenus.map((item) => (
            <li key={item.href}>
              <Link className={`nav-link${pathname === item.href ? " active" : ""}`} href={item.href as Route}>
                <ChevronRight size={16} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
