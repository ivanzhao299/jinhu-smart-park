import type { UserContext } from "@jinhu/shared";
import type {
  PropertyCapabilityProjection,
  PropertyPageState
} from "../../../features/property-shared";
import {
  encodeReturnContext,
  type StructuredReturnContext
} from "../../../features/property-shared/detail/return-context";

export const HOMESTAY_LANDING_PRIORITY = [
  ["homestay.dashboard", "/homestay/dashboard"],
  ["homestay.tasks", "/homestay/tasks"],
  ["homestay.availability", "/homestay/availability"],
  ["homestay.rates", "/homestay/rates"],
  ["homestay.bookings", "/homestay/bookings"],
  ["homestay.stays", "/homestay/stays"],
  ["homestay.turnovers", "/homestay/turnovers"],
  ["homestay.finance", "/homestay/finance"]
] as const;

export type HomestayLandingHref = (typeof HOMESTAY_LANDING_PRIORITY)[number][1];
export type HomestayLandingResolution =
  | { kind: "redirect"; href: HomestayLandingHref }
  | { kind: "module-forbidden" }
  | { kind: "page-forbidden" };

export function resolveHomestayLanding(
  capabilityFor: (featureId: string) => Pick<PropertyCapabilityProjection, "moduleAvailable" | "pageAllowed">
): HomestayLandingResolution {
  const first = capabilityFor(HOMESTAY_LANDING_PRIORITY[0][0]);
  if (!first.moduleAvailable) return { kind: "module-forbidden" };
  const allowed = HOMESTAY_LANDING_PRIORITY.find(([featureId]) => capabilityFor(featureId).pageAllowed);
  return allowed ? { kind: "redirect", href: allowed[1] } : { kind: "page-forbidden" };
}

export function listPageState(input: {
  pageAllowed: boolean;
  readAllowed: boolean;
  loading: boolean;
  error: string;
  hasData: boolean;
  total: number;
  filtered: boolean;
  emptyScope: boolean;
}): PropertyPageState {
  if (!input.pageAllowed || !input.readAllowed) return { kind: "forbidden-full" };
  if (input.loading && !input.hasData) return { kind: "initial-loading" };
  if (input.error && !input.hasData) return { kind: "initial-failure", message: input.error };
  if (input.error) return { kind: "refresh-failure", message: input.error };
  if (input.total === 0 && input.emptyScope) return { kind: "empty-scope" };
  if (input.total === 0 && input.filtered) return { kind: "empty-filtered" };
  if (input.total === 0) return { kind: "empty-initial" };
  return { kind: "ready" };
}

export const HOMESTAY_LIST_READ_ACTIONS = {
  dashboard: "homestay.dashboard.read",
  tasks: "homestay.tasks.list",
  availability: "homestay.availability.read",
  bookings: "homestay.bookings.list",
  stays: "homestay.stays.list",
  turnovers: "homestay.turnovers.list",
  finance: "homestay.finance.list"
} as const;

export const HOMESTAY_DETAIL_READ_ACTIONS = {
  booking: "homestay.bookings.detail",
  stay: "homestay.stays.detail",
  turnover: "homestay.turnovers.detail"
} as const;

export function shouldLoadHomestayRead(queryReady: boolean, readAllowed: boolean): boolean {
  return queryReady && readAllowed;
}

export function hasExplicitEmptyHomestayUnitScope(
  user: Pick<UserContext, "data_scopes"> | null
): boolean {
  return Boolean(user?.data_scopes?.some((scope) => {
    if (scope.dimension !== "unit" || scope.scope_type === "all") return false;
    const unitIds = scope.scope_config?.unitIds ?? scope.scope_config?.ids;
    return Array.isArray(unitIds) && unitIds.length === 0;
  }));
}

export function homestayDetailHref(
  path: string,
  context: StructuredReturnContext
): string {
  const params = new URLSearchParams();
  params.set("returnTo", encodeReturnContext(context));
  return `${path}?${params.toString()}`;
}

export function taskDetailHref(sourceType: string, sourceId: string): string {
  if (sourceType === "homestay_turnover") return `/homestay/turnovers/${sourceId}`;
  return `/homestay/bookings/${sourceId}`;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
