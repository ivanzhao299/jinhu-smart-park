import assert from "node:assert/strict";
import test from "node:test";
import { encodeReturnContext } from "../../features/property-shared/detail/return-context";
import {
  propertyApprovalListDetailHref,
  propertyApprovalReturnHref
} from "./property-approval-return.logic";

test("approval detail returns only to allowlisted workbench contexts", () => {
  assert.equal(propertyApprovalReturnHref(encodeReturnContext({
    route: "tasks",
    query: { page: "2", requestId: "request-1", unsafe: "drop" }
  })), "/homestay/tasks?page=2&requestId=request-1");
  assert.equal(propertyApprovalReturnHref(encodeReturnContext({
    route: "/housing/tasks",
    query: { status: "pending", taskId: "task-1" }
  })), "/housing/tasks?status=pending&taskId=task-1");
  assert.equal(propertyApprovalReturnHref(encodeReturnContext({
    route: "unknown",
    query: { page: "2" }
  })), "/property/approvals");
  assert.equal(propertyApprovalReturnHref("https://evil.example/"), "/property/approvals");
});

test("approval list detail links preserve their page context", () => {
  const href = propertyApprovalListDetailHref("request/one", 3);
  assert.match(href, /^\/property\/approvals\/request%2Fone\?returnTo=/);
  const returnTo = new URL(href, "https://workbench.local").searchParams.get("returnTo");
  assert.equal(propertyApprovalReturnHref(returnTo), "/property/approvals?page=3");
});
