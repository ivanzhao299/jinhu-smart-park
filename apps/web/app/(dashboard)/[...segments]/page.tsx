"use client";

import { Card } from "@jinhu/ui";
import Link from "next/link";
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
      <Card>
        <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <span className="panel-tag">模块未开放</span>
            <h1 className="panel-title">{menu?.label ?? "功能暂未开放"}</h1>
            <p className="muted-text">
              当前页面还没有接入正式业务能力。请先从已上线模块继续处理，避免停留在空白入口。
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link className="primary-button" href="/">
              返回首页
            </Link>
            <Link className="secondary-button" href="/workflow/inbox">
              去流程收件箱
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
