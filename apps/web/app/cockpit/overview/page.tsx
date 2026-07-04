import { Card } from "@jinhu/ui";
import { ArrowRight, BarChart3, Building2, ClipboardList, LayoutDashboard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "../../module-overview.module.css";

const featureCards = [
  {
    title: "总览首页",
    description: "先看跨模块核心指标，再进入细分业务。",
    tag: "总览",
    icon: LayoutDashboard,
    points: ["核心指标", "异常提醒", "工作入口"],
    href: "/dashboard",
    hrefLabel: "进入首页总览"
  },
  {
    title: "资产与招商",
    description: "房源、租户、合同、账单放到一条经营链上。",
    tag: "经营",
    icon: Building2,
    points: ["房源状态", "合同账单", "招商漏斗"],
    href: "/assets/statistics",
    hrefLabel: "查看资产统计"
  },
  {
    title: "运行质量",
    description: "安全、工单和工程交付进度集中查看。",
    tag: "运行",
    icon: ShieldCheck,
    points: ["安全整改", "工程交付", "工单超时"],
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
              Control Board
            </span>
            <h1>经营驾驶舱</h1>
            <p className={styles.heroLead}>
              先看全局，再一跳进入资产、招商、安全、工单和工程。
            </p>
            <div className={styles.chipRow}>
              <span className={styles.chip}>总览</span>
              <span className={styles.chip}>经营</span>
              <span className={styles.chip}>运行</span>
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
            <span className={styles.summaryLabel}>看什么</span>
            <strong className={styles.summaryValue}>先看全局</strong>
            <span className={styles.summaryHint}>把关键指标和入口先收在一页里。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>覆盖范围</span>
            <strong className={styles.summaryValue}>多模块</strong>
            <span className={styles.summaryHint}>资产、招商、安全、工单、工程已连起来。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>使用方式</span>
            <strong className={styles.summaryValue}>直接进入</strong>
            <span className={styles.summaryHint}>从总览跳到具体业务，不再走说明页。</span>
          </article>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>常用入口</h2>
            <p>把最常用的入口压缩到一屏里。</p>
          </div>
          <span className={styles.sectionBadge}>
            <ClipboardList size={14} />
            Control
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
