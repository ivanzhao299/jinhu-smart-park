import assert from "node:assert/strict";
import test from "node:test";
import { calculateLeaveBalances, type ClassifiedLeaveSource, type LeaveBalanceInput } from "./hr-attendance-leave-balance";

const at = (time: string) => new Date(`2026-07-${time}+08:00`);
const source = (id: string, type: string | null, start = "01T09:00:00", end = "01T17:00:00"): ClassifiedLeaveSource =>
  ({ id, leaveTypeId: type, requestType: "leave", status: "approved", startAt: at(start), endAt: at(end) });
const base = (): LeaveBalanceInput => ({
  from: at("01T00:00:00"), to: at("02T00:00:00"), scheduleCoverageComplete: true, sourceCoverageComplete: true,
  schedules: [{ startAt: at("01T09:00:00"), endAt: at("01T12:00:00") }, { startAt: at("01T13:00:00"), endAt: at("01T17:00:00") }],
  openings: [{ leaveTypeId: "annual", openingMinutes: 1000, adjustmentMinutes: 0 }], sources: [source("a", "annual")], cancellations: [],
});
const first = (input: LeaveBalanceInput) => calculateLeaveBalances(input).items[0]!;

test("saved work windows exclude lunch; quota and adjustment are explicit and immutable", () => {
  const input = base(); input.openings = [{ leaveTypeId: "annual", openingMinutes: 1000, adjustmentMinutes: -20 }];
  const before = JSON.stringify(input), row = first(input);
  assert.equal(row.consumedMinutes, 420); assert.equal(row.balanceMinutes, 560);
  assert.equal(JSON.stringify(input), before);
});

test("overlapping schedules and same-type requests count each work minute once", () => {
  const input = base(); input.schedules = [...input.schedules, ...input.schedules];
  input.sources = [source("a", "annual"), source("b", "annual", "01T10:00:00", "01T16:00:00")];
  assert.equal(first(input).consumedMinutes, 420);
  assert.equal(first({ ...input, schedules: [...input.schedules].reverse(), sources: [...input.sources].reverse() }).consumedMinutes, 420);
});

test("only source-bound approved cancellations return occupancy, including duplicate cuts", () => {
  const input = base(); input.cancellations = [
    { sourceRequestId: "a", status: "approved", startAt: at("01T10:00:00"), endAt: at("01T14:00:00") },
    { sourceRequestId: "a", status: "approved", startAt: at("01T11:00:00"), endAt: at("01T15:00:00") },
    { sourceRequestId: "a", status: "submitted", startAt: at("01T09:00:00"), endAt: at("01T17:00:00") },
  ];
  assert.equal(first(input).consumedMinutes, 180); assert.equal(first(input).balanceMinutes, 820);
  input.sources = [...input.sources, source("b", "annual")];
  assert.equal(first(input).consumedMinutes, 420);
});

test("cross-midnight schedules are clipped to the exact reporting cutoff", () => {
  const input = base(); input.from = at("02T00:00:00"); input.to = at("02T05:00:00");
  input.schedules = [{ startAt: at("01T23:00:00"), endAt: at("02T07:00:00") }];
  input.sources = [source("a", "annual", "01T22:00:00", "02T08:00:00")];
  input.cancellations = [{ sourceRequestId: "a", status: "approved", startAt: at("02T02:00:00"), endAt: at("02T04:00:00") }];
  assert.equal(first(input).consumedMinutes, 180);
});

test("missing opening differs from zero; known overspending remains a negative fact", () => {
  const input = base(); input.openings = [{ leaveTypeId: "annual", openingMinutes: null, adjustmentMinutes: 0 }];
  assert.equal(first(input).consumedMinutes, 420); assert.equal(first(input).balanceMinutes, null);
  assert.deepEqual(first(input).blockers, ["opening_unknown"]);
  input.openings = [{ leaveTypeId: "annual", openingMinutes: 0, adjustmentMinutes: 0 }];
  assert.equal(first(input).balanceMinutes, -420);
  input.sources = []; assert.equal(first(input).balanceMinutes, 0);
});

test("missing coverage cannot fabricate zero even with no stored schedules or requests", () => {
  const input = base(); input.schedules = []; input.sources = [];
  input.scheduleCoverageComplete = false; input.sourceCoverageComplete = false;
  assert.equal(first(input).observedMinutes, 0); assert.equal(first(input).consumedMinutes, null);
  assert.equal(first(input).balanceMinutes, null);
  assert.deepEqual(first(input).blockers, ["schedule_coverage_incomplete", "source_coverage_incomplete"]);
  assert.equal(first({ ...input, scheduleCoverageComplete: true, sourceCoverageComplete: true }).consumedMinutes, 0);
});

test("unclassified actual work leaves all balances unknown, while rest-only leave does not", () => {
  const input = base(); input.sources = [source("unknown", null, "01T10:00:00", "01T11:00:00")];
  assert.equal(calculateLeaveBalances(input).unclassifiedMinutes, 60);
  assert.deepEqual(first(input).blockers, ["leave_classification_incomplete"]);
  assert.equal(first(input).balanceMinutes, null);
  input.sources = [source("rest", null, "01T12:00:00", "01T13:00:00")];
  assert.equal(calculateLeaveBalances(input).unclassifiedMinutes, 0); assert.equal(first(input).balanceMinutes, 1000);
});

test("different types overlapping at work invalidate affected balances without arbitrary priority", () => {
  const input = base(); input.openings = [...input.openings,
    { leaveTypeId: "sick", openingMinutes: 600, adjustmentMinutes: 0 }, { leaveTypeId: "other", openingMinutes: 10, adjustmentMinutes: 0 }];
  input.sources = [source("a", "annual", "01T09:00:00", "01T11:00:00"), source("b", "sick", "01T10:00:00", "01T12:00:00")];
  const result = calculateLeaveBalances(input);
  assert.deepEqual(result.items.map(row => row.balanceMinutes), [null, null, 10]);
  assert.deepEqual(result.items.map(row => row.observedMinutes), [120, 120, 0]);
  assert.deepEqual(result.items[0]!.blockers, ["leave_type_overlap"]);
});

test("touching types, rest-only overlap and cancelled overlap remain exact", () => {
  const input = base(); input.openings = [...input.openings, { leaveTypeId: "sick", openingMinutes: 600, adjustmentMinutes: 0 }];
  input.sources = [source("a", "annual", "01T09:00:00", "01T13:00:00"), source("b", "sick", "01T12:00:00", "01T17:00:00")];
  assert.deepEqual(calculateLeaveBalances(input).items.map(row => row.balanceMinutes), [820, 360]);
  input.sources = [source("a", "annual"), source("b", "sick", "01T10:00:00", "01T11:00:00")];
  input.cancellations = [{ sourceRequestId: "a", status: "approved", startAt: at("01T10:00:00"), endAt: at("01T11:00:00") }];
  assert.deepEqual(calculateLeaveBalances(input).items.map(row => row.balanceMinutes), [640, 540]);
});

test("undated approved leave cannot silently disappear; nonapproved or other request types do not consume", () => {
  const input = base(); input.sources = [{ ...source("a", "annual"), startAt: null }];
  assert.deepEqual(first(input).blockers, ["approved_leave_undated"]); assert.equal(first(input).balanceMinutes, null);
  for (const status of ["draft", "returned", "submitted", "cancelled"]) {
    input.sources = [{ ...source("a", "annual"), status }]; assert.equal(first(input).consumedMinutes, 0);
  }
  input.sources = [{ ...source("a", "annual"), requestType: "overtime" }]; assert.equal(first(input).consumedMinutes, 0);
});

test("invalid quantities, identities, windows, minute precision and orphan cuts fail closed", () => {
  for (const quantity of [NaN, Infinity, -1, 0.5, 2147483648]) {
    const input = base(); input.openings = [{ ...input.openings[0]!, openingMinutes: quantity }];
    assert.throws(() => calculateLeaveBalances(input), /INVALID_QUANTITY/);
  }
  const input = base();
  assert.throws(() => calculateLeaveBalances({ ...input, sources: [...input.sources, ...input.sources] }), /DUPLICATE_SOURCE/);
  assert.throws(() => calculateLeaveBalances({ ...input, openings: [...input.openings, ...input.openings] }), /DUPLICATE_TYPE/);
  assert.throws(() => calculateLeaveBalances({ ...input, sources: [source("a", "absent")] }), /UNKNOWN_TYPE/);
  assert.throws(() => calculateLeaveBalances({ ...input, to: input.from }), /INVALID_INTERVAL/);
  assert.throws(() => calculateLeaveBalances({ ...input, from: new Date("invalid") }), /INVALID_INSTANT/);
  assert.throws(() => calculateLeaveBalances({ ...input, from: new Date(input.from.getTime() + 1) }), /INVALID_INSTANT/);
  const cut = { sourceRequestId: "absent", status: "approved", startAt: at("01T10:00:00"), endAt: at("01T11:00:00") };
  assert.throws(() => calculateLeaveBalances({ ...input, cancellations: [cut] }), /ORPHAN_CANCELLATION/);
  assert.throws(() => calculateLeaveBalances({ ...input, cancellations: [{ ...cut, sourceRequestId: "a", startAt: at("01T08:00:00") }] }), /INVALID_FACT/);
  assert.throws(() => calculateLeaveBalances({ ...input, openings: [{ ...input.openings[0]!, openingMinutes: 2147483647, adjustmentMinutes: 1000 }] }), /INVALID_QUANTITY/);
});

test("60 deterministic source/window/cancellation combinations agree with an independent minute occupancy oracle", () => {
  const epoch = at("01T00:00:00").getTime(), date = (minute: number) => new Date(epoch + minute * 60000);
  for (let seed = 0; seed < 60; seed++) {
    const input = base(); input.from = date(0); input.to = date(100);
    input.schedules = [{ startAt: date(seed % 12), endAt: date(40 + seed % 20) }, { startAt: date(30), endAt: date(80 + seed % 20) }];
    input.sources = [source("a", "annual"), source("b", "annual")].map((row, index) => ({ ...row, startAt: date(index * 20 + seed % 9), endAt: date(index * 10 + 60 + seed % 15) }));
    input.cancellations = [{ sourceRequestId: "a", status: seed % 2 ? "approved" : "submitted", startAt: date(20), endAt: date(35) }];
    let expected = 0;
    for (let minute = 0; minute < 100; minute++) {
      const ms = date(minute).getTime();
      const work = input.schedules.some(row => row.startAt.getTime() <= ms && ms < row.endAt.getTime());
      const leave = input.sources.some(row => row.startAt!.getTime() <= ms && ms < row.endAt!.getTime()
        && !input.cancellations.some(cut => cut.status === "approved" && cut.sourceRequestId === row.id && cut.startAt.getTime() <= ms && ms < cut.endAt.getTime()));
      if (work && leave) expected++;
    }
    assert.equal(first(input).consumedMinutes, expected, `case ${seed}`);
  }
});
