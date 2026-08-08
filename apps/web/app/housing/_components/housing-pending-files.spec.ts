import assert from "node:assert/strict";
import test from "node:test";
import { pendingFilesQuery } from "./housing-pending-files";

test("repair draft recovery requests only unbound pending files", () => {
  const query = new URLSearchParams(pendingFilesQuery(
    "housing_repair",
    "11111111-1111-4111-8111-111111111111"
  ));
  assert.equal(query.get("pending"), "true");
  assert.equal(query.get("biz_type"), "housing_repair");
  assert.equal(query.get("biz_id"), "11111111-1111-4111-8111-111111111111");
});

test("other attachment recovery keeps historical list semantics", () => {
  assert.equal(new URLSearchParams(pendingFilesQuery("housing_handover")).has("pending"), false);
});
