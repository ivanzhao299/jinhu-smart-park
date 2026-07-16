import assert from "node:assert/strict";
import test from "node:test";
import { scoreWorkforceCandidates, shouldAutoSelect } from "./assignment-scoring";
import type { ParsedWorkPlanTask, WorkforceCandidate } from "./domain/ai-work-plan.types";

const task: ParsedWorkPlanTask = {
  title: "完成消防设施专项检查",
  description: "由安全部负责消防巡检",
  departmentHint: "安全部",
  roleHint: "安全负责人",
  personHint: null,
  workOrderType: "fire_safety",
  priority: "high",
  urgency: "urgent",
  dueAt: new Date("2026-07-17T12:00:00.000Z"),
  acceptanceCriteria: "检查项有结论",
  evidenceRequirements: ["现场照片"],
  dependencyIndexes: []
};

const candidates: WorkforceCandidate[] = [
  {
    userId: "00000000-0000-0000-0000-000000000001",
    username: "safety_manager",
    displayName: "安全主管",
    orgId: "00000000-0000-0000-0000-000000000011",
    orgName: "安全管理部",
    postName: "安全主管",
    roleCodes: ["SAFETY_MANAGER"],
    roleNames: ["安全负责人"],
    activeWorkload: 1
  },
  {
    userId: "00000000-0000-0000-0000-000000000002",
    username: "finance",
    displayName: "财务人员",
    orgId: "00000000-0000-0000-0000-000000000012",
    orgName: "财务管理部",
    postName: "会计",
    roleCodes: ["FINANCE_USER"],
    roleNames: ["财务人员"],
    activeWorkload: 0
  }
];

test("assignment scoring prioritizes matching department and capability", () => {
  const scored = scoreWorkforceCandidates(task, candidates);
  assert.equal(scored[0]?.userId, candidates[0]?.userId);
  assert.ok((scored[0]?.score ?? 0) > (scored[1]?.score ?? 0));
  assert.ok(scored[0]?.reasons.includes("业务能力匹配"));
  assert.equal(shouldAutoSelect(scored), true);
});

test("assignment scoring does not auto select ambiguous weak candidates", () => {
  const weakTask = { ...task, departmentHint: null, roleHint: null, title: "整理材料", description: "整理材料" };
  const scored = scoreWorkforceCandidates(weakTask, candidates);
  assert.equal(shouldAutoSelect(scored), false);
});
