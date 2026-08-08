import assert from "node:assert/strict";
import test from "node:test";
import {
  capturePropertyOfflineGeneration,
  disablePropertyDraftPersistence,
  disablePropertyUploadQueuePersistence,
  isPropertyOfflineGenerationCurrent,
  listPropertyUploadQueue,
  loadPropertyDraft,
  purgePropertyOfflineState,
  putPropertyUploadQueueItem,
  savePropertyDraft
} from "./property-draft-store";
import { createPropertyUploadQueueItem } from "./property-upload-queue";

test("scope reset invalidates an old upload catch before it can repopulate IndexedDB", async () => {
  const previousQueueFlag = process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
  process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = "true";
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
  try {
    await assert.rejects(() => putPropertyUploadQueueItem(item, staleGeneration), /stale operation discarded/u);
  } finally {
    if (previousQueueFlag === undefined) delete process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
    else process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = previousQueueFlag;
  }
});

test("disabled persistence cleans local databases without opening IndexedDB or retaining queue UI data", async () => {
  const previousDraftFlag = process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
  const previousQueueFlag = process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
  delete process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
  process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = "off";

  let openCount = 0;
  const deletedDatabases: string[] = [];
  const fakeIndexedDb = {
    open() {
      openCount += 1;
      throw new Error("disabled features must not open IndexedDB");
    },
    deleteDatabase(name: string) {
      deletedDatabases.push(name);
      const request: {
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
        error: DOMException | null;
      } = { onsuccess: null, onerror: null, onblocked: null, error: null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }
  };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb });

  const draftContext = {
    tenantId: "t", parkId: "p", userId: "u", route: "/homestay/bookings", entityId: "new"
  };
  const uploadContext = {
    tenantId: "t", parkId: "p", userId: "u", module: "housing", permissionFingerprint: "write",
    bizType: "housing_repair", bizId: "lease", entityVersion: "v1"
  };
  try {
    assert.equal(await loadPropertyDraft(draftContext), null);
    assert.deepEqual(await listPropertyUploadQueue(uploadContext), []);
    await disablePropertyDraftPersistence();
    await disablePropertyUploadQueuePersistence();
    assert.equal(openCount, 0);
    assert.ok(deletedDatabases.includes("jinhu-property-offline-v1"));
    assert.ok(deletedDatabases.includes("jinhu-property-drafts-v1"));
    assert.ok(deletedDatabases.includes("jinhu-property-upload-queue-v1"));
  } finally {
    if (previousDraftFlag === undefined) delete process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
    else process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1 = previousDraftFlag;
    if (previousQueueFlag === undefined) delete process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
    else process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = previousQueueFlag;
    Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("blocked IndexedDB deletion waits for the existing connection before completing cleanup", async () => {
  type DeleteRequest = {
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
    onblocked: (() => void) | null;
    error: DOMException | null;
  };
  const requests: DeleteRequest[] = [];
  const fakeIndexedDb = {
    deleteDatabase() {
      const request = { onsuccess: null, onerror: null, onblocked: null, error: null };
      requests.push(request);
      return request;
    }
  };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb });

  try {
    const cleanup = disablePropertyDraftPersistence();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const request = requests[0];
    assert.ok(request);
    request.onblocked?.();

    let settled = false;
    void cleanup.then(() => { settled = true; });
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(settled, false);

    for (const pending of requests) pending.onsuccess?.();
    await cleanup;
    assert.equal(settled, true);
  } finally {
    Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("failed IndexedDB deletion keeps the scope marker so cleanup is retried", async () => {
  const values = new Map([["jinhu-property-offline-scope-v1", "account-scope"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
  let failDraftDelete = true;
  const fakeIndexedDb = {
    deleteDatabase(name: string) {
      const request: {
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
        error: Error | null;
      } = { onsuccess: null, onerror: null, onblocked: null, error: null };
      queueMicrotask(() => {
        if (name === "jinhu-property-drafts-v1" && failDraftDelete) {
          request.error = new Error("delete failed");
          request.onerror?.();
        } else request.onsuccess?.();
      });
      return request;
    }
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { indexedDB: fakeIndexedDb, localStorage: storage } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb });
  try {
    await assert.rejects(purgePropertyOfflineState(), /delete failed/u);
    assert.equal(storage.getItem("jinhu-property-offline-scope-v1"), "account-scope");
  } finally {
    failDraftDelete = false;
    await purgePropertyOfflineState();
    Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("logout purge wins a legacy cleanup interleaving before stale draft or upload writes can open IndexedDB", async () => {
  const previousDraftFlag = process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
  const previousQueueFlag = process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
  process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1 = "true";
  process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = "true";

  let openCount = 0;
  let recordCount = 0;
  const pendingDeletes = new Map<string, Array<{ onsuccess: (() => void) | null }>>();
  const releasedDeletes = new Set<string>();
  const fakeIndexedDb = {
    open() {
      openCount += 1;
      recordCount += 1;
      throw new Error("stale write opened IndexedDB after purge");
    },
    deleteDatabase(name: string) {
      const request = {
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
        error: null as DOMException | null
      };
      if (releasedDeletes.has(name)) queueMicrotask(() => request.onsuccess?.());
      else pendingDeletes.set(name, [...(pendingDeletes.get(name) ?? []), request]);
      return request;
    }
  };
  const storage = { removeItem() {}, getItem() { return null; }, setItem() {} };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDb });
  Object.defineProperty(globalThis, "window", {
    configurable: true, value: { indexedDB: fakeIndexedDb, localStorage: storage }
  });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

  const generation = capturePropertyOfflineGeneration();
  const draftWrite = savePropertyDraft(
    { tenantId: "t", parkId: "p", userId: "u", route: "/homestay/bookings", entityId: "draft" },
    { remark: "safe" },
    { remark: "string" },
    null,
    generation
  );
  const queueItem = createPropertyUploadQueueItem({
    id: "interleaved-upload",
    context: {
      tenantId: "t", parkId: "p", userId: "u", module: "housing", permissionFingerprint: "write",
      bizType: "housing_repair", bizId: "lease", entityVersion: "v1"
    },
    explicitConsent: true,
    file: Object.assign(new Blob(["x"], { type: "image/jpeg" }), { name: "x.jpg" })
  });
  const uploadWrite = putPropertyUploadQueueItem(queueItem, generation);

  const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
  const releaseDelete = (name: string) => {
    releasedDeletes.add(name);
    const requests = pendingDeletes.get(name) ?? [];
    pendingDeletes.delete(name);
    for (const request of requests) request.onsuccess?.();
  };
  let purge: Promise<void> | null = null;
  try {
    await flush();
    assert.equal(pendingDeletes.get("jinhu-property-offline-v1")?.length, 1);
    purge = purgePropertyOfflineState();
    await flush();
    assert.equal(pendingDeletes.get("jinhu-property-drafts-v1")?.length, 1);
    assert.equal(pendingDeletes.get("jinhu-property-upload-queue-v1")?.length, 1);

    releaseDelete("jinhu-property-offline-v1");
    releaseDelete("jinhu-property-drafts-v1");
    releaseDelete("jinhu-property-upload-queue-v1");
    await purge;
    await assert.rejects(draftWrite, /stale operation discarded/u);
    await assert.rejects(uploadWrite, /stale operation discarded/u);
    assert.equal(openCount, 0);
    assert.equal(recordCount, 0);
  } finally {
    for (const name of pendingDeletes.keys()) releaseDelete(name);
    await purge?.catch(() => undefined);
    if (previousDraftFlag === undefined) delete process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1;
    else process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1 = previousDraftFlag;
    if (previousQueueFlag === undefined) delete process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1;
    else process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1 = previousQueueFlag;
    Reflect.deleteProperty(globalThis, "indexedDB");
  }
});
