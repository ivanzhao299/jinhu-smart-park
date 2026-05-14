import { findMenuByPath } from "../../../lib/menu";

interface PlaceholderPageProps {
  params: Promise<{
    segments: string[];
  }>;
}

export default async function PlaceholderPage({ params }: PlaceholderPageProps) {
  const { segments } = await params;
  const pathname = `/${segments.join("/")}`;
  const menu = findMenuByPath(pathname);
  return (
    <main className="content">
      <section className="work-panel">
        <h1 className="panel-title">{menu?.label ?? "功能建设中"}</h1>
        <p>该页面为预留菜单入口，后续 sprint 将接入正式业务功能。</p>
      </section>
    </main>
  );
}
