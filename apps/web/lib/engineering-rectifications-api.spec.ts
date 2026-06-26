import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { engineeringRectificationsApi, toSearchParams } from "./engineering-rectifications-api";
import { engineeringRectificationActionLabels, engineeringRectificationStatusLabels } from "./engineering-rectifications-display";
import { hasEngineeringRectificationPermission } from "./engineering-rectifications-permissions";
import { availableRectificationActions, isRectificationDeletable, isRectificationEditable } from "./engineering-rectifications-utils";

test("engineeringRectificationsApi exposes Task 016 methods", () => {
  assert.equal(typeof engineeringRectificationsApi.createRectification, "function");
  assert.equal(typeof engineeringRectificationsApi.listRectifications, "function");
  assert.equal(typeof engineeringRectificationsApi.getRectification, "function");
  assert.equal(typeof engineeringRectificationsApi.updateRectification, "function");
  assert.equal(typeof engineeringRectificationsApi.executeRectificationAction, "function");
  assert.equal(typeof engineeringRectificationsApi.deleteRectification, "function");
  assert.equal(typeof engineeringRectificationsApi.getProjectRectifications, "function");
});

test("engineering rectification query params omit empty values", () => {
  const params = toSearchParams({ keyword: "消防", status: "PENDING", project_id: "project-id", severity: "", page: 2, page_size: 20 });
  assert.equal(params.toString(), "keyword=%E6%B6%88%E9%98%B2&status=PENDING&project_id=project-id&page=2&page_size=20");
});

test("engineering rectification display labels cover status and actions", () => {
  assert.equal(engineeringRectificationStatusLabels.PENDING, "待整改");
  assert.equal(engineeringRectificationStatusLabels.RECHECKING, "待复查");
  assert.equal(engineeringRectificationStatusLabels.OVERDUE, "已逾期");
  assert.equal(engineeringRectificationActionLabels.SUBMIT, "提交整改");
  assert.equal(engineeringRectificationActionLabels.REJECT, "复查驳回");
});

test("engineering rectification UI helpers expose workflow actions", () => {
  assert.deepEqual(availableRectificationActions("IN_PROGRESS"), ["SUBMIT", "MARK_OVERDUE"]);
  assert.deepEqual(availableRectificationActions("RECHECKING"), ["PASS", "REJECT", "MARK_OVERDUE"]);
  assert.equal(isRectificationEditable("PENDING"), true);
  assert.equal(isRectificationEditable("CLOSED"), false);
  assert.equal(isRectificationDeletable("REJECTED"), true);
  assert.equal(isRectificationDeletable("SUBMITTED"), false);
});

test("engineering rectification route files and project detail entry are wired", () => {
  const listPage = readFileSync(resolve(__dirname, "../app/engineering/rectifications/page.tsx"), "utf8");
  const detailPage = readFileSync(resolve(__dirname, "../app/engineering/rectifications/[id]/page.tsx"), "utf8");
  const projectDetail = readFileSync(resolve(__dirname, "../app/engineering/projects/components/EngineeringProjectDetailClient.tsx"), "utf8");
  const inspectionDetail = readFileSync(resolve(__dirname, "../app/engineering/inspections/components/EngineeringInspectionDetailClient.tsx"), "utf8");

  assert.match(listPage, /EngineeringRectificationsListClient/);
  assert.match(detailPage, /EngineeringRectificationDetailClient/);
  assert.match(projectDetail, /engineeringRectificationsApi\.getProjectRectifications/);
  assert.match(inspectionDetail, /generateRectificationFromIssue/);
});

test("engineering rectification permission helper enforces seeded engineering permissions but allows pre-seed users", () => {
  assert.equal(hasEngineeringRectificationPermission(null, "ENGINEERING_RECTIFICATION_VIEW"), false);
  assert.equal(hasEngineeringRectificationPermission({ permissions: ["module:read"], is_super: false }, "ENGINEERING_RECTIFICATION_VIEW"), true);
  assert.equal(hasEngineeringRectificationPermission({ permissions: ["ENGINEERING_RECTIFICATION_VIEW"], is_super: false }, "ENGINEERING_RECTIFICATION_VIEW"), true);
  assert.equal(hasEngineeringRectificationPermission({ permissions: ["ENGINEERING_RECTIFICATION_VIEW"], is_super: false }, "ENGINEERING_RECTIFICATION_UPDATE"), false);
  assert.equal(hasEngineeringRectificationPermission({ permissions: ["*"], is_super: false }, "ENGINEERING_RECTIFICATION_UPDATE"), true);
});
