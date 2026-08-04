import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_UPLOAD_BLOB_TTL_MS,
  assertPropertyUploadSubmissionContext,
  createPropertyUploadQueueItem,
  isPropertyUploadQueueItemUsable,
  preparePropertyUploadRecovery,
  type PropertyUploadContext
} from "./property-upload-queue";

const context: PropertyUploadContext = {
  tenantId: "tenant-a", parkId: "park-a", userId: "user-a",
  bizType: "housing_repair", bizId: "lease-a", entityVersion: 3
};

test("offline image queue requires explicit consent and rejects sensitive business types", () => {
  const file = Object.assign(new Blob(["image"], { type: "image/jpeg" }), { name: "site.jpg" });
  assert.throws(() => createPropertyUploadQueueItem({ id: "one", context, file, explicitConsent: false }));
  assert.throws(() => createPropertyUploadQueueItem({
    id: "two", context: { ...context, bizType: "payment_evidence" }, file, explicitConsent: true
  }));
});

test("queued blob expires after two hours and is bound to entity version", () => {
  const now = 1_000;
  const file = Object.assign(new Blob(["image"], { type: "image/png" }), { name: "site.png" });
  const item = createPropertyUploadQueueItem({ id: "three", context, file, explicitConsent: true, now });
  assert.equal(item.expiresAt, now + PROPERTY_UPLOAD_BLOB_TTL_MS);
  assert.equal(isPropertyUploadQueueItemUsable(item, context, item.expiresAt - 1), true);
  assert.equal(isPropertyUploadQueueItemUsable(item, context, item.expiresAt), false);
  assert.throws(() => assertPropertyUploadSubmissionContext(item, { ...context, entityVersion: 4 }, now));
  assert.throws(() => preparePropertyUploadRecovery(item, context, false, now));
  assert.equal(preparePropertyUploadRecovery(item, context, true, now), item);
  assert.throws(() => preparePropertyUploadRecovery(item, { ...context, parkId: "park-b" }, true, now));
});
