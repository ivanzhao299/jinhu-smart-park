import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "safety-inspect-tasks.service.ts"), "utf8");

test("inspection execution context rejects terminal states before loading child context", () => {
  const executionDetail = source.slice(
    source.indexOf("async executionDetail"),
    source.indexOf("async create(", source.indexOf("async executionDetail"))
  );

  const reject = executionDetail.indexOf('resolveSafetyInspectTaskStartDisposition(entity.status) === "reject"');
  const loadItems = executionDetail.indexOf("loadExecutionItems");
  assert.ok(reject >= 0);
  assert.ok(loadItems > reject);
});

test("inspection detail projections secure nested results with their own field policies", () => {
  const projection = source.slice(
    source.indexOf("private async projectTaskDetail"),
    source.indexOf("async create(", source.indexOf("private async projectTaskDetail"))
  );

  assert.match(projection, /applyFieldPoliciesToList\(/);
  assert.match(projection, /"inspect_task_result"/);
  assert.match(projection, /results: securedResults/);
});

test("inspection result writes preserve omitted protected values", () => {
  const submit = source.slice(
    source.indexOf("async submitResults"),
    source.indexOf("private scopedBuilder", source.indexOf("async submitResults"))
  );

  assert.match(submit, /resolveSubmittedOptionalValue\(/);
  assert.match(submit, /existingResult\.valueText/);
  assert.match(submit, /existingResult\.valueNumber/);
  assert.match(submit, /resolvedValueText/);
  assert.match(submit, /lock: \{ mode: "pessimistic_write" \}/);
});

test("inspection start decides the transition while holding the task row lock", () => {
  const start = source.slice(
    source.indexOf("async start("),
    source.indexOf("async checkIn(", source.indexOf("async start("))
  );

  const transaction = start.indexOf("manager.transaction");
  const lock = start.indexOf('lock: { mode: "pessimistic_write" }');
  const disposition = start.indexOf("resolveSafetyInspectTaskStartDisposition(task.status)");
  const save = start.indexOf("save(task)");
  assert.ok(transaction >= 0);
  assert.ok(lock > transaction);
  assert.ok(disposition > lock);
  assert.ok(save > disposition);
  assert.match(start, /return this\.projectExecutionDetail\(scope, currentTask, actor\)/);
  assert.doesNotMatch(start, /return this\.executionDetail/);
});
