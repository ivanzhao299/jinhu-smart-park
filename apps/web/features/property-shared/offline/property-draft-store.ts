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

const DATABASE = "jinhu-property-offline-v1";
const STORE = "drafts";
const UPLOAD_STORE = "uploads";
const SCOPE_KEY = "jinhu-property-offline-scope-v1";
let offlineStateGeneration = 0;
let offlineCleanupBarrier: Promise<void> = Promise.resolve();
let offlineScopeBarrier: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("expiresAt", "expiresAt");
      }
      if (!request.result.objectStoreNames.contains(UPLOAD_STORE)) {
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
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, setResult: (value: T) => void) => void,
  storeName = STORE
): Promise<T> {
  const database = await openDatabase();
  try {
    return await completeIndexedDbTransaction(database, storeName, mode, operation);
  } finally {
    database.close();
  }
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
  await awaitWritableGeneration(expectedGeneration);
  const envelope = createPropertyDraftEnvelope(context, value, schema, { entityVersion });
  await transaction<void>("readwrite", (store, setResult) => {
    const request = store.put(envelope);
    request.onsuccess = () => setResult(undefined);
  });
  if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) throw new Error("offline scope changed during draft save");
  return envelope;
}

export async function loadPropertyDraft<T extends Record<string, unknown>>(
  context: PropertyDraftContext
): Promise<PropertyDraftEnvelope<T> | null> {
  const envelope = await transaction<PropertyDraftEnvelope<T> | null>("readonly", (store, setResult) => {
    const request = store.get(propertyDraftKey(context));
    request.onsuccess = () => setResult((request.result as PropertyDraftEnvelope<T> | undefined) ?? null);
  });
  if (!envelope) return null;
  if (isPropertyDraftUsable(envelope, context)) return envelope;
  await deletePropertyDraft(context);
  return null;
}

export async function deletePropertyDraft(context: PropertyDraftContext): Promise<void> {
  await transaction<void>("readwrite", (store, setResult) => {
    const request = store.delete(propertyDraftKey(context));
    request.onsuccess = () => setResult(undefined);
  });
}

export async function purgePropertyDrafts(): Promise<void> {
  await transaction<void>("readwrite", (store, setResult) => {
    const request = store.clear();
    request.onsuccess = () => setResult(undefined);
  });
}

export async function purgeExpiredPropertyDrafts(now = Date.now()): Promise<void> {
  await transaction<void>("readwrite", (store, setResult) => {
    sweepIndexedDbKeys(store, "expiresAt", IDBKeyRange.upperBound(now), () => setResult(undefined));
  });
}

export async function ensurePropertyOfflineScope(scope: PropertyOfflineScope): Promise<number> {
  if (typeof window === "undefined") return capturePropertyOfflineGeneration();
  const operation = offlineScopeBarrier.catch(() => undefined).then(async () => {
    await offlineCleanupBarrier;
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
        await Promise.all([purgePropertyDrafts(), clearPropertyUploadQueue()]);
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
  await awaitWritableGeneration(expectedGeneration);
  await transaction<void>("readwrite", (store, setResult) => {
    const request = store.put(item);
    request.onsuccess = () => setResult(undefined);
  }, UPLOAD_STORE);
  if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) throw new Error("offline scope changed during upload queue save");
}

export async function listPropertyUploadQueue(context: PropertyUploadContext): Promise<PropertyUploadQueueItem[]> {
  const contextKey = propertyUploadContextKey(context);
  const items = await transaction<PropertyUploadQueueItem[]>("readonly", (store, setResult) => {
    const request = store.index("contextKey").getAll(contextKey);
    request.onsuccess = () => setResult(request.result as PropertyUploadQueueItem[]);
  }, UPLOAD_STORE);
  const now = Date.now();
  const usable = items.filter((item) => isPropertyUploadQueueItemUsable(item, context, now));
  await Promise.all(items.filter((item) => !usable.includes(item)).map((item) => deletePropertyUploadQueueItem(item.id)));
  return usable;
}

export async function deletePropertyUploadQueueItem(id: string): Promise<void> {
  await transaction<void>("readwrite", (store, setResult) => {
    const request = store.delete(id);
    request.onsuccess = () => setResult(undefined);
  }, UPLOAD_STORE);
}

export async function clearPropertyUploadQueue(): Promise<void> {
  await transaction<void>("readwrite", (store, setResult) => {
    const request = store.clear();
    request.onsuccess = () => setResult(undefined);
  }, UPLOAD_STORE);
}

export async function purgeExpiredPropertyUploadQueue(now = Date.now()): Promise<void> {
  await transaction<void>("readwrite", (store, setResult) => {
    sweepIndexedDbKeys(store, "expiresAt", IDBKeyRange.upperBound(now), () => setResult(undefined));
  }, UPLOAD_STORE);
}
