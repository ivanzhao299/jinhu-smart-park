"use client";

import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import type { Route } from "next";
import type { UrlObject } from "node:url";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  projectPropertyCapabilities,
  type PropertyFieldDescriptor,
  type PropertyPageState
} from "../../../features/property-shared";
import {
  HOUSING_LIST_PAGE_SIZE,
  housingPageCorrection
} from "../../../features/housing/listing/pagination";
import { ApiError, apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasAccess } from "../../../lib/permissions";
import { HousingCollectionView } from "./HousingCollectionView";
import { hasAuthoritativeEmptyUnitScope } from "./housing-list-logic";
import { routeWithSearch } from "./housing-route-types";

export interface HousingFilterOption { label: string; value: string; }
export interface HousingFilterDefinition {
  key: string; label: string; options?: readonly HousingFilterOption[]; placeholder?: string;
}
export interface HousingCollectionPageProps<T> {
  featureId: string; readActionId: string; endpoint: string; title: string; description: string;
  route: Route;
  fields: readonly PropertyFieldDescriptor<T>[]; getKey(item: T): string; getTitle(item: T): ReactNode;
  detailHref?(item: T): UrlObject | null;
  renderItemActions?(item: T, capabilities: ReturnType<typeof projectPropertyCapabilities>, reload: () => Promise<void>): ReactNode;
  filters?: readonly HousingFilterDefinition[]; toolbar?: ReactNode; refreshKey?: number;
}

function useCollectionQuery(filters: readonly HousingFilterDefinition[], route: Route) {
  const router = useRouter(); const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const active = useMemo(() => Object.fromEntries(filters.map((filter) => [
    filter.key, searchParams.get(filter.key) ?? ""
  ])), [filters, searchParams]);
  const [draft, setDraft] = useState(active);
  useEffect(() => setDraft(active), [active]);
  const update = useCallback((nextPage: number, values: Record<string, string>) => {
    const query = new URLSearchParams();
    if (nextPage > 1) query.set("page", String(nextPage));
    Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
    router.push(routeWithSearch(route, query));
  }, [route, router]);
  return { active, draft, page, query: Object.fromEntries(searchParams.entries()), setDraft, update };
}

function failureState(error: unknown, cached: boolean): PropertyPageState {
  const message = error instanceof Error ? error.message : "数据加载失败";
  if (error instanceof ApiError && error.status === 403) {
    return cached ? { kind: "forbidden-partial", message } : { kind: "forbidden-full" };
  }
  if (error instanceof ApiError && error.status === 409) return { kind: "conflict", message };
  if (typeof navigator !== "undefined" && !navigator.onLine && cached) return { kind: "offline-stale", message };
  return cached ? { kind: "refresh-failure", message } : { kind: "initial-failure", message };
}

function useCollectionData<T>(input: {
  active: Record<string, string>; endpoint: string; featureId: string; page: number;
  readActionId: string; refreshKey: number; queryKey: string;
}) {
  const user = useAuthUser();
  const capabilities = useMemo(() => projectPropertyCapabilities(user, input.featureId), [input.featureId, user]);
  const [result, setResult] = useState<PaginatedResult<T> | null>(null);
  const resultRef = useRef<PaginatedResult<T> | null>(null);
  const resultQueryKey = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const [state, setState] = useState<PropertyPageState>({ kind: "initial-loading" });
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (resultQueryKey.current !== input.queryKey) {
      resultQueryKey.current = input.queryKey;
      resultRef.current = null;
      setResult(null);
      setState({ kind: "initial-loading" });
    }
    if (!capabilities.pageAllowed || !capabilities.actionAllowed(input.readActionId)) {
      resultQueryKey.current = null;
      resultRef.current = null; setResult(null); setState({ kind: "forbidden-full" }); return;
    }
    const query = new URLSearchParams({ page: String(input.page), page_size: String(HOUSING_LIST_PAGE_SIZE) });
    Object.entries(input.active).forEach(([key, value]) => { if (value) query.set(key, value); });
    try {
      const response = await apiRequest<PaginatedResult<T>>(`${input.endpoint}?${query.toString()}`, { token: getAccessToken() });
      if (sequence !== requestSequence.current) return;
      resultRef.current = response.data; setResult(response.data);
      const emptyScope = hasAuthoritativeEmptyUnitScope(user?.data_scopes, user?.is_super === true);
      setState(response.data.items.length ? { kind: "ready" }
        : Object.values(input.active).some(Boolean) ? { kind: "empty-filtered" }
          : emptyScope ? { kind: "empty-scope" } : { kind: "empty-initial" });
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setState(failureState(error, Boolean(resultRef.current)));
    }
  }, [capabilities, input.active, input.endpoint, input.page, input.queryKey, input.readActionId, user]);
  useEffect(() => { void load(); }, [load, input.queryKey, input.refreshKey]);
  const authorized = capabilities.pageAllowed && capabilities.actionAllowed(input.readActionId);
  const currentQuery = resultQueryKey.current === input.queryKey;
  return {
    canChangeScope: hasAccess(user, SYSTEM_PERMISSIONS.ROLE_READ, "system")
      && hasAccess(user, SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE, "system"),
    capabilities,
    load,
    result: authorized && currentQuery ? result : null,
    state: !authorized
      ? { kind: "forbidden-full" } as const
      : currentQuery ? state : { kind: "initial-loading" } as const
  };
}

export function HousingCollectionPage<T>(props: HousingCollectionPageProps<T>) {
  const filters = props.filters ?? [];
  const query = useCollectionQuery(filters, props.route);
  const data = useCollectionData<T>({
    active: query.active, endpoint: props.endpoint, featureId: props.featureId, page: query.page,
    queryKey: JSON.stringify({
      active: query.active,
      endpoint: props.endpoint,
      featureId: props.featureId,
      page: query.page,
      readActionId: props.readActionId
    }),
    readActionId: props.readActionId, refreshKey: props.refreshKey ?? 0
  });
  const correctedPage = data.result ? housingPageCorrection(query.page, data.result.total) : null;
  const pageOutOfRange = correctedPage !== null;
  useEffect(() => {
    if (correctedPage !== null) query.update(correctedPage, query.active);
  }, [correctedPage, query.active, query.update]);
  return <HousingCollectionView
    {...props} {...data} {...query} filters={filters}
    result={pageOutOfRange ? null : data.result}
    state={pageOutOfRange ? { kind: "initial-loading" } : data.state}
  />;
}
