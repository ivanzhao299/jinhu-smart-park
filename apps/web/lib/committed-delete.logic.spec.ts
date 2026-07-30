import assert from "node:assert/strict";
import test from "node:test";
import {
  getCommittedDeleteRefreshError,
  removeCommittedItem
} from "./committed-delete.logic";

test("a committed deletion is removed locally even when the follow-up refresh fails", async () => {
  const page = {
    items: [{ id: "keep" }, { id: "deleted" }],
    page: 1,
    page_size: 20,
    total: 2
  };

  assert.deepEqual(removeCommittedItem(page, "deleted"), {
    ...page,
    items: [{ id: "keep" }],
    total: 1
  });
  assert.equal(
    await getCommittedDeleteRefreshError(async () => {
      throw new Error("network unavailable");
    }),
    "network unavailable"
  );
});
