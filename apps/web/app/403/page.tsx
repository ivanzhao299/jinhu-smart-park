import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <h1>403</h1>
        <p>当前账号没有访问该页面的权限。</p>
        <Link className="primary-button" href="/dashboard">返回首页</Link>
      </section>
    </main>
  );
}
