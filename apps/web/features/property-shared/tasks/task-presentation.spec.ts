import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  invokeTaskAction,
  taskStaleText,
  visibleTaskActions,
  visibleTaskFilters,
  type TaskLightAction
} from "./task-presentation";

test("task filters and counts remain server projections", () => {
  const filters = visibleTaskFilters([
    { id: "all", label: "全部", count: 8, active: true },
    { id: "mine", label: "我的", count: 3, active: false },
    { id: "hidden", label: "无权筛选", count: 5, active: false, authorized: false }
  ]);

  assert.deepEqual(filters.map(({ id, count }) => ({ id, count })), [
    { id: "all", count: 8 },
    { id: "mine", count: 3 }
  ]);
});

test("unauthorized or disabled light actions invoke zero callbacks", () => {
  const calls: string[] = [];
  const denied: TaskLightAction<{ id: string }> = {
    id: "claim",
    label: "认领",
    authorized: false,
    invoke: (item) => calls.push(item.id)
  };
  const disabled: TaskLightAction<{ id: string }> = {
    ...denied,
    id: "start",
    authorized: true,
    disabled: true
  };
  const allowed: TaskLightAction<{ id: string }> = {
    ...denied,
    id: "block",
    authorized: true
  };

  assert.deepEqual(visibleTaskActions([denied, disabled, allowed]).map((item) => item.id), [
    "start",
    "block"
  ]);
  assert.equal(invokeTaskAction(denied, { id: "task-1" }), false);
  assert.equal(invokeTaskAction(disabled, { id: "task-1" }), false);
  assert.deepEqual(calls, []);
  assert.equal(invokeTaskAction(allowed, { id: "task-1" }), true);
  assert.deepEqual(calls, ["task-1"]);
});

test("stale presentation is textual and carries its server timestamp", () => {
  assert.equal(taskStaleText({ isStale: false, label: "旧数据" }), null);
  assert.equal(
    taskStaleText({
      isStale: true,
      label: "网络异常，正在展示最近成功数据",
      generatedAt: "2026-07-30 14:00"
    }),
    "网络异常，正在展示最近成功数据（数据时间：2026-07-30 14:00）"
  );
});

test("task component stays presentational and reuses property DS surfaces", () => {
  const source = readFileSync(resolve(__dirname, "TaskPresentation.tsx"), "utf8");
  const css = readFileSync(resolve(__dirname, "TaskPresentation.module.css"), "utf8");

  assert.match(source, /PropertyResponsiveRecords/);
  assert.match(source, /<StatusPill value=\{`\$\{count\} 项`\}/);
  assert.match(source, /taskStaleText\(stale\)/);
  assert.match(source, /visibleTaskActions/);
  assert.match(source, /propertyAccessibleControlClassName/);
  assert.match(
    source,
    /getTitle=\{\(item\) => \([\s\S]*className=\{propertyAccessibleControlClassName\(\)\}[\s\S]*href=\{getHref\(item\) as NextRoute\}/
  );
  assert.match(source, /href=\{getHref\(item\) as NextRoute\}/);
  assert.doesNotMatch(source, /apiRequest|fetch\(|useEffect|useState/);
  assert.doesNotMatch(source, /complete|assignment|homestay|housing|identity|approval/i);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|box-shadow|background:/i);
});
