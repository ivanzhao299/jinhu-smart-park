import assert from "node:assert/strict";
import test from "node:test";
import { completeAttachmentDeletion } from "./attachment-list.logic";

test("a successful delete notifies the owner before refreshing the attachment projection", async () => {
  const events: string[] = [];

  await assert.rejects(
    completeAttachmentDeletion(
      { id: "file-1" },
      () => events.push("owner-notified"),
      async () => {
        events.push("refresh-started");
        throw new Error("refresh failed");
      }
    ),
    /refresh failed/
  );

  assert.deepEqual(events, ["owner-notified", "refresh-started"]);
});
