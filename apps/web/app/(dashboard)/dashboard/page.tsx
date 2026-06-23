import { ArrowRight, Bot, ClipboardCheck, ShieldCheck, Wrench } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { DashboardMetrics } from "./DashboardMetrics";

const quickEntries: Array<{ title: string; description: string; href: Route; icon: typeof ClipboardCheck }> = [
  { title: "现场工作台", description: "面向物业、安全、运营负责人，快速处理巡检、工单与现场上报。", href: "/operations/terminal", icon: ClipboardCheck },
  { title: "工单列表", description: "业主诉求、维修清理、设备告警转派的统一入口。", href: "/workorders/list", icon: Wrench },
  { title: "安全看板", description: "查看巡检完成率、隐患闭环率、重大与超期风险。", href: "/safety/dashboard", icon: ShieldCheck },
  { title: "清洁机器人", description: "接入萤石清洁机器人，管理任务、控制与回调数据。", href: "/robots/cleaning", icon: Bot }
];

const workstreams = [
  "资产、招商、合同、财务形成一套经营主线",
  "巡检、隐患、应急、作业许可形成安全闭环",
  "IoT、视频、机器人、能耗通过统一动作执行器联动",
  "面向手机端现场高频作业，逐步迁移为任务式终端体验"
];

export default function DashboardPage() {
  return (
    <main className="page-container ds-page dashboard-home">
      <section className="ds-hero ds-hero-production dashboard-hero-panel">
        <div className="ds-hero-copy dashboard-hero-copy">
          <span className="ds-eyebrow dashboard-eyebrow">Smart Park Operation Cloud</span>
          <h1>金湖科创产业园数字运营中枢</h1>
          <p>围绕资产经营、现场服务、安全闭环、设备态势和能源管理，构建统一、可追踪、可联动的园区运营工作台。</p>
          <div className="ds-action-bar dashboard-hero-actions">
            <Link className="ds-button ds-button-primary" href="/operations/terminal">
              进入现场工作台
              <ArrowRight size={16} />
            </Link>
            <Link className="ds-button ds-button-secondary" href="/assets/units">
              查看房源台账
            </Link>
          </div>
        </div>
        <div className="dashboard-hero-card" aria-label="运营闭环">
          <strong>今日运营关注</strong>
          <span>高频作业入口已优先面向手机端优化，巡检、工单、隐患、设备处置将统一为现场终端体验。</span>
        </div>
      </section>

      <DashboardMetrics />

      <section className="dashboard-main-grid">
        <div className="page-content ds-panel dashboard-entry-panel">
          <div className="content-header-row">
            <div>
              <span className="section-eyebrow">Quick Entry</span>
              <h2>高频业务入口</h2>
            </div>
          </div>
          <div className="ds-command-grid dashboard-entry-grid">
            {quickEntries.map((entry) => {
              const Icon = entry.icon;
              return (
                <Link className="ds-command-card dashboard-entry-card" href={entry.href} key={entry.href}>
                  <span className="ds-command-icon dashboard-entry-icon"><Icon size={18} /></span>
                  <div className="ds-command-copy dashboard-entry-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.description}</small>
                  </div>
                  <em>打开 <ArrowRight size={14} /></em>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="page-content ds-panel dashboard-workstream-panel">
          <span className="section-eyebrow">Design Baseline</span>
          <h2>当前体验升级原则</h2>
          <ul>
            {workstreams.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}
