import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildWorkOrderAssignmentBody,
  buildWorkOrderAssignmentRequest,
  filterEnabledWorkOrderAssignees,
  getWorkOrderAssignmentError,
  resolveWorkOrderAssigneeOptions
} from "../../components/workorders/work-order-assignment.logic";

test("work-order assignment validation rejects the nearest invalid forms", () => {
  assert.equal(getWorkOrderAssignmentError("assign", { assigneeId: "", reason: "" }), "请选择处理人");
  assert.equal(
    getWorkOrderAssignmentError("reassign", { assigneeId: "user-1", reason: "   " }),
    "改派原因必填"
  );
  assert.equal(getWorkOrderAssignmentError("assign", { assigneeId: "user-1", reason: "" }), null);
  assert.equal(getWorkOrderAssignmentError("reassign", { assigneeId: "user-1", reason: "调整班组" }), null);
});

test("work-order assignment body keeps the user id internal and normalizes the reason", () => {
  assert.deepEqual(buildWorkOrderAssignmentBody({ assigneeId: " user-1 ", reason: " " }), {
    assignee_id: "user-1"
  });
  assert.deepEqual(buildWorkOrderAssignmentBody({ assigneeId: "user-2", reason: "  调整班组  " }), {
    assignee_id: "user-2",
    reason: "调整班组"
  });
});

test("work-order assignment request owns the endpoint, payload, and retry key contract", () => {
  assert.deepEqual(
    buildWorkOrderAssignmentRequest(
      "work-order-1",
      "reassign",
      { assigneeId: "user-2", reason: "调整班组" },
      "retry-key-1"
    ),
    {
      path: "/work-orders/work-order-1/reassign",
      idempotencyKey: "retry-key-1",
      body: { assignee_id: "user-2", reason: "调整班组" }
    }
  );
});

test("work-order assignment candidates keep only enabled users without mutating the source", () => {
  const candidates = [
    { id: "enabled-user", status: "enabled" },
    { id: "disabled-user", status: "disabled" },
    { id: "missing-status" }
  ];

  assert.deepEqual(filterEnabledWorkOrderAssignees(candidates), [{ id: "enabled-user", status: "enabled" }]);
  assert.equal(candidates.length, 3);
});

test("work-order assignee options disambiguate only colliding business names with usernames", () => {
  const candidates = [
    { id: "user-1", username: "zhang.san", displayName: "张三" },
    { id: "user-2", username: "zhang.san.2", displayName: "张三" },
    { id: "user-3", username: "li.si", displayName: "李四" }
  ];

  assert.deepEqual(resolveWorkOrderAssigneeOptions(candidates), [
    { id: "user-1", label: "张三（zhang.san）" },
    { id: "user-2", label: "张三（zhang.san.2）" },
    { id: "user-3", label: "李四" }
  ]);
});

test("work-order assignee collision detection normalizes invisible and whitespace differences", () => {
  assert.deepEqual(
    resolveWorkOrderAssigneeOptions([
      { id: "user-1", username: "operator one", displayName: "王\u200B五" },
      { id: "user-2", username: "operator\\two", displayName: " 王五 " }
    ]),
    [
      { id: "user-1", label: "王五（operator\\u{20}one）" },
      { id: "user-2", label: "王五（operator\\u{5C}two）" }
    ]
  );
});

test("work-order assignee options recheck collisions introduced by username suffixes", () => {
  assert.deepEqual(
    resolveWorkOrderAssigneeOptions([
      { id: "user-1", username: "a", displayName: "张三" },
      { id: "user-2", username: "b", displayName: "张三" },
      { id: "user-3", username: "c", displayName: "张三（a）" }
    ]),
    [
      { id: "user-1", label: "张三（a）（a）" },
      { id: "user-2", label: "张三（b）" },
      { id: "user-3", label: "张三（a）（c）" }
    ]
  );
});

test("work-order assignee options disable unresolved duplicate account data instead of throwing", () => {
  const duplicateAccountLabel = "张三（账号信息重复，请联系管理员）";
  assert.deepEqual(
    resolveWorkOrderAssigneeOptions([
      { id: "user-1", username: "duplicate", displayName: "张三" },
      { id: "user-2", username: "duplicate", displayName: "张三" }
    ]),
    [
      { id: "user-1", label: duplicateAccountLabel, disabled: true },
      { id: "user-2", label: duplicateAccountLabel, disabled: true }
    ]
  );
});

test("work-order detail assignment uses the shared picker and no longer prompts for a user id", () => {
  const detail = readFileSync(resolve(__dirname, "[id]/page.tsx"), "utf8");
  const list = readFileSync(resolve(__dirname, "list/page.tsx"), "utf8");
  const dialog = readFileSync(resolve(__dirname, "../../components/workorders/WorkOrderAssignDialog.tsx"), "utf8");

  assert.doesNotMatch(detail, /请输入处理人用户 ID/);
  assert.match(detail, /action === "assign" \|\| action === "reassign"/);
  assert.match(detail, /fetchReferenceFormOptions\(\)/);
  assert.match(detail, /filterEnabledWorkOrderAssignees\(references\.users\)/);
  assert.match(detail, /<WorkOrderAssignDialog/);
  assert.match(detail, /createIdempotencyKey\(`work-order-\$\{assignment\.mode\}`\)/);
  assert.match(detail, /buildWorkOrderAssignmentRequest\(/);
  assert.match(detail, /await loadLogs\(\)/);
  assert.match(detail, /setUsersError\(error\.message\)/);

  assert.match(list, /components\/workorders\/WorkOrderAssignDialog/);
  assert.doesNotMatch(list, /\.\/components\/WorkOrderAssignDialog/);
  assert.match(list, /getWorkOrderAssignmentError\(assignment\.mode, assignmentForm\)/);
  assert.match(list, /assignmentActionLock\.current/);

  assert.match(dialog, /<DrawerForm noValidate/);
  assert.match(dialog, /<select[\s\S]*required/);
  assert.match(dialog, /正在加载处理人/);
  assert.match(dialog, /处理人加载失败/);
  assert.match(dialog, /暂无可选处理人/);
  assert.match(dialog, /role="alert"/);
  assert.match(dialog, /resolveWorkOrderAssigneeOptions\(users\)/);
  assert.match(dialog, /disabled=\{submitDisabled\}/);
  assert.match(detail, /error=\{assignmentError\}/);
  assert.match(list, /error=\{assignmentError\}/);
});
