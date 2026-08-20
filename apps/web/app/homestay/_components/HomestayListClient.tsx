"use client";

import type {
  HomestayDashboardResponse,
  HomestayFinanceListResponse,
} from "@jinhu/shared";
import { useMemo } from "react";
import {
  PageState,
  PropertyPageSurface,
  PropertyPanelSurface,
  RemoteEntityPicker,
  projectPropertyCapabilities,
} from "../../../features/property-shared";
import { useAuthUser } from "../../../lib/auth-context";
import { addBusinessDateDays } from "../../../lib/business-date";
import styles from "./HomestayWorkbench.module.css";
import { HomestayBookingCreatePanel } from "./HomestayBookingCreatePanel";
import { HomestayFinanceEntryPanel } from "./HomestayFinanceEntryPanel";
import {
  HomestayListRecords,
  type HomestayDashboardLink,
  type HomestayListReturnContext
} from "./HomestayListRecords";
import {
  HOMESTAY_LIST_READ_ACTIONS,
  hasExplicitEmptyHomestayUnitScope,
  listPageState,
  pageCount,
} from "./homestay-workbench.logic";
import {
  EMPTY_HOMESTAY_FILTERS,
  createHomestayReturnContext,
  hasActiveHomestayFilters,
  homestayPaginatedData,
  homestayResultTotal,
  loadHomestayUnitOptions,
  useHomestayListFilters,
  useHomestaySurfaceData,
  type HomestayListFilters,
  type HomestaySurfaceData
} from "./use-homestay-list-state";

export type HomestayListSurface =
  | "dashboard"
  | "tasks"
  | "availability"
  | "bookings"
  | "stays"
  | "turnovers"
  | "finance";

const TITLES: Record<HomestayListSurface, [string, string]> = {
  dashboard: ["运营看板", "聚焦今日到离店、房态和周转压力。"],
  tasks: ["岗位任务", "按当前岗位和数据范围展示待办，并进入业务权威详情。"],
  availability: ["房态", "查看指定经营日期范围内的房源状态。"],
  bookings: ["订单", "按状态浏览订单并进入完整业务详情。"],
  stays: ["入住", "查看今日到店、离店和在住房客。"],
  turnovers: ["周转", "查看保洁、检查和异常周转任务。"],
  finance: ["财务", "查看民宿子账应收、实收、退款与减免投影。"]
};


function allowedDashboardLinks(user: ReturnType<typeof useAuthUser>): HomestayDashboardLink[] {
  const candidates = [
    ["homestay.tasks", "/homestay/tasks", "查看岗位任务"],
    ["homestay.availability", "/homestay/availability", "查看今日房态"],
    ["homestay.turnovers", "/homestay/turnovers", "处理待周转"]
  ] as const;
  return candidates.flatMap(([featureId, href, label]) =>
    projectPropertyCapabilities(user, featureId).pageAllowed ? [{ href, label }] : []
  );
}

export function HomestayListClient({ surface }: { surface: HomestayListSurface }) {
  const user = useAuthUser();
  const capability = useMemo(
    () => projectPropertyCapabilities(user, `homestay.${surface}`),
    [surface, user]
  );
  const readAllowed = capability.actionAllowed(HOMESTAY_LIST_READ_ACTIONS[surface]);
  const { filters, update } = useHomestayListFilters(surface);
  const { data, error, load, loading } = useHomestaySurfaceData(
    surface, filters, readAllowed, capability.invalidationKey
  );

  const pageData = homestayPaginatedData(surface, data);
  const state = listPageState({
    pageAllowed: capability.pageAllowed,
    readAllowed,
    loading,
    error,
    hasData: Boolean(data),
    total: homestayResultTotal(data, pageData),
    emptyScope: hasExplicitEmptyHomestayUnitScope(user),
    filtered: hasActiveHomestayFilters(filters)
  });
  const [title, description] = TITLES[surface];
  const returnContext = createHomestayReturnContext(surface, filters);

  return (
    <PropertyPageSurface>
      <HomestayHeader description={description} title={title} />
      <HomestayListTopPanels capability={capability} data={data} filters={filters}
        load={load} readAllowed={readAllowed} surface={surface} update={update} />
      <HomestayResults data={data} dashboardLinks={allowedDashboardLinks(user)}
        filters={filters} load={load} loading={loading} pageData={pageData}
        returnContext={returnContext} state={state} surface={surface} update={update} />
    </PropertyPageSurface>
  );
}

function HomestayListTopPanels({
  capability, data, filters, load, readAllowed, surface, update
}: {
  capability: ReturnType<typeof projectPropertyCapabilities>;
  data: HomestaySurfaceData | null; filters: HomestayListFilters; load(): Promise<void>;
  readAllowed: boolean; surface: HomestayListSurface;
  update(patch: Partial<HomestayListFilters>): void;
}) {
  return <>
    {surface !== "dashboard" && readAllowed
      ? <HomestayFilters capability={capability} filters={filters} onRefresh={load} surface={surface} update={update} />
      : null}
    {surface === "bookings" && readAllowed && capability.actionAllowed("homestay.bookings.create")
      ? <HomestayBookingCreatePanel capability={capability} onCreated={() => void load()} /> : null}
    {surface === "finance" && readAllowed && data
      ? <HomestayFinanceEntryPanel capability={capability}
          items={(data as HomestayFinanceListResponse).items} onSaved={() => void load()} />
      : null}
  </>;
}

function HomestayResults({
  dashboardLinks, data, filters, load, loading, pageData, returnContext, state, surface, update
}: {
  dashboardLinks: readonly HomestayDashboardLink[]; data: HomestaySurfaceData | null;
  filters: HomestayListFilters; load(): Promise<void>; loading: boolean;
  pageData: Exclude<HomestaySurfaceData, HomestayDashboardResponse> | null;
  returnContext: HomestayListReturnContext;
  state: ReturnType<typeof listPageState>; surface: HomestayListSurface;
  update(patch: Partial<HomestayListFilters>): void;
}) {
  return <div id="homestay-results" tabIndex={-1}><PageState state={state}
    retryAction={<button className="secondary-button" type="button" onClick={() => void load()}>重试</button>}
    clearFiltersAction={<button className="secondary-button" type="button" onClick={() => update({ ...EMPTY_HOMESTAY_FILTERS, ready: true })}>清除筛选</button>}>
    <HomestayListRecords dashboardLinks={dashboardLinks} data={data}
      returnContext={returnContext} surface={surface} />
    {pageData ? <HomestayPager filters={filters} loading={loading} pageData={pageData} update={update} /> : null}
  </PageState></div>;
}

function HomestayPager({ filters, loading, pageData, update }: {
  filters: HomestayListFilters; loading: boolean;
  pageData: Exclude<HomestaySurfaceData, HomestayDashboardResponse>;
  update(patch: Partial<HomestayListFilters>): void;
}) {
  return <div className={styles.pager} aria-label="分页">
    <span>共 {pageData.total} 条，第 {filters.page}/{pageCount(pageData.total, pageData.page_size)} 页</span>
    <button className="secondary-button" disabled={loading || filters.page <= 1} type="button" onClick={() => update({ page: filters.page - 1 })}>上一页</button>
    <button className="secondary-button" disabled={loading || filters.page >= pageCount(pageData.total, pageData.page_size)} type="button" onClick={() => update({ page: filters.page + 1 })}>下一页</button>
  </div>;
}

function HomestayHeader({ description, title }: { description: string; title: string }) {
  return <header className="ds-hero"><p className="ds-eyebrow">民宿管理</p><h1>{title}</h1><p>{description}</p></header>;
}

function HomestayFilters({
  capability,
  filters,
  onRefresh,
  surface,
  update
}: {
  capability: ReturnType<typeof projectPropertyCapabilities>;
  filters: HomestayListFilters;
  onRefresh(): Promise<void>;
  surface: HomestayListSurface;
  update(patch: Partial<HomestayListFilters>): void;
}) {
  const resetPage = (patch: Partial<HomestayListFilters>) => update({ ...patch, page: 1 });
  return (
    <PropertyPanelSurface title="筛选条件">
      <div className={styles.toolbar}>
        {surface === "availability" ? (
          <>
            <label>开始日期<input name="availability_date_from" type="date" value={filters.dateFrom} onChange={(event) => {
              const next = event.target.value;
              if (!next) {
                resetPage({ dateFrom: "", dateTo: "" });
                return;
              }
              resetPage({
                dateFrom: next,
                dateTo: filters.dateTo > next ? filters.dateTo : addBusinessDateDays(next, 1)
              });
            }} /></label>
            <label>结束日期<input name="availability_date_to" type="date" min={filters.dateFrom ? addBusinessDateDays(filters.dateFrom, 1) : undefined} value={filters.dateTo} onChange={(event) => resetPage({ dateTo: event.target.value })} /></label>
          </>
        ) : (
          <>
            {surface === "bookings" ? (
              <>
                <label>订单搜索<input maxLength={100} name="booking_keyword" placeholder="订单号" type="search" value={filters.keyword} onChange={(event) => resetPage({ keyword: event.target.value })} /></label>
                <RemoteEntityPicker authorized contextValid={capability.moduleAvailable} invalidationKey={capability.invalidationKey} label="房源" loadOptions={loadHomestayUnitOptions} onChange={(unit) => resetPage({ unit })} value={filters.unit} />
                <label>入住开始<input name="booking_date_from" type="date" value={filters.dateFrom} onChange={(event) => resetPage({ dateFrom: event.target.value })} /></label>
                <label>入住结束<input name="booking_date_to" type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => resetPage({ dateTo: event.target.value })} /></label>
              </>
            ) : null}
            {surface === "tasks" ? (
              <>
                <label>任务来源<select name="task_source_type" value={filters.sourceType} onChange={(event) => resetPage({ sourceType: event.target.value })}><option value="">全部</option><option value="homestay_arrival">到店</option><option value="homestay_departure">离店</option><option value="homestay_turnover">周转</option></select></label>
                <label>业务日期<input name="task_business_date" type="date" value={filters.businessDateValue} onChange={(event) => resetPage({ businessDateValue: event.target.value })} /></label>
              </>
            ) : null}
            {surface === "stays" ? <label>业务日期<input name="stay_business_date" type="date" value={filters.businessDateValue} onChange={(event) => resetPage({ businessDateValue: event.target.value })} /></label> : null}
            <label>业务状态<select name={`${surface}_status`} value={filters.status} onChange={(event) => resetPage({ status: event.target.value })}><option value="">全部</option>{filterOptions(surface).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </>
        )}
        <button className="secondary-button" type="button" onClick={() => void onRefresh()}>刷新</button>
      </div>
    </PropertyPanelSurface>
  );
}

function filterOptions(surface: HomestayListSurface): Array<[string, string]> {
  if (surface === "tasks") return [["pending", "待处理"], ["active", "处理中"], ["completed", "已完成"], ["exception", "异常"]];
  if (surface === "stays") return [["arrivals", "今日到店"], ["departures", "今日离店"], ["in_house", "在住"]];
  if (surface === "turnovers") return [["open", "未关闭"], ["pending", "待开始"], ["cleaning", "清洁中"], ["inspection", "待检查"], ["exception", "异常"], ["completed", "已完成"]];
  if (surface === "bookings" || surface === "finance") return [["draft", "草稿"], ["confirmed", "已确认"], ["checked_in", "已入住"], ["checked_out", "已退房"], ["cancelled", "已取消"]];
  return [];
}
