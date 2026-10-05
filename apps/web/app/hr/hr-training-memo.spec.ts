import assert from "node:assert/strict";
import test from "node:test";
import { trainingMemoPayload } from "./training/TrainingMemoFields";

test("training note form preserves omitted fields and distinguishes explicit null from empty text", () => {
  const form = new FormData();
  assert.deepEqual(trainingMemoPayload(form), {});
  form.set("memo", "stale hidden form value");
  form.set("memoAction", "preserve");
  assert.deepEqual(trainingMemoPayload(form), {});
  form.set("memoAction", "clear");
  assert.deepEqual(trainingMemoPayload(form), { memo: null });
  form.set("memoAction", "write");
  form.set("memo", "");
  assert.deepEqual(trainingMemoPayload(form), { memo: "" });
  form.set("memo", "  备注\n原样  ");
  assert.deepEqual(trainingMemoPayload(form), { memo: "  备注\n原样  " });
});
