import assert from "node:assert/strict";
import test from "node:test";
import {
  HOMESTAY_LANDING_PRIORITY,
  HOMESTAY_DETAIL_READ_ACTIONS,
  HOMESTAY_LIST_READ_ACTIONS,
  availabilityQueryDates,
  hasExplicitEmptyHomestayUnitScope,
  homestayRateWorkspaceKey,
  homestayDetailHref,
  listPageState,
  normalizeHomestayAvailabilityResponse,
  pageCount,
  resolveHomestayLanding,
  shouldLoadHomestayRead,
  taskDetailHref
} from "./homestay-workbench.logic";
import { resolveReturnHref } from "../../../features/property-shared/detail/return-context";

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

test("availability normalizes the legacy array response without changing v2 metadata", () => {
  const item = { unitId: "unit-1" } as never;
  assert.deepEqual(normalizeHomestayAvailabilityResponse([item], 3), {
    items: [item], total: 1, page: 3, page_size: 20
  });
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
