import { Card } from "@jinhu/ui";
import { ArrowRight, BarChart3, Building2, ClipboardCheck, FileCheck2, HardHat, ListChecks, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import type { ComponentType } from "react";
import type { Route } from "next";
import Link from "next/link";
import styles from "./engineering-runtime.module.css";

type WorkbenchAction = {
  title: string;
  detail: string;
  href: Route;
};

type ModuleEntry = {
  name: string;
  description: string;
  primaryUse: string;
  status: string;
  href: Route;
  icon: ComponentType<{ size?: number }>;
};

const quickActions: WorkbenchAction[] = [
  {
    title: "手机终端",
    detail: "现场作业入口。",
    href: "/engineering/terminal"
  },
  {
    title: "新建项目",
    detail: "登记项目主档。",
    href: "/engineering/projects/new"
  },
  {
    title: "拆解计划",
    detail: "排阶段与节点。",
    href: "/engineering/plans"
  },
  {
    title: "记录日报",
    detail: "记录当天施工。",
    href: "/engineering/daily-reports"
  },
  {
    title: "查看看板",
    detail: "看推进与风险。",
    href: "/engineering/dashboard"
  }
];

const moduleEntries: ModuleEntry[] = [
  {
    name: "工程项目",
    description: "项目主档、负责人、预算、工期。",
    primaryUse: "立项入口",
    status: "可用",
    href: "/engineering/projects",
    icon: Building2
  },
  {
    name: "工程计划",
    description: "阶段计划、周计划、关键节点。",
    primaryUse: "计划排程",
    status: "可用",
    href: "/engineering/plans",
    icon: ListChecks
  },
  {
    name: "施工日报",
    description: "施工内容、资源投入、当日问题。",
    primaryUse: "现场记录",
    status: "可用",
    href: "/engineering/daily-reports",
    icon: HardHat
  },
  {
    name: "现场巡检",
    description: "质量、安全、进度、隐患检查。",
    primaryUse: "巡检发现",
    status: "可用",
    href: "/engineering/inspections",
    icon: ClipboardCheck
  },
  {
    name: "整改任务",
    description: "责任人、期限、复查、闭环跟踪。",
    primaryUse: "问题闭环",
    status: "可用",
    href: "/engineering/rectifications",
    icon: ShieldCheck
  },
  {
    name: "工程验收",
    description: "阶段验收、专项验收、竣工验收。",
    primaryUse: "验收收口",
    status: "可用",
    href: "/engineering/acceptances",
    icon: FileCheck2
  },
  {
    name: "工程看板",
    description: "推进、整改、日报、验收总览。",
    primaryUse: "管理总览",
    status: "可用",
    href: "/engineering/dashboard",
    icon: BarChart3
  },
  {
    name: "移动作业终端",
    description: "手机端办理日报、巡检、整改和验收。",
    primaryUse: "现场作业",
    status: "可用",
    href: "/engineering/terminal",
    icon: Smartphone
  }
];

export default function EngineeringRuntimePage() {
  return (
    <main className={`content ds-page ${styles.page}`}>
      <Card className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <Sparkles size={14} />
              工程总入口
            </span>
            <h1>工程交付工作台</h1>
            <p className={styles.heroLead}>面向项目经理、工程部和现场团队的统一入口。</p>
          </div>
          <div className={styles.heroActions}>
            <Link className="primary-button" href="/engineering/terminal">手机作业终端</Link>
            <Link className="secondary-button" href="/engineering/projects/new">新建工程项目</Link>
            <Link className="secondary-button" href="/engineering/projects">项目列表</Link>
            <Link className="secondary-button" href="/engineering/dashboard">工程看板</Link>
          </div>
        </div>

        <div className={styles.heroMeta}>
          <span className={styles.metaChip}>项目 / 计划 / 日报 / 巡检 / 整改 / 验收</span>
          <span className={styles.metaChip}>编号自动生成，主数据优先选择</span>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>今天先做什么</h2>
            <p>按当前工作直接进入。</p>
          </div>
        </div>
        <div className={styles.quickGrid}>
          {quickActions.map((item) => (
            <Link className={styles.quickCard} href={item.href} key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </Link>
          ))}
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>模块入口</h2>
            <p>分模块办理，同一条工程链路贯通。</p>
          </div>
        </div>
        <div className={styles.moduleGrid}>
          {moduleEntries.map((item) => {
            const Icon = item.icon;
            return (
              <article className={styles.moduleCard} key={item.name}>
                <div className={styles.moduleTop}>
                  <span className={styles.moduleIcon}>
                    <Icon size={20} />
                  </span>
                  <span className={styles.moduleStatus}>{item.status}</span>
                </div>
                <div className={styles.moduleBody}>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <small>{item.primaryUse}</small>
                </div>
                <Link className={styles.moduleLink} href={item.href}>
                  进入
                  <ArrowRight size={15} />
                </Link>
              </article>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
