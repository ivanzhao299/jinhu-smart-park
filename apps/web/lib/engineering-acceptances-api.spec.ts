import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { engineeringAcceptancesApi, toSearchParams } from "./engineering-acceptances-api";
import { engineeringAcceptanceStatusLabels, engineeringAcceptanceTypeLabels } from "./engineering-acceptances-display";
import { hasEngineeringAcceptancePermission } from "./engineering-acceptances-permissions";
import {
  isAcceptanceClosable,
  isAcceptanceDeletable,
  isAcceptanceEditable,
  isAcceptanceReviewable,
  isAcceptanceSubmittable,
  validateAcceptanceName
} from "./engineering-acceptances-utils";

test("engineeringAcceptancesApi exposes all Task 019 methods", () => {
  assert.equal(typeof engineeringAcceptancesApi.createAcceptance, "function");
  assert.equal(typeof engineeringAcceptancesApi.listAcceptances, "function");
  assert.equal(typeof engineeringAcceptancesApi.getAcceptance, "function");
  assert.equal(typeof engineeringAcceptancesApi.updateAcceptance, "function");
  assert.equal(typeof engineeringAcceptancesApi.deleteAcceptance, "function");
  assert.equal(typeof engineeringAcceptancesApi.submitAcceptance, "function");
  assert.equal(typeof engineeringAcceptancesApi.reviewAcceptance, "function");
  assert.equal(typeof engineeringAcceptancesApi.closeAcceptance, "function");
  assert.equal(typeof engineeringAcceptancesApi.getProjectAcceptances, "function");
});

test("engineering acceptance query search params omit empty values", () => {
  const params = toSearchParams({
    keyword: "消防",
    acceptance_status: "DRAFT",
    acceptance_type: "",
    project_id: "project-id",
    page: 2,
    page_size: 20
  });
  assert.equal(params.toString(), "keyword=%E6%B6%88%E9%98%B2&acceptance_status=DRAFT&project_id=project-id&page=2&page_size=20");
});

test("engineering acceptance enum Chinese mappings cover required values", () => {
  assert.equal(engineeringAcceptanceTypeLabels.HIDDEN_WORK, "隐蔽工程验收");
  assert.equal(engineeringAcceptanceTypeLabels.STAGE, "阶段验收");
  assert.equal(engineeringAcceptanceTypeLabels.SPECIAL, "专项验收");
  assert.equal(engineeringAcceptanceTypeLabels.COMPLETION, "竣工验收");
  assert.equal(engineeringAcceptanceTypeLabels.TRANSFER_PRECHECK, "移交预验收");
  assert.equal(engineeringAcceptanceStatusLabels.DRAFT, "草稿");
  assert.equal(engineeringAcceptanceStatusLabels.SUBMITTED, "已提交");
  assert.equal(engineeringAcceptanceStatusLabels.PASSED, "通过");
  assert.equal(engineeringAcceptanceStatusLabels.RECTIFICATION_REQUIRED, "需整改");
  assert.equal(engineeringAcceptanceStatusLabels.CLOSED, "关闭");
});

test("engineering acceptance validators and status guards match backend rules", () => {
  assert.equal(validateAcceptanceName(""), "请填写验收名称");
  assert.equal(validateAcceptanceName("阶段验收"), "");
  assert.equal(isAcceptanceEditable("DRAFT"), true);
  assert.equal(isAcceptanceEditable("SUBMITTED"), false);
  assert.equal(isAcceptanceSubmittable("RECTIFICATION_REQUIRED"), true);
  assert.equal(isAcceptanceReviewable("SUBMITTED"), true);
  assert.equal(isAcceptanceReviewable("DRAFT"), false);
  assert.equal(isAcceptanceClosable("PASSED"), true);
  assert.equal(isAcceptanceDeletable("DRAFT"), true);
  assert.equal(isAcceptanceDeletable("FAILED"), false);
});

test("engineering acceptance route files and project detail entry are wired", () => {
  const listPage = readFileSync(resolve(__dirname, "../app/engineering/acceptances/page.tsx"), "utf8");
  const newPage = readFileSync(resolve(__dirname, "../app/engineering/acceptances/new/page.tsx"), "utf8");
  const detailPage = readFileSync(resolve(__dirname, "../app/engineering/acceptances/[id]/page.tsx"), "utf8");
  const editPage = readFileSync(resolve(__dirname, "../app/engineering/acceptances/[id]/edit/page.tsx"), "utf8");
  const projectDetail = readFileSync(resolve(__dirname, "../app/engineering/projects/components/EngineeringProjectDetailClient.tsx"), "utf8");

  assert.match(listPage, /EngineeringAcceptancesListClient/);
  assert.match(newPage, /EngineeringAcceptanceFormClient/);
  assert.match(detailPage, /EngineeringAcceptanceDetailClient/);
  assert.match(editPage, /acceptanceId/);
  assert.match(projectDetail, /engineeringAcceptancesApi\.getProjectAcceptances/);
  assert.match(projectDetail, /工程验收/);
});

test("engineering acceptance list and detail expose submit, review, close and delete controls", () => {
  const listSource = readFileSync(resolve(__dirname, "../app/engineering/acceptances/components/EngineeringAcceptancesListClient.tsx"), "utf8");
  const detailSource = readFileSync(resolve(__dirname, "../app/engineering/acceptances/components/EngineeringAcceptanceDetailClient.tsx"), "utf8");
  const reviewDrawerSource = readFileSync(resolve(__dirname, "../app/engineering/acceptances/components/EngineeringAcceptanceShared.tsx"), "utf8");

  assert.match(listSource, /isAcceptanceSubmittable/);
  assert.match(listSource, /isAcceptanceReviewable/);
  assert.match(listSource, /isAcceptanceClosable/);
  assert.match(detailSource, /submitAcceptance/);
  assert.match(detailSource, /reviewAcceptance/);
  assert.match(detailSource, /closeAcceptance/);
  assert.match(reviewDrawerSource, /未通过或需整改时请填写评审意见/);
});

test("engineering acceptance edit form does not send acceptanceStatus through update payload", () => {
  const formSource = readFileSync(resolve(__dirname, "../app/engineering/acceptances/components/EngineeringAcceptanceFormClient.tsx"), "utf8");
  const updateFunction = formSource.slice(formSource.indexOf("function toUpdateInput"));
  assert.equal(/acceptance_status\s*:/.test(updateFunction), false);
  assert.equal(/acceptanceStatus\s*:/.test(updateFunction), false);
});

test("engineering acceptance permission helper requires seeded engineering permissions", () => {
  assert.equal(hasEngineeringAcceptancePermission(null, "ENGINEERING_ACCEPTANCE_VIEW"), false);
  assert.equal(hasEngineeringAcceptancePermission({ permissions: ["module:read"], is_super: false }, "ENGINEERING_ACCEPTANCE_VIEW"), false);
  assert.equal(hasEngineeringAcceptancePermission({ permissions: ["ENGINEERING_ACCEPTANCE_VIEW"], is_super: false }, "ENGINEERING_ACCEPTANCE_VIEW"), true);
  assert.equal(hasEngineeringAcceptancePermission({ permissions: ["ENGINEERING_ACCEPTANCE_VIEW"], is_super: false }, "ENGINEERING_ACCEPTANCE_UPDATE"), false);
  assert.equal(hasEngineeringAcceptancePermission({ permissions: ["ENGINEERING_ACCEPTANCE_UPDATE"], is_super: false }, "ENGINEERING_ACCEPTANCE_DELETE"), true);
  assert.equal(hasEngineeringAcceptancePermission({ permissions: ["*"], is_super: false }, "ENGINEERING_ACCEPTANCE_REVIEW"), true);
});
