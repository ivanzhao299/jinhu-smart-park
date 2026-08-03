import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildFileIdReplacement,
  isCurrentRequestGeneration,
  normalizeFileIdInput,
  normalizeFileIdProjection,
  normalizeNumericInput,
  normalizeRecordArrayProjection
} from "./inspect-task-form.logic";

test("inspection execution ignores responses from an older request generation", () => {
  assert.equal(isCurrentRequestGeneration(2, 2), true);
  assert.equal(isCurrentRequestGeneration(1, 2), false);

  const source = readFileSync(resolve(__dirname, "InspectTasksPageClient.tsx"), "utf8");
  assert.match(source, /const requestGeneration = \+\+executionRequestGeneration\.current/);
  assert.match(source, /isCurrentRequestGeneration\(requestGeneration, executionRequestGeneration\.current\)/);
  assert.ok(
    source.indexOf("applyTemplateItems(detail.data.items, detail.data.results)")
      < source.indexOf("setViewing(detail.data)")
  );
});

test("inspection execution rejects malformed collection projections before mapping form state", () => {
  const valid = { id: "item-a", itemName: "检查项 A" };

  assert.deepEqual(normalizeRecordArrayProjection(undefined, ["id"]), { available: false, value: [] });
  assert.deepEqual(normalizeRecordArrayProjection(null, ["id"]), { available: false, value: [] });
  assert.deepEqual(normalizeRecordArrayProjection("***", ["id"]), { available: false, value: [] });
  assert.deepEqual(normalizeRecordArrayProjection([null, 42, [], {}, { id: "" }, valid], ["id"]), { available: false, value: [] });
  assert.deepEqual(normalizeRecordArrayProjection([], ["id"]), { available: true, value: [] });
  assert.deepEqual(normalizeRecordArrayProjection([valid], ["id"]), { available: true, value: [valid] });
  assert.deepEqual(
    normalizeRecordArrayProjection([{ itemId: "result-a" }, { itemId: null }, { id: "wrong-key" }], ["itemId"]),
    { available: false, value: [] }
  );
});

test("inspection execution normalizes attachment projections before opening the form", () => {
  assert.equal(normalizeFileIdInput([" file-a ", "", "file-b"]), "file-a,file-b");
  assert.equal(normalizeFileIdInput(undefined), "");
  assert.equal(normalizeFileIdInput(null), "");
  assert.equal(normalizeFileIdInput("***"), "");
  assert.equal(normalizeFileIdInput(["file-a", 42, null]), "");
});

test("inspection execution distinguishes an explicit empty attachment list from an unavailable projection", () => {
  assert.deepEqual(normalizeFileIdProjection([]), { available: true, value: "" });
  assert.deepEqual(normalizeFileIdProjection(["file-a"]), { available: true, value: "file-a" });
  assert.deepEqual(normalizeFileIdProjection([null]), { available: false, value: "" });
  assert.deepEqual(normalizeFileIdProjection(["file-a", null]), { available: false, value: "" });
  assert.deepEqual(normalizeFileIdProjection(undefined), { available: false, value: "" });
  assert.deepEqual(normalizeFileIdProjection("***"), { available: false, value: "" });
});

test("inspection result payloads omit unavailable evidence and retain explicit replacement semantics", () => {
  assert.deepEqual(buildFileIdReplacement("", false), {});
  assert.deepEqual(buildFileIdReplacement("", true), { photo_file_ids: [] });
  assert.deepEqual(buildFileIdReplacement(" file-a, file-b ", true), {
    photo_file_ids: ["file-a", "file-b"]
  });
});

test("inspection result photos use their independent field-policy entity", () => {
  const source = readFileSync(resolve(__dirname, "InspectTasksPageClient.tsx"), "utf8");

  assert.match(source, /INSPECT_TASK_RESULT_ENTITY = "inspect_task_result"/);
  assert.match(
    source,
    /canViewResultPhotos = canViewField\(authUser, SAFETY_MODULE, INSPECT_TASK_RESULT_ENTITY, "photoFileIds"\)/
  );
  assert.match(source, /photoFileIdsAvailable: canViewResultPhotos && photoProjection\.available/);
  assert.doesNotMatch(source, /photoFileIdsAvailable: canViewTaskPhotos && photoProjection\.available/);
});

test("inspection execution accepts only finite numeric GPS projections", () => {
  assert.equal(normalizeNumericInput(" 120.123 "), "120.123");
  assert.equal(normalizeNumericInput(31.234), "31.234");
  assert.equal(normalizeNumericInput("***"), "");
  assert.equal(normalizeNumericInput(Number.NaN), "");
  assert.equal(normalizeNumericInput(undefined), "");
});
