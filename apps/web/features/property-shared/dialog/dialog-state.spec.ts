import assert from "node:assert/strict";
import test from "node:test";
import {
  createSingleFlightGate,
  reduceDialogDraft,
  visibleDialogReason
} from "./dialog-state";

test("reason is cleared when closed or synchronized to another target", () => {
  const initial = { targetId: "booking-1", reason: "operator reason" };
  const closed = reduceDialogDraft(initial, {
    type: "synchronize",
    open: false,
    targetId: "booking-1"
  });
  const changed = reduceDialogDraft(initial, {
    type: "synchronize",
    open: true,
    targetId: "booking-2"
  });

  assert.deepEqual(closed, { targetId: "booking-1", reason: "" });
  assert.deepEqual(changed, { targetId: "booking-2", reason: "" });
  assert.equal(visibleDialogReason(initial, true, "booking-2"), "");
});

test("successful confirmation clears only the matching target draft", () => {
  const initial = { targetId: "booking-1", reason: "operator reason" };

  assert.deepEqual(
    reduceDialogDraft(initial, { type: "confirmed", targetId: "booking-1" }),
    { targetId: "booking-1", reason: "" }
  );
  assert.equal(
    reduceDialogDraft(initial, { type: "confirmed", targetId: "booking-2" }),
    initial
  );
});

test("single-flight gate rejects same-tick duplicate entry until released", () => {
  const gate = createSingleFlightGate();

  assert.equal(gate.tryEnter(), true);
  assert.equal(gate.isActive(), true);
  assert.equal(gate.tryEnter(), false);
  gate.leave();
  assert.equal(gate.isActive(), false);
  assert.equal(gate.tryEnter(), true);
});
