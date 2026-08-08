import type {
  HomestayAvailabilityListResponse,
  HomestayBookingListItem,
  HomestayBookingListResponse,
  HomestayDashboardResponse,
  HomestayFinanceItem,
  HomestayFinanceListResponse,
  HomestayStayListItem,
  HomestayStayListResponse,
  HomestayTaskListResponse,
  HomestayTurnoverListItem,
  HomestayTurnoverListResponse,
  PropertyWorkbenchTaskItem
} from "@jinhu/shared";
import { StatusPill } from "@jinhu/ui";
import type { Route } from "next";
import Link from "next/link";
import {
  PropertyPanelSurface,
  PropertyResponsiveRecords,
  TaskPresentation
} from "../../../features/property-shared";
import styles from "./HomestayWorkbench.module.css";
import type { HomestayListSurface } from "./HomestayListClient";
import { homestayDetailHref, taskDetailHref } from "./homestay-workbench.logic";

export interface HomestayListReturnContext {
  route: HomestayListSurface;
  query: Readonly<Record<string, string | undefined>>;
}

export interface HomestayDashboardLink {
  href: string;
  label: string;
}

type RecordData =
  | HomestayDashboardResponse | HomestayTaskListResponse
  | HomestayAvailabilityListResponse | HomestayBookingListResponse
  | HomestayStayListResponse | HomestayTurnoverListResponse
  | HomestayFinanceListResponse;

function detailHref(path: string, context: HomestayListReturnContext): string {
  return homestayDetailHref(path, {
    route: context.route,
    query: context.query,
    scrollAnchor: "homestay-results"
  });
}

export function HomestayListRecords({
  dashboardLinks,
  data,
  returnContext,
  surface
}: {
  dashboardLinks: readonly HomestayDashboardLink[];
  data: RecordData | null;
  returnContext: HomestayListReturnContext;
  surface: HomestayListSurface;
}) {
  if (!data) return null;
  if (surface === "dashboard") return <Dashboard data={data as HomestayDashboardResponse} links={dashboardLinks} />;
  if (surface === "tasks") return <Tasks data={data as HomestayTaskListResponse} returnContext={returnContext} />;
  if (surface === "availability") return <Availability data={data as HomestayAvailabilityListResponse} />;
  if (surface === "bookings") return <Bookings data={data as HomestayBookingListResponse} returnContext={returnContext} />;
  if (surface === "stays") return <Stays data={data as HomestayStayListResponse} returnContext={returnContext} />;
  if (surface === "turnovers") return <Turnovers data={data as HomestayTurnoverListResponse} returnContext={returnContext} />;
  return <Finance data={data as HomestayFinanceListResponse} returnContext={returnContext} />;
}

function Dashboard({ data, links }: { data: HomestayDashboardResponse; links: readonly HomestayDashboardLink[] }) {
  const cards = [
    ["今日到店", data.arrivals], ["今日离店", data.departures],
    ["在住房间", data.occupied], ["可租房间", data.rentable_units],
    ["入住率", `${data.occupancy_rate}%`], ["待周转", data.pending_turnovers]
  ];
  return <><div className="ds-kpi-grid">{cards.map(([label, value]) => <article className="ds-kpi-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    {(data.average_daily_rate !== undefined || data.revenue !== undefined) ? <PropertyPanelSurface title="授权财务摘要"><p className={styles.finance}>平均房价：{data.average_daily_rate ?? "未授权"} · 营业收入：{data.revenue ?? "未授权"}</p></PropertyPanelSurface> : null}
    {data.pending_turnovers > 0 ? <aside className="ds-panel" role="status">当前有 {data.pending_turnovers} 项周转任务待处理。</aside> : null}
    {links.length ? <nav className="ds-command-grid" aria-label="授权快捷入口">{links.map((link) => <Link className="ds-command-card" href={link.href as Route} key={link.href}>{link.label}</Link>)}</nav> : null}</>;
}

function Tasks({ data, returnContext }: { data: HomestayTaskListResponse; returnContext: HomestayListReturnContext }) {
  return <TaskPresentation<PropertyWorkbenchTaskItem> count={data.total} fields={[
    { key: "status", label: "状态", render: (item) => <StatusPill value={item.status} /> },
    { key: "due", label: "截止时间", render: (item) => item.dueAt ?? "未设置" },
    { key: "source", label: "来源", render: (item) => item.sourceType }
  ]} getHref={(item) => detailHref(taskDetailHref(item.sourceType, item.sourceId), returnContext)} getKey={(item) => item.id} getTitle={(item) => item.title} items={data.items} label="民宿岗位任务" title="待办任务" />;
}

function Availability({ data }: { data: HomestayAvailabilityListResponse }) {
  return <PropertyResponsiveRecords items={data.items} label="民宿房态" getKey={(item) => item.unit_id} getTitle={(item) => `${item.unit_code} · ${item.unit_name}`} fields={[
    { key: "unit", label: "房源", render: (item) => `${item.unit_code} · ${item.unit_name}` },
    { key: "mode", label: "经营模式", render: (item) => item.operation_mode ?? "未设置" },
    { key: "state", label: "房态", render: (item) => <StatusPill value={item.room_state} /> }
  ]} />;
}

function Bookings({ data, returnContext }: { data: HomestayBookingListResponse; returnContext: HomestayListReturnContext }) {
  return <PropertyResponsiveRecords<HomestayBookingListItem> items={data.items} label="民宿订单" getKey={(item) => item.id} getTitle={(item) => item.bookingCode} fields={[
    { key: "code", label: "订单号", render: (item) => item.bookingCode }, { key: "unit", label: "房源", render: (item) => [item.unitCode, item.unitName].filter(Boolean).join(" · ") || "—" },
    { key: "dates", label: "入住期间", render: (item) => `${item.arrivalDate} 至 ${item.departureDate}` }, { key: "status", label: "状态", render: (item) => <StatusPill value={item.status} /> }
  ]} renderActions={(item) => <Link className="secondary-button" href={detailHref(`/homestay/bookings/${item.id}`, returnContext) as Route}>查看详情</Link>} />;
}

function Stays({ data, returnContext }: { data: HomestayStayListResponse; returnContext: HomestayListReturnContext }) {
  return <PropertyResponsiveRecords<HomestayStayListItem> items={data.items} label="民宿入住" getKey={(item) => item.id} getTitle={(item) => item.bookingCode} fields={[
    { key: "code", label: "订单号", render: (item) => item.bookingCode }, { key: "dates", label: "入住期间", render: (item) => `${item.arrivalDate} 至 ${item.departureDate}` },
    { key: "status", label: "状态", render: (item) => <StatusPill value={item.status} /> }, { key: "credentials", label: "已发凭证", render: (item) => item.credentialCount }
  ]} renderActions={(item) => <Link className="secondary-button" href={detailHref(`/homestay/stays/${item.id}`, returnContext) as Route}>查看详情</Link>} />;
}

function Turnovers({ data, returnContext }: { data: HomestayTurnoverListResponse; returnContext: HomestayListReturnContext }) {
  return <PropertyResponsiveRecords<HomestayTurnoverListItem> items={data.items} label="民宿周转" getKey={(item) => item.id} getTitle={(item) => [item.unitCode, item.unitName].filter(Boolean).join(" · ") || "未命名房源"} fields={[
    { key: "unit", label: "房源", render: (item) => [item.unitCode, item.unitName].filter(Boolean).join(" · ") || "—" }, { key: "status", label: "状态", render: (item) => <StatusPill value={item.status} /> },
    { key: "assignee", label: "负责人", render: (item) => item.assigneeName ?? "待领取" }, { key: "exception", label: "异常", render: (item) => item.exceptionDescription ?? "无" }
  ]} renderActions={(item) => <Link className="secondary-button" href={detailHref(`/homestay/turnovers/${item.id}`, returnContext) as Route}>查看详情</Link>} />;
}

function Finance({ data, returnContext }: { data: HomestayFinanceListResponse; returnContext: HomestayListReturnContext }) {
  return <PropertyResponsiveRecords<HomestayFinanceItem> items={data.items} label="民宿财务" getKey={(item) => item.bookingId} getTitle={(item) => item.bookingCode} fields={[
    { key: "code", label: "订单号", render: (item) => item.bookingCode }, { key: "total", label: "订单金额", render: (item) => item.totalAmount ?? "未授权" },
    { key: "paid", label: "已收", render: (item) => item.paidAmount }, { key: "refund", label: "退款/减免", render: (item) => `${item.refundedAmount} / ${item.waivedAmount}` },
    { key: "balance", label: "余额", render: (item) => item.balanceAmount }
  ]} renderActions={(item) => <Link className="secondary-button" href={detailHref(`/homestay/bookings/${item.bookingId}`, returnContext) as Route}>查看订单</Link>} />;
}
