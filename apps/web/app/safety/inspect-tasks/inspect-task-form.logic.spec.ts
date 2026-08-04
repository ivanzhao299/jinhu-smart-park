import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildEditableResultValuePayload,
  buildFileIdReplacement,
  isCurrentRequestGeneration,
  normalizeFileIdInput,
  normalizeFileIdProjection,
  normalizeNumericInput,
  normalizeRecordArrayProjection,
  resolveExecutionChildrenProjection,
  resolveInspectTaskExecutionEntry
} from "./inspect-task-form.logic";

test("inspection execution entry starts, resumes, or hides by lifecycle status", () => {
  assert.equal(resolveInspectTaskExecutionEntry("10"), "start");
  assert.equal(resolveInspectTaskExecutionEntry("40"), "start");
  assert.equal(resolveInspectTaskExecutionEntry("20"), "resume");
  assert.equal(resolveInspectTaskExecutionEntry("30"), "hidden");
  assert.equal(resolveInspectTaskExecutionEntry("unexpected"), "hidden");
});

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

test("inspection execution is a single guarded business action with task-owned items", () => {
  const source = readFileSync(resolve(__dirname, "InspectTasksPageClient.tsx"), "utf8");
  const openExecute = source.slice(
    source.indexOf("async function openExecute"),
    source.indexOf("function applyTemplateItems")
  );

  assert.match(openExecute, /executionActionLock\.current/);
  assert.match(openExecute, /\/safety\/inspect-tasks\/\$\{task\.id\}\/start/);
  assert.match(openExecute, /resolveExecutionChildrenProjection<InspectItemRow, InspectTaskResultRow>/);
  assert.match(openExecute, /startResponse\.data\.items/);
  assert.match(openExecute, /preflightChildren\.items/);
  assert.doesNotMatch(openExecute, /inspect-templates/);
  assert.doesNotMatch(source, />\s*开始任务\s*</);
  assert.match(source, /taskDetailEndpoint\(mode, row\.id\)/);
  assert.match(openExecute, /taskExecutionEndpoint\(mode, row\.id\)/);
  assert.ok(openExecute.indexOf("preflightChildren.available") < openExecute.indexOf("/start"));
});

test("inspection start prefers fresh valid children and falls back atomically", () => {
  const oldItems = [{ id: "item-old" }];
  const oldResults = [{ itemId: "item-old", valueText: "old" }];
  const freshItems = [{ id: "item-new" }];
  const freshResults = [{ itemId: "item-new", valueText: "fresh" }];

  assert.deepEqual(
    resolveExecutionChildrenProjection(freshItems, freshResults, oldItems, oldResults),
    { available: true, items: freshItems, results: freshResults, source: "primary" }
  );
  assert.deepEqual(
    resolveExecutionChildrenProjection(undefined, freshResults, oldItems, oldResults),
    { available: true, items: oldItems, results: oldResults, source: "fallback" }
  );
  assert.deepEqual(
    resolveExecutionChildrenProjection(undefined, freshResults),
    { available: false, items: [], results: [], source: "unavailable" }
  );
});

test("inspection resume entry accepts any execution permission", () => {
  const source = readFileSync(resolve(__dirname, "InspectTasksPageClient.tsx"), "utf8");

  assert.match(source, /INSPECT_TASK_EXECUTION_PERMISSIONS = \[/);
  assert.match(
    source,
    /INSPECT_TASK_EXECUTION_PERMISSIONS\.find\(\(permission\) => hasPermission\(authUser, permission\)\)/
  );
});

test("successful inspection submission is published before optional refresh reads", () => {
  const source = readFileSync(resolve(__dirname, "InspectTasksPageClient.tsx"), "utf8");
  const submit = source.indexOf("async function submitResults");
  const publish = source.indexOf("setMessage(\"巡检结果已提交\")", submit);
  const refresh = source.indexOf("await load()", publish);

  assert.ok(publish > submit);
  assert.ok(refresh > publish);
  assert.match(source, /巡检结果已提交，但最新数据刷新失败/);
  assert.match(
    source.slice(submit, source.indexOf("function closeExecution", submit)),
    /resolveInspectTaskExecutionEntry\(response\.data\.status\) === "hidden"/
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

test("inspection result payloads omit protected values and preserve explicit clearing", () => {
  assert.deepEqual(buildEditableResultValuePayload("masked", false, "123", false), {});
  assert.deepEqual(buildEditableResultValuePayload("", true, "", true), {
    value_text: null,
    value_number: null
  });
  assert.deepEqual(buildEditableResultValuePayload(" replacement ", true, "12.5", true), {
    value_text: "replacement",
    value_number: 12.5
  });
});

test("inspection result photos use their independent field-policy entity", () => {
  const source = readFileSync(resolve(__dirname, "InspectTasksPageClient.tsx"), "utf8");

  assert.match(source, /INSPECT_TASK_RESULT_ENTITY = "inspect_task_result"/);
  assert.match(
    source,
    /canEditResultPhotos = canEditField\(authUser, SAFETY_MODULE, INSPECT_TASK_RESULT_ENTITY, "photoFileIds"\)/
  );
  assert.match(source, /photoFileIdsAvailable: canViewResultPhotos && canEditResultPhotos && photoProjection\.available/);
  assert.doesNotMatch(source, /photoFileIdsAvailable: canViewTaskPhotos && photoProjection\.available/);
});

test("inspection result values use edit field policies and omit protected payload fields", () => {
  const source = readFileSync(resolve(__dirname, "InspectTasksPageClient.tsx"), "utf8");

  assert.match(source, /canEditField\(authUser, SAFETY_MODULE, INSPECT_TASK_RESULT_ENTITY, "valueText"\)/);
  assert.match(source, /canEditField\(authUser, SAFETY_MODULE, INSPECT_TASK_RESULT_ENTITY, "valueNumber"\)/);
  assert.match(source, /buildEditableResultValuePayload\(/);
  assert.match(source, /disabled=\{!input\.valueTextEditable\}/);
  assert.match(source, /disabled=\{!input\.valueNumberEditable\}/);
});

test("inspection execution accepts only finite numeric GPS projections", () => {
  assert.equal(normalizeNumericInput(" 120.123 "), "120.123");
  assert.equal(normalizeNumericInput(31.234), "31.234");
  assert.equal(normalizeNumericInput("***"), "");
  assert.equal(normalizeNumericInput(Number.NaN), "");
  assert.equal(normalizeNumericInput(undefined), "");
});
