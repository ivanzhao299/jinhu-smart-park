import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(
  resolve(__dirname, "performance/HrPerformanceLegacyWebAssQueryPanel.tsx"),
  "utf8",
);
const client = readFileSync(
  resolve(__dirname, "performance/HrPerformanceClient.tsx"),
  "utf8",
);
const api = readFileSync(
  resolve(__dirname, "../../lib/hr-performance-legacy-web-ass-query-api.ts"),
  "utf8",
);
const styles = readFileSync(
  resolve(__dirname, "performance/performance-legacy-person-summary.module.css"),
  "utf8",
);

test("web_assquery browser binds all five filters and explicitly honors period", () => {
  assert.match(api, /ass_session: filters\.assSession/u);
  assert.match(api, /person_like", filters\.personLike/u);
  assert.match(api, /right_scope_prefix: filters\.rightScopePrefix/u);
  assert.match(api, /item_value_min: String\(filters\.itemValueMin\)/u);
  assert.match(api, /item_value_max: String\(filters\.itemValueMax\)/u);
  assert.match(api, /query-reports\/web-ass-query\?/u);
  assert.match(panel, /旧过程会丢弃传入的考核期间/u);
  assert.match(panel, /现代查询明确遵守所选期间/u);
});

test("web_assquery response is exactly the sealed six-column projection", () => {
  const fields = [
    "sourcePersonCode",
    "employeeDisplayName",
    "sourceSelfGrade",
    "sourceAssGrade",
    "sourceItemValue",
    "sourceTotalValue",
  ];
  const rowContract = api.match(
    /export interface HrPerformanceLegacyWebAssQueryRow \{([\s\S]*?)\n\}/u,
  )?.[1] ?? "";
  for (const field of fields) assert.match(rowContract, new RegExp(`^ {2}${field}:`, "mu"));
  assert.equal(rowContract.match(/^ {2}[a-z][A-Za-z]+:/gmu)?.length, 6);
  for (const forbidden of [
    "sourcePay",
    "sourceAppraisal",
    "sourceMasterValue",
    "sourceSessionId",
    "migrationBatchId",
    "legacyRecordMapId",
  ]) {
    assert.doesNotMatch(rowContract, new RegExp(`^ {2}${forbidden}:`, "mu"));
  }
});

test("web_assquery UI rejects dynamic SQL shapes and invalid score ranges", () => {
  assert.match(panel, /isHrPerformanceLegacyDepartmentPattern\(normalizedPerson\)/u);
  assert.match(panel, /isHrPerformanceLegacyDepartmentPrefix\(normalizedRightScope\)/u);
  assert.match(panel, /!Number\.isFinite\(minimum\)/u);
  assert.match(panel, /!Number\.isFinite\(maximum\)/u);
  assert.match(panel, /minimum > maximum/u);
  assert.match(panel, /人员条件最多 30 个字符/u);
  assert.match(panel, /部门权限前缀最多 30 个字符/u);
  assert.match(panel, /总评定分上下限必须为有效数字/u);
});

test("web_assquery labels resolved current-person semantics without claiming a frozen snapshot", () => {
  assert.match(panel, /T0 精确解析后的当前员工和主组织/u);
  assert.match(panel, /对应旧过程运行时关联当前 person/u);
  assert.match(panel, /不是冻结的历史姓名或部门快照/u);
});

test("web_assquery panel preserves permissions frozen query and paging", () => {
  for (const permission of [
    "HR_PERFORMANCE_READ",
    "HR_PERFORMANCE_TEAM_READ",
    "HR_PERFORMANCE_SELF_READ",
  ]) {
    assert.match(panel, new RegExp(`HR_PERMISSIONS\\.${permission}\\b`, "u"));
  }
  assert.doesNotMatch(panel, /HR_PERFORMANCE_RESULT_READ/u);
  assert.match(panel, /useState<HrPerformanceLegacyWebAssQueryFilters \| null>\(null\)/u);
  assert.match(panel, /performanceLegacyWebAssQuery\(\s*submitted,/u);
  assert.match(panel, /request\.current\?\.abort\(\)/u);
  assert.match(panel, /current === generation\.current/u);
  assert.match(panel, /<Pager result=\{result\}/u);
  assert.match(api, /page: String\(page\)/u);
  assert.match(api, /page_size: String\(pageSize\)/u);
  assert.match(client, /<HrPerformanceLegacyWebAssQueryPanel\/>/u);
});

test("web_assquery remains read-only and 390px-card based", () => {
  assert.doesNotMatch(panel, /hrApi\.(create|publish|submit|resolve|add|complete)/u);
  assert.doesNotMatch(api, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/u);
  assert.match(panel, /className=\{styles\.cards\}/u);
  assert.match(panel, /className=\{styles\.fieldGrid\}/u);
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.search\s*\{[\s\S]*?flex-direction: column/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(styles, /\.search button\s*\{[\s\S]*?width: 100%/u);
});
