"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { dashboardMenus, findMenuByPath } from "../../lib/menu";

export function AppBreadcrumb() {
  const pathname = usePathname();
  const current = findMenuByPath(pathname);
  const parent = dashboardMenus.find((menu) => menu.children?.some((child) => child.href === pathname));

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
