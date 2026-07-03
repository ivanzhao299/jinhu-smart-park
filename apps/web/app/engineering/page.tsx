import { Card } from "@jinhu/ui";
import { ArrowRight, BarChart3, Building2, ClipboardCheck, FileCheck2, HardHat, ListChecks, ShieldCheck, Sparkles } from "lucide-react";
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
    title: "新建立项",
    detail: "先创建真实工程项目，把负责人、预算和工期立住。",
    href: "/engineering/projects/new"
  },
  {
    title: "拆解计划",
    detail: "为项目补阶段计划、周计划和关键节点。",
    href: "/engineering/plans"
  },
  {
    title: "录施工日报",
    detail: "把当天施工内容、人材机和进度及时沉淀下来。",
    href: "/engineering/daily-reports"
  },
  {
    title: "看工程态势",
    detail: "集中查看项目推进、整改压力和验收节奏。",
    href: "/engineering/dashboard"
  }
];

const moduleEntries: ModuleEntry[] = [
  {
    name: "工程项目",
    description: "管理立项、负责人、预算、工期和项目状态，是工程交付的总台账。",
    primaryUse: "先把项目建起来",
    status: "已接入",
    href: "/engineering/projects",
    icon: Building2
  },
  {
    name: "工程计划",
    description: "把项目拆成阶段计划、周计划和里程碑，形成执行基线。",
    primaryUse: "项目批准后立刻拆计划",
    status: "已接入",
    href: "/engineering/plans",
    icon: ListChecks
  },
  {
    name: "施工日报",
    description: "沉淀每天的施工内容、投入资源、问题和次日安排。",
    primaryUse: "现场每天要留痕",
    status: "已接入",
    href: "/engineering/daily-reports",
    icon: HardHat
  },
  {
    name: "现场巡检",
    description: "围绕质量、安全、进度和隐患做现场检查，问题可直接进入整改。",
    primaryUse: "工程部与监理常用",
    status: "已接入",
    href: "/engineering/inspections",
    icon: ClipboardCheck
  },
  {
    name: "整改任务",
    description: "跟踪整改责任人、期限、复查结果和闭环状态。",
    primaryUse: "发现问题后立即转入",
    status: "已接入",
    href: "/engineering/rectifications",
    icon: ShieldCheck
  },
  {
    name: "工程验收",
    description: "承接阶段验收、专项验收和竣工验收，形成交付结论。",
    primaryUse: "整改收口后进入验收",
    status: "已接入",
    href: "/engineering/acceptances",
    icon: FileCheck2
  },
  {
    name: "工程看板",
    description: "汇总项目推进、整改压力、日报活跃度和验收节奏。",
    primaryUse: "管理层与项目经理总览",
    status: "已接入",
    href: "/engineering/dashboard",
    icon: BarChart3
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
              工程管理
            </span>
            <h1>工程交付工作台</h1>
            <p className={styles.heroLead}>这里只做一件事：把工程项目从立项推进到计划、日报、巡检、整改和验收，直接落成一条能跑真实业务的工作链。</p>
          </div>
          <div className={styles.heroActions}>
            <Link className="primary-button" href="/engineering/projects/new">新建工程项目</Link>
            <Link className="secondary-button" href="/engineering/projects">项目列表</Link>
            <Link className="secondary-button" href="/engineering/dashboard">工程看板</Link>
          </div>
        </div>

        <div className={styles.heroMeta}>
          <span className={styles.metaChip}>项目 → 计划 → 日报 → 巡检 → 整改 → 验收 已接通</span>
          <span className={styles.metaChip}>当前重点：先跑进真实工程数据</span>
          <span className={styles.metaChip}>系统自动生成业务编号，主数据只选不手填 ID</span>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>今天先做什么</h2>
            <p>按工程团队的真实动作组织入口，不用记 Runtime 编号，不用看说明书。</p>
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
            <h2>业务入口</h2>
            <p>每个页面都直接对应工程团队的一个工位：建项目、拆计划、记过程、查问题、做验收。</p>
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
