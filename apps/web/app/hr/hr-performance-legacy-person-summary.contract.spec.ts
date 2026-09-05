import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const repositoryRoot = path.resolve(root, "../..");
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
const sourceProfilePath = path.join(
  repositoryRoot,
  "scripts/hr-cutover/contracts/legacy-performance-person-code-profile-v1.json",
);
const sourceProfile = JSON.parse(fs.readFileSync(sourceProfilePath, "utf8")) as Record<string, unknown>;
const sourceProfileSql = fs.readFileSync(
  path.join(repositoryRoot, String(sourceProfile.captureQueryPath)),
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
  assert.match(api, /source_routine: sourceRoutine/u);
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

test("person code uses the shared Unicode-safe exact-code policy before any request", () => {
  for (const symbol of [
    "HR_LEGACY_PERSON_CODE_MAX_LENGTH",
    "HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH",
    "isHrLegacyPersonCode",
    "normalizeHrLegacyPersonCode",
  ]) assert.match(component, new RegExp(`\\b${symbol}\\b`, "u"));
  assert.match(component, /const normalized = normalizeHrLegacyPersonCode\(input\)/u);
  assert.match(component, /maxLength=\{HR_LEGACY_PERSON_CODE_MAX_UTF16_LENGTH\}/u);
  assert.match(component, /if \(!isHrLegacyPersonCode\(normalized\)\)/u);
  assert.doesNotMatch(component, /ASCII|PERSON_CODE_PATTERN/u);
  assert.match(component, /if \(!canRead \|\| queryCode === null \|\| queryRoutine === null\) return/u);
});

test("routine mode is explicit and preserves the two distinct orphan policies", () => {
  assert.match(component, /<select/u);
  assert.match(component, /HR_PERFORMANCE_LEGACY_PERSON_SUMMARY_ROUTINES\.map/u);
  assert.match(component, /web_ass:\s*"web_ass（仅已映射现代员工）"/u);
  assert.match(
    component,
    /web_assessmentquery:\s*"web_assessmentquery（保留未映射历史汇总）"/u,
  );
  assert.match(component, /useState<HrPerformanceLegacyPersonSummaryRoutine>\("web_ass"\)/u);
  assert.match(component, /setQueryRoutine\(sourceRoutine\)/u);
  assert.match(component, /setQueryRoutine\(null\)/u);
  assert.match(component, /performanceLegacyPersonSummary\(\s*queryRoutine,\s*queryCode,/u);
  assert.match(component, /web_assessmentquery 保留未映射历史汇总并明确显示未映射状态/u);
  assert.match(component, /value === null \? "未建立现代员工映射" : valueText\(value\)/u);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?\.search\s*\{[\s\S]*?flex-direction:\s*column/u);
});

test("the read-only source profile proves Unicode coverage without carrying source values", () => {
  assert.deepEqual(
    {
      databaseReadOnly: sourceProfile.databaseReadOnly,
      sourceType: sourceProfile.sourceType,
      sourceMaxBytes: sourceProfile.sourceMaxBytes,
      totalRows: sourceProfile.totalRows,
      nullRows: sourceProfile.nullRows,
      emptyRows: sourceProfile.emptyRows,
      minCodeUnits: sourceProfile.minCodeUnits,
      maxCodeUnits: sourceProfile.maxCodeUnits,
      outerSpaceRows: sourceProfile.outerSpaceRows,
      whitespaceRows: sourceProfile.whitespaceRows,
      controlRows: sourceProfile.controlRows,
      nonAsciiRows: sourceProfile.nonAsciiRows,
      hanRows: sourceProfile.hanRows,
      nonAsciiNonHanRows: sourceProfile.nonAsciiNonHanRows,
      asciiOtherRows: sourceProfile.asciiOtherRows,
      wildcardRows: sourceProfile.wildcardRows,
      sqlMetaRows: sourceProfile.sqlMetaRows,
      exactDuplicateGroups: sourceProfile.exactDuplicateGroups,
      trimCollisionGroups: sourceProfile.trimCollisionGroups,
      caseFoldCollisionGroups: sourceProfile.caseFoldCollisionGroups,
    },
    {
      databaseReadOnly: true,
      sourceType: "varchar",
      sourceMaxBytes: 10,
      totalRows: 2949,
      nullRows: 0,
      emptyRows: 0,
      minCodeUnits: 2,
      maxCodeUnits: 6,
      outerSpaceRows: 0,
      whitespaceRows: 0,
      controlRows: 0,
      nonAsciiRows: 2,
      hanRows: 2,
      nonAsciiNonHanRows: 0,
      asciiOtherRows: 0,
      wildcardRows: 0,
      sqlMetaRows: 0,
      exactDuplicateGroups: 0,
      trimCollisionGroups: 0,
      caseFoldCollisionGroups: 0,
    },
  );
  assert.equal(sourceProfile.containsSourceValues, false);
  assert.equal(sourceProfile.containsPersonalData, false);
  assert.equal(sourceProfile.productionImport, "HOLD");
  assert.deepEqual(sourceProfile.inputPolicy, {
    normalization: "trim_only_no_case_or_unicode_rewrite",
    maxCodePoints: 10,
    webMaxUtf16CodeUnits: 20,
    allowedUnicodeCategories: ["Letter", "Number"],
    allowedLiteralSeparators: ["_", "-"],
    comparison: "parameterized_exact_equality",
    urlEncoding: "URLSearchParams",
    claimScope: "current_snapshot_query_superset_not_varchar_write_equivalence",
  });
  assert.match(String(sourceProfile.sourceSetSha256), /^[a-f0-9]{64}$/u);
  assert.equal(
    createHash("sha256").update(sourceProfileSql).digest("hex"),
    sourceProfile.captureQuerySha256,
  );
  assert.match(sourceProfileSql, /PERFORMANCE_PERSON_CODE_SOURCE_NOT_READ_ONLY/u);
  assert.match(sourceProfileSql, /IS_SRVROLEMEMBER\('sysadmin'\)/u);
  assert.match(sourceProfileSql, /FOR JSON PATH, WITHOUT_ARRAY_WRAPPER/u);
  assert.doesNotMatch(
    sourceProfileSql,
    /\b(?:INSERT\s+INTO|UPDATE\s+dbo\.|DELETE\s+FROM|MERGE\s+INTO|ALTER\s+TABLE|DROP\s+TABLE)\b/iu,
  );
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
