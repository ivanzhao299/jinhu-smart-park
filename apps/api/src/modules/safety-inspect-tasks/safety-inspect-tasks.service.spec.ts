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
