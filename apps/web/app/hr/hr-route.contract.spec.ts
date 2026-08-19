import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("HR top-level route keeps the authenticated dashboard and visible permission fallback", () => {
  const layout = readFileSync(resolve(__dirname, "layout.tsx"), "utf8");
  const workbench = readFileSync(resolve(__dirname, "HrWorkbench.tsx"), "utf8");

  assert.match(layout, /import \{ DashboardLayout \}/);
  assert.match(layout, /<DashboardLayout>\{children\}<\/DashboardLayout>/);
  assert.match(workbench, /module="hr"/);
  assert.match(workbench, /permission="hr:dashboard"/);
  assert.match(workbench, /无权访问人力资源管理/);
});

test("HR operational forms collapse to one column on phone width", () => {
  const styles = readFileSync(resolve(__dirname, "hr-workbench.module.css"), "utf8");
  const organization = readFileSync(resolve(__dirname, "organization/HrOrganizationClient.tsx"), "utf8");
  const reports = readFileSync(resolve(__dirname, "work-reports/HrWorkReportsClient.tsx"), "utf8");

  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.formGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(organization, /ds-mobile-record-list/);
  assert.match(organization, /type="number" min="0" max="100000" step="1"/);
  assert.match(reports, /ds-mobile-record-list/);
  assert.match(reports, /type="number" min="0" max="744" step="0\.25"/);
});
