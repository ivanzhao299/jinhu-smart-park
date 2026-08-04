import assert from "node:assert/strict";
import test from "node:test";
import {
  capturePropertyOfflineGeneration,
  isPropertyOfflineGenerationCurrent,
  purgePropertyOfflineState,
  putPropertyUploadQueueItem
} from "./property-draft-store";
import { createPropertyUploadQueueItem } from "./property-upload-queue";

test("scope reset invalidates an old upload catch before it can repopulate IndexedDB", async () => {
  const storage = { removeItem() {}, getItem() { return null; }, setItem() {} };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  const staleGeneration = capturePropertyOfflineGeneration();
  await purgePropertyOfflineState();
  assert.notEqual(capturePropertyOfflineGeneration(), staleGeneration);
  assert.equal(isPropertyOfflineGenerationCurrent(staleGeneration), false);
  const item = createPropertyUploadQueueItem({
    id: "race-item",
    context: {
      tenantId: "t", parkId: "p", userId: "u", module: "housing", permissionFingerprint: "write",
      bizType: "housing_repair", bizId: "lease", entityVersion: "v1"
    },
    explicitConsent: true,
    file: Object.assign(new Blob(["x"], { type: "image/jpeg" }), { name: "x.jpg" })
  });
  await assert.rejects(() => putPropertyUploadQueueItem(item, staleGeneration), /stale operation discarded/u);
});
