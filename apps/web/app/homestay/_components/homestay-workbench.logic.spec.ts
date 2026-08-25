import assert from "node:assert/strict";
import test from "node:test";
import {
  HOMESTAY_LANDING_PRIORITY,
  HOMESTAY_DETAIL_READ_ACTIONS,
  HOMESTAY_LIST_READ_ACTIONS,
  HOMESTAY_ROOM_STATE_PRESENTATION,
  availabilityQueryDates,
  hasExplicitEmptyHomestayUnitScope,
  homestayErrorMessage,
  homestayFinanceEntryTypes,
  homestayRoomStatePresentation,
  homestayRateWorkspaceKey,
  homestayRateWindow,
  homestaySurfaceQueryKey,
  homestayDetailHref,
  homestayStayActionVisibility,
  isMissingHomestayRateConfiguration,
  listPageState,
  normalizeHomestayAvailabilityResponse,
  pageCount,
  projectHomestayRateCalendarResponse,
  resolveHomestayLanding,
  shouldLoadHomestayRead,
  taskDetailHref
} from "./homestay-workbench.logic";
import { resolveReturnHref } from "../../../features/property-shared/detail/return-context";
import { ApiError } from "../../../lib/api-client";

test("seven list categories and all detail aliases use exact read actions", () => {
  assert.deepEqual(HOMESTAY_LIST_READ_ACTIONS, {
    dashboard: "homestay.dashboard.read",
    tasks: "homestay.tasks.list",
    availability: "homestay.availability.read",
    bookings: "homestay.bookings.list",
    stays: "homestay.stays.list",
    turnovers: "homestay.turnovers.list",
    finance: "homestay.finance.list"
  });
  assert.deepEqual(HOMESTAY_DETAIL_READ_ACTIONS, {
    booking: "homestay.bookings.detail",
    stay: "homestay.stays.detail",
    turnover: "homestay.turnovers.detail"
  });
  assert.equal(shouldLoadHomestayRead(true, false), false);
  assert.equal(shouldLoadHomestayRead(false, true), false);
  assert.equal(shouldLoadHomestayRead(true, true), true);
});

test("homestay query identity and rate window preserve backend half-open semantics", () => {
  assert.equal(
    homestaySurfaceQueryKey("bookings", new URLSearchParams({ page: "2", status: "confirmed" })),
    "bookings:page=2&status=confirmed"
  );
  assert.deepEqual(homestayRateWindow("2026-08-08"), {
    from: "2026-08-08",
    to: "2026-08-22"
  });
});

test("only the exact missing-rate 404 is treated as an unconfigured workspace", () => {
  assert.equal(isMissingHomestayRateConfiguration(
    new ApiError("Homestay rate configuration not found", 404)
  ), true);
  assert.equal(isMissingHomestayRateConfiguration(new ApiError("Unit not found", 404)), false);
  assert.equal(isMissingHomestayRateConfiguration(new ApiError("Forbidden", 403)), false);
});

test("rate calendar response projects the 2xx unconfigured state without fake pricing", () => {
  assert.deepEqual(projectHomestayRateCalendarResponse({
    configured: false,
    unit_id: "unit-1"
  }), {
    calendar: null,
    notConfigured: true
  });
  const configured = {
    configured: true as const,
    unit_id: "unit-1",
    currency: "CNY",
    base_daily_rate: "688.00",
    checkout_requires_inspection: false,
    cancellation_policy: {
      free_cancel_before_hours: 24,
      late_cancel_fee_type: "fixed" as const,
      late_cancel_fee_value: "0.00",
      captured_at: "2026-08-26T00:00:00.000Z"
    },
    days: []
  };
  assert.deepEqual(projectHomestayRateCalendarResponse(configured), {
    calendar: configured,
    notConfigured: false
  });
});

test("booking setup and occupancy conflicts are translated into actionable Chinese messages", () => {
  assert.equal(
    homestayErrorMessage(new Error("Homestay rate configuration is required"), "创建失败"),
    "请先为所选房源配置基础价格。"
  );
  assert.equal(
    homestayErrorMessage(new Error("Property occupancy conflicts with an existing period"), "创建失败"),
    "所选房源在该入住期间已被占用，请调整房源或日期。"
  );
  assert.equal(homestayErrorMessage(new Error("网络异常"), "创建失败"), "网络异常");
  assert.equal(homestayErrorMessage(null, "创建失败"), "创建失败");
});

test("finance entry choices mirror the booking status matrix", () => {
  const all = { ordinary: true, refund: true, waiver: true };
  assert.deepEqual(homestayFinanceEntryTypes("draft", all), []);
  assert.deepEqual(homestayFinanceEntryTypes("confirmed", all),
    ["payment", "charge", "refund", "waiver"]);
  assert.deepEqual(homestayFinanceEntryTypes("checked_in", all),
    ["payment", "charge", "refund", "waiver"]);
  assert.deepEqual(homestayFinanceEntryTypes("checked_out", all),
    ["payment", "refund", "waiver"]);
  assert.deepEqual(homestayFinanceEntryTypes("cancelled", all), ["refund", "waiver"]);
  assert.deepEqual(homestayFinanceEntryTypes("no_show", all), ["refund", "waiver"]);
  assert.deepEqual(homestayFinanceEntryTypes("checked_out", {
    ordinary: false, refund: true, waiver: false
  }), ["refund"]);
});

test("landing requires active modules and selects the first granular page only", () => {
  assert.deepEqual(
    resolveHomestayLanding(() => ({ moduleAvailable: false, pageAllowed: true })),
    { kind: "module-forbidden" }
  );
  assert.deepEqual(
    resolveHomestayLanding(() => ({ moduleAvailable: true, pageAllowed: false })),
    { kind: "page-forbidden" }
  );
  assert.deepEqual(
    resolveHomestayLanding((featureId) => ({
      moduleAvailable: true,
      pageAllowed: featureId === "homestay.stays"
    })),
    { kind: "redirect", href: "/homestay/stays" }
  );
  assert.equal(HOMESTAY_LANDING_PRIORITY.length, 8);
});

test("list state separates permission, scope, filters, initial failure, and stale refresh", () => {
  const base = {
    pageAllowed: true,
    readAllowed: true,
    loading: false,
    error: "",
    hasData: false,
    total: 0,
    filtered: false,
    emptyScope: false
  };
  assert.deepEqual(listPageState({ ...base, pageAllowed: false }), { kind: "forbidden-full" });
  assert.deepEqual(listPageState({ ...base, readAllowed: false }), { kind: "forbidden-full" });
  assert.deepEqual(listPageState({ ...base, emptyScope: true }), { kind: "empty-scope" });
  assert.deepEqual(listPageState({ ...base, filtered: true }), { kind: "empty-filtered" });
  assert.deepEqual(listPageState({ ...base, error: "boom" }), { kind: "initial-failure", message: "boom" });
  assert.deepEqual(
    listPageState({ ...base, error: "boom", hasData: true, total: 2 }),
    { kind: "refresh-failure", message: "boom" }
  );
});

test("empty scope is only claimed from an explicit restricted empty unit list", () => {
  assert.equal(hasExplicitEmptyHomestayUnitScope(null), false);
  assert.equal(hasExplicitEmptyHomestayUnitScope({ data_scopes: [] }), false);
  assert.equal(hasExplicitEmptyHomestayUnitScope({
    data_scopes: [{ dimension: "unit", scope_type: "custom" }]
  }), false);
  assert.equal(hasExplicitEmptyHomestayUnitScope({
    data_scopes: [{ dimension: "unit", scope_type: "custom", scope_config: { unitIds: ["u1"] } }]
  }), false);
  assert.equal(hasExplicitEmptyHomestayUnitScope({
    data_scopes: [{ dimension: "unit", scope_type: "all", scope_config: { unitIds: [] } }]
  }), false);
  assert.equal(hasExplicitEmptyHomestayUnitScope({
    data_scopes: [{ dimension: "unit", scope_type: "custom", scope_config: { unitIds: [] } }]
  }), true);
  assert.equal(hasExplicitEmptyHomestayUnitScope({
    data_scopes: [{ dimension: "unit", scope_type: "custom", scope_config: { ids: [] } }]
  }), true);
  assert.equal(hasExplicitEmptyHomestayUnitScope({
    data_scopes: [{ dimension: "unit", scope_type: "custom", scope_config: { ids: ["u1"] } }]
  }), false);
});

test("detail return context survives URL parsing with percent characters and keeps the anchor", () => {
  const href = homestayDetailHref("/homestay/bookings/b1", {
    route: "bookings",
    query: { page: "2", keyword: "50% off" },
    scrollAnchor: "homestay-results"
  });
  const encoded = new URL(href, "https://park.example").searchParams.get("returnTo");
  const restored = resolveReturnHref(encoded, {
    origin: "https://park.example",
    fallbackHref: "/homestay/bookings",
    routes: {
      bookings: {
        pathTemplate: "/homestay/bookings",
        allowedQueryKeys: ["page", "keyword"]
      }
    }
  });
  const restoredUrl = new URL(restored, "https://park.example");
  assert.equal(restoredUrl.searchParams.get("keyword"), "50% off");
  assert.equal(restoredUrl.searchParams.get("page"), "2");
  assert.equal(restoredUrl.hash, "#homestay-results");
});

test("task links reach owning aggregate details and pagination is bounded", () => {
  assert.equal(taskDetailHref("homestay_turnover", "turnover-1"), "/homestay/turnovers/turnover-1");
  assert.equal(taskDetailHref("homestay_arrival", "booking-1"), "/homestay/bookings/booking-1");
  assert.equal(pageCount(0, 20), 1);
  assert.equal(pageCount(41, 20), 3);
});

test("availability always sends a strict non-empty date interval", () => {
  assert.deepEqual(
    availabilityQueryDates({}, "2026-08-04"),
    { dateFrom: "2026-08-04", dateTo: "2026-08-05" }
  );
  assert.deepEqual(
    availabilityQueryDates({ dateFrom: "2026-08-10", dateTo: "2026-08-10" }),
    { dateFrom: "2026-08-10", dateTo: "2026-08-11" }
  );
  assert.deepEqual(
    availabilityQueryDates({ dateFrom: "2026-08-10", dateTo: "2026-08-09" }),
    { dateFrom: "2026-08-10", dateTo: "2026-08-11" }
  );
  assert.deepEqual(
    availabilityQueryDates({ dateFrom: "2026-08-10", dateTo: "2026-08-12" }),
    { dateFrom: "2026-08-10", dateTo: "2026-08-12" }
  );
});

test("availability presents every shared room state in Chinese with distinct occupancy semantics", () => {
  assert.deepEqual(HOMESTAY_ROOM_STATE_PRESENTATION, {
    available: { label: "可售", variant: "success" },
    reserved: { label: "已预订", variant: "warning" },
    held: { label: "暂时保留", variant: "info" },
    occupied: { label: "在住", variant: "primary" },
    turnover: { label: "周转中", variant: "warning" },
    out_of_service: { label: "停用", variant: "danger" },
    mode_unavailable: { label: "经营模式不可用", variant: "muted" }
  });
  assert.notEqual(
    HOMESTAY_ROOM_STATE_PRESENTATION.reserved.variant,
    HOMESTAY_ROOM_STATE_PRESENTATION.occupied.variant
  );
  assert.notEqual(
    HOMESTAY_ROOM_STATE_PRESENTATION.held.variant,
    HOMESTAY_ROOM_STATE_PRESENTATION.occupied.variant
  );
  assert.deepEqual(homestayRoomStatePresentation("legacy_unknown"), {
    label: "未知房态",
    variant: "muted"
  });
});

test("availability normalizes the legacy array response without changing v2 metadata", () => {
  const item = { unitId: "unit-1" } as never;
  assert.deepEqual(normalizeHomestayAvailabilityResponse([item], 1), {
    items: [item], total: 1, page: 1, page_size: 20
  });
  const legacy = Array.from({ length: 41 }, (_, index) => ({ unit_id: `unit-${index + 1}` })) as never;
  assert.deepEqual(
    normalizeHomestayAvailabilityResponse(legacy, 2).items.map((entry) => entry.unit_id),
    Array.from({ length: 20 }, (_, index) => `unit-${index + 21}`)
  );
  assert.equal(normalizeHomestayAvailabilityResponse(legacy, 2).total, 41);
  const wrapped = { items: [item], total: 41, page: 2, page_size: 20 };
  assert.equal(normalizeHomestayAvailabilityResponse(wrapped, 9), wrapped);
  assert.deepEqual(normalizeHomestayAvailabilityResponse([], 1), {
    items: [], total: 0, page: 1, page_size: 20
  });
});

test("rate workspaces remount whenever the selected unit changes", () => {
  assert.equal(homestayRateWorkspaceKey(null), "homestay-rate:no-unit");
  assert.notEqual(homestayRateWorkspaceKey("unit-a"), homestayRateWorkspaceKey("unit-b"));
  assert.equal(homestayRateWorkspaceKey("unit-a"), "homestay-rate:unit-a");
});

test("stay mutations mirror the booking lifecycle accepted by the API", () => {
  assert.deepEqual(homestayStayActionVisibility("draft"), {
    canAddGuest: true,
    canIssueCredential: false
  });
  for (const status of ["confirmed", "checked_in"]) {
    assert.deepEqual(homestayStayActionVisibility(status), {
      canAddGuest: true,
      canIssueCredential: true
    });
  }
  for (const status of ["cancelled", "no_show", "checked_out"]) {
    assert.deepEqual(homestayStayActionVisibility(status), {
      canAddGuest: false,
      canIssueCredential: false
    });
  }
});
