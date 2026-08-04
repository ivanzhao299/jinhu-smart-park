import {
  createPropertyDraftEnvelope,
  isPropertyDraftUsable,
  propertyDraftKey,
  type PropertyDraftContext,
  type PropertyDraftEnvelope,
  type PropertyDraftSchema,
  type PropertyOfflineScope,
  propertyOfflineScopeKey
} from "./property-draft-contract";
import {
  isPropertyUploadQueueItemUsable,
  propertyUploadContextKey,
  type PropertyUploadContext,
  type PropertyUploadQueueItem
} from "./property-upload-queue";
import { completeIndexedDbTransaction, sweepIndexedDbKeys } from "./indexeddb-transaction";
import {
  propertyOfflineDraftsV1Enabled,
  propertyUploadQueueV1Enabled
} from "./property-reliability-flags";

// Dedicated databases let either rollback flag erase only its browser-local
// state via deleteDatabase(), without opening IndexedDB or touching API files.
// The legacy combined database also contained only drafts and unsubmitted blobs.
const LEGACY_DATABASE = "jinhu-property-offline-v1";
const DRAFT_DATABASE = "jinhu-property-drafts-v1";
const UPLOAD_DATABASE = "jinhu-property-upload-queue-v1";
const STORE = "drafts";
const UPLOAD_STORE = "uploads";
const SCOPE_KEY = "jinhu-property-offline-scope-v1";
let offlineStateGeneration = 0;
let offlineCleanupBarrier: Promise<void> = Promise.resolve();
let offlineScopeBarrier: Promise<void> = Promise.resolve();
let legacyCleanupBarrier: Promise<void> | null = null;

function openDatabase(databaseName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("offline database unavailable"));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (storeName === STORE && !request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("expiresAt", "expiresAt");
      }
      if (storeName === UPLOAD_STORE && !request.result.objectStoreNames.contains(UPLOAD_STORE)) {
        const uploads = request.result.createObjectStore(UPLOAD_STORE, { keyPath: "id" });
        uploads.createIndex("expiresAt", "expiresAt");
        uploads.createIndex("contextKey", "contextKey");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("offline draft database unavailable"));
  });
}

async function transaction<T>(
  databaseName: string,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, setResult: (value: T) => void) => void
): Promise<T> {
  const database = await openDatabase(databaseName, storeName);
  try {
    return await completeIndexedDbTransaction(database, storeName, mode, operation);
  } finally {
    database.close();
  }
}

function deleteDatabaseWithoutOpening(databaseName: string): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`offline database cleanup failed: ${databaseName}`));
    request.onblocked = () => reject(new Error(`offline database cleanup blocked: ${databaseName}`));
  });
}

function cleanupLegacyDatabase(): Promise<void> {
  if (!legacyCleanupBarrier) {
    const barrier = deleteDatabaseWithoutOpening(LEGACY_DATABASE).finally(() => {
      if (legacyCleanupBarrier === barrier) legacyCleanupBarrier = null;
    });
    legacyCleanupBarrier = barrier;
  }
  return legacyCleanupBarrier;
}

export async function disablePropertyDraftPersistence(): Promise<void> {
  await Promise.all([
    cleanupLegacyDatabase(),
    deleteDatabaseWithoutOpening(DRAFT_DATABASE)
  ]);
}

export async function disablePropertyUploadQueuePersistence(): Promise<void> {
  await Promise.all([
    cleanupLegacyDatabase(),
    deleteDatabaseWithoutOpening(UPLOAD_DATABASE)
  ]);
}

export function capturePropertyOfflineGeneration(): number {
  return offlineStateGeneration;
}

export function isPropertyOfflineGenerationCurrent(expectedGeneration: number): boolean {
  return expectedGeneration === offlineStateGeneration;
}

async function awaitWritableGeneration(expectedGeneration: number): Promise<void> {
  await offlineCleanupBarrier;
  if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) {
    throw new Error("offline scope changed; stale operation discarded");
  }
}

export async function savePropertyDraft<T extends Record<string, unknown>>(
  context: PropertyDraftContext,
  value: T,
  schema: PropertyDraftSchema,
  entityVersion: number | null = null,
  expectedGeneration = capturePropertyOfflineGeneration()
): Promise<PropertyDraftEnvelope<T>> {
  if (!propertyOfflineDraftsV1Enabled()) {
    throw new Error("property offline drafts are disabled");
  }
  await awaitWritableGeneration(expectedGeneration);
  const envelope = createPropertyDraftEnvelope(context, value, schema, { entityVersion });
  await cleanupLegacyDatabase();
  await awaitWritableGeneration(expectedGeneration);
  await transaction<void>(DRAFT_DATABASE, STORE, "readwrite", (store, setResult) => {
    const request = store.put(envelope);
    request.onsuccess = () => setResult(undefined);
  });
  if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) throw new Error("offline scope changed during draft save");
  return envelope;
}

export async function loadPropertyDraft<T extends Record<string, unknown>>(
  context: PropertyDraftContext
): Promise<PropertyDraftEnvelope<T> | null> {
  if (!propertyOfflineDraftsV1Enabled()) {
    await disablePropertyDraftPersistence();
    return null;
  }
  await cleanupLegacyDatabase();
  const envelope = await transaction<PropertyDraftEnvelope<T> | null>(DRAFT_DATABASE, STORE, "readonly", (store, setResult) => {
    const request = store.get(propertyDraftKey(context));
    request.onsuccess = () => setResult((request.result as PropertyDraftEnvelope<T> | undefined) ?? null);
  });
  if (!envelope) return null;
  if (isPropertyDraftUsable(envelope, context)) return envelope;
  await deletePropertyDraft(context);
  return null;
}

export async function deletePropertyDraft(context: PropertyDraftContext): Promise<void> {
  if (!propertyOfflineDraftsV1Enabled()) {
    await disablePropertyDraftPersistence();
    return;
  }
  await transaction<void>(DRAFT_DATABASE, STORE, "readwrite", (store, setResult) => {
    const request = store.delete(propertyDraftKey(context));
    request.onsuccess = () => setResult(undefined);
  });
}

export async function purgePropertyDrafts(): Promise<void> {
  if (!propertyOfflineDraftsV1Enabled()) {
    await disablePropertyDraftPersistence();
    return;
  }
  await transaction<void>(DRAFT_DATABASE, STORE, "readwrite", (store, setResult) => {
    const request = store.clear();
    request.onsuccess = () => setResult(undefined);
  });
}

export async function purgeExpiredPropertyDrafts(now = Date.now()): Promise<void> {
  if (!propertyOfflineDraftsV1Enabled()) {
    await disablePropertyDraftPersistence();
    return;
  }
  await transaction<void>(DRAFT_DATABASE, STORE, "readwrite", (store, setResult) => {
    sweepIndexedDbKeys(store, "expiresAt", IDBKeyRange.upperBound(now), () => setResult(undefined));
  });
}

export async function ensurePropertyOfflineScope(scope: PropertyOfflineScope): Promise<number> {
  if (typeof window === "undefined") return capturePropertyOfflineGeneration();
  const operation = offlineScopeBarrier.catch(() => undefined).then(async () => {
    await offlineCleanupBarrier;
    await cleanupLegacyDatabase();
    if (!propertyOfflineDraftsV1Enabled() && !propertyUploadQueueV1Enabled()) {
      await Promise.all([disablePropertyDraftPersistence(), disablePropertyUploadQueuePersistence()]);
      localStorage.removeItem(SCOPE_KEY);
      return capturePropertyOfflineGeneration();
    }
    const nextScope = propertyOfflineScopeKey(scope);
    const previousScope = localStorage.getItem(SCOPE_KEY);
    if (previousScope && previousScope !== nextScope) await purgePropertyOfflineState();
    if ("indexedDB" in window) {
      await Promise.all([purgeExpiredPropertyDrafts(), purgeExpiredPropertyUploadQueue()]);
    }
    localStorage.setItem(SCOPE_KEY, nextScope);
    return capturePropertyOfflineGeneration();
  });
  offlineScopeBarrier = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function purgePropertyOfflineState(): Promise<void> {
  if (typeof window === "undefined") return;
  offlineStateGeneration += 1;
  offlineCleanupBarrier = offlineCleanupBarrier.catch(() => undefined).then(async () => {
    try {
      if ("indexedDB" in window) {
        await Promise.all([
          cleanupLegacyDatabase(),
          deleteDatabaseWithoutOpening(DRAFT_DATABASE),
          deleteDatabaseWithoutOpening(UPLOAD_DATABASE)
        ]);
      }
    } finally {
      localStorage.removeItem(SCOPE_KEY);
    }
  });
  await offlineCleanupBarrier;
}

export async function putPropertyUploadQueueItem(
  item: PropertyUploadQueueItem,
  expectedGeneration = capturePropertyOfflineGeneration()
): Promise<void> {
  if (!propertyUploadQueueV1Enabled()) {
    throw new Error("property upload queue is disabled");
  }
  await awaitWritableGeneration(expectedGeneration);
  await cleanupLegacyDatabase();
  await awaitWritableGeneration(expectedGeneration);
  await transaction<void>(UPLOAD_DATABASE, UPLOAD_STORE, "readwrite", (store, setResult) => {
    const request = store.put(item);
    request.onsuccess = () => setResult(undefined);
  });
  if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) throw new Error("offline scope changed during upload queue save");
}

export async function listPropertyUploadQueue(context: PropertyUploadContext): Promise<PropertyUploadQueueItem[]> {
  if (!propertyUploadQueueV1Enabled()) {
    await disablePropertyUploadQueuePersistence();
    return [];
  }
  await cleanupLegacyDatabase();
  const contextKey = propertyUploadContextKey(context);
  const items = await transaction<PropertyUploadQueueItem[]>(UPLOAD_DATABASE, UPLOAD_STORE, "readonly", (store, setResult) => {
    const request = store.index("contextKey").getAll(contextKey);
    request.onsuccess = () => setResult(request.result as PropertyUploadQueueItem[]);
  });
  const now = Date.now();
  const usable = items.filter((item) => isPropertyUploadQueueItemUsable(item, context, now));
  await Promise.all(items.filter((item) => !usable.includes(item)).map((item) => deletePropertyUploadQueueItem(item.id)));
  return usable;
}

export async function deletePropertyUploadQueueItem(id: string): Promise<void> {
  if (!propertyUploadQueueV1Enabled()) {
    await disablePropertyUploadQueuePersistence();
    return;
  }
  await transaction<void>(UPLOAD_DATABASE, UPLOAD_STORE, "readwrite", (store, setResult) => {
    const request = store.delete(id);
    request.onsuccess = () => setResult(undefined);
  });
}

export async function clearPropertyUploadQueue(): Promise<void> {
  if (!propertyUploadQueueV1Enabled()) {
    await disablePropertyUploadQueuePersistence();
    return;
  }
  await transaction<void>(UPLOAD_DATABASE, UPLOAD_STORE, "readwrite", (store, setResult) => {
    const request = store.clear();
    request.onsuccess = () => setResult(undefined);
  });
}

export async function purgeExpiredPropertyUploadQueue(now = Date.now()): Promise<void> {
  if (!propertyUploadQueueV1Enabled()) {
    await disablePropertyUploadQueuePersistence();
    return;
  }
  await transaction<void>(UPLOAD_DATABASE, UPLOAD_STORE, "readwrite", (store, setResult) => {
    sweepIndexedDbKeys(store, "expiresAt", IDBKeyRange.upperBound(now), () => setResult(undefined));
  });
}
