import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

test("legacy custom field admin is permission-gated, has desktop and phone structures, and is reachable from employee administration", () => {
  const client = read("employees/custom-fields/HrCustomFieldDefinitionsClient.tsx");
  const employee = read("employees/HrEmployeesClient.tsx");
  assert.match(client, /permission=\{HR_PERMISSIONS\.HR_EMPLOYEE_PROFILE_MANAGE\}/);
  assert.match(client, /ds-kpi-grid/);
  assert.match(client, /ds-mobile-record-list/);
  assert.match(client, /ds-mobile-record/);
  assert.match(client, /ds-table-shell/);
  assert.match(client, /<table>/);
  assert.match(client, /当前筛选范围内没有旧自定义字段定义/);
  assert.match(client, /加载更多/);
  assert.match(employee, /href="\/hr\/employees\/custom-fields"/);
});

test("admin display exposes only presence, classifications, and coverage rather than legacy SQL or fingerprints", () => {
  const client = read("employees/custom-fields/HrCustomFieldDefinitionsClient.tsx");
  const api = read("../../lib/hr-custom-field-api.ts");
  assert.match(client, /仅保留指纹/);
  assert.match(client, /旧 SQL 原文不会入库、执行或出站/);
  assert.match(client, /logicCoverage\.captured/);
  assert.match(client, /reviewReasonCode/);
  assert.doesNotMatch(client, /sourceValueSha256|sqltextSha256|crosssqlSha256|descriptionDSha256/);
  assert.doesNotMatch(api, /sourceValueSha256|sqltextSha256|crosssqlSha256|descriptionDSha256/);
  assert.doesNotMatch(client, /legacySqlText|legacyCrossSql|rawLegacySql/i);
});

test("review management uses constrained decisions, optimistic versions, and no free-text reason", () => {
  const client = read("employees/custom-fields/HrCustomFieldDefinitionsClient.tsx");
  const api = read("../../lib/hr-custom-field-api.ts");
  assert.match(client, /expectedVersion: row\.review\.version/);
  assert.match(client, /name="reviewReasonCode"/);
  assert.match(client, /name="targetFieldKey" pattern="\[a-z\]\[a-z0-9_\.-\]\{0,127\}"/);
  assert.doesNotMatch(client, /textarea/);
  assert.match(api, /idempotencyKey: createIdempotencyKey\("hr-custom-field-review"\)/);
});
