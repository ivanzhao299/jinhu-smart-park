import { Card } from "@jinhu/ui";
import { ArrowRight, Building2, Database, Map, Radar, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "../../module-overview.module.css";

const featureCards = [
  {
    title: "空间资产映射",
    description: "把园区、楼栋、楼层和房源结构作为数字孪生的骨架，用统一空间视图承接资产、招商和工程业务。",
    tag: "资产底座",
    icon: Building2,
    points: ["园区 / 楼栋 / 楼层 / 房源映射", "空间主数据统一编号", "支撑资产、招商与工程联动"],
    href: "/assets/parks",
    hrefLabel: "查看空间资产"
  },
  {
    title: "设备与态势融合",
    description: "把 IoT、视频安防和能耗入口整理到同一空间视角，方便统一查看设备运行和告警态势。",
    tag: "数据融合",
    icon: Radar,
    points: ["IoT 设备与告警", "视频点位与事件", "能耗表计与异常信号"],
    href: "/iot/dashboard",
    hrefLabel: "查看 IoT 看板"
  },
  {
    title: "工程与安全定位",
    description: "把工程巡检、整改任务和安全隐患关联到空间位置，方便从楼栋、楼层和点位追踪问题。",
    tag: "业务落点",
    icon: ShieldCheck,
    points: ["工程巡检空间挂载", "隐患定位与复查", "现场问题统一落点"],
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
              Digital Twin Runtime
            </span>
            <h1>数字孪生</h1>
            <p className={styles.heroLead}>
              把数字孪生作为正式模块接回管理员导航，先围绕空间、设备和现场业务提供统一入口，
              避免模块权限已经有了、前端却完全看不到。
            </p>
            <div className={styles.chipRow}>
              <span className={styles.chip}>管理员已可见</span>
              <span className={styles.chip}>空间与设备入口已接通</span>
              <span className={styles.chip}>工程 / 安全 / IoT 可统一进入</span>
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
            <span className={styles.summaryLabel}>当前阶段</span>
            <strong className={styles.summaryValue}>总览接通</strong>
            <span className={styles.summaryHint}>先把模块入口、业务挂点和导航结构补成完整产品，而不是让模块继续消失。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>核心底座</span>
            <strong className={styles.summaryValue}>空间模型</strong>
            <span className={styles.summaryHint}>资产结构是孪生基础，设备、工程和安全入口都建立在统一空间主数据上。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>当前价值</span>
            <strong className={styles.summaryValue}>统一落点</strong>
            <span className={styles.summaryHint}>让空间、设备和现场业务先在同一条产品入口里汇合，方便统一查看与跳转。</span>
          </article>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>孪生接入面</h2>
            <p>当前先把空间、设备和现场业务的连接关系组织清楚，方便从统一入口查看与联动。</p>
          </div>
          <span className={styles.sectionBadge}>
            <Map size={14} />
            Spatial Runtime
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
