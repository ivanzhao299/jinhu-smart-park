import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmationShouldClose,
  createSingleFlightGate,
  reduceDialogDraft,
  runDialogConfirmation,
  visibleDialogReason
} from "./dialog-state";

test("only an explicit failed confirmation keeps the dialog open", () => {
  assert.equal(confirmationShouldClose(false), false);
  assert.equal(confirmationShouldClose(true), true);
  assert.equal(confirmationShouldClose(undefined), true);
});

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

test("a failed async confirmation keeps the dialog open and releases the gate", async () => {
  const gate = createSingleFlightGate();
  assert.equal(gate.tryEnter(), true);

  const shouldClose = await runDialogConfirmation(gate, async () => false);

  assert.equal(shouldClose, false);
  assert.equal(gate.isActive(), false);
});

test("a rejected async confirmation releases the gate before propagating", async () => {
  const gate = createSingleFlightGate();
  assert.equal(gate.tryEnter(), true);

  await assert.rejects(
    runDialogConfirmation(gate, async () => {
      throw new Error("conflict");
    }),
    /conflict/
  );
  assert.equal(gate.isActive(), false);
});
