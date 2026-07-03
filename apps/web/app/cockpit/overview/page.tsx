import { Card } from "@jinhu/ui";
import { ArrowRight, BarChart3, Building2, ClipboardList, LayoutDashboard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "../../module-overview.module.css";

const featureCards = [
  {
    title: "经营总览",
    description: "把资产、招商、工单、安全和工程的关键态势收拢到一个入口，先给管理层一个可落地的经营总控台。",
    tag: "总控视角",
    icon: LayoutDashboard,
    points: ["聚焦跨模块经营信号", "统一跳转核心业务面板", "为后续经营指标沉淀留接口"],
    href: "/dashboard",
    hrefLabel: "进入首页总览"
  },
  {
    title: "资产与招商联动",
    description: "从资产台账、房源状态到招商漏斗和合同账单，快速看到园区经营面的基础盘。",
    tag: "经营基本盘",
    icon: Building2,
    points: ["房源状态看板", "租户企业档案与合同", "账单、收款、账龄协同"],
    href: "/assets/statistics",
    hrefLabel: "查看资产统计"
  },
  {
    title: "安全与工程闭环",
    description: "把工单、安全巡检和工程交付链联到经营层，让异常、整改和交付进度都能被管理层看见。",
    tag: "运行质量",
    icon: ShieldCheck,
    points: ["安全看板与隐患整改", "工程项目交付运行时", "工单执行态与超时态势"],
    href: "/engineering/dashboard",
    hrefLabel: "查看工程看板"
  }
] as const;

export default function CockpitOverviewPage() {
  return (
    <main className={`content ds-page ${styles.page}`}>
      <Card className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <BarChart3 size={14} />
              Cockpit Runtime
            </span>
            <h1>经营驾驶舱</h1>
            <p className={styles.heroLead}>
              给管理员和管理层一个统一的经营入口。先把园区首页、资产、招商、安全、工单和工程看板串起来，
              让“看全局”和“跳到现场动作”能在一个模块里完成。
            </p>
            <div className={styles.chipRow}>
              <span className={styles.chip}>管理员已可见</span>
              <span className={styles.chip}>生产端已接正式导航</span>
              <span className={styles.chip}>后续继续沉淀跨模块指标</span>
            </div>
          </div>
          <div className={styles.heroActions}>
            <Link className="primary-button" href="/dashboard">进入首页总览</Link>
            <Link className="secondary-button" href="/assets/statistics">资产统计</Link>
            <Link className="secondary-button" href="/leasing/funnel">招商漏斗</Link>
            <Link className="secondary-button" href="/engineering/dashboard">工程看板</Link>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>当前定位</span>
            <strong className={styles.summaryValue}>经营总控</strong>
            <span className={styles.summaryHint}>把已有业务模块连接成管理层可直接使用的入口，而不是再藏在分散菜单里。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>接入范围</span>
            <strong className={styles.summaryValue}>多模块</strong>
            <span className={styles.summaryHint}>首页总览、资产、招商、安全、工单、工程都可从这里继续进入。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>下一步</span>
            <strong className={styles.summaryValue}>指标沉淀</strong>
            <span className={styles.summaryHint}>后续把经营驾驶舱升级成真正的跨模块 KPI、预警和日报中心。</span>
          </article>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>驾驶舱入口</h2>
            <p>先把管理员真实需要频繁切换的能力组织成更清楚的控制面，避免“有模块但不好进”。</p>
          </div>
          <span className={styles.sectionBadge}>
            <ClipboardList size={14} />
            Cross Module Control
          </span>
        </div>
        <div className={styles.featureGrid}>
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <article className={styles.featureCard} key={card.title}>
                <div className={styles.featureTop}>
                  <span className={styles.featureIcon}>
                    <Icon size={20} />
                  </span>
                  <span className={styles.featureTag}>{card.tag}</span>
                </div>
                <div className={styles.featureBody}>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
                <ul className={styles.featureList}>
                  {card.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <Link className={styles.featureLink} href={card.href}>
                  {card.hrefLabel}
                  <ArrowRight size={16} />
                </Link>
              </article>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
