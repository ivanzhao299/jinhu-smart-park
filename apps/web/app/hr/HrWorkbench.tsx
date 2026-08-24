"use client";

import {
  BadgeDollarSign,
  BriefcaseBusiness,
  ClipboardCheck,
  FileClock,
  Network,
  Target,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { PermissionGuard } from "../../components/auth/PermissionGuard";
import styles from "./hr-workbench.module.css";

const capabilityGroups = [
  {
    icon: UsersRound,
    title: "组织与员工档案",
    description: "统一组织、岗位、汇报关系和员工入转调离档案。",
    phase: "基础期"
  },
  {
    icon: Target,
    title: "战略与员工目标",
    description: "把集团目标逐级分解到部门、岗位与每一名员工。",
    phase: "执行期"
  },
  {
    icon: FileClock,
    title: "日报·周报·月报",
    description: "员工汇报关联目标，周期报告可从日常工作自动汇总。",
    phase: "执行期"
  },
  {
    icon: ClipboardCheck,
    title: "绩效与 360 考核",
    description: "覆盖自评、上级评价、多角色反馈、校准与结果确认。",
    phase: "绩效期"
  },
  {
    icon: BadgeDollarSign,
    title: "薪酬与工资核算",
    description: "管理薪资方案、月度工资批次、复核确认与个人工资条。",
    phase: "薪酬期"
  },
  {
    icon: Network,
    title: "人事流程审批",
    description: "承接入转调离、调薪、绩效和工资确认等受控流程。",
    phase: "贯穿全程"
  }
] as const;

const deliverySteps = [
  ["01", "人事基础", "组织岗位、员工档案与员工自助入口"],
  ["02", "目标执行", "战略分解、员工目标与日周月报"],
  ["03", "绩效闭环", "绩效周期、360 评价、校准与确认"],
  ["04", "薪资核算", "薪酬方案、工资批次、复核与工资条"]
] as const;

export function HrWorkbench() {
  const forbidden = (
    <main className="content ds-page">
      <section className="ds-panel">
        <h1>无权访问人力资源管理</h1>
        <p>当前账号缺少人力资源模块或工作台权限，请联系系统管理员授权。</p>
      </section>
    </main>
  );

  return (
    <PermissionGuard module="hr" permission="hr:dashboard" fallback={forbidden}>
      <main className={`content ds-page ${styles.page}`}>
        <section className={`ds-hero ${styles.hero}`}>
          <div className="ds-hero-copy">
            <span className="ds-eyebrow"><BriefcaseBusiness size={15} /> 金湖 Smart Park · 独立业务模块</span>
            <h1>人力资源管理</h1>
            <p>以员工为中心，把组织档案、战略目标、日常工作、绩效评价与薪酬核算连接成一条可追溯的管理闭环。</p>
          </div>
          <div className={styles.heroSummary} aria-label="模块建设原则">
            <strong>国内中型企业版</strong>
            <span>流程规范、权限清晰、分阶段上线</span>
            <div className={styles.heroLinks}>
              <Link className="ds-button ds-button-secondary" href="/hr/employees">员工档案</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/organization">组织岗位</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/goals">战略目标</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/work-reports">我的汇报</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/performance">绩效考核</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/feedback-360">360 评价</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/compensation">薪酬方案</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/payroll">工资核算</Link>
              <Link className="ds-button ds-button-secondary" href="/hr/approvals">人事审批</Link>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="hr-capabilities-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className="ds-eyebrow">规划能力</span>
              <h2 id="hr-capabilities-title">覆盖人力资源部，也服务每一名员工</h2>
            </div>
            <span className="status-pill">模块基础已接入</span>
          </header>
          <div className="ds-command-grid">
            {capabilityGroups.map(({ icon: Icon, title, description, phase }) => (
              <article className={`ds-command-card ${styles.capabilityCard}`} key={title}>
                <div className={styles.cardTop}>
                  <Icon size={22} />
                  <span className="status-pill">{phase}</span>
                </div>
                <strong>{title}</strong>
                <span>{description}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={`ds-panel ${styles.section}`} aria-labelledby="hr-roadmap-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className="ds-eyebrow">交付路线</span>
              <h2 id="hr-roadmap-title">先覆盖员工工作，再稳妥接入绩效与工资</h2>
            </div>
          </header>
          <div className={styles.steps}>
            {deliverySteps.map(([number, title, detail]) => (
              <article className={`ds-mobile-record ${styles.step}`} key={number}>
                <span className={styles.stepNumber}>{number}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </PermissionGuard>
  );
}
