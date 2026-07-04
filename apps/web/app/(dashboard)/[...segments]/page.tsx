"use client";

import { Card } from "@jinhu/ui";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { dashboardMenus, findMenuByPath, type MenuNode } from "../../../lib/menu";
import TenantsPage from "../../system/tenants/page";

type MenuLink = {
  label: string;
  href: Route;
};

export default function PlaceholderPage() {
  const pathname = usePathname();
  if (pathname === "/system/tenants") {
    return <TenantsPage />;
  }

  const menu = findMenuByPath(pathname);
  const relatedLinks = collectRelatedLinks(pathname, menu);

  return (
    <main className="content ds-page">
      <Card>
        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
            <span className="panel-tag">继续工作</span>
            <h1 className="panel-title">{menu?.label ?? "当前入口暂未独立成页"}</h1>
            <p className="muted-text">
              这个入口还没有单独做成完整页面，但同组业务已经可以继续处理。直接从下面这些正式入口进去，不会卡在空白页。
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14
            }}
          >
            {relatedLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "grid",
                  gap: 6,
                  minHeight: 96,
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: 18,
                  background: "var(--bg-card)",
                  textDecoration: "none",
                  color: "inherit"
                }}
              >
                <strong style={{ fontSize: 18, fontWeight: 800 }}>{item.label}</strong>
                <span className="muted-text">{item.href}</span>
              </Link>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link className="primary-button" href="/dashboard">
              返回首页总览
            </Link>
            <Link className="secondary-button" href="/workflow/inbox">
              去流程收件箱
            </Link>
            <Link className="secondary-button" href="/operations/terminal">
              去现场作业台
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}

function collectRelatedLinks(pathname: string, menu?: MenuNode): MenuLink[] {
  const primarySegment = pathname.split("/").filter(Boolean)[0];
  const links = new Map<string, MenuLink>();

  for (const group of dashboardMenus) {
    const children = group.children ?? [];
    const sameModule =
      menu?.module
        ? children.some((child) => child.module === menu.module)
        : children.some((child) => child.href?.startsWith(`/${primarySegment}`));

    if (!sameModule) continue;

    for (const child of children) {
      if (!child.href) continue;
      links.set(child.href, { label: child.label, href: child.href as Route });
    }
  }

  if (links.size === 0) {
    for (const href of ["/dashboard", "/workflow/inbox", "/operations/terminal", "/system/modules"]) {
      const item = findMenuByPath(href);
      if (item?.href) {
        links.set(item.href, { label: item.label, href: item.href as Route });
      }
    }
  }

  return Array.from(links.values()).slice(0, 8);
}
