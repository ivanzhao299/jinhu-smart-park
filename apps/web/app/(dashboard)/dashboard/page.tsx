import { Activity, ArrowRight, Bot, Building2, ClipboardCheck, ShieldCheck, Wrench, Zap } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

const kpis = [
  { label: "运营资产", value: "空间台账", meta: "园区 / 楼栋 / 房源统一管理", icon: Building2 },
  { label: "现场任务", value: "巡检闭环", meta: "打卡、拍照、隐患联动", icon: ClipboardCheck },
  { label: "设备态势", value: "IoT 在线", meta: "设备、告警、规则联动", icon: Activity },
  { label: "能耗管理", value: "计量账期", meta: "读数、分摊、调整红冲", icon: Zap }
];

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
    <main className="page-container dashboard-home">
      <section className="dashboard-hero-panel">
        <div className="dashboard-hero-copy">
          <span className="dashboard-eyebrow">Smart Park Operation Cloud</span>
          <h1>金湖科创产业园数字运营中枢</h1>
          <p>围绕资产经营、现场服务、安全闭环、设备态势和能源管理，构建统一、可追踪、可联动的园区运营工作台。</p>
          <div className="dashboard-hero-actions">
            <Link className="primary-button" href="/operations/terminal">
              进入现场工作台
              <ArrowRight size={16} />
            </Link>
            <Link className="secondary-button" href="/assets/units">
              查看房源台账
            </Link>
          </div>
        </div>
        <div className="dashboard-hero-card" aria-label="运营闭环">
          <strong>今日运营关注</strong>
          <span>高频作业入口已优先面向手机端优化，巡检、工单、隐患、设备处置将统一为现场终端体验。</span>
        </div>
      </section>

      <section className="dashboard-kpi-grid" aria-label="核心能力">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <article className="dashboard-kpi-card" key={item.label}>
              <span className="dashboard-kpi-icon"><Icon size={20} /></span>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.meta}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dashboard-main-grid">
        <div className="page-content dashboard-entry-panel">
          <div className="content-header-row">
            <div>
              <span className="section-eyebrow">Quick Entry</span>
              <h2>高频业务入口</h2>
            </div>
          </div>
          <div className="dashboard-entry-grid">
            {quickEntries.map((entry) => {
              const Icon = entry.icon;
              return (
                <Link className="dashboard-entry-card" href={entry.href} key={entry.href}>
                  <span><Icon size={18} /></span>
                  <strong>{entry.title}</strong>
                  <p>{entry.description}</p>
                  <em>打开 <ArrowRight size={14} /></em>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="page-content dashboard-workstream-panel">
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
