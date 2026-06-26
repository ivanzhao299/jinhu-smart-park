import assert from "node:assert/strict";
import test from "node:test";
import {
  engineeringProjectActionLabels,
  engineeringProjectLevelLabels,
  engineeringProjectStatusLabels,
  engineeringProjectTypeLabels,
  engineeringRiskLevelLabels
} from "./engineering-projects-display";
import { engineeringProjectsApi, toSearchParams } from "./engineering-projects-api";
import { hasEngineeringProjectPermission } from "./engineering-projects-permissions";

test("engineeringProjectsApi exposes all Task 005 methods", () => {
  assert.equal(typeof engineeringProjectsApi.createProject, "function");
  assert.equal(typeof engineeringProjectsApi.listProjects, "function");
  assert.equal(typeof engineeringProjectsApi.getProject, "function");
  assert.equal(typeof engineeringProjectsApi.updateProject, "function");
  assert.equal(typeof engineeringProjectsApi.deleteProject, "function");
  assert.equal(typeof engineeringProjectsApi.executeProjectAction, "function");
  assert.equal(typeof engineeringProjectsApi.getAvailableActions, "function");
  assert.equal(typeof engineeringProjectsApi.getStatusLogs, "function");
});

test("engineering project query search params omit empty values", () => {
  const params = toSearchParams({ keyword: "消防", status: "DRAFT", project_type: "", page: 2, page_size: 20 });
  assert.equal(params.toString(), "keyword=%E6%B6%88%E9%98%B2&status=DRAFT&page=2&page_size=20");
});

test("engineering enum Chinese mappings cover required values", () => {
  assert.equal(engineeringProjectStatusLabels.DRAFT, "草稿");
  assert.equal(engineeringProjectStatusLabels.SUBMITTED, "已提交");
  assert.equal(engineeringProjectStatusLabels.APPROVED, "已批准");
  assert.equal(engineeringProjectStatusLabels.PLANNING, "计划中");
  assert.equal(engineeringProjectStatusLabels.EXECUTING, "施工中");
  assert.equal(engineeringProjectStatusLabels.INSPECTING, "巡检中");
  assert.equal(engineeringProjectStatusLabels.RECTIFYING, "整改中");
  assert.equal(engineeringProjectStatusLabels.ACCEPTING, "验收中");
  assert.equal(engineeringProjectStatusLabels.ACCEPTED, "已验收");
  assert.equal(engineeringProjectStatusLabels.TRANSFER_READY, "待移交");
  assert.equal(engineeringProjectStatusLabels.SETTLEMENT_READY, "待结算");
  assert.equal(engineeringProjectStatusLabels.CLOSED, "已关闭");
  assert.equal(engineeringProjectStatusLabels.ARCHIVED, "已归档");
  assert.equal(engineeringProjectStatusLabels.CANCELLED, "已取消");
  assert.equal(engineeringProjectTypeLabels.FIRE_PROTECTION, "消防工程");
  assert.equal(engineeringProjectLevelLabels.MAJOR, "重大项目");
  assert.equal(engineeringRiskLevelLabels.CRITICAL, "严重");
  assert.equal(engineeringProjectActionLabels.REQUIRE_RECTIFICATION, "要求整改");
});

test("engineering permission helper enforces seeded engineering permissions but allows pre-seed users", () => {
  assert.equal(hasEngineeringProjectPermission(null, "ENGINEERING_PROJECT_VIEW"), false);
  assert.equal(hasEngineeringProjectPermission({ permissions: ["module:read"], is_super: false }, "ENGINEERING_PROJECT_VIEW"), true);
  assert.equal(hasEngineeringProjectPermission({ permissions: ["ENGINEERING_PROJECT_VIEW"], is_super: false }, "ENGINEERING_PROJECT_VIEW"), true);
  assert.equal(hasEngineeringProjectPermission({ permissions: ["ENGINEERING_PROJECT_VIEW"], is_super: false }, "ENGINEERING_PROJECT_UPDATE"), false);
  assert.equal(hasEngineeringProjectPermission({ permissions: ["*"], is_super: false }, "ENGINEERING_PROJECT_UPDATE"), true);
});
