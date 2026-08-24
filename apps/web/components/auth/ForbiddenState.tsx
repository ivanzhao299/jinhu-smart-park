import Link from "next/link";

interface ForbiddenStateProps {
  reason?: "permission" | "module";
  variant?: "page" | "inline";
  message?: string;
}

export function ForbiddenState({
  reason = "permission",
  variant = "inline",
  message
}: ForbiddenStateProps) {
  const resolvedMessage = message ?? (reason === "module"
    ? "模块未授权，请联系管理员开通当前模块。"
    : "当前账号没有访问该页面的权限。");

  if (variant === "page") {
    return (
      <main className="login-page">
        <section className="login-panel">
          <h1>403</h1>
          <p>{resolvedMessage}</p>
          <Link className="primary-button" href="/dashboard">返回首页</Link>
        </section>
      </main>
    );
  }

  return <div className="empty-state" role="status">403，{resolvedMessage}</div>;
}
