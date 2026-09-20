import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(
  resolve(__dirname, "performance/HrPerformanceLegacyAssessmentValueOfPersonPanel.tsx"),
  "utf8",
);
const client = readFileSync(
  resolve(__dirname, "performance/HrPerformanceClient.tsx"),
  "utf8",
);
const api = readFileSync(
  resolve(__dirname, "../../lib/hr-performance-legacy-assessment-value-of-person-api.ts"),
  "utf8",
);
const styles = readFileSync(
  resolve(__dirname, "performance/performance-legacy-person-summary.module.css"),
  "utf8",
);

test("u_assessmentvalueofperson browser binds one exact safe legacy person code", () => {
  assert.match(api, /source_person_code: sourcePersonCode/u);
  assert.match(api, /query-reports\/assessment-value-of-person\?/u);
  assert.match(panel, /normalizeHrLegacyPersonCode/u);
  assert.match(panel, /isHrLegacyPersonCode/u);
  assert.match(panel, /HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH/u);
  assert.match(panel, /人员编码只作精确匹配，不能作为授权边界/u);
});

test("u_assessmentvalueofperson response is exactly the sealed eight-column projection", () => {
  const fields = [
    "compatibleLegacySessionText",
    "unresolvedLegacyGrade",
    "sourceItemValue",
    "sourceMasterValue",
    "sourceTimekeepValue",
    "sourceBonusValue",
    "legacyLastValueWithoutMaster",
    "sourceAppraisal",
  ];
  const rowContract = api.match(
    /export interface HrPerformanceLegacyAssessmentValueOfPersonRow \{([\s\S]*?)\n\}/u,
  )?.[1] ?? "";
  for (const field of fields) assert.match(rowContract, new RegExp(`^ {2}${field}:`, "mu"));
  assert.equal(rowContract.match(/^ {2}[a-z][A-Za-z]+:/gmu)?.length, 8);
  for (const forbidden of [
    "sourcePersonCode",
    "employeeDisplayName",
    "sourceAssGrade",
    "sourceTotalValue",
    "sourcePay",
    "sourceSessionId",
    "migrationBatchId",
    "legacyRecordMapId",
  ]) {
    assert.doesNotMatch(rowContract, new RegExp(`^ {2}${forbidden}:`, "mu"));
  }
});

test("u_assessmentvalueofperson UI keeps schema drift explicit", () => {
  assert.match(panel, /周期名称只显示已验证的同批次关系投影/u);
  assert.match(panel, /旧 grade 仍保持未解析/u);
  assert.match(panel, /item\.unresolvedLegacyGrade === null[\s\S]*?源清单未证明/u);
  assert.match(panel, /item\.compatibleLegacySessionText/u);
  assert.match(panel, /item\.unresolvedLegacyGrade/u);
});

test("u_assessmentvalueofperson UI keeps the legacy final separate from displayed mastervalue", () => {
  assert.match(panel, /最后评定分不含单独展示的主管附加分/u);
  assert.match(panel, /item\.legacyLastValueWithoutMaster/u);
  assert.match(panel, /item\.sourceMasterValue/u);
  assert.match(panel, /最后评定分（不含主管附加分）/u);
});

test("u_assessmentvalueofperson panel preserves permissions frozen query and paging", () => {
  for (const permission of [
    "HR_PERFORMANCE_READ",
    "HR_PERFORMANCE_TEAM_READ",
    "HR_PERFORMANCE_SELF_READ",
  ]) {
    assert.match(panel, new RegExp(`HR_PERMISSIONS\\.${permission}\\b`, "u"));
  }
  assert.doesNotMatch(panel, /HR_PERFORMANCE_RESULT_READ/u);
  assert.match(panel, /useState<string \| null>\(null\)/u);
  assert.match(panel, /performanceLegacyAssessmentValueOfPersonQuery\(\s*submittedCode,/u);
  assert.match(panel, /request\.current\?\.abort\(\)/u);
  assert.match(panel, /current === generation\.current/u);
  assert.match(panel, /<Pager result=\{result\}/u);
  assert.match(api, /page: String\(page\)/u);
  assert.match(api, /page_size: String\(pageSize\)/u);
  assert.match(client, /<HrPerformanceLegacyAssessmentValueOfPersonPanel\/>/u);
});

test("u_assessmentvalueofperson remains read-only and 390px-card based", () => {
  assert.doesNotMatch(panel, /hrApi\.(create|publish|submit|resolve|add|complete)/u);
  assert.doesNotMatch(api, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/u);
  assert.match(panel, /className=\{styles\.cards\}/u);
  assert.match(panel, /className=\{styles\.fieldGrid\}/u);
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.search\s*\{[\s\S]*?flex-direction: column/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(styles, /\.search button\s*\{[\s\S]*?width: 100%/u);
});
