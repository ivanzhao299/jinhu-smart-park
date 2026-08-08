import Link from "next/link";

export default function HomestayNotFound() {
  return (
    <main className="ds-page">
      <section className="ds-panel">
        <h1>民宿页面不存在</h1>
        <p>该地址不是已发布的民宿工作台，或详情地址无效。</p>
        <Link className="secondary-button" href="/homestay">返回民宿安全入口</Link>
      </section>
    </main>
  );
}
