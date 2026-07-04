import { Card } from "@jinhu/ui";
import type { Route } from "next";
import Link from "next/link";
import { Bot, Cable, Route as RouteIcon, ShieldCheck } from "lucide-react";

const entries: Array<{
  title: string;
  detail: string;
  href: Route;
  icon: typeof Bot;
}> = [
  {
    title: "清洁机器人",
    detail: "设备台账、在线状态、清扫任务和远程指令。",
    href: "/robots/cleaning",
    icon: Bot
  },
  {
    title: "平台接入",
    detail: "查看平台配置、设备同步和接入状态。",
    href: "/robots/cleaning",
    icon: Cable
  },
  {
    title: "作业轨迹",
    detail: "查看路径下发、区域清扫和执行结果。",
    href: "/robots/cleaning",
    icon: RouteIcon
  },
  {
    title: "异常处理",
    detail: "关注离线、故障和需要人工接管的设备。",
    href: "/robots/cleaning",
    icon: ShieldCheck
  }
];

export default function RobotsOverviewPage() {
  return (
    <main className="content ds-page">
      <Card style={{ display: "grid", gap: 24 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <span className="panel-tag">机器人运营</span>
          <h1 className="panel-title">机器人工作台</h1>
          <p className="muted-text" style={{ maxWidth: 720 }}>
            当前机器人模块以清洁机器人运行为主，统一处理设备接入、作业下发、路径执行和异常跟进。
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link className="primary-button" href="/robots/cleaning">
            进入机器人运营
          </Link>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14
          }}
        >
          {entries.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.title}
                href={item.href}
                style={{
                  display: "grid",
                  gap: 12,
                  minHeight: 160,
                  padding: 18,
                  borderRadius: 18,
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  textDecoration: "none",
                  color: "inherit"
                }}
              >
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg-subtle)"
                  }}
                >
                  <Icon size={20} />
                </span>
                <div style={{ display: "grid", gap: 8 }}>
                  <strong style={{ fontSize: 18, fontWeight: 800 }}>{item.title}</strong>
                  <span className="muted-text">{item.detail}</span>
                </div>
              </Link>
            );
          })}
        </section>
      </Card>
    </main>
  );
}
