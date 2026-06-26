import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { engineeringPlansApi, toSearchParams } from "./engineering-plans-api";
import {
  engineeringPlanLevelLabels,
  engineeringPlanStatusLabels,
  engineeringPlanTypeLabels
} from "./engineering-plans-display";
import { hasEngineeringPlanPermission } from "./engineering-plans-permissions";
import type { EngineeringPlan } from "./engineering-plans-types";
import {
  buildEngineeringPlanTree,
  flattenEngineeringPlanTree,
  validateActualDateRange,
  validatePlanDateRange,
  validatePlanProgress,
  validatePlanWeight
} from "./engineering-plans-utils";

test("engineeringPlansApi exposes all Task 007 methods", () => {
  assert.equal(typeof engineeringPlansApi.createPlan, "function");
  assert.equal(typeof engineeringPlansApi.listPlans, "function");
  assert.equal(typeof engineeringPlansApi.getPlan, "function");
  assert.equal(typeof engineeringPlansApi.updatePlan, "function");
  assert.equal(typeof engineeringPlansApi.deletePlan, "function");
  assert.equal(typeof engineeringPlansApi.getProjectPlans, "function");
  assert.equal(typeof engineeringPlansApi.updatePlanProgress, "function");
  assert.equal(typeof engineeringPlansApi.updatePlanStatus, "function");
});

test("engineering plan query search params omit empty values", () => {
  const params = toSearchParams({ keyword: "消防", status: "DRAFT", plan_type: "", project_id: "project-id", page: 2, page_size: 20 });
  assert.equal(params.toString(), "keyword=%E6%B6%88%E9%98%B2&status=DRAFT&project_id=project-id&page=2&page_size=20");
});

test("engineering plan enum Chinese mappings cover required values", () => {
  assert.equal(engineeringPlanTypeLabels.MASTER, "总计划");
  assert.equal(engineeringPlanTypeLabels.PHASE, "阶段计划");
  assert.equal(engineeringPlanTypeLabels.WEEKLY, "周计划");
  assert.equal(engineeringPlanTypeLabels.DAILY, "日计划");
  assert.equal(engineeringPlanTypeLabels.SPECIAL, "专项计划");
  assert.equal(engineeringPlanTypeLabels.MILESTONE, "里程碑");
  assert.equal(engineeringPlanStatusLabels.DRAFT, "草稿");
  assert.equal(engineeringPlanStatusLabels.SUBMITTED, "已提交");
  assert.equal(engineeringPlanStatusLabels.APPROVED, "已批准");
  assert.equal(engineeringPlanStatusLabels.IN_PROGRESS, "执行中");
  assert.equal(engineeringPlanStatusLabels.DELAYED, "已延期");
  assert.equal(engineeringPlanStatusLabels.COMPLETED, "已完成");
  assert.equal(engineeringPlanStatusLabels.CANCELLED, "已取消");
  assert.equal(engineeringPlanLevelLabels.L1, "一级计划");
  assert.equal(engineeringPlanLevelLabels.L4, "四级计划");
});

test("engineering plan tree groups child plans by parentPlanId", () => {
  const plans = [
    makePlan("child-b", "root", 2),
    makePlan("root", null, 1),
    makePlan("child-a", "root", 1)
  ];
  const tree = buildEngineeringPlanTree(plans);
  const rows = flattenEngineeringPlanTree(tree);

  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.id, "root");
  assert.equal(tree[0]?.children.length, 2);
  assert.deepEqual(rows.map((item) => [item.id, item.depth]), [["root", 0], ["child-a", 1], ["child-b", 1]]);
});

test("engineering plan form validators cover date, progress, and weight rules", () => {
  assert.equal(validatePlanDateRange("2026-07-01", "2026-06-01"), "计划结束日期不能早于计划开始日期");
  assert.equal(validateActualDateRange("2026-07-01", "2026-06-01"), "实际结束日期不能早于实际开始日期");
  assert.equal(validatePlanProgress(101), "计划进度必须在 0 到 100 之间");
  assert.equal(validatePlanProgress(80), "");
  assert.equal(validatePlanWeight(-1), "计划权重不能为负数");
});

test("engineering plan route files and project detail plan entry are wired", () => {
  const plansPage = readFileSync(resolve(__dirname, "../app/engineering/plans/page.tsx"), "utf8");
  const newPage = readFileSync(resolve(__dirname, "../app/engineering/plans/new/page.tsx"), "utf8");
  const detailPage = readFileSync(resolve(__dirname, "../app/engineering/plans/[id]/page.tsx"), "utf8");
  const editPage = readFileSync(resolve(__dirname, "../app/engineering/plans/[id]/edit/page.tsx"), "utf8");
  const projectDetail = readFileSync(resolve(__dirname, "../app/engineering/projects/components/EngineeringProjectDetailClient.tsx"), "utf8");

  assert.match(plansPage, /EngineeringPlansListClient/);
  assert.match(newPage, /EngineeringPlanFormClient/);
  assert.match(detailPage, /EngineeringPlanDetailClient/);
  assert.match(editPage, /planId/);
  assert.match(projectDetail, /engineeringPlansApi\.getProjectPlans/);
  assert.match(projectDetail, /PlanTreeTable/);
});

test("engineering plan edit form does not send status through update payload", () => {
  const formSource = readFileSync(resolve(__dirname, "../app/engineering/plans/components/EngineeringPlanFormClient.tsx"), "utf8");
  const updateFunction = formSource.slice(formSource.indexOf("function toUpdateInput"));
  assert.equal(/status\s*:/.test(updateFunction), false);
});

test("engineering plan permission helper enforces seeded engineering permissions but allows pre-seed users", () => {
  assert.equal(hasEngineeringPlanPermission(null, "ENGINEERING_PLAN_VIEW"), false);
  assert.equal(hasEngineeringPlanPermission({ permissions: ["module:read"], is_super: false }, "ENGINEERING_PLAN_VIEW"), true);
  assert.equal(hasEngineeringPlanPermission({ permissions: ["ENGINEERING_PLAN_VIEW"], is_super: false }, "ENGINEERING_PLAN_VIEW"), true);
  assert.equal(hasEngineeringPlanPermission({ permissions: ["ENGINEERING_PLAN_VIEW"], is_super: false }, "ENGINEERING_PLAN_UPDATE"), false);
  assert.equal(hasEngineeringPlanPermission({ permissions: ["*"], is_super: false }, "ENGINEERING_PLAN_UPDATE"), true);
});

function makePlan(id: string, parentPlanId: string | null, sortOrder: number): EngineeringPlan {
  return {
    id,
    tenantId: "tenant-a",
    parkId: "park-a",
    orgId: null,
    projectId: "project-id",
    planCode: `GCJH20260626${sortOrder}`,
    planName: id,
    planType: "MASTER",
    parentPlanId,
    planLevel: "L1",
    description: null,
    plannedStartDate: "2026-06-26",
    plannedEndDate: "2026-07-26",
    actualStartDate: null,
    actualEndDate: null,
    plannedProgressPercent: 0,
    actualProgressPercent: 0,
    weight: null,
    ownerUserId: null,
    ownerOrgId: null,
    contractorOrgId: null,
    status: "DRAFT",
    delayDays: 0,
    riskLevel: "LOW",
    sortOrder,
    remark: null,
    createBy: null,
    updateBy: null,
    createTime: "2026-06-26T00:00:00.000Z",
    updateTime: "2026-06-26T00:00:00.000Z"
  };
}
