import assert from "node:assert/strict";
import test from "node:test";
import { requisitionChanges, requisitionDraft, rebaseRequisitionDraft, requisitionStatusChoices, type RequisitionEditable } from "./requisition-draft";

const original: RequisitionEditable = { requisitionCode: "R-1", title: "合成招聘需求", orgId: "org-a", positionId: "position-a",
  ownerUserId: "owner-a", headcount: 3, plannedOnboardDate: "2026-11-01", approvalNote: "原说明", status: "open" };

test("a partial correction never sends unchanged references or a canonical no-op", () => {
  const draft = requisitionDraft(original);
  assert.deepEqual(requisitionChanges(original, { ...draft, title: "  更正标题  " }), { title: "更正标题" });
  assert.deepEqual(requisitionChanges(original, { ...draft, requisitionCode: " R-1 ", headcount: "03" }), {});
});
test("clearing optional values is explicit null, not omission", () => {
  assert.deepEqual(requisitionChanges(original, { ...requisitionDraft(original), positionId: "", plannedOnboardDate: "", approvalNote: " " }),
    { positionId: null, plannedOnboardDate: null, approvalNote: null });
});
test("explicit conflict rebase preserves another operator's untouched changes", () => {
  const current = { ...original, ownerUserId: "owner-b", headcount: 5, approvalNote: "他人新说明", status: "paused" as const };
  const rebased = rebaseRequisitionDraft(original, { ...requisitionDraft(original), title: "本地草稿标题" }, current);
  assert.deepEqual(requisitionChanges(current, rebased), { title: "本地草稿标题" });
  assert.equal(rebased.ownerUserId, "owner-b"); assert.equal(rebased.headcount, "5"); assert.equal(rebased.status, "paused");
});
test("invalid headcount cannot become an unintended numeric zero or truncation", () => {
  for (const headcount of ["", "0", "-1", "2.5", "1e2", "1001", "Infinity"]) {
    assert.throws(() => requisitionChanges(original, { ...requisitionDraft(original), headcount }), /整数/u);
  }
});
test("status choices retain the current state and respect hired capacity and terminal cancellation", () => {
  assert.deepEqual(requisitionStatusChoices("closed", 3, 3), ["closed"]);
  assert.deepEqual(requisitionStatusChoices("closed", 3, 4), ["closed", "open"]);
  assert.deepEqual(requisitionStatusChoices("open", 1, 3), ["open", "paused", "closed"]);
  assert.deepEqual(requisitionStatusChoices("draft", 0, 3), ["draft", "open", "cancelled"]);
  assert.deepEqual(requisitionStatusChoices("cancelled", 0, 3), ["cancelled"]);
});
