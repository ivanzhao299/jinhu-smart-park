import assert from "node:assert/strict";
import test from "node:test";
import {
  propertyApprovalListQuery,
  propertyApprovalPageCount
} from "./property-approval-list.logic";

test("approval work queue query follows the selected page", () => {
  assert.equal(propertyApprovalListQuery(3), "page=3&pageSize=20");
  assert.equal(propertyApprovalPageCount(0), 1);
  assert.equal(propertyApprovalPageCount(41), 3);
});
