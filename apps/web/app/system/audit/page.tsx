"use client";
import { Card } from "@jinhu/ui";

import Link from "next/link";

export default function AuditPage() {
  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>审计日志</strong>
          <span>查询操作审计与登录日志，默认限定在当前登录租户和园区范围内</span>
        </div>
      </header>
      <Card >
        <div className="task-list">
          <Link className="task-item" href="/system/audit/op-logs">操作审计</Link>
          <Link className="task-item" href="/system/audit/login-logs">登录日志</Link>
        </div>
      </Card>
    </main>
  );
}
