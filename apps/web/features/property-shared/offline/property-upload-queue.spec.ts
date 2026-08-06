import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_UPLOAD_BLOB_TTL_MS,
  assertPropertyUploadSubmissionContext,
  createPropertyUploadQueueItem,
  executePropertyUploadAttempt,
  isPropertyUploadQueueItemUsable,
  notifyPropertyUploadQueueState,
  preparePropertyUploadRecovery,
  propertyUploadContextKey,
  propertyUploadQueueBusy,
  propertyUploadQueueUiState,
  type PropertyUploadContext
} from "./property-upload-queue";
import { propertyOfflinePermissionFingerprint } from "./property-draft-contract";

const context: PropertyUploadContext = {
  tenantId: "tenant-a", parkId: "park-a", userId: "user-a",
  module: "housing", permissionFingerprint: "repair+file-upload",
  bizType: "housing_repair", bizId: "lease-a", entityVersion: "sha256:version-3"
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
  assert.equal(item.idempotencyKey, "file-upload-three");
  assert.equal(item.expiresAt, now + PROPERTY_UPLOAD_BLOB_TTL_MS);
  assert.equal(isPropertyUploadQueueItemUsable(item, context, item.expiresAt - 1), true);
  assert.equal(isPropertyUploadQueueItemUsable(item, context, item.expiresAt), false);
  assert.throws(() => assertPropertyUploadSubmissionContext(item, { ...context, entityVersion: "sha256:version-4" }, now));
  assert.throws(() => preparePropertyUploadRecovery(item, context, false, now));
  assert.equal(preparePropertyUploadRecovery(item, context, true, now), item);
  assert.throws(() => preparePropertyUploadRecovery(item, { ...context, parkId: "park-b" }, true, now));
  assert.throws(() => preparePropertyUploadRecovery(item, { ...context, permissionFingerprint: "repair-only" }, true, now));
});

test("queue keeps bounded non-sensitive remark and remains busy until exact context list succeeds", () => {
  const file = Object.assign(new Blob(["image"], { type: "image/jpeg" }), { name: "site.jpg" });
  const item = createPropertyUploadQueueItem({
    id: "remarked", context, file, explicitConsent: true, remark: "  现场入口  "
  });
  assert.equal(item.remark, "现场入口");
  assert.throws(() => createPropertyUploadQueueItem({
    id: "too-long", context, file, explicitConsent: true, remark: "x".repeat(501)
  }), /exceeds 500/u);
  const contextKey = propertyUploadContextKey(context);
  assert.equal(propertyUploadQueueBusy(contextKey, null, false), true);
  assert.equal(propertyUploadQueueBusy(contextKey, "another-context", false), true);
  assert.equal(propertyUploadQueueBusy(contextKey, contextKey, false), false);
});

test("upload context key changes when enabled module assignment changes", () => {
  const baseFingerprint = propertyOfflinePermissionFingerprint({
    dataScope: "park", permissions: ["file:upload"],
    enabledModules: [{ module_code: "housing_rental", enabled: true, expire_time: null }]
  });
  const changedFingerprint = propertyOfflinePermissionFingerprint({
    dataScope: "park", permissions: ["file:upload"],
    enabledModules: [{ module_code: "housing_rental", enabled: true, expire_time: "2026-12-31T00:00:00.000Z" }]
  });
  assert.notEqual(
    propertyUploadContextKey({ ...context, permissionFingerprint: baseFingerprint }),
    propertyUploadContextKey({ ...context, permissionFingerprint: changedFingerprint })
  );
});

test("disabled queue hides local UI and reports a non-busy zero-count callback state", () => {
  const disabledState = propertyUploadQueueUiState({
    enabled: false,
    contextKey: propertyUploadContextKey(context),
    initializedContextKey: null,
    uploading: true,
    count: 2
  });
  assert.deepEqual(disabledState, { busy: false, count: 0, visible: false });
  let callbackState: { busy: boolean; count: number } | null = null;
  notifyPropertyUploadQueueState((state) => { callbackState = state; }, disabledState);
  assert.deepEqual(callbackState, { busy: false, count: 0 });
  assert.deepEqual(propertyUploadQueueUiState({
    enabled: true,
    contextKey: propertyUploadContextKey(context),
    initializedContextKey: null,
    uploading: false,
    count: 2
  }), { busy: true, count: 2, visible: true });
});

test("disabled queue always executes the API upload path and never the local queue path", async () => {
  let apiCalls = 0;
  let queueCalls = 0;
  const result = await executePropertyUploadAttempt({
    contextAvailable: true,
    online: false,
    queueEnabled: false,
    queueOffline: async () => { queueCalls += 1; },
    uploadOnline: async () => {
      apiCalls += 1;
      return { id: "server-file" };
    }
  });
  assert.deepEqual(result, { kind: "uploaded", value: { id: "server-file" } });
  assert.equal(apiCalls, 1);
  assert.equal(queueCalls, 0);
});
