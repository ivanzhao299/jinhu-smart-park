import assert from "node:assert/strict";
import test from "node:test";
import { trainingResultPayload } from "./training/training-result-form";

test("result correction keeps rendered revision and distinguishes preservation, empty text and clear", () => {
  const form = new FormData();
  form.set("reason", " Synthetic review ");
  form.set("score", "stale hidden value");
  assert.throws(() => trainingResultPayload(form, "correct", 7, true, true), /选择/);
  form.set("scoreAction", "clear");
  form.set("evaluationAction", "write");
  form.set("evaluation", "");
  form.set("memoAction", "write");
  form.set("memo", "  raw memo\n  ");
  assert.deepEqual(trainingResultPayload(form, "correct", 7, true, true), { correctedScore: null, correctedEvaluation: "", correctedMemo: "  raw memo\n  ", expectedRevision: 7, reason: "Synthetic review" });
});

test("cost and certificate payloads use exact field permissions, including clear attempts", () => {
  for (const cost of [false, true]) for (const certificate of [false, true]) {
    const form = new FormData();
    form.set("scoreAction", "write"); form.set("score", "0"); form.set("reason", "Synthetic field check");
    form.set("actualCostAction", "clear"); form.set("certificateFileIdAction", "clear");
    const payload = trainingResultPayload(form, "correct", 0, cost, certificate);
    assert.equal(Object.hasOwn(payload, "correctedActualCost"), cost);
    assert.equal(Object.hasOwn(payload, "certificateFileId"), certificate);
    assert.equal(payload.correctedScore, "0");
  }
});

test("completion requires hours, preserves optional fields and accepts a selected recovered certificate", () => {
  const form = new FormData();
  assert.throws(() => trainingResultPayload(form, "complete", 0, false, true), /学时/);
  form.set("hoursAction", "write"); form.set("hours", "2.50");
  assert.deepEqual(trainingResultPayload(form, "complete", 0, false, true), { completedHours: "2.50" });
  form.set("certificateFileIdAction", "write");
  assert.throws(() => trainingResultPayload(form, "complete", 0, false, true), /填写/);
  form.set("certificateFileId", "synthetic-recovered-file");
  assert.equal(trainingResultPayload(form, "complete", 0, false, true).certificateFileId, "synthetic-recovered-file");
  form.set("hoursAction", "clear");
  assert.throws(() => trainingResultPayload(form, "complete", 0, false, true), /不能清空/);
});
