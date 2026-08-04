"use client";

import type {
  HomestayAvailabilityListResponse,
  HomestayBookingListResponse,
  HomestayDashboardResponse,
  HomestayFinanceListResponse,
  HomestayStayListResponse,
  HomestayTaskListResponse,
  HomestayTurnoverListResponse,
  HomestayUnitCandidateListResponse,
} from "@jinhu/shared";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PageState,
  PropertyPageSurface,
  PropertyPanelSurface,
  RemoteEntityPicker,
  projectPropertyCapabilities,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
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
  availabilityQueryDates,
  hasExplicitEmptyHomestayUnitScope,
  listPageState,
  pageCount,
  shouldLoadHomestayRead
} from "./homestay-workbench.logic";

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

type SurfaceData =
  | HomestayDashboardResponse
  | HomestayTaskListResponse
  | HomestayAvailabilityListResponse
  | HomestayBookingListResponse
  | HomestayStayListResponse
  | HomestayTurnoverListResponse
  | HomestayFinanceListResponse;

function createReturnContext(surface: HomestayListSurface, filters: ListFilters): HomestayListReturnContext {
  return {
    route: surface,
    query: {
      page: String(filters.page),
      page_size: "20",
      status: filters.status || undefined,
      queue: surface === "stays" ? filters.status || undefined : undefined,
      keyword: filters.keyword || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      source_type: filters.sourceType || undefined,
      business_date: filters.businessDateValue || undefined,
      unit_id: filters.unit?.id
    }
  };
}


interface QueryInput {
  page: number;
  status: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  sourceType?: string;
  businessDateValue?: string;
  unitId?: string;
}

function appendStatus(params: URLSearchParams, surface: HomestayListSurface, status: string) {
  if (!status) return;
  params.set(surface === "stays" ? "queue" : "status", status);
}

function appendBookingQuery(params: URLSearchParams, input: QueryInput) {
  const values = {
    keyword: input.keyword?.trim(),
    unit_id: input.unitId,
    date_from: input.dateFrom,
    date_to: input.dateTo
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
}

function appendWorkDateQuery(
  params: URLSearchParams,
  surface: "tasks" | "stays",
  input: QueryInput
) {
  if (surface === "tasks" && input.sourceType) params.set("source_type", input.sourceType);
  if (input.businessDateValue) params.set("business_date", input.businessDateValue);
}

function appendAvailabilityQuery(params: URLSearchParams, input: QueryInput) {
  const { dateFrom, dateTo } = availabilityQueryDates(input);
  params.set("date_from", dateFrom);
  params.set("date_to", dateTo);
}

function queryFor(surface: HomestayListSurface, input: QueryInput) {
  const params = new URLSearchParams({ page: String(input.page), page_size: "20" });
  appendStatus(params, surface, input.status);
  if (surface === "bookings") appendBookingQuery(params, input);
  if (surface === "tasks" || surface === "stays") appendWorkDateQuery(params, surface, input);
  if (surface === "availability") appendAvailabilityQuery(params, input);
  return params;
}

async function loadUnitOptions(input: {
  page: number;
  pageSize: number;
  signal: AbortSignal;
}) {
  const response = await apiRequest<HomestayUnitCandidateListResponse>(
    `/homestay/unit-candidates?page=${input.page}&page_size=${input.pageSize}`,
    { token: getAccessToken() ?? undefined, signal: input.signal }
  );
  return {
    items: response.data.items.map((item) => ({
      id: item.id,
      label: `${item.unitCode} · ${item.unitName}`
    })),
    page: response.data.page,
    pageSize: response.data.page_size,
    total: response.data.total
  };
}

function endpointFor(surface: HomestayListSurface, params: URLSearchParams): string {
  return surface === "dashboard"
    ? "/homestay/dashboard"
    : `/homestay/${surface}?${params.toString()}`;
}

interface ListFilters {
  page: number;
  status: string;
  dateFrom: string;
  dateTo: string;
  keyword: string;
  sourceType: string;
  businessDateValue: string;
  unit: RemoteEntityOption | null;
  ready: boolean;
}

const EMPTY_FILTERS: ListFilters = {
  page: 1, status: "", dateFrom: "", dateTo: "", keyword: "",
  sourceType: "", businessDateValue: "", unit: null, ready: false
};

function useListFilters(surface: HomestayListSurface) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const parsedPage = Number(query.get("page") ?? "1");
    const unitId = query.get("unit_id");
    setFilters({
      page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      status: query.get(surface === "stays" ? "queue" : "status") ?? "",
      dateFrom: query.get("date_from") ?? "",
      dateTo: query.get("date_to") ?? "",
      keyword: query.get("keyword") ?? "",
      sourceType: query.get("source_type") ?? "",
      businessDateValue: query.get("business_date") ?? "",
      unit: unitId ? { id: unitId, label: "已选择房源" } : null,
      ready: true
    });
  }, [surface]);
  function update(patch: Partial<ListFilters>) {
    const next = { ...filters, ...patch, ready: true };
    setFilters(next);
    const params = queryFor(surface, {
      ...next,
      unitId: next.unit?.id ?? ""
    });
    router.replace(`${pathname}?${params.toString()}` as Route);
  }
  return { filters, update };
}

function useSurfaceData(
  surface: HomestayListSurface,
  filters: ListFilters,
  readAllowed: boolean,
  invalidationKey: string
) {
  const [data, setData] = useState<SurfaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (!shouldLoadHomestayRead(filters.ready, readAllowed)) {
      setLoading(false);
      return;
    }
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<SurfaceData>(
        endpointFor(surface, queryFor(surface, {
          ...filters,
          unitId: filters.unit?.id ?? ""
        })),
        { token: getAccessToken() ?? undefined }
      );
      if (currentRequest === requestId.current) setData(response.data);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : "数据加载失败");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [filters, readAllowed, surface]);
  useEffect(() => void load(), [load, invalidationKey]);
  return { data, error, load, loading };
}

function paginatedData(
  surface: HomestayListSurface,
  data: SurfaceData | null
): Exclude<SurfaceData, HomestayDashboardResponse> | null {
  return surface === "dashboard"
    ? null
    : data as Exclude<SurfaceData, HomestayDashboardResponse> | null;
}

function resultTotal(
  data: SurfaceData | null,
  pageData: Exclude<SurfaceData, HomestayDashboardResponse> | null
): number {
  if (pageData) return pageData.total;
  return data ? 1 : 0;
}

function hasActiveFilters(filters: ListFilters): boolean {
  return [
    filters.status, filters.dateFrom, filters.dateTo, filters.keyword,
    filters.sourceType, filters.businessDateValue, filters.unit
  ].some(Boolean);
}

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
  const { filters, update } = useListFilters(surface);
  const { data, error, load, loading } = useSurfaceData(
    surface, filters, readAllowed, capability.invalidationKey
  );

  const pageData = paginatedData(surface, data);
  const state = listPageState({
    pageAllowed: capability.pageAllowed,
    readAllowed,
    loading,
    error,
    hasData: Boolean(data),
    total: resultTotal(data, pageData),
    emptyScope: hasExplicitEmptyHomestayUnitScope(user),
    filtered: hasActiveFilters(filters)
  });
  const [title, description] = TITLES[surface];
  const returnContext = createReturnContext(surface, filters);

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
  data: SurfaceData | null; filters: ListFilters; load(): Promise<void>;
  readAllowed: boolean; surface: HomestayListSurface;
  update(patch: Partial<ListFilters>): void;
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
  dashboardLinks: readonly HomestayDashboardLink[]; data: SurfaceData | null;
  filters: ListFilters; load(): Promise<void>; loading: boolean;
  pageData: Exclude<SurfaceData, HomestayDashboardResponse> | null;
  returnContext: HomestayListReturnContext;
  state: ReturnType<typeof listPageState>; surface: HomestayListSurface;
  update(patch: Partial<ListFilters>): void;
}) {
  return <div id="homestay-results" tabIndex={-1}><PageState state={state}
    retryAction={<button className="secondary-button" type="button" onClick={() => void load()}>重试</button>}
    clearFiltersAction={<button className="secondary-button" type="button" onClick={() => update({ ...EMPTY_FILTERS, ready: true })}>清除筛选</button>}>
    <HomestayListRecords dashboardLinks={dashboardLinks} data={data}
      returnContext={returnContext} surface={surface} />
    {pageData ? <HomestayPager filters={filters} loading={loading} pageData={pageData} update={update} /> : null}
  </PageState></div>;
}

function HomestayPager({ filters, loading, pageData, update }: {
  filters: ListFilters; loading: boolean;
  pageData: Exclude<SurfaceData, HomestayDashboardResponse>;
  update(patch: Partial<ListFilters>): void;
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
  filters: ListFilters;
  onRefresh(): Promise<void>;
  surface: HomestayListSurface;
  update(patch: Partial<ListFilters>): void;
}) {
  const resetPage = (patch: Partial<ListFilters>) => update({ ...patch, page: 1 });
  return (
    <PropertyPanelSurface title="筛选条件">
      <div className={styles.toolbar}>
        {surface === "availability" ? (
          <>
            <label>开始日期<input type="date" value={filters.dateFrom} onChange={(event) => {
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
            <label>结束日期<input type="date" min={filters.dateFrom ? addBusinessDateDays(filters.dateFrom, 1) : undefined} value={filters.dateTo} onChange={(event) => resetPage({ dateTo: event.target.value })} /></label>
          </>
        ) : (
          <>
            {surface === "bookings" ? (
              <>
                <label>订单搜索<input maxLength={100} placeholder="订单号" type="search" value={filters.keyword} onChange={(event) => resetPage({ keyword: event.target.value })} /></label>
                <RemoteEntityPicker authorized contextValid={capability.moduleAvailable} invalidationKey={capability.invalidationKey} label="房源" loadOptions={loadUnitOptions} onChange={(unit) => resetPage({ unit })} value={filters.unit} />
                <label>入住开始<input type="date" value={filters.dateFrom} onChange={(event) => resetPage({ dateFrom: event.target.value })} /></label>
                <label>入住结束<input type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => resetPage({ dateTo: event.target.value })} /></label>
              </>
            ) : null}
            {surface === "tasks" ? (
              <>
                <label>任务来源<select value={filters.sourceType} onChange={(event) => resetPage({ sourceType: event.target.value })}><option value="">全部</option><option value="homestay_arrival">到店</option><option value="homestay_departure">离店</option><option value="homestay_turnover">周转</option></select></label>
                <label>业务日期<input type="date" value={filters.businessDateValue} onChange={(event) => resetPage({ businessDateValue: event.target.value })} /></label>
              </>
            ) : null}
            {surface === "stays" ? <label>业务日期<input type="date" value={filters.businessDateValue} onChange={(event) => resetPage({ businessDateValue: event.target.value })} /></label> : null}
            <label>业务状态<select value={filters.status} onChange={(event) => resetPage({ status: event.target.value })}><option value="">全部</option>{filterOptions(surface).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
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
