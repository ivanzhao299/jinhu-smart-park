import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(resolve(__dirname, "performance/HrPerformanceLegacyPanel.tsx"), "utf8");
const styles = readFileSync(resolve(__dirname, "performance/performance-legacy.module.css"), "utf8");
const api = readFileSync(resolve(__dirname, "../../lib/hr-api.ts"), "utf8");

test("legacy performance screen exposes all 29 definition, 12 detail, and 21 master source fields", () => {
  const sourceFields = [
    "sourceAssessment", "sourceAssessmentName", "sourceDepartment", "sourceMPercent",
    "sourceTPercent", "sourceXPercent", "sourceCPercent", "sourceSPercent",
    "sourceTimekeep", "sourceBonus", "sourceMaster", "sourceAssGrade",
    "sourceDescription", "sourceMyOrder", "sourceAssessmentId", "sourceMinValue",
    "sourceMaxValue", "sourceItemId", "sourceItemName", "sourceFullValue",
    "sourceGuideId", "sourceGrade", "sourceDetailId", "sourceSessionId",
    "sourcePersonCode", "sourceSelfValue", "sourceMItemValue", "sourceItemValue",
    "sourceXItemValue", "sourceCItemValue", "sourceSelfGrade", "sourceAppraisal",
    "sourceMasterId", "sourceMasterValue", "sourceTimekeepValue", "sourceBonusValue",
    "sourceTotalValue", "sourceSelfAppraisal", "sourcePay", "sourceAssessmentPerson",
    "sourceRecordedAt", "sourceOperatorCode",
  ];
  for (const field of sourceFields) assert.match(panel, new RegExp(`key: "${field}"`, "u"));
  assert.equal(panel.match(/\{ key: "source[A-Z][A-Za-z]+"/gu)?.length, 62);
  assert.match(panel, /29 个定义字段、12 个明细结果字段和 21 个汇总字段/u);
  for (const field of ["calculatedTotal", "expectedAssGrade", "winningMinValue", "winningCandidateCount", "parityStatus"]) {
    assert.match(panel, new RegExp(`key: "${field}"`, "u"));
  }
});

test("legacy performance browser is read-only, paginated, scoped, and relationship-visible", () => {
  for (const endpoint of ["Templates", "Levels", "Dimensions", "Guides", "Rubric", "Results", "Masters"]) {
    assert.match(api, new RegExp(`performanceLegacy${endpoint}:`, "u"));
  }
  for (const relation of [
    "legacyTemplateProfileId", "legacyDimensionProfileId", "legacyLevelRuleId",
    "targetTemplateId", "targetTemplateVersionId", "targetLevelId",
    "targetDimensionId", "targetCycleEmployeeId",
  ]) assert.match(panel, new RegExp(`key: "${relation}"`, "u"));
  assert.match(panel, /HR_PERFORMANCE_TEAM_READ/u);
  assert.match(api, /source_session_id/u);
  assert.match(panel, /<Pager result=/u);
  assert.doesNotMatch(panel, /hrApi\.(create|publish|submit|resolve|add|complete)/u);
});

test("legacy performance rubric reproduces the dynamic grade matrix on desktop and mobile", () => {
  assert.match(api, /performanceLegacyRubric:/u);
  assert.match(api, /performance-legacy\/rubric\?source_assessment_id=/u);
  assert.match(panel, /旧过程 u_printassessment/u);
  assert.match(panel, /旧版动态评分表/u);
  assert.match(panel, /源库没有该考核表的等级定义/u);
  assert.match(panel, /ds-table-shell/u);
  assert.match(panel, /ds-mobile-record-list/u);
  assert.match(styles, /\.rubricTable[\s\S]*?display: none/u);
  assert.match(styles, /\.rubricMobile[\s\S]*?display: grid/u);
});

test("legacy performance fields collapse on phone-width layouts", () => {
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(panel, /<details className=\{styles\.record\}/u);
});
