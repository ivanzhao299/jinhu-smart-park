"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { findMenuByPath, getDashboardMenus } from "../../lib/menu";

export function AppBreadcrumb() {
  const pathname = usePathname();
  const user = useAuthUser();
  const menus = useMemo(() => getDashboardMenus(user?.menus ?? user?.menu_tree), [user]);
  const current = findMenuByPath(pathname, menus);
  const parent = menus.find((menu) => menu.children?.some((child) => child.href === pathname));

  return (
    <nav className="breadcrumb" aria-label="breadcrumb">
      <span>后台</span>
      {parent ? (
        <>
          <ChevronRight size={14} />
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
