import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(
  resolve(__dirname, "performance/HrPerformanceLegacyAssessmentValuePanel.tsx"),
  "utf8",
);
const client = readFileSync(
  resolve(__dirname, "performance/HrPerformanceClient.tsx"),
  "utf8",
);
const api = readFileSync(
  resolve(__dirname, "../../lib/hr-performance-legacy-assessment-value-api.ts"),
  "utf8",
);
const styles = readFileSync(
  resolve(__dirname, "performance/performance-legacy-person-summary.module.css"),
  "utf8",
);

test("u_assessmentvalue browser binds its two bounded legacy filters", () => {
  assert.match(api, /ass_session: filters\.assSession/u);
  assert.match(api, /department_prefix: filters\.departmentPrefix/u);
  assert.match(api, /query-reports\/assessment-value\?/u);
  assert.match(panel, /HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH/u);
  assert.match(panel, /HR_PERFORMANCE_LEGACY_DEPARTMENT_PATTERN_MAX_LENGTH/u);
  assert.match(panel, /isHrPerformanceLegacyDepartmentPrefix/u);
  assert.match(panel, /不能包含通配符/u);
});

test("u_assessmentvalue response is exactly the sealed nine-column projection", () => {
  const fields = [
    "sourcePersonCode",
    "employeeDisplayName",
    "unresolvedLegacyGrade",
    "sourceItemValue",
    "sourceMasterValue",
    "sourceTimekeepValue",
    "sourceBonusValue",
    "legacyLastValueWithoutMaster",
    "sourceAppraisal",
  ];
  const rowContract = api.match(
    /export interface HrPerformanceLegacyAssessmentValueQueryRow \{([\s\S]*?)\n\}/u,
  )?.[1] ?? "";
  for (const field of fields) assert.match(rowContract, new RegExp(`^ {2}${field}:`, "mu"));
  assert.equal(rowContract.match(/^ {2}[a-z][A-Za-z]+:/gmu)?.length, 9);
  for (const forbidden of [
    "sourceAssGrade",
    "sourceTotalValue",
    "sourcePay",
    "sourceSelfAppraisal",
    "sourceSessionId",
    "migrationBatchId",
    "legacyRecordMapId",
  ]) {
    assert.doesNotMatch(rowContract, new RegExp(`^ {2}${forbidden}:`, "mu"));
  }
  assert.match(panel, /旧 grade 字段尚无目录证据/u);
  assert.match(panel, /<dt>旧 grade<\/dt><dd>源清单未证明<\/dd>/u);
});

test("u_assessmentvalue UI keeps the legacy final separate from displayed mastervalue", () => {
  assert.match(panel, /最后评定分严格按项目总分、考勤加减分、奖惩加减分相加/u);
  assert.match(panel, /主管附加分仅展示、不计入该旧公式/u);
  assert.match(panel, /item\.legacyLastValueWithoutMaster/u);
  assert.match(panel, /item\.sourceMasterValue/u);
  assert.match(panel, /最后评定分（不含主管附加分）/u);
});

test("u_assessmentvalue panel preserves permissions, frozen query and paging", () => {
  for (const permission of [
    "HR_PERFORMANCE_READ",
    "HR_PERFORMANCE_TEAM_READ",
    "HR_PERFORMANCE_SELF_READ",
  ]) {
    assert.match(panel, new RegExp(`HR_PERMISSIONS\\.${permission}\\b`, "u"));
  }
  assert.doesNotMatch(panel, /HR_PERFORMANCE_RESULT_READ/u);
  assert.match(panel, /useState<HrPerformanceLegacyAssessmentValueFilters \| null>\(null\)/u);
  assert.match(panel, /performanceLegacyAssessmentValueQuery\(\s*submitted,/u);
  assert.match(panel, /request\.current\?\.abort\(\)/u);
  assert.match(panel, /current === generation\.current/u);
  assert.match(panel, /<Pager result=\{result\}/u);
  assert.match(api, /page: String\(page\)/u);
  assert.match(api, /page_size: String\(pageSize\)/u);
  assert.match(client, /<HrPerformanceLegacyAssessmentValuePanel\/>/u);
});

test("u_assessmentvalue remains read-only and 390px-card based", () => {
  assert.doesNotMatch(panel, /hrApi\.(create|publish|submit|resolve|add|complete)/u);
  assert.doesNotMatch(api, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/u);
  assert.match(panel, /className=\{styles\.cards\}/u);
  assert.match(panel, /className=\{styles\.fieldGrid\}/u);
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.search\s*\{[\s\S]*?flex-direction: column/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(styles, /\.search button\s*\{[\s\S]*?width: 100%/u);
});
