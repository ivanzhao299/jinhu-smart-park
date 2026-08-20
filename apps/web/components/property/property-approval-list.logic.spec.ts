import assert from "node:assert/strict";
import test from "node:test";
import {
  propertyApprovalPageFromQuery,
  propertyApprovalListQuery,
  propertyApprovalPageCount
} from "./property-approval-list.logic";

test("approval work queue query follows the selected page", () => {
  assert.equal(propertyApprovalListQuery(3), "page=3&pageSize=20");
  assert.equal(propertyApprovalPageCount(0), 1);
  assert.equal(propertyApprovalPageCount(41), 3);
});

test("approval work queue restores a validated page from the return URL", () => {
  assert.equal(propertyApprovalPageFromQuery("2"), 2);
  assert.equal(propertyApprovalPageFromQuery("0"), 1);
  assert.equal(propertyApprovalPageFromQuery("1.5"), 1);
  assert.equal(propertyApprovalPageFromQuery("not-a-page"), 1);
  assert.equal(propertyApprovalPageFromQuery(null), 1);
});
