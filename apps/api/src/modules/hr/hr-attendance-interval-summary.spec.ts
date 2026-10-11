import assert from "node:assert/strict";
import test from "node:test";
import { approvedIntervalDifference, sumApprovedIntervalMilliseconds } from "./hr-attendance-interval-summary";

function daily(workDate: string, durationMs = 1): Record<string, unknown> {
  const start = new Date(`${workDate}T00:00:00+08:00`);
  return { workDate, approvedIntervalQuantities: {
    basis: "shanghai-calendar-interval-v1", windowStart: start.toISOString(), windowEnd: new Date(start.getTime() + 86400000).toISOString(),
    overtime: { availability: "known", durationMs, sources: [{ id: "source", version: 1 }], unknownSources: [] },
    businessTrip: { availability: "known", durationMs: 0, sources: [], unknownSources: [] },
  } };
}

test("month sums exact milliseconds without per-day minute truncation; types remain independent", () => {
  const rows = [daily("2026-07-01", 1), daily("2026-07-02", 59999)];
  assert.equal(sumApprovedIntervalMilliseconds(rows, "overtime"), "60000");
  assert.equal(sumApprovedIntervalMilliseconds(rows, "businessTrip"), "0");
});

test("missing, unknown, malformed, repeated dates or wrong windows remain unknown rather than partial totals", () => {
  assert.equal(sumApprovedIntervalMilliseconds([], "overtime"), null);
  assert.equal(sumApprovedIntervalMilliseconds([daily("2026-07-01"), { workDate: "2026-07-02" }], "overtime"), null);
  assert.equal(sumApprovedIntervalMilliseconds([daily("2026-07-01"), daily("2026-07-01")], "overtime"), null);
  for (const patch of [{ availability: "unknown", durationMs: null }, { durationMs: -1 }, { durationMs: 1.1 }, { durationMs: 86400001 }, { sources: [] }, { unknownSources: [{}] }, { sources: [{ id: "source", version: 0 }] }]) {
    const row = daily("2026-07-01"), fact = row.approvedIntervalQuantities as Record<string, unknown>;
    fact.overtime = { ...(fact.overtime as object), ...patch };
    assert.equal(sumApprovedIntervalMilliseconds([row], "overtime"), null);
    assert.equal(sumApprovedIntervalMilliseconds([row], "businessTrip"), "0");
  }
  const wrongWindow = daily("2026-07-01");
  (wrongWindow.approvedIntervalQuantities as Record<string, unknown>).windowEnd = "2026-07-02T00:00:00Z";
  assert.equal(sumApprovedIntervalMilliseconds([wrongWindow], "overtime"), null);
  assert.equal(sumApprovedIntervalMilliseconds([{ ...daily("2026-02-28"), workDate: "2026-02-30" }], "overtime"), null);
});

test("full-month quantity exceeds int32 safely and correction differences preserve unknown", () => {
  const rows = Array.from({ length: 31 }, (_, i) => daily(`2026-07-${String(i + 1).padStart(2, "0")}`, 86400000));
  assert.equal(sumApprovedIntervalMilliseconds(rows, "overtime"), "2678400000");
  assert.deepEqual(approvedIntervalDifference("2678400000", "0"), { delta: "2678400000", availability: "known" });
  assert.deepEqual(approvedIntervalDifference("0", "2678400000"), { delta: "-2678400000", availability: "known" });
  assert.deepEqual(approvedIntervalDifference("0", null), { delta: null, availability: "previous_unknown" });
  assert.deepEqual(approvedIntervalDifference(null, "0"), { delta: null, availability: "current_unknown" });
});
