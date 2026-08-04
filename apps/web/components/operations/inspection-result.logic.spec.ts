import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildResultMutationPayload, mergeLocalDraftResultInputs, prepareResultInputs } from "./inspection-result.logic";

const items = [{ id: "item-1", itemName: "温度", required: true }];

test("operations terminal omits protected result fields from mutations", () => {
  const inputs = prepareResultInputs(items, [{
    id: "result-1",
    itemId: "item-1",
    itemName: "温度",
    result: "normal",
    valueText: "脱敏值",
    valueNumber: "12",
    photoFileIds: ["file-1"],
    isAbnormal: false,
    hazardCreated: false
  }], {
    valueTextEditable: false,
    valueNumberEditable: false,
    photoFileIdsEditable: false
  });

  assert.deepEqual(buildResultMutationPayload("item-1", inputs["item-1"]!, false), {
    item_id: "item-1",
    result: "normal",
    create_hazard: false
  });
});

test("operations terminal keeps explicit clear semantics for editable fields", () => {
  const [input] = Object.values(prepareResultInputs(items, [], {
    valueTextEditable: true,
    valueNumberEditable: true,
    photoFileIdsEditable: true
  }));

  assert.deepEqual(buildResultMutationPayload("item-1", input!, false), {
    item_id: "item-1",
    result: "normal",
    value_text: null,
    value_number: null,
    photo_file_ids: [],
    create_hazard: false
  });
});

test("operations terminal rejects missing child projections before creating editable state", () => {
  const access = { valueTextEditable: true, valueNumberEditable: true, photoFileIdsEditable: true };

  assert.throws(() => prepareResultInputs(items, undefined, access), /巡检执行数据格式异常/);
  assert.throws(() => prepareResultInputs(undefined, [], access), /巡检执行数据格式异常/);
  assert.throws(() => prepareResultInputs(items, [{ valueText: "missing item id" }], access), /巡检执行数据格式异常/);
});

test("local drafts cannot restore values that current field policies protect", () => {
  const authoritative = prepareResultInputs(items, [{
    id: "result-1",
    itemId: "item-1",
    itemName: "温度",
    result: "normal",
    isAbnormal: false,
    hazardCreated: false
  }], {
    valueTextEditable: false,
    valueNumberEditable: false,
    photoFileIdsEditable: false
  });
  const saved = {
    ...authoritative["item-1"]!,
    valueText: "旧明文",
    valueNumber: "99",
    photoFileIds: ["old-file"]
  };

  assert.deepEqual(mergeLocalDraftResultInputs(authoritative, { "item-1": saved })["item-1"], authoritative["item-1"]);
});

test("operations terminal disables protected controls and uses guarded payloads", () => {
  const client = readFileSync(resolve(__dirname, "OperationsTerminalClient.tsx"), "utf8");
  const drawer = readFileSync(resolve(__dirname, "InspectionExecutionDrawer.tsx"), "utf8");

  assert.match(client, /canEditField\(authUser, SAFETY_MODULE, INSPECT_TASK_RESULT_ENTITY, "photoFileIds"\)/);
  assert.match(client, /buildResultMutationPayload\(/);
  assert.match(client, /mergeLocalDraftResultInputs\(/);
  assert.match(drawer, /disabled=\{!input\.valueTextEditable\}/);
  assert.match(drawer, /disabled=\{!input\.valueNumberEditable\}/);
  assert.match(drawer, /input\.photoFileIdsEditable \? \(/);
});
