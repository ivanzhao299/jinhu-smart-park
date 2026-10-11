import assert from "node:assert/strict";
import test from "node:test";
import { approvedLeaveMinutesAfterCancellations, effectiveApprovedLeaveFragments, type ApprovedLeaveSource, type LeaveCancellationFact } from "./hr-attendance-leave-cancellation-effect";

const at = (time: string) => new Date(`2026-07-${time}+08:00`);
const source = (id: string, from = "01T09:00:00", to = "01T17:00:00"): ApprovedLeaveSource => ({ id, requestType: "leave", status: "approved", startAt: at(from), endAt: at(to) });
const cut = (id: string, from: string, to: string, status = "approved"): LeaveCancellationFact => ({ sourceRequestId: id, status, startAt: at(from), endAt: at(to) });
const minutes = (sources: ApprovedLeaveSource[], cuts: LeaveCancellationFact[]) => approvedLeaveMinutesAfterCancellations(sources, cuts, at("01T09:00:00"), at("01T17:00:00"));

test("partial and complete cancellation preserve the original source and only affect approved cuts", () => {
  const original = source("a"), before = JSON.stringify(original);
  assert.equal(minutes([original], []), 480);
  assert.equal(minutes([original], [cut("a", "01T10:00:00", "01T12:00:00")]), 360);
  assert.equal(minutes([original], [cut("a", "01T09:00:00", "01T17:00:00")]), 0);
  for (const status of ["draft", "submitted", "returned", "cancelled"]) assert.equal(minutes([original], [cut("a", "01T09:00:00", "01T17:00:00", status)]), 480);
  assert.equal(JSON.stringify(original), before);
});

test("source-bound subtraction cannot erase another approved leave in the same window", () => {
  const leaves = [source("a"), source("b", "01T11:00:00", "01T13:00:00")];
  assert.equal(minutes(leaves, [cut("a", "01T10:00:00", "01T12:00:00")]), 420);
  assert.equal(minutes(leaves, [cut("unknown", "01T09:00:00", "01T17:00:00")]), 480);
  assert.equal(minutes(leaves, [cut("a", "01T09:00:00", "01T17:00:00")]), 120);
});

test("duplicate, nested, touching and unordered cuts subtract their union once", () => {
  const cuts = [cut("a", "01T11:00:00", "01T13:00:00"), cut("a", "01T10:00:00", "01T12:00:00"), cut("a", "01T10:00:00", "01T12:00:00"), cut("a", "01T13:00:00", "01T14:00:00")];
  assert.equal(minutes([source("a")], cuts), 240);
  assert.equal(minutes([source("a")], [...cuts].reverse()), 240);
  assert.deepEqual(effectiveApprovedLeaveFragments([source("a")], cuts).map(row => [row.startAt.toISOString(), row.endAt.toISOString()]), [[at("01T09:00:00").toISOString(), at("01T10:00:00").toISOString()], [at("01T14:00:00").toISOString(), at("01T17:00:00").toISOString()]]);
});

test("saved overnight shift counts cancellation on the next calendar day", () => {
  const original = source("night", "31T23:00:00", "31T23:00:00");
  original.endAt = new Date("2026-08-01T07:00:00+08:00");
  const cancelled = { sourceRequestId: "night", status: "approved", startAt: new Date("2026-08-01T02:00:00+08:00"), endAt: new Date("2026-08-01T04:00:00+08:00") };
  assert.equal(approvedLeaveMinutesAfterCancellations([original], [cancelled], original.startAt!, original.endAt), 360);
  assert.equal(approvedLeaveMinutesAfterCancellations([original], [cancelled], new Date("2026-08-01T01:00:00+08:00"), new Date("2026-08-01T05:00:00+08:00")), 120);
});

test("invalid approved cuts fail closed; undated and unapproved originals have no effect", () => {
  for (const invalid of [cut("a", "01T08:00:00", "01T10:00:00"), cut("a", "01T16:00:00", "01T18:00:00"), cut("a", "01T12:00:00", "01T12:00:00"), { ...cut("a", "01T10:00:00", "01T11:00:00"), startAt: new Date("invalid") }]) assert.throws(() => minutes([source("a")], [invalid]), /INVALID_FACT/);
  assert.equal(minutes([{ ...source("a"), status: "submitted" }, { ...source("b"), requestType: "overtime" }, { ...source("c"), startAt: null }], []), 0);
  assert.equal(approvedLeaveMinutesAfterCancellations([source("a")], [], at("01T17:00:00"), at("01T19:00:00")), 0);
});
