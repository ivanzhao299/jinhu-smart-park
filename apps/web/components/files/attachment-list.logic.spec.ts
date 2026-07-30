import assert from "node:assert/strict";
import test from "node:test";
import { completeAttachmentDeletion } from "./attachment-list.logic";

test("a successful delete notifies the owner before refreshing the attachment projection", async () => {
  const events: string[] = [];

  const refreshError = await completeAttachmentDeletion(
    { id: "file-1" },
    () => events.push("owner-notified"),
    () => events.push("removed-locally"),
    async () => {
      events.push("refresh-started");
      throw new Error("refresh failed");
    }
  );

  assert.equal(refreshError, "refresh failed");
  assert.deepEqual(events, ["owner-notified", "removed-locally", "refresh-started"]);
});
