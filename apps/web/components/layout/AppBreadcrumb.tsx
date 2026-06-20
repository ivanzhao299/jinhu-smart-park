"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { findMenuByPath, getDashboardMenus } from "../../lib/menu";

interface AppBreadcrumbProps {
  variant?: "standalone" | "inline";
}

export function AppBreadcrumb({ variant = "standalone" }: AppBreadcrumbProps) {
  const pathname = usePathname();
  const user = useAuthUser();
  const menus = useMemo(() => getDashboardMenus(user?.menus ?? user?.menu_tree), [user]);
  const current = findMenuByPath(pathname, menus);
  const parent = menus.find((menu) => menu.children?.some((child) => child.href === pathname));

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
