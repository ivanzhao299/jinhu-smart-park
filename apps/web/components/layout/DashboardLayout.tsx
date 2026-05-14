"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { UserContext } from "@jinhu/shared";
import { AuthUserContext } from "../../lib/auth-context";
import { clearSession, fetchCurrentUser, getStoredUser, getToken } from "../../lib/auth";
import { findMenuByPath } from "../../lib/menu";
import { hasPermission } from "../../lib/permissions";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserContext | null>(getStoredUser());
  const [ready, setReady] = useState(false);

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

  const requiredPermission = useMemo(() => findMenuByPath(pathname)?.permission, [pathname]);

  useEffect(() => {
    if (ready && requiredPermission && !hasPermission(user, requiredPermission)) {
      router.replace("/403");
    }
  }, [ready, requiredPermission, router, user]);

  if (!ready) {
    return <main className="content">加载中...</main>;
  }

  return (
    <AuthUserContext.Provider value={user}>
      <div className="dashboard-shell">
        <AppSidebar />
        <div className="dashboard-main">
          <AppHeader />
          <AppBreadcrumb />
          {children}
        </div>
      </div>
    </AuthUserContext.Provider>
  );
}
