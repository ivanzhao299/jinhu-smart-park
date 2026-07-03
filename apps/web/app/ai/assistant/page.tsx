import { Card } from "@jinhu/ui";
import { ArrowRight, BrainCircuit, HardHat, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import styles from "../../module-overview.module.css";

const featureCards = [
  {
    title: "工单协助",
    description: "把工单受理、分类和处理建议收拢到统一助手入口，方便客服和物业快速查看处理方向。",
    tag: "服务协助",
    icon: Wrench,
    points: ["工单分类与响应建议", "处理链路摘要", "为客服与物业提供辅助判断"],
    href: "/workorders",
    hrefLabel: "查看工单看板"
  },
  {
    title: "安全治理协助",
    description: "围绕安全巡检、隐患整改和应急事件整理统一助手入口，帮助管理员更快读懂风险和处理链路。",
    tag: "安全分析",
    icon: ShieldAlert,
    points: ["隐患整改摘要", "应急事件辅助阅读", "巡检任务态势辅助判断"],
    href: "/safety/dashboard",
    hrefLabel: "查看安全看板"
  },
  {
    title: "工程交付协助",
    description: "把工程项目、计划、施工日报和整改验收的摘要入口放进统一 AI 模块，方便工程人员集中查看重点信息。",
    tag: "工程协同",
    icon: HardHat,
    points: ["工程项目进展摘要", "计划与日报联读", "整改与验收节点辅助汇总"],
    href: "/engineering/dashboard",
    hrefLabel: "查看工程看板"
  }
] as const;

export default function AiAssistantPage() {
  return (
    <main className={`content ds-page ${styles.page}`}>
      <Card className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <BrainCircuit size={14} />
              AI Assistant
            </span>
            <h1>AI 助手</h1>
            <p className={styles.heroLead}>
              把 AI 助手作为正式产品模块接回生产导航。当前重点是给管理员一个真实可落地的统一入口，
              先承接工单、安全和工程三条高频业务链路。
            </p>
            <div className={styles.chipRow}>
              <span className={styles.chip}>管理员已可见</span>
              <span className={styles.chip}>AI 工作台入口已接通</span>
              <span className={styles.chip}>工单 / 安全 / 工程入口已联动</span>
            </div>
          </div>
          <div className={styles.heroActions}>
            <Link className="primary-button" href="/workorders">工单协助</Link>
            <Link className="secondary-button" href="/safety/dashboard">安全协助</Link>
            <Link className="secondary-button" href="/engineering/dashboard">工程协助</Link>
            <Link className="secondary-button" href="/dashboard">返回总览</Link>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>当前定位</span>
            <strong className={styles.summaryValue}>统一入口</strong>
            <span className={styles.summaryHint}>先把 AI 模块变成正式产品入口，而不是只存在于权限和数据库里。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>接入方向</span>
            <strong className={styles.summaryValue}>工单 / 安全 / 工程</strong>
            <span className={styles.summaryHint}>先覆盖最需要辅助判断和摘要的链路，让管理员能直接从一个入口切换到关键场景。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>当前重点</span>
            <strong className={styles.summaryValue}>快速协同</strong>
            <span className={styles.summaryHint}>先把真实可用的业务入口收拢起来，再继续打磨 AI 交互和辅助流程。</span>
          </article>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>AI 工作台能力方向</h2>
            <p>当前先把 AI 助手作为统一业务入口接入主导航，方便运营和管理角色直接进入关键场景。</p>
          </div>
          <span className={styles.sectionBadge}>
            <Sparkles size={14} />
            Assisted Operations
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
