import { Card } from "@jinhu/ui";
import { ArrowRight, BrainCircuit, HardHat, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import styles from "../../module-overview.module.css";

const featureCards = [
  {
    title: "工单助手",
    description: "集中查看工单受理、分类和处理建议。",
    tag: "工单",
    icon: Wrench,
    points: ["受理与分派", "处理建议", "闭环摘要"],
    href: "/workorders",
    hrefLabel: "查看工单看板"
  },
  {
    title: "安全助手",
    description: "把巡检、隐患和应急放到一个入口里。",
    tag: "安全",
    icon: ShieldAlert,
    points: ["隐患摘要", "应急态势", "巡检跟进"],
    href: "/safety/dashboard",
    hrefLabel: "查看安全看板"
  },
  {
    title: "工程助手",
    description: "围绕项目、计划、日报和整改验收快速切换。",
    tag: "工程",
    icon: HardHat,
    points: ["进度摘要", "计划联读", "整改验收"],
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
              AI Workspace
            </span>
            <h1>AI 工作台</h1>
            <p className={styles.heroLead}>
              从一个入口切到工单、安全和工程，不用在菜单里来回找。
            </p>
            <div className={styles.chipRow}>
              <span className={styles.chip}>统一入口</span>
              <span className={styles.chip}>工单 / 安全 / 工程</span>
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
            <span className={styles.summaryLabel}>现在先做</span>
            <strong className={styles.summaryValue}>进业务</strong>
            <span className={styles.summaryHint}>直接进入高频链路，不停留在说明页。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>覆盖范围</span>
            <strong className={styles.summaryValue}>三条主链</strong>
            <span className={styles.summaryHint}>工单、安全、工程已经并到同一入口。</span>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>工作方式</span>
            <strong className={styles.summaryValue}>先行动</strong>
            <span className={styles.summaryHint}>先完成入口收口，再继续加 AI 交互。</span>
          </article>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>常用入口</h2>
            <p>先把最常用的三条链路收进来。</p>
          </div>
          <span className={styles.sectionBadge}>
            <Sparkles size={14} />
            Workspace
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
