import assert from "node:assert/strict";
import test from "node:test";
import { engineeringInspectionsApi, toSearchParams } from "./engineering-inspections-api";
import {
  engineeringInspectionStatusLabels,
  engineeringInspectionTypeLabels,
  engineeringIssueSeverityLabels,
  engineeringIssueStatusLabels,
  engineeringIssueTypeLabels
} from "./engineering-inspections-display";
import { isInspectionEditable, isInspectionSubmittable, validateInspectionCounts } from "./engineering-inspections-utils";

test("engineeringInspectionsApi exposes inspection and issue methods", () => {
  assert.equal(typeof engineeringInspectionsApi.createInspection, "function");
  assert.equal(typeof engineeringInspectionsApi.listInspections, "function");
  assert.equal(typeof engineeringInspectionsApi.getInspection, "function");
  assert.equal(typeof engineeringInspectionsApi.updateInspection, "function");
  assert.equal(typeof engineeringInspectionsApi.deleteInspection, "function");
  assert.equal(typeof engineeringInspectionsApi.submitInspection, "function");
  assert.equal(typeof engineeringInspectionsApi.getProjectInspections, "function");
  assert.equal(typeof engineeringInspectionsApi.createInspectionIssue, "function");
  assert.equal(typeof engineeringInspectionsApi.getInspectionIssues, "function");
  assert.equal(typeof engineeringInspectionsApi.listIssues, "function");
});

test("engineering inspection search params omit empty values", () => {
  const params = toSearchParams({ project_id: "project-1", keyword: "", page: 2, inspection_status: "DRAFT" });
  assert.equal(params.toString(), "project_id=project-1&page=2&inspection_status=DRAFT");
});

test("engineering inspection display labels cover required enums", () => {
  assert.equal(engineeringInspectionTypeLabels.SAFETY, "安全巡检");
  assert.equal(engineeringInspectionStatusLabels.SUBMITTED, "已提交");
  assert.equal(engineeringIssueTypeLabels.CIVILIZED_CONSTRUCTION, "文明施工");
  assert.equal(engineeringIssueSeverityLabels.CRITICAL, "重大");
  assert.equal(engineeringIssueStatusLabels.RECTIFICATION_PENDING, "待整改");
});

test("engineering inspection UI helpers enforce draft-only editing and issue counts", () => {
  assert.equal(isInspectionEditable("DRAFT"), true);
  assert.equal(isInspectionEditable("SUBMITTED"), false);
  assert.equal(isInspectionSubmittable("DRAFT"), true);
  assert.equal(validateInspectionCounts("3", "1"), "");
  assert.equal(validateInspectionCounts("1", "2"), "重大问题数量不能超过问题总数");
});
