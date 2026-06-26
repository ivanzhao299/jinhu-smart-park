import { Card, StatusPill } from "@jinhu/ui";
import { Building2, ClipboardCheck, FileCheck2, HardHat, ListChecks, ShieldCheck } from "lucide-react";
import Link from "next/link";

const subRuntimes = [
  { code: "EPDR-P1", name: "工程项目中心", href: "/engineering/projects", status: "READY", icon: Building2 },
  { code: "EPDR-P2", name: "工程计划管理", href: "/engineering/plans", status: "READY", icon: ListChecks },
  { code: "EPDR-P3", name: "施工日报管理", href: "/engineering/daily-reports", status: "READY", icon: HardHat },
  { code: "EPDR-P4", name: "现场巡检管理", href: "/engineering/inspections", status: "READY", icon: ClipboardCheck },
  { code: "EPDR-P5", name: "整改闭环管理", href: null, status: "NEXT", icon: ShieldCheck },
  { code: "EPDR-P6", name: "工程验收管理", href: null, status: "NEXT", icon: FileCheck2 }
] as const;

export default function EngineeringRuntimePage() {
  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>工程项目交付运行时</strong>
          <span>Engineering Project Delivery Runtime · Phase 1 Project / Planning / Daily Report / Inspection 已接入</span>
        </div>
        <div className="page-actions">
          <StatusPill variant="primary">EPDR PHASE 1</StatusPill>
          <Link className="primary-button" href="/engineering/projects">进入工程项目</Link>
          <Link className="secondary-button" href="/engineering/plans">进入工程计划</Link>
          <Link className="secondary-button" href="/engineering/daily-reports">进入施工日报</Link>
          <Link className="secondary-button" href="/engineering/inspections">进入工程巡检</Link>
        </div>
      </header>

      <Card>
        <div className="empty-state">
          <strong>工程交付闭环正在成型</strong>
          <span>工程项目中心、工程计划管理、施工日报和工程巡检已接入真实 API。后续任务继续进入整改和验收。</span>
        </div>
      </Card>

      <section className="dashboard-grid">
        {subRuntimes.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.code}>
              <div className="task-item">
                <span><Icon size={18} /> {item.code}</span>
                <strong>{item.name}</strong>
                {item.href ? <Link className="secondary-button" href={item.href}>进入</Link> : <StatusPill variant="muted">{item.status}</StatusPill>}
              </div>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
