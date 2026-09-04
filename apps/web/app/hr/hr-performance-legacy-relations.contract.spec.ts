import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const panel = readFileSync(
  resolve(__dirname, "performance/HrPerformanceLegacyRelationsPanel.tsx"),
  "utf8",
);
const styles = readFileSync(
  resolve(__dirname, "performance/performance-legacy-relations.module.css"),
  "utf8",
);
const api = readFileSync(
  resolve(__dirname, "../../lib/hr-performance-legacy-relations-api.ts"),
  "utf8",
);
const client = readFileSync(
  resolve(__dirname, "performance/HrPerformanceClient.tsx"),
  "utf8",
);

test("legacy performance relations expose all three read-only paginated projections", () => {
  for (const route of [
    "relations/sessions",
    "relations/score-sources",
    "relations/source-person-assignments",
  ]) {
    assert.match(api, new RegExp(route, "u"));
  }
  for (const typeName of [
    "HrPerformanceLegacySessionRelation",
    "HrPerformanceLegacyScoreSourceRelation",
    "HrPerformanceLegacyPersonAssignmentRelation",
  ]) {
    assert.match(api, new RegExp(`interface ${typeName}`, "u"));
  }
  assert.match(api, /page_size/u);
  assert.match(api, /source_session_id/u);
  assert.doesNotMatch(api, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/u);
  assert.match(panel, /<Pager result=/u);
  assert.match(panel, /AbortController/u);
  assert.match(panel, /generation\.current/u);
});

test("person relation visibility uses only corrected park-wide read or manage authority", () => {
  assert.match(panel, /HR_PERFORMANCE_READ/u);
  assert.match(panel, /HR_PERFORMANCE_MANAGE/u);
  assert.doesNotMatch(
    panel,
    /HR_PERFORMANCE_RESULT_READ|HR_PERFORMANCE_TEAM_READ|HR_PERFORMANCE_SELF_READ/u,
  );
  assert.match(panel, /HR_PERFORMANCE_TEMPLATE_READ/u);
  assert.match(panel, /HR_PERFORMANCE_TEMPLATE_MANAGE/u);
});

test("relation cards preserve old codes and make absent modern employee mapping explicit", () => {
  for (const label of ["旧绩效周期", "评分来源", "评分人关系"]) {
    assert.match(panel, new RegExp(label, "u"));
  }
  assert.match(
    panel,
    /现代员工映射：未建立；仅保留旧人员编码，不推断人员身份/u,
  );
  assert.match(panel, /旧关系类型代码/u);
  assert.match(panel, /mappingText\(row\.targetReviewCycleId\)/u);
  assert.match(panel, /mappingText\(row\.legacySessionId\)/u);
  assert.match(panel, /mappingText\(row\.legacyDimensionProfileId\)/u);
  assert.match(panel, /不推断人员姓名或关系含义/u);
});

test("relation Web projection excludes migration provenance and payroll details", () => {
  const webProjection = `${api}\n${panel}`;
  for (const forbidden of [
    "sourceIdentitySha256",
    "sourceRowSha256",
    "migrationBatchId",
    "legacyRecordMapId",
    "sourcePay",
    "payroll",
    "salary",
  ]) {
    assert.doesNotMatch(webProjection, new RegExp(forbidden, "iu"));
  }
});

test("relation UI is card-based on desktop and collapses safely at phone width", () => {
  assert.match(styles, /\.cards\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u);
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/u);
  assert.match(styles, /overflow-wrap:\s*anywhere/u);
  assert.match(panel, /<article className=\{styles\.card\}/u);
  assert.doesNotMatch(panel, /<table/u);
});

test("session filter validates locally and relation panel is mounted in the performance workbench", () => {
  assert.match(panel, /\^\\d\+\$/u);
  assert.match(panel, /Number\.isSafeInteger/u);
  assert.match(panel, /旧周期编号必须是大于等于零的整数/u);
  assert.match(client, /<HrPerformanceLegacyRelationsPanel\/>/u);
});
