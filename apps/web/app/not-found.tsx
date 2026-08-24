import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="ds-page">
      <section className="ds-panel">
        <span className="panel-tag">页面未找到</span>
        <h1 className="panel-title">404</h1>
        <p className="muted-text">这个地址不存在，可能已下线或输入有误。</p>
        <Link className="primary-button" href="/dashboard">返回首页总览</Link>
      </section>
    </main>
  );
}
