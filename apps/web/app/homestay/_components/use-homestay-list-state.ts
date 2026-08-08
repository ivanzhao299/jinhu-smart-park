"use client";

import type {
  HomestayAvailabilityListResponse,
  HomestayAvailabilityResponse,
  HomestayBookingListResponse,
  HomestayDashboardResponse,
  HomestayFinanceListResponse,
  HomestayStayListResponse,
  HomestayTaskListResponse,
  HomestayTurnoverListResponse,
  HomestayUnitCandidateListResponse
} from "@jinhu/shared";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RemoteEntityOption } from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import type { HomestayListReturnContext } from "./HomestayListRecords";
import {
  availabilityQueryDates,
  normalizeHomestayAvailabilityResponse,
  shouldLoadHomestayRead
} from "./homestay-workbench.logic";
import type { HomestayListSurface } from "./HomestayListClient";

export type HomestaySurfaceData =
  | HomestayDashboardResponse
  | HomestayTaskListResponse
  | HomestayAvailabilityListResponse
  | HomestayBookingListResponse
  | HomestayStayListResponse
  | HomestayTurnoverListResponse
  | HomestayFinanceListResponse;

export interface HomestayListFilters {
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

export const EMPTY_HOMESTAY_FILTERS: HomestayListFilters = {
  page: 1, status: "", dateFrom: "", dateTo: "", keyword: "",
  sourceType: "", businessDateValue: "", unit: null, ready: false
};

interface QueryInput {
  page: number; status: string; dateFrom?: string; dateTo?: string; keyword?: string;
  sourceType?: string; businessDateValue?: string; unitId?: string;
}

function queryFor(surface: HomestayListSurface, input: QueryInput) {
  const params = new URLSearchParams({ page: String(input.page), page_size: "20" });
  if (input.status) params.set(surface === "stays" ? "queue" : "status", input.status);
  if (surface === "bookings") {
    const values = { keyword: input.keyword?.trim(), unit_id: input.unitId, date_from: input.dateFrom, date_to: input.dateTo };
    Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  }
  if (surface === "tasks" && input.sourceType) params.set("source_type", input.sourceType);
  if ((surface === "tasks" || surface === "stays") && input.businessDateValue) {
    params.set("business_date", input.businessDateValue);
  }
  if (surface === "availability") {
    const { dateFrom, dateTo } = availabilityQueryDates(input);
    params.set("date_from", dateFrom);
    params.set("date_to", dateTo);
  }
  return params;
}

export async function loadHomestayUnitOptions(input: {
  page: number; pageSize: number; signal: AbortSignal;
}) {
  const response = await apiRequest<HomestayUnitCandidateListResponse>(
    `/homestay/unit-candidates?page=${input.page}&page_size=${input.pageSize}`,
    { token: getAccessToken() ?? undefined, signal: input.signal }
  );
  return {
    items: response.data.items.map((item) => ({ id: item.id, label: `${item.unitCode} · ${item.unitName}` })),
    page: response.data.page, pageSize: response.data.page_size, total: response.data.total
  };
}

export function createHomestayReturnContext(
  surface: HomestayListSurface,
  filters: HomestayListFilters
): HomestayListReturnContext {
  return { route: surface, query: {
    page: String(filters.page), page_size: "20", status: filters.status || undefined,
    queue: surface === "stays" ? filters.status || undefined : undefined,
    keyword: filters.keyword || undefined, date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined, source_type: filters.sourceType || undefined,
    business_date: filters.businessDateValue || undefined, unit_id: filters.unit?.id
  } };
}

export function useHomestayListFilters(surface: HomestayListSurface) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<HomestayListFilters>(EMPTY_HOMESTAY_FILTERS);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const parsedPage = Number(query.get("page") ?? "1");
    const unitId = query.get("unit_id");
    setFilters({
      page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      status: query.get(surface === "stays" ? "queue" : "status") ?? "",
      dateFrom: query.get("date_from") ?? "", dateTo: query.get("date_to") ?? "",
      keyword: query.get("keyword") ?? "", sourceType: query.get("source_type") ?? "",
      businessDateValue: query.get("business_date") ?? "",
      unit: unitId ? { id: unitId, label: "已选择房源" } : null, ready: true
    });
  }, [surface]);
  function update(patch: Partial<HomestayListFilters>) {
    const next = { ...filters, ...patch, ready: true };
    setFilters(next);
    router.replace(`${pathname}?${queryFor(surface, { ...next, unitId: next.unit?.id ?? "" }).toString()}` as Route);
  }
  return { filters, update };
}

export function useHomestaySurfaceData(
  surface: HomestayListSurface,
  filters: HomestayListFilters,
  readAllowed: boolean,
  invalidationKey: string
) {
  const [data, setData] = useState<HomestaySurfaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (!shouldLoadHomestayRead(filters.ready, readAllowed)) { setLoading(false); return; }
    const currentRequest = ++requestId.current;
    setLoading(true); setError("");
    try {
      const endpoint = surface === "dashboard"
        ? "/homestay/dashboard"
        : `/homestay/${surface}?${queryFor(surface, { ...filters, unitId: filters.unit?.id ?? "" }).toString()}`;
      const response = await apiRequest<HomestaySurfaceData>(endpoint, { token: getAccessToken() ?? undefined });
      const normalized = surface === "availability"
        ? normalizeHomestayAvailabilityResponse(
            response.data as HomestayAvailabilityListResponse | HomestayAvailabilityResponse,
            filters.page
          )
        : response.data;
      if (currentRequest === requestId.current) setData(normalized);
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(loadError instanceof Error ? loadError.message : "数据加载失败");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [filters, readAllowed, surface]);
  useEffect(() => void load(), [load, invalidationKey]);
  return { data, error, load, loading };
}

export function homestayPaginatedData(surface: HomestayListSurface, data: HomestaySurfaceData | null) {
  return surface === "dashboard" ? null : data as Exclude<HomestaySurfaceData, HomestayDashboardResponse> | null;
}

export function homestayResultTotal(data: HomestaySurfaceData | null, pageData: Exclude<HomestaySurfaceData, HomestayDashboardResponse> | null) {
  return pageData ? pageData.total : data ? 1 : 0;
}

export function hasActiveHomestayFilters(filters: HomestayListFilters): boolean {
  return [filters.status, filters.dateFrom, filters.dateTo, filters.keyword,
    filters.sourceType, filters.businessDateValue, filters.unit].some(Boolean);
}
