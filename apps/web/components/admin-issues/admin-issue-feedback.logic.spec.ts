import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ADMIN_ISSUE_PAGE_SIZE, adminIssuePageCount, buildAdminIssueHistoryPath } from "./admin-issue-feedback.logic";

test("feedback history builds bounded server-pagination requests for both views", () => {
  assert.equal(ADMIN_ISSUE_PAGE_SIZE, 20);
  assert.equal(buildAdminIssueHistoryPath("mine", 3), "/admin-issues/mine?page=3&page_size=20");
  assert.equal(buildAdminIssueHistoryPath("manage", 0), "/admin-issues?page=1&page_size=20");
  assert.equal(adminIssuePageCount(0), 1);
  assert.equal(adminIssuePageCount(41), 3);
  assert.equal(adminIssuePageCount(-1, 0), 1);
});

test("feedback surface composes shared design-system controls and pagination", () => {
  const component = readFileSync(resolve(process.cwd(), "components/admin-issues/AdminIssueFeedback.tsx"), "utf8");
  assert.match(component, /ds-panel/);
  assert.match(component, /ds-button ds-button-primary/);
  assert.match(component, /ds-button ds-button-secondary/);
  assert.match(component, /ds-mobile-record/);
  assert.match(component, /buildAdminIssueHistoryPath\(view as AdminIssueHistoryView, page\)/);
  assert.match(component, /setIssues\(\[\]\);\s+setPagination\(\{ total: 0, page, pageSize: ADMIN_ISSUE_PAGE_SIZE \}\);/);
  assert.match(component, /共 \{pagination\.total\} 条/);
  assert.match(
    component,
    /idempotencyKey: createIdempotencyKey\(`admin-issue-triage-\$\{issue\.issueNo\}-\$\{status\.toLowerCase\(\)\}`\)/
  );
  assert.doesNotMatch(component, /page=1&page_size=50/);
});
