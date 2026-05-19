"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { UserContext } from "@jinhu/shared";
import { AuthUserContext } from "../../lib/auth-context";
import { clearSession, fetchCurrentUser, getStoredUser, getToken } from "../../lib/auth";
import { findMenuByPath, getDashboardMenus } from "../../lib/menu";
import { hasModule, hasPermission } from "../../lib/permissions";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

const SIDEBAR_COLLAPSED_KEY = "jinhu_sidebar_collapsed";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserContext | null>(getStoredUser());
  const [ready, setReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      clearSession();
      router.replace("/login");
      return;
    }
    fetchCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setReady(true);
      })
      .catch(() => {
        clearSession();
        router.replace("/login");
      });
  }, [router]);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  };

  const menus = useMemo(() => getDashboardMenus(user?.menus ?? user?.menu_tree), [user]);
  const requiredMenu = useMemo(() => findMenuByPath(pathname, menus), [menus, pathname]);

  useEffect(() => {
    if (ready && requiredMenu && !hasPermission(user, requiredMenu.permission)) {
      router.replace("/403");
    }
    if (ready && requiredMenu && hasPermission(user, requiredMenu.permission) && !hasModule(user, requiredMenu.module)) {
      router.replace("/403?reason=module");
    }
  }, [ready, requiredMenu, router, user]);

  if (!ready) {
    return <main className="content">加载中...</main>;
  }

  return (
    <AuthUserContext.Provider value={user}>
      <div className={`dashboard-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={handleSidebarCollapsedChange} />
        <div className="dashboard-main">
          <AppHeader />
          <AppBreadcrumb />
          {children}
        </div>
      </div>
    </AuthUserContext.Provider>
  );
}
