import { Card, StatusPill } from "@jinhu/ui";
import { Building2, ClipboardCheck, FileCheck2, HardHat, ListChecks, ShieldCheck } from "lucide-react";

const subRuntimes = [
  { code: "EPDR-P1", name: "工程项目中心", icon: Building2 },
  { code: "EPDR-P2", name: "工程计划管理", icon: ListChecks },
  { code: "EPDR-P3", name: "施工日报管理", icon: HardHat },
  { code: "EPDR-P4", name: "现场巡检管理", icon: ClipboardCheck },
  { code: "EPDR-P5", name: "整改闭环管理", icon: ShieldCheck },
  { code: "EPDR-P6", name: "工程验收管理", icon: FileCheck2 }
];

export default function EngineeringRuntimePage() {
  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>工程项目交付运行时</strong>
          <span>Engineering Project Delivery Runtime · Phase 1 MVP 骨架</span>
        </div>
        <div className="page-actions">
          <StatusPill variant="warning">SKELETON</StatusPill>
        </div>
      </header>

      <Card>
        <div className="empty-state">
          <strong>Runtime 骨架已就绪</strong>
          <span>当前页面为 Task 001 占位 Console。后续 Task 005 起接入项目列表、状态流转、日报、巡检、整改、验收和看板。</span>
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
              </div>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
