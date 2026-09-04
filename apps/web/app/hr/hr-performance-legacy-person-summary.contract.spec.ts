import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const component = fs.readFileSync(
  path.join(root, "app/hr/performance/HrPerformanceLegacyPersonSummaryPanel.tsx"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(root, "app/hr/performance/performance-legacy-person-summary.module.css"),
  "utf8",
);
const client = fs.readFileSync(
  path.join(root, "app/hr/performance/HrPerformanceClient.tsx"),
  "utf8",
);
const api = fs.readFileSync(
  path.join(root, "lib/hr-performance-legacy-person-summary-api.ts"),
  "utf8",
);

const fields = [
  "sourcePersonCode",
  "employeeDisplayName",
  "sourceSelfGrade",
  "sourceAssGrade",
  "sourceItemValue",
  "sourceTotalValue",
] as const;

test("legacy person summary uses the bounded GET query contract", () => {
  assert.match(api, /\/hr\/performance-legacy\/query-reports\/person-summary\?/u);
  assert.match(api, /source_person_code: sourcePersonCode/u);
  assert.match(api, /page: String\(page\)/u);
  assert.match(api, /page_size: String\(pageSize\)/u);
  assert.doesNotMatch(api, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/u);

  const shape = api.match(/interface HrPerformanceLegacyPersonSummary \{([\s\S]*?)\n\}/u)?.[1];
  assert.ok(shape);
  for (const field of fields) assert.match(shape, new RegExp(`\\b${field}\\b`, "u"));
  const propertyNames = [...shape.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:/gmu)]
    .map(match => match[1]);
  assert.deepEqual(propertyNames, fields);
});

test("entry permission is limited to read, team-read, and self-read", () => {
  assert.match(component, /HR_PERFORMANCE_READ/u);
  assert.match(component, /HR_PERFORMANCE_TEAM_READ/u);
  assert.match(component, /HR_PERFORMANCE_SELF_READ/u);
  assert.doesNotMatch(component, /HR_PERFORMANCE_RESULT_READ/u);
  assert.doesNotMatch(component, /HR_PERFORMANCE_MANAGE/u);
});

test("person code is trimmed and validated before any request", () => {
  assert.match(component, /const normalized = input\.trim\(\)/u);
  assert.ok(component.includes("const PERSON_CODE_PATTERN = /^[A-Za-z0-9_-]{1,10}$/u;"));
  assert.match(component, /maxLength=\{10\}/u);
  assert.match(component, /if \(!PERSON_CODE_PATTERN\.test\(normalized\)\)/u);
  assert.match(component, /if \(!canRead \|\| queryCode === null\) return/u);
});

test("requests have independent cancellation, stale-response, and retry controls", () => {
  assert.match(component, /new AbortController\(\)/u);
  assert.match(component, /const current = \+\+generation\.current/u);
  assert.match(component, /current === generation\.current/u);
  assert.match(component, /controller\.signal\.aborted/u);
  assert.match(component, /setQueryVersion\(version => version \+ 1\)/u);
  assert.match(component, /setResult\(\{ \.\.\.EMPTY_PAGE, page: nextPage \}\)/u);
});

test("result surface renders only the six approved person-summary fields", () => {
  for (const field of fields) {
    assert.match(component, new RegExp(`row\\.${field}\\b`, "u"));
  }
  const forbidden = [
    "sourceSessionId",
    "migrationBatchId",
    "legacyRecordMapId",
    "sourceIdentitySha256",
    "sourceRowSha256",
    "targetCycleEmployeeId",
    "targetTemplateVersionId",
    "sourceAppraisal",
    "sourceSelfAppraisal",
  ];
  for (const token of forbidden) assert.doesNotMatch(component + api, new RegExp(token, "u"));
});

test("a null employee projection is explicit and never guessed from the source code", () => {
  assert.match(component, /value === null \? "未建立现代员工映射" : valueText\(value\)/u);
  assert.match(component, /employeeNameText\(row\.employeeDisplayName\)/u);
  assert.doesNotMatch(component, /row\.employeeDisplayName\s*\?\?\s*row\.sourcePersonCode/u);
  assert.doesNotMatch(component, /row\.employeeDisplayName\s*\|\|\s*row\.sourcePersonCode/u);
});

test("desktop and phone render cards without a table overflow dependency", () => {
  assert.match(component, /<article/u);
  assert.doesNotMatch(component, /<table/u);
  assert.match(styles, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*?grid-template-columns:\s*1fr/u);
  assert.match(styles, /overflow-wrap:\s*anywhere/u);
});

test("performance workbench mounts person summary without displacing relationship facts", () => {
  assert.match(client, /<HrPerformanceLegacyRelationsPanel\/>/u);
  assert.match(client, /<HrPerformanceLegacyPersonSummaryPanel\/>/u);
});
