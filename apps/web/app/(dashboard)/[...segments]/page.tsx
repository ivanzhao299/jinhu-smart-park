"use client";

import { Card } from "@jinhu/ui";
import { usePathname } from "next/navigation";
import { findMenuByPath } from "../../../lib/menu";
import TenantsPage from "../../system/tenants/page";

export default function PlaceholderPage() {
  const pathname = usePathname();
  if (pathname === "/system/tenants") {
    return <TenantsPage />;
  }
  const menu = findMenuByPath(pathname);
  return (
    <main className="content">
      <Card >
        <h1 className="panel-title">{menu?.label ?? "功能建设中"}</h1>
        <p>该页面为预留菜单入口，后续 sprint 将接入正式业务功能。</p>
      </Card>
    </main>
  );
}
