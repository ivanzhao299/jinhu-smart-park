import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(
  resolve(__dirname, "performance/HrPerformanceLegacyAssessmentMasterPanel.tsx"),
  "utf8",
);
const client = readFileSync(
  resolve(__dirname, "performance/HrPerformanceClient.tsx"),
  "utf8",
);
const api = readFileSync(
  resolve(__dirname, "../../lib/hr-performance-legacy-assessment-master-api.ts"),
  "utf8",
);
const styles = readFileSync(
  resolve(__dirname, "performance/performance-legacy-person-summary.module.css"),
  "utf8",
);

test("u_assessmentmaster browser sends all four explicit bounded filters", () => {
  assert.match(api, /ass_session: filters\.assSession/u);
  assert.match(api, /assessment_type: filters\.assessmentType/u);
  assert.match(api, /department_like: filters\.departmentLike/u);
  assert.match(api, /department_match_mode: filters\.departmentMatchMode/u);
  assert.match(api, /query-reports\/assessment-master\?/u);
  assert.match(panel, /HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH/u);
  assert.match(panel, /HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH/u);
  assert.match(panel, /isHrPerformanceLegacyDepartmentPattern/u);
  assert.match(panel, /仅 % 和 _ 通配符/u);
  assert.match(panel, /精确部门编码/u);
});

test("u_assessmentmaster response contract is exactly the sealed twelve-column projection", () => {
  const fields = [
    "unresolvedLegacyAssessmentMasterId",
    "sourcePersonCode",
    "employeeDisplayName",
    "sourceAssGrade",
    "sourceItemValue",
    "sourceMasterValue",
    "sourceTimekeepValue",
    "sourceBonusValue",
    "sourceAppraisal",
    "sourceAssessmentPerson",
    "sourceRecordedAt",
    "sourceOperatorCode",
  ];
  for (const field of fields) assert.match(api, new RegExp(`^  ${field}:`, "mu"));
  const rowContract = api.match(
    /export interface HrPerformanceLegacyAssessmentMasterQueryRow \{([\s\S]*?)\n\}/u,
  )?.[1] ?? "";
  assert.equal(rowContract.match(/^ {2}[a-z][A-Za-z]+:/gmu)?.length, 12);
  for (const forbidden of [
    "sourceMasterId",
    "sourceSessionId",
    "sourcePay",
    "sourceSelfAppraisal",
    "sourceDescription",
    "migrationBatchId",
    "legacyRecordMapId",
  ]) {
    assert.doesNotMatch(api, new RegExp(`^  ${forbidden}:`, "mu"));
  }
  assert.match(panel, /旧 assid 在当前源清单中没有可证明字段/u);
  assert.match(panel, /<dt>旧 assid<\/dt><dd>源清单未证明<\/dd>/u);
});

test("u_assessmentmaster panel preserves exact permissions, frozen query and stable paging", () => {
  for (const permission of [
    "HR_PERFORMANCE_READ",
    "HR_PERFORMANCE_TEAM_READ",
    "HR_PERFORMANCE_SELF_READ",
  ]) {
    assert.match(panel, new RegExp(`HR_PERMISSIONS\\.${permission}\\b`, "u"));
  }
  assert.doesNotMatch(panel, /HR_PERFORMANCE_RESULT_READ/u);
  assert.match(panel, /useState<HrPerformanceLegacyAssessmentMasterFilters \| null>\(null\)/u);
  assert.match(panel, /performanceLegacyAssessmentMasterQuery\(\s*submitted,/u);
  assert.match(panel, /request\.current\?\.abort\(\)/u);
  assert.match(panel, /current === generation\.current/u);
  assert.match(panel, /<Pager result=\{result\}/u);
  assert.match(api, /page: String\(page\)/u);
  assert.match(api, /page_size: String\(pageSize\)/u);
  assert.match(client, /<HrPerformanceLegacyAssessmentMasterPanel\/>/u);
});

test("u_assessmentmaster results remain read-only and usable on a 390px-class layout", () => {
  assert.doesNotMatch(panel, /hrApi\.(create|publish|submit|resolve|add|complete)/u);
  assert.doesNotMatch(api, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/u);
  assert.match(panel, /className=\{styles\.cards\}/u);
  assert.match(panel, /className=\{styles\.fieldGrid\}/u);
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.search\s*\{[\s\S]*?flex-direction: column/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(styles, /\.search button\s*\{[\s\S]*?width: 100%/u);
});
