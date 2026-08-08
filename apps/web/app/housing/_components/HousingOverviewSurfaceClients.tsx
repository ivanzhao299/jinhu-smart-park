"use client";

import type { HousingDashboardResponse, HousingTaskListResponse } from "@jinhu/shared";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import {
  PageState, PropertyPageSurface, PropertyPanelSurface, projectPropertyCapabilities,
  type PropertyPageState
} from "../../../features/property-shared";
import { ApiError, apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { HousingCollectionPage } from "./HousingCollectionPage";
import {
  displayHousingValue, housingDateTime, housingFields, housingMoney,
  housingOrderFilter, housingSortFilter
} from "./HousingSurfacePrimitives";
import { detailUrlObject } from "./housing-route-types";
import styles from "./HousingWorkbench.module.css";

export function HousingDashboardClient() {
  const user = useAuthUser();
  const capabilities = useMemo(() => projectPropertyCapabilities(user, "housing.dashboard"), [user]);
  const [dashboard, setDashboard] = useState<HousingDashboardResponse | null>(null);
  const [state, setState] = useState<PropertyPageState>({ kind: "initial-loading" });
  async function load() {
    if (!capabilities.pageAllowed || !capabilities.actionAllowed("housing.dashboard.read")) {
      setState({ kind: "forbidden-full" }); return;
    }
    try {
      const response = await apiRequest<HousingDashboardResponse>("/housing/dashboard", { token: getAccessToken() });
      setDashboard(response.data); setState({ kind: "ready" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "看板加载失败";
      if (error instanceof ApiError && error.status === 403) {
        setState(dashboard ? { kind: "forbidden-partial", message } : { kind: "forbidden-full" });
      } else if (error instanceof ApiError && error.status === 409) {
        setState({ kind: "conflict", message });
      } else if (typeof navigator !== "undefined" && !navigator.onLine && dashboard) {
        setState({ kind: "offline-stale", message });
      } else {
        setState({ kind: dashboard ? "refresh-failure" : "initial-failure", message });
      }
    }
  }
  useEffect(() => { void load(); }, [capabilities.invalidationKey]);
  const kpis = dashboard ? [
    ["草稿租约", dashboard.draft_leases], ["待审批", dashboard.pending_approval],
    ["待签署", dashboard.pending_signature], ["生效租约", dashboard.active_leases],
    ["退租处理中", dashboard.checkout_pending], ["应收", housingMoney(dashboard.receivable_amount)],
    ["已收", housingMoney(dashboard.collected_amount)], ["未收", housingMoney(dashboard.outstanding_amount)],
    ["已批采购成本", housingMoney(dashboard.approved_purchase_cost)]
  ] : [];
  return <DashboardView dashboard={dashboard} kpis={kpis} load={load} state={state} />;
}

function DashboardView(props: {
  dashboard: HousingDashboardResponse | null; kpis: Array<Array<string | number>>;
  load(): Promise<void>; state: PropertyPageState;
}) {
  return <PropertyPageSurface>
    <header className={`ds-hero ${styles.hero}`}><div><p>住房出租工作台</p><h1>运营看板</h1>
      <p>按当前园区和授权范围汇总租约、交割与住房子账。</p></div></header>
    <PageState state={props.state} retryAction={<button className="ds-button" onClick={() => void props.load()} type="button">重试</button>}>
      <div className={`ds-kpi-grid ${styles.kpiGrid}`}>{props.kpis.map(([label, value]) =>
        <article className="ds-kpi-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      {props.dashboard ? <DashboardExceptions dashboard={props.dashboard} /> : null}<DashboardShortcuts />
    </PageState>
  </PropertyPageSurface>;
}

function DashboardExceptions({ dashboard }: { dashboard: HousingDashboardResponse }) {
  const items = [
    dashboard.pending_approval ? ["待审批租约", dashboard.pending_approval, "/housing/leases?status=pending_approval"] : null,
    dashboard.pending_signature ? ["待签署租约", dashboard.pending_signature, "/housing/leases?status=pending_signature"] : null,
    dashboard.checkout_pending ? ["退租处理中", dashboard.checkout_pending, "/housing/leases?status=checkout_pending"] : null
  ].filter((item): item is [string, number, Route] => Boolean(item));
  return <PropertyPanelSurface title="运营异常">{items.length ? <div className="ds-scene-grid">
    {items.map(([label, value, href]) => <article className="ds-scene-card" key={label}>
      <strong>{label}</strong><p>{value} 项</p><Link className="ds-button" href={href}>查看</Link>
    </article>)}</div> : <p>当前没有待处理异常。</p>}</PropertyPanelSurface>;
}

function DashboardShortcuts() {
  const user = useAuthUser();
  const items = [
    ["housing.tasks", "housing.tasks.list", "/housing/tasks", "进入任务中心"],
    ["housing.leases", "housing.leases.list", "/housing/leases", "进入租约管理"],
    ["housing.billing", "housing.billing.list", "/housing/billing", "进入周期账单"],
    ["housing.repairs", "housing.repairs.list", "/housing/repairs", "进入报修协同"]
  ] as const;
  const allowed = items.filter(([feature, action]) => {
    const capability = projectPropertyCapabilities(user, feature);
    return capability.pageAllowed && capability.actionAllowed(action);
  });
  return allowed.length ? <PropertyPanelSurface title="授权快捷入口"><div className={styles.actionBar}>
    {allowed.map(([, , href, label]) => <Link className="ds-button" href={href} key={href}>{label}</Link>)}
  </div></PropertyPanelSurface> : null;
}

export function HousingTasksClient() {
  type Item = HousingTaskListResponse["items"][number];
  const user = useAuthUser();
  return <HousingCollectionPage<Item>
    description="聚合租约、交割、账单、报修与采购待办；任务状态不替代领域状态。"
    detailHref={(item) => {
      const destinations: Record<string, { feature: string; action: string; path: Route; detail: boolean }> = {
        housing_lease: { feature: "housing.leases", action: "housing.leases.list", path: "/housing/leases", detail: true },
        housing_handover: { feature: "housing.handovers", action: "housing.handovers.list", path: "/housing/handovers", detail: true },
        housing_repair: { feature: "housing.repairs", action: "housing.repairs.list", path: "/housing/repairs", detail: true },
        housing_purchase: { feature: "housing.purchases", action: "housing.purchases.list", path: "/housing/purchases", detail: true },
        housing_billing: { feature: "housing.billing", action: "housing.billing.list", path: "/housing/billing", detail: false }
      };
      const destination = destinations[item.sourceType];
      if (!destination) return null;
      const capability = projectPropertyCapabilities(user, destination.feature);
      if (!capability.pageAllowed || !capability.actionAllowed(destination.action)) return null;
      return detailUrlObject(destination.detail
        ? `${destination.path}/${encodeURIComponent(item.sourceId)}`
        : destination.path);
    }}
    endpoint="/housing/tasks" featureId="housing.tasks" route="/housing/tasks"
    fields={housingFields<Item>(
      { key: "source", label: "来源", render: (item) => item.sourceType },
      { key: "status", label: "状态", render: (item) => item.status },
      { key: "assignee", label: "负责人", render: (item) => displayHousingValue(item.assigneeId) },
      { key: "due", label: "截止时间", render: (item) => housingDateTime(item.dueAt) }
    )}
    filters={[
      { key: "status", label: "任务状态", options: [
        { label: "待处理", value: "pending" }, { label: "进行中", value: "active" },
        { label: "异常", value: "exception" }, { label: "已完成", value: "completed" }
      ] },
      { key: "source_type", label: "来源类型", options: [
        { label: "租约", value: "housing_lease" }, { label: "交割", value: "housing_handover" },
        { label: "报修", value: "housing_repair" }, { label: "账单", value: "housing_billing" },
        { label: "采购", value: "housing_purchase" }
      ] },
      housingSortFilter([
        { label: "截止时间", value: "dueAt" }, { label: "状态", value: "status" },
        { label: "标题", value: "title" }
      ]),
      housingOrderFilter
    ]}
    getKey={(item) => item.id} getTitle={(item) => item.title}
    readActionId="housing.tasks.list" title="任务中心"
  />;
}
