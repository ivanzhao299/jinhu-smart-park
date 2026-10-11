import assert from "node:assert/strict";
import test from "node:test";
import { approvedQuantityForWindow, ApprovedQuantityRequest } from "./hr-attendance-approved-quantity";

const at = (value: string) => new Date(value);
const req = (id: string, startAt: Date | null, endAt: Date | null, requestType = "overtime", status = "approved", version = 1): ApprovedQuantityRequest => ({ id, version, requestType, status, startAt, endAt });
const start = at("2026-06-30T23:59:59.999Z");
const end = at("2026-07-01T00:00:00.003Z");
const monthBoundary = at("2026-07-01T00:00:00.000Z");

test("unions overlap, duplicates, adjacency and clips half-open boundaries", () => {
  const rows = [
    req("a", at("2026-06-30T23:59:59.999Z"), at("2026-07-01T00:00:00.001Z")),
    req("b", at("2026-07-01T00:00:00.001Z"), at("2026-07-01T00:00:00.003Z")),
    req("c", at("2026-07-01T00:00:00.000Z"), at("2026-07-01T00:00:00.002Z")),
    req("duplicate", at("2026-06-30T23:59:59.999Z"), at("2026-07-01T00:00:00.001Z")),
    req("touch-left", at("2026-06-30T23:00:00.000Z"), start),
    req("touch-right", end, at("2026-07-01T01:00:00.000Z")),
  ];
  const result = approvedQuantityForWindow(rows, "overtime", start, end);
  assert.equal(result.availability, "known");
  assert.equal(result.durationMs, 4);
  assert.deepEqual(result.sources, [
    { id: "a", version: 1 }, { id: "b", version: 1 }, { id: "c", version: 1 }, { id: "duplicate", version: 1 },
  ]);
});

test("filters request type and approval status and returns explicit known zero", () => {
  const rows = [
    req("submitted", at("2026-07-01T00:00:00.000Z"), at("2026-07-01T01:00:00.000Z"), "overtime", "submitted"),
    req("trip", at("2026-07-01T00:00:00.000Z"), at("2026-07-01T01:00:00.000Z"), "business_trip"),
  ];
  assert.deepEqual(approvedQuantityForWindow(rows, "overtime", start, end), { availability: "known", durationMs: 0, sources: [], unknownSources: [] });
  const trip = approvedQuantityForWindow(rows, "business_trip", start, end);
  assert.equal(trip.availability, "known");
  assert.equal(trip.durationMs, 3);
  assert.deepEqual(trip.sources, [{ id: "trip", version: 1 }]);
});

test("separate month windows conserve every millisecond without minute rounding", () => {
  const source = req("cross-month", at("2026-06-30T23:59:59.999Z"), at("2026-07-01T00:00:00.002Z"), "business_trip", "approved", 7);
  const june = approvedQuantityForWindow([source], "business_trip", at("2026-06-01T00:00:00.000Z"), monthBoundary);
  const july = approvedQuantityForWindow([source], "business_trip", monthBoundary, at("2026-08-01T00:00:00.000Z"));
  assert.equal(june.durationMs, 1);
  assert.equal(july.durationMs, 2);
  assert.equal((june.durationMs ?? 0) + (july.durationMs ?? 0), 3);
  assert.deepEqual(july.sources, [{ id: "cross-month", version: 7 }]);
});

test("Asia/Shanghai month boundary partitions an overnight interval without losing milliseconds", () => {
  const boundary = at("2026-07-01T00:00:00+08:00");
  const overnight = req("sh-overnight", at("2026-06-30T23:59:59.999+08:00"), at("2026-07-01T00:00:00.002+08:00"));
  const june = approvedQuantityForWindow([overnight], "overtime", at("2026-06-01T00:00:00+08:00"), boundary);
  const july = approvedQuantityForWindow([overnight], "overtime", boundary, at("2026-08-01T00:00:00+08:00"));
  assert.equal(june.durationMs, 1);
  assert.equal(july.durationMs, 2);
  assert.equal((june.durationMs ?? 0) + (july.durationMs ?? 0), 3);
});

test("invalid windows throw RangeError", () => {
  assert.throws(() => approvedQuantityForWindow([], "overtime", new Date(Number.NaN), end), RangeError);
  assert.throws(() => approvedQuantityForWindow([], "overtime", end, start), RangeError);
  assert.throws(() => approvedQuantityForWindow([], "overtime", start, start), RangeError);
  assert.throws(() => approvedQuantityForWindow([], "overtime", new Date(-8_640_000_000_000_000), new Date(8_640_000_000_000_000)), RangeError);
});

test("valid intersecting evidence survives beside an unknown approved source", () => {
  const result = approvedQuantityForWindow([
    req("known", start, end, "overtime", "approved", 3),
    req("unknown", null, end, "overtime", "approved", 8),
  ], "overtime", start, end);
  assert.equal(result.availability, "unknown");
  assert.equal(result.durationMs, null);
  assert.deepEqual(result.sources, [{ id: "known", version: 3 }]);
  assert.deepEqual(result.unknownSources, [{ id: "unknown", version: 8, reason: "missing_start" }]);
});

test("missing, invalid and reversed approved timestamps yield unknown with reason and evidence", () => {
  const rows = [
    req("missing-start", null, end),
    req("invalid-start", new Date(Number.NaN), end),
    req("missing-end", start, null),
    req("invalid-end", start, new Date(Number.NaN)),
    req("reversed", end, start),
  ];
  const result = approvedQuantityForWindow(rows, "overtime", start, end);
  assert.equal(result.availability, "unknown");
  assert.equal(result.durationMs, null);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.unknownSources, [
    { id: "invalid-end", version: 1, reason: "invalid_end" },
    { id: "invalid-start", version: 1, reason: "invalid_start" },
    { id: "missing-end", version: 1, reason: "missing_end" },
    { id: "missing-start", version: 1, reason: "missing_start" },
    { id: "reversed", version: 1, reason: "non_increasing_interval" },
  ]);
});

test("source version changes evidence, ordering is deterministic, and inputs remain unchanged", () => {
  const rows = [
    req("z", at("2026-07-01T00:00:00.000Z"), at("2026-07-01T00:00:00.002Z"), "overtime", "approved", 2),
    req("a", at("2026-07-01T00:00:00.001Z"), at("2026-07-01T00:00:00.003Z"), "overtime", "approved", 4),
  ];
  const snapshot = rows.map(row => ({ ...row, startAt: row.startAt && new Date(row.startAt), endAt: row.endAt && new Date(row.endAt) }));
  const result = approvedQuantityForWindow(rows, "overtime", start, end);
  assert.deepEqual(result.sources, [{ id: "a", version: 4 }, { id: "z", version: 2 }]);
  assert.notDeepEqual(result.sources, approvedQuantityForWindow(rows.map(row => row.id === "z" ? { ...row, version: 3 } : row), "overtime", start, end).sources);
  assert.deepEqual(rows, snapshot);
});
