"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { UserContext } from "@jinhu/shared";
import { AuthUserContext } from "../../lib/auth-context";
import { clearSession, fetchCurrentUser, getStoredUser, getToken } from "../../lib/auth";
import { findMenuByPath, getDashboardAuthorizationMenus } from "../../lib/menu";
import { hasModule, hasPermission } from "../../lib/permissions";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

const SIDEBAR_COLLAPSED_KEY = "jinhu_sidebar_collapsed";
const TERMINAL_LAYOUT_PATHS = [
  "/operations/terminal",
  "/preview/operations-terminal",
  "/engineering/terminal",
  "/tenant/service",
  "/preview/tenant-service",
  "/safety/my-inspect-tasks"
] as const;

interface DashboardLayoutProps {
  children: React.ReactNode;
  forceTerminalMode?: boolean;
}

export function DashboardLayout({ children, forceTerminalMode = false }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isTerminalRoute = forceTerminalMode || (pathname ? TERMINAL_LAYOUT_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) : false);
  const [user, setUser] = useState<UserContext | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(readSidebarCollapsedPreference());
    const token = getToken();
    if (!token) {
      clearSession();
      router.replace("/login");
      return;
    }
    const storedUser = getStoredUser();
    if (storedUser) {
      setUser(storedUser);
      setReady(true);
    }
    const reloadIfTokenChanged = (requestToken: string): boolean => {
      const latestToken = getToken();
      if (requestToken !== latestToken && latestToken) {
        setReady(false);
        void loadCurrentUser(latestToken);
        return true;
      }
      return false;
    };
    const loadCurrentUser = (requestToken: string) => fetchCurrentUser({ requestToken })
      .then((currentUser) => {
        if (reloadIfTokenChanged(requestToken)) {
          return;
        }
        setUser(currentUser);
        setReady(true);
      })
      .catch(() => {
        if (reloadIfTokenChanged(requestToken)) {
          return;
        }
        clearSession();
        router.replace("/login");
      });
    void loadCurrentUser(token);
  }, [router]);

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    writeSidebarCollapsedPreference(collapsed);
  };

  const authorizationMenus = useMemo(() => getDashboardAuthorizationMenus(user?.menus ?? user?.menu_tree), [user]);
  const requiredMenu = useMemo(() => findMenuByPath(pathname, authorizationMenus), [authorizationMenus, pathname]);

  useEffect(() => {
    if (!ready || !user) {
      return;
    }
    if (requiredMenu && !hasPermission(user, requiredMenu.permission)) {
      router.replace("/403");
    }
    if (requiredMenu && hasPermission(user, requiredMenu.permission) && !hasModule(user, requiredMenu.module)) {
      router.replace("/403?reason=module");
    }
  }, [ready, requiredMenu, router, user]);

  if (!ready || !user) {
    return <DashboardShellSkeleton collapsed={sidebarCollapsed} terminalMode={isTerminalRoute} />;
  }

  return (
    <AuthUserContext.Provider value={user}>
      <div className={`dashboard-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}${isTerminalRoute ? " dashboard-shell-terminal" : ""}`}>
        <AppHeader
          breadcrumb={<AppBreadcrumb variant="inline" />}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarCollapsedChange={handleSidebarCollapsedChange}
          terminalMode={isTerminalRoute}
        />
        <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={handleSidebarCollapsedChange} terminalMode={isTerminalRoute} />
        <div className={`dashboard-main${isTerminalRoute ? " dashboard-main-terminal" : ""}`}>
          {children}
        </div>
      </div>
    </AuthUserContext.Provider>
  );
}

function DashboardShellSkeleton({ collapsed, terminalMode }: { collapsed: boolean; terminalMode: boolean }) {
  return (
    <div className={`dashboard-shell dashboard-loading-shell${collapsed ? " sidebar-collapsed" : ""}${terminalMode ? " dashboard-shell-terminal" : ""}`} data-loading="true">
      <header className={`app-header${terminalMode ? " app-header-terminal" : ""}`} data-terminal-header={terminalMode ? "true" : "false"}>
        <div className="header-leading">
          <span className="header-icon-button header-sidebar-toggle skeleton" />
          <span className="header-brand-symbol skeleton" />
          <div className="header-title">
            <span className="skeleton-line skeleton-line-sm" />
            <span className="skeleton-line" />
          </div>
        </div>
        <div className="header-actions">
          <span className="header-icon-button skeleton" />
          <span className="user-avatar skeleton" />
        </div>
      </header>
      <aside className={`app-sidebar dashboard-sidebar-skeleton${terminalMode ? " app-sidebar-terminal" : ""}`} aria-hidden="true">
        <div className="sidebar-brand-row">
          <div className="brand">
            <span className="brand-mark skeleton" />
            <span className="skeleton-line sidebar-brand-skeleton-title" />
          </div>
        </div>
        <nav className="sidebar-menu">
          {Array.from({ length: 10 }).map((_, index) => (
            <span className="menu-group-title sidebar-menu-skeleton-line skeleton" key={index} />
          ))}
        </nav>
      </aside>
      <div className={`dashboard-main${terminalMode ? " dashboard-main-terminal" : ""}`}>
        <main className="page-container">
          <section className="page-header">
            <div className="header-title">
              <span className="skeleton-line skeleton-line-lg" />
              <span className="skeleton-line" />
            </div>
          </section>
          <section className="page-content dashboard-page-skeleton">
            <span className="skeleton-line skeleton-line-lg" />
            <span className="skeleton-line" />
            <span className="skeleton-line" />
            <span className="skeleton-line skeleton-line-sm" />
          </section>
        </main>
      </div>
    </div>
  );
}

function readSidebarCollapsedPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function writeSidebarCollapsedPreference(collapsed: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  if (collapsed) {
    document.documentElement.dataset.sidebarCollapsed = "true";
  } else {
    delete document.documentElement.dataset.sidebarCollapsed;
  }
}
