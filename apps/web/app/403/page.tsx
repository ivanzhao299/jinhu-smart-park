"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

export default function ForbiddenPage() {
  return (
    <Suspense fallback={<ForbiddenContent isModuleDenied={false} />}>
      <ForbiddenContentWithReason />
    </Suspense>
  );
}

function ForbiddenContentWithReason() {
  const searchParams = useSearchParams();
  const isModuleDenied = searchParams.get("reason") === "module";
  return <ForbiddenContent isModuleDenied={isModuleDenied} />;
}

function ForbiddenContent({ isModuleDenied }: { isModuleDenied: boolean }) {
  return (
    <main className="login-page">
      <section className="login-panel">
        <h1>403</h1>
        <p>{isModuleDenied ? "模块未授权，请联系管理员开通当前模块。" : "当前账号没有访问该页面的权限。"}</p>
        <Link className="primary-button" href="/dashboard">返回首页</Link>
      </section>
    </main>
  );
}
