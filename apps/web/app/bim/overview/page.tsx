import { Card } from "@jinhu/ui";
import { ArrowRight, Building2, Database, Map, Radar, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "../../module-overview.module.css";

const featureCards = [
  {
    title: "空间台账",
    description: "园区、楼栋、楼层和房源主数据统一查看。",
    tag: "空间",
    icon: Building2,
    points: ["园区结构", "楼栋楼层", "房源空间"],
    href: "/assets/parks",
    hrefLabel: "查看空间资产"
  },
  {
    title: "设备态势",
    description: "IoT、安防和能耗统一进入设备侧工作面。",
    tag: "设备",
    icon: Radar,
    points: ["IoT 告警", "视频点位", "能耗异常"],
    href: "/iot/dashboard",
    hrefLabel: "查看 IoT 看板"
  },
  {
    title: "现场定位",
    description: "工程巡检、安全隐患和整改都能回到具体空间。",
    tag: "现场",
    icon: ShieldCheck,
    points: ["巡检落点", "隐患定位", "整改复查"],
    href: "/safety/dashboard",
    hrefLabel: "查看安全看板"
  }
] as const;

export default function BimOverviewPage() {
  return (
    <main className={`content ds-page ${styles.page}`}>
      <Card className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <Database size={14} />
              Spatial Runtime
            </span>
            <h1>空间与孪生入口</h1>
            <p className={styles.heroLead}>
              先从空间、设备和现场三个入口看园区，不做空壳总览。
            </p>
            <div className={styles.chipRow}>
              <span className={styles.chip}>空间</span>
              <span className={styles.chip}>设备</span>
              <span className={styles.chip}>现场</span>
            </div>
          </div>
          <div className={styles.heroActions}>
            <Link className="primary-button" href="/assets/parks">空间资产</Link>
            <Link className="secondary-button" href="/iot/dashboard">IoT 看板</Link>
            <Link className="secondary-button" href="/admin/video-security/dashboard">安防指挥中心</Link>
            <Link className="secondary-button" href="/engineering/dashboard">工程看板</Link>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>当前重点</span>
            <strong className={styles.summaryValue}>看空间</strong>
            <span className={styles.summaryHint}>先用空间台账把业务入口串起来。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>核心底座</span>
            <strong className={styles.summaryValue}>主数据</strong>
            <span className={styles.summaryHint}>楼栋、楼层、房源先统一，后面联设备和现场。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>使用方式</span>
            <strong className={styles.summaryValue}>从点位切</strong>
            <span className={styles.summaryHint}>从空间切到设备、安防和现场处理。</span>
          </article>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>常用入口</h2>
            <p>围绕空间与点位来进业务。</p>
          </div>
          <span className={styles.sectionBadge}>
            <Map size={14} />
            Spatial
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
