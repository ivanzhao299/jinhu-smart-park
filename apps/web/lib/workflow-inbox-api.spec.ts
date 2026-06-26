import assert from "node:assert/strict";
import test from "node:test";
import { workflowInboxApi } from "./workflow-inbox-api";
import { workflowAudienceCopy, workflowNextTodo, workflowPriorityLabels, workflowSummaryItems, workflowTodoKindLabels } from "./workflow-inbox-display";

test("workflowInboxApi exposes digest and read methods", () => {
  assert.equal(typeof workflowInboxApi.getInbox, "function");
  assert.equal(typeof workflowInboxApi.markMessageRead, "function");
  assert.equal(typeof workflowInboxApi.markAllRead, "function");
});

test("workflow inbox display mappings cover compact mobile inbox labels", () => {
  assert.equal(workflowTodoKindLabels.work_order_triage, "待派单");
  assert.equal(workflowTodoKindLabels.inspection_task, "巡检待办");
  assert.equal(workflowPriorityLabels.urgent, "紧急");

  const operationsCopy = workflowAudienceCopy("operations");
  const tenantCopy = workflowAudienceCopy("tenant");
  assert.equal(operationsCopy.title, "统一收件箱");
  assert.equal(tenantCopy.title, "服务收件箱");
});

test("workflow summary items and next todo expose the mobile digest data shape", () => {
  const items = workflowSummaryItems({
    triageCount: 2,
    assignedCount: 3,
    customerConfirmCount: 1,
    inspectionCount: 4,
    overdueCount: 1,
    messageCount: 7,
    unreadMessageCount: 5
  });
  assert.equal(items.length, 6);
  assert.equal(items[0].label, "待派单");
  assert.equal(items[5].value, 5);

  const todo = workflowNextTodo([
    {
      id: "normal",
      kind: "work_order_assigned",
      sourceType: "work_order",
      sourceId: "wo-2",
      title: "普通事项",
      subtitle: "普通优先级",
      status: "20",
      priority: "normal",
      ownerRole: "处理人",
      actionLabel: "继续处理",
      href: "/workflow/inbox",
      createdAt: "2026-06-27T08:00:00.000Z"
    },
    {
      id: "urgent",
      kind: "work_order_overdue",
      sourceType: "work_order",
      sourceId: "wo-1",
      title: "紧急事项",
      subtitle: "超时提醒",
      status: "40",
      priority: "urgent",
      ownerRole: "主管",
      actionLabel: "立即跟进",
      href: "/workflow/inbox",
      createdAt: "2026-06-27T09:00:00.000Z"
    }
  ]);

  assert.equal(todo?.id, "urgent");
});
