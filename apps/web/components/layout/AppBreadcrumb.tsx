"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { findBreadcrumbByPath, getUserDashboardMenus } from "../../lib/menu";
import { useDynamicBreadcrumbLabel } from "../../lib/dynamic-breadcrumb";

interface AppBreadcrumbProps {
  variant?: "standalone" | "inline";
}

export function AppBreadcrumb({ variant = "standalone" }: AppBreadcrumbProps) {
  const pathname = usePathname();
  const user = useAuthUser();
  const dynamicLabel = useDynamicBreadcrumbLabel();
  const menus = useMemo(() => getUserDashboardMenus(user), [user]);
  const { current, parent } = findBreadcrumbByPath(pathname, menus, dynamicLabel);

  if (!parent && !current) {
    return null;
  }

  return (
    <nav className={`breadcrumb${variant === "inline" ? " breadcrumb-inline" : ""}`} aria-label="breadcrumb">
      {parent ? (
        <>
          <span>{parent.label}</span>
        </>
      ) : null}
      {current ? (
        <>
          <ChevronRight size={14} />
          <strong>{current.label}</strong>
        </>
      ) : null}
    </nav>
  );
}
