import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(__dirname, "../../../..");
const page = readFileSync(resolve(__dirname, "organization/HrOrganizationClient.tsx"), "utf8");
const api = readFileSync(resolve(root, "apps/web/lib/hr-api.ts"), "utf8");
const styles = readFileSync(resolve(__dirname, "hr-workbench.module.css"), "utf8");

test("HR organization page reads the scoped system organization tree without replacing position operations", () => {
  assert.match(api, /organizationTree:\(token\?:string,signal\?:AbortSignal\)=>unwrap\(apiRequest<OrgTreeNode\[]>\("\/orgs\/tree"/);
  assert.match(page, /hasPermission\(user, SYSTEM_PERMISSIONS\.ORG_LIST\)/);
  assert.match(page, /hrApi\.organizationTree\(getAccessToken\(\)\)/);
  assert.match(page, /permission=\{HR_PERMISSIONS\.HR_ORGANIZATION_PAGE\}/);
  assert.match(page, /hrApi\.positions\(token\)/);
  assert.match(page, /hrApi\.createPosition/);
  assert.doesNotMatch(page, /legacyManagerReference|legacyCompanyManagerReference|legacy_source_id/);
});

test("organization tree has explicit loading forbidden failure empty and retry states", () => {
  assert.match(page, /"loading" \| "ready" \| "empty" \| "forbidden" \| "error"/);
  assert.match(page, /正在加载组织树/);
  assert.match(page, /当前账号缺少组织树读取权限/);
  assert.match(page, /加载组织树失败/);
  assert.match(page, /当前范围暂无组织数据/);
  assert.match(page, />重试<\/button>/);
});

test("tree is recursively collapsible and exposes semantic hierarchy controls", () => {
  assert.match(page, /function OrganizationTreeNodes/);
  assert.match(page, /aria-label="组织结构树"/);
  assert.match(page, /aria-expanded=\{expanded\}/);
  assert.match(page, /node\.children \?\? \[\]/);
  assert.match(page, /<OrganizationTreeNodes nodes=\{children\}/);
});

test("390px tree uses bounded cards and compact indentation without horizontal overflow", () => {
  assert.match(page, /ds-mobile-record/);
  assert.match(styles, /\.organizationTree\s*\{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*hidden/);
  assert.match(styles, /\.organizationTreeCard\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.organizationTreeBranch\s*\{[\s\S]*margin-inline-start:\s*14px/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.organizationTreeHeading\s*\{[\s\S]*grid-template-columns:\s*32px minmax\(0, 1fr\)/);
});
