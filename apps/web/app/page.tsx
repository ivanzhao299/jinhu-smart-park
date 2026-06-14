import { MetricCard, StatusPill, Card } from "@jinhu/ui";
import { ThemeToggle } from "../components/theme/ThemeToggle";
import { Gauge, LayoutDashboard, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";

const metrics = [
  { label: "入驻企业", value: "128" },
  { label: "在线设备", value: "2,436" },
  { label: "今日访客", value: "386" },
  { label: "待处理工单", value: "24" }
];

const tasks = [
  "A3 楼宇空调能耗异常复核",
  "访客闸机策略同步",
  "企业租户权限审批",
  "消防巡检日报归档"
];

export default function DashboardPage() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <img alt="金湖科创产业园" className="brand-mark-image" src="/brand/jinhupark-symbol.svg" />
          </span>
          <span>金湖科创产业园</span>
        </div>
        <ul className="nav-list">
          <li>
            <Link className="nav-link active" href="/">
              <LayoutDashboard size={18} />
              首页总览
            </Link>
          </li>
          <li>
            <Link className="nav-link" href="/login">
              <ShieldCheck size={18} />
              登录认证
            </Link>
          </li>
          <li>
            <span className="nav-link">
              <UsersRound size={18} />
              租户与企业
            </span>
          </li>
          <li>
            <span className="nav-link">
              <Gauge size={18} />
              运营监测
            </span>
          </li>
        </ul>
      </aside>
      <main className="main-panel">
        <header className="header">
          <div className="header-title">
            <strong>Dashboard 首页</strong>
            <span>tenant_id / park_id 隔离已在后端查询层预留</span>
          </div>
          <div className="page-actions">
            <ThemeToggle />
            <Link className="primary-button" href="/login">
              <ShieldCheck size={16} />
              进入登录
            </Link>
          </div>
        </header>
        <section className="content">
          <div className="dashboard-grid">
            {metrics.map((metric) => (
              <MetricCard title={metric.label} value={metric.value} key={metric.label} />
            ))}
          </div>
          <Card >
            <h2 className="panel-title">今日运营事项</h2>
            <ul className="task-list">
              {tasks.map((task) => (
                <li className="task-item" key={task}>
                  <span>{task}</span>
                  <StatusPill variant="muted">待跟进</StatusPill>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </main>
    </div>
  );
}
