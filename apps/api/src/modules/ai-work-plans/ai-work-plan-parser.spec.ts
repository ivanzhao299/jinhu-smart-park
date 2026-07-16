import assert from "node:assert/strict";
import test from "node:test";
import { LocalNaturalLanguageWorkPlanner } from "./ai-work-plan-parser";

const planner = new LocalNaturalLanguageWorkPlanner();

test("natural language planner splits cross-department work and extracts deadline", () => {
  const result = planner.parse(
    "本周五前完成 A1 楼消防设施专项检查，由安全部牵头，工程部配合，发现重大隐患后 24 小时内整改，物业负责人最终复核。",
    { now: new Date("2026-07-13T01:00:00.000Z") }
  );
  assert.ok(result.tasks.length >= 3);
  assert.equal(result.tasks[0]?.departmentHint, "安全部");
  assert.ok(result.tasks.some((task) => task.departmentHint?.includes("工程部")));
  assert.ok(result.tasks.some((task) => task.title.includes("复核")));
  assert.ok(result.tasks.every((task) => task.acceptanceCriteria.length > 0));
  assert.ok(result.tasks.some((task) => task.dueAt instanceof Date));
  assert.equal(result.riskLevel, "HIGH");
});

test("natural language planner flags missing responsibility and deadline", () => {
  const result = planner.parse("整理近期园区运营资料并形成汇总报告");
  assert.equal(result.tasks.length, 1);
  assert.ok(result.clarificationQuestions.includes("请确认各项工作的完成期限"));
  assert.ok(result.clarificationQuestions.includes("请确认主责部门或责任人"));
});

test("natural language planner keeps explicit person hint", () => {
  const result = planner.parse("请张三负责明天完成配电室设备检查");
  assert.equal(result.tasks[0]?.personHint, "张三");
  assert.equal(result.tasks[0]?.workOrderType, "maintenance");
  assert.ok(result.tasks[0]?.dueAt);
});

test("natural language planner carries deadline and person into sequential review", () => {
  const result = planner.parse("请郑子勇负责明天完成配电室检查，邵明洪完成后复核。");
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0]?.personHint, "郑子勇");
  assert.equal(result.tasks[1]?.personHint, "邵明洪");
  assert.ok(result.tasks.every((task) => task.dueAt instanceof Date));
  assert.deepEqual(result.tasks[1]?.dependencyIndexes, [0]);
});
