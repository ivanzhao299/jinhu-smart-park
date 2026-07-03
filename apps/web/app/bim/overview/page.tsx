import { Card } from "@jinhu/ui";
import { ArrowRight, Building2, Database, Map, Radar, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "../../module-overview.module.css";

const featureCards = [
  {
    title: "空间资产映射",
    description: "把园区、楼栋、楼层和房源结构作为数字孪生的骨架，先从空间主数据开始建立统一视图。",
    tag: "资产底座",
    icon: Building2,
    points: ["园区 / 楼栋 / 楼层 / 房源映射", "后续接 BIM 模型与定位", "支撑资产、招商与工程联动"],
    href: "/assets/parks",
    hrefLabel: "查看空间资产"
  },
  {
    title: "设备与态势融合",
    description: "预留 IoT、视频安防和能耗数据接入位置，让孪生页面能承接后续设备运行态和告警态势。",
    tag: "数据融合",
    icon: Radar,
    points: ["IoT 设备与告警", "视频点位与事件", "能耗表计与异常信号"],
    href: "/iot/dashboard",
    hrefLabel: "查看 IoT 看板"
  },
  {
    title: "工程与安全定位",
    description: "为工程巡检、整改任务和安全隐患提供空间落点，后续能直接把问题挂到楼栋、楼层和点位。",
    tag: "业务落点",
    icon: ShieldCheck,
    points: ["工程巡检空间挂载", "隐患定位与复查", "后续支持现场可视化排障"],
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
              先把数字孪生作为一个正式模块接回管理员导航，并为后续 BIM 模型、空间映射、设备数据和工程安全定位预留统一入口。
              现在先提供产品级控制面，避免模块权限已经有了、前端却完全看不到。
            </p>
            <div className={styles.chipRow}>
              <span className={styles.chip}>管理员已可见</span>
              <span className={styles.chip}>BIM 总览入口已接通</span>
              <span className={styles.chip}>后续继续补三维模型和实时映射</span>
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
            <span className={styles.summaryHint}>资产结构是孪生基础，后续三维模型和设备映射都建立在统一空间主数据上。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>后续演进</span>
            <strong className={styles.summaryValue}>可视联动</strong>
            <span className={styles.summaryHint}>下一步继续接 BIM 模型浏览、点位定位和运行态联动。</span>
          </article>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>孪生接入面</h2>
            <p>先把空间、设备和现场业务的连接关系组织清楚，后续再逐层补真实三维与实时渲染能力。</p>
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
