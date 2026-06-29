import { Card } from "@jinhu/ui";
import { ArrowRight, BarChart3, Building2, ClipboardCheck, FileCheck2, HardHat, Layers3, ListChecks, ShieldCheck, Sparkles } from "lucide-react";
import type { ComponentType } from "react";
import type { Route } from "next";
import Link from "next/link";
import styles from "./engineering-runtime.module.css";

type SubRuntime = {
  code: string;
  name: string;
  description: string;
  meta: string;
  href?: Route;
  status: string;
  icon: ComponentType<{ size?: number }>;
};

const subRuntimes: SubRuntime[] = [
  {
    code: "EPDR-P1",
    name: "工程项目中心",
    description: "统一管理立项、负责人、预算、状态机与后续计划挂接，是整个工程链路的主索引。",
    meta: "立项 / 预算 / 负责人 / 生命周期",
    href: "/engineering/projects",
    status: "READY",
    icon: Building2
  },
  {
    code: "EPDR-P2",
    name: "工程计划管理",
    description: "把项目拆解成阶段、周计划和专项节点，给日报、巡检和验收提供执行基线。",
    meta: "总计划 / 阶段计划 / 进度基线",
    href: "/engineering/plans",
    status: "READY",
    icon: ListChecks
  },
  {
    code: "EPDR-P3",
    name: "施工日报管理",
    description: "沉淀每天的施工内容、投入资源、问题和次日计划，为现场追踪和结算留痕。",
    meta: "日报 / 人材机 / 当日进度",
    href: "/engineering/daily-reports",
    status: "READY",
    icon: HardHat
  },
  {
    code: "EPDR-P4",
    name: "现场巡检管理",
    description: "面向工程现场记录质量、安全、进度和隐患检查，问题可直接进入整改闭环。",
    meta: "巡检 / 问题 / 隐患发现",
    href: "/engineering/inspections",
    status: "READY",
    icon: ClipboardCheck
  },
  {
    code: "EPDR-P5",
    name: "整改闭环管理",
    description: "跟踪责任人、期限、复查和通过结果，把现场问题真正从发现推进到关闭。",
    meta: "整改 / 责任人 / 复查关闭",
    href: "/engineering/rectifications",
    status: "READY",
    icon: ShieldCheck
  },
  {
    code: "EPDR-P6",
    name: "工程验收管理",
    description: "承接阶段验收、专项验收和竣工验收，形成交付前的关键审批与留档节点。",
    meta: "验收 / 整改回流 / 结论留档",
    href: "/engineering/acceptances",
    status: "READY",
    icon: FileCheck2
  },
  {
    code: "EPDR-D1",
    name: "工程 Dashboard",
    description: "汇总项目、计划、日报、巡检、整改和验收的闭环态势，给管理层一个统一视图。",
    meta: "分布 / 排名 / 闭环总览",
    href: "/engineering/dashboard",
    status: "READY",
    icon: BarChart3
  }
] as const;

export default function EngineeringRuntimePage() {
  return (
    <main className={`content ds-page ${styles.page}`}>
      <Card className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <Sparkles size={14} />
              EPDR Runtime
            </span>
            <h1>工程项目交付运行时</h1>
            <p className={styles.heroLead}>
              把工程项目从立项、计划、施工日报、现场巡检、整改闭环到工程验收串成一条真实可追踪的业务链，
              让项目经理、工程部和管理层都在同一套运行时里协作。
            </p>
            <div className={styles.heroMeta}>
              <span className={styles.metaChip}>Phase 1 已接入真实 API</span>
              <span className={styles.metaChip}>7 个子运行时</span>
              <span className={styles.metaChip}>后续接权限、附件、DataScope</span>
            </div>
          </div>
          <div className={styles.heroActions}>
            <Link className="primary-button" href="/engineering/projects">进入工程项目</Link>
            <Link className="secondary-button" href="/engineering/plans">进入工程计划</Link>
            <Link className="secondary-button" href="/engineering/daily-reports">施工日报</Link>
            <Link className="secondary-button" href="/engineering/dashboard">工程看板</Link>
          </div>
        </div>

        <div className={styles.heroSummaryGrid}>
          <div className={styles.summaryTile}>
            <span>当前阶段</span>
            <strong>Phase 1</strong>
            <small>先把项目、计划、日报、巡检、整改、验收和看板闭环跑通。</small>
          </div>
          <div className={styles.summaryTile}>
            <span>运行时数量</span>
            <strong>7</strong>
            <small>覆盖项目主数据、执行过程、验收结论和管理看板。</small>
          </div>
          <div className={styles.summaryTile}>
            <span>接入状态</span>
            <strong>READY</strong>
            <small>入口和 API 已接通，接下来重点打磨权限、附件和真实业务数据。</small>
          </div>
          <div className={styles.summaryTile}>
            <span>下一步重点</span>
            <strong>加固</strong>
            <small>把权限种子、数据范围、附件联动和跨项目挂接再做厚一层。</small>
          </div>
        </div>
      </Card>

      <Card className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>闭环总控入口</h2>
            <p>每个子运行时都不是孤立页面，而是工程交付链条中的一段。这里给你一个能快速切换的总入口。</p>
          </div>
          <span className={styles.sectionBadge}>
            <Layers3 size={14} />
            EPDR Control Surface
          </span>
        </div>
        <div className={styles.moduleGrid}>
          {subRuntimes.map((item) => {
            const Icon = item.icon;
            return (
              <article className={styles.moduleCard} key={item.code}>
                <div className={styles.moduleCardHeader}>
                  <span className={styles.moduleIcon}>
                    <Icon size={22} />
                  </span>
                  <span className={styles.moduleStatus}>{item.status}</span>
                </div>
                <div className={styles.moduleBody}>
                  <span className={styles.moduleCode}>{item.code}</span>
                  <h3 className={styles.moduleName}>{item.name}</h3>
                  <p className={styles.moduleDescription}>{item.description}</p>
                </div>
                <div className={styles.moduleFoot}>
                  <span className={styles.moduleMeta}>{item.meta}</span>
                  {item.href ? (
                    <Link className={styles.moduleLink} href={item.href}>
                      进入
                      <ArrowRight size={15} />
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
