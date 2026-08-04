import {
  createPropertyDraftEnvelope,
  isPropertyDraftUsable,
  propertyDraftKey,
  type PropertyDraftContext,
  type PropertyDraftEnvelope,
  type PropertyOfflineScope,
  propertyOfflineScopeKey
} from "./property-draft-contract";
import {
  isPropertyUploadQueueItemUsable,
  propertyUploadContextKey,
  type PropertyUploadContext,
  type PropertyUploadQueueItem
} from "./property-upload-queue";

const DATABASE = "jinhu-property-offline-v1";
const STORE = "drafts";
const UPLOAD_STORE = "uploads";
const SCOPE_KEY = "jinhu-property-offline-scope-v1";

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
  operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
  storeName = STORE
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => operation(database.transaction(storeName, mode).objectStore(storeName), resolve, reject));
  } finally {
    database.close();
  }
}

export async function savePropertyDraft<T extends Record<string, unknown>>(
  context: PropertyDraftContext,
  value: T,
  entityVersion: number | null = null
): Promise<PropertyDraftEnvelope<T>> {
  const envelope = createPropertyDraftEnvelope(context, value, { entityVersion });
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(envelope);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  return envelope;
}

export async function loadPropertyDraft<T extends Record<string, unknown>>(
  context: PropertyDraftContext
): Promise<PropertyDraftEnvelope<T> | null> {
  const envelope = await transaction<PropertyDraftEnvelope<T> | null>("readonly", (store, resolve, reject) => {
    const request = store.get(propertyDraftKey(context));
    request.onsuccess = () => resolve((request.result as PropertyDraftEnvelope<T> | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  if (!envelope) return null;
  if (isPropertyDraftUsable(envelope, context)) return envelope;
  await deletePropertyDraft(context);
  return null;
}

export async function deletePropertyDraft(context: PropertyDraftContext): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(propertyDraftKey(context));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function purgePropertyDrafts(): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function ensurePropertyOfflineScope(scope: PropertyOfflineScope): Promise<void> {
  if (typeof window === "undefined") return;
  const nextScope = propertyOfflineScopeKey(scope);
  const previousScope = localStorage.getItem(SCOPE_KEY);
  if (previousScope && previousScope !== nextScope) {
    await Promise.all([purgePropertyDrafts(), clearPropertyUploadQueue()]);
  }
  await purgeExpiredPropertyUploadQueue();
  localStorage.setItem(SCOPE_KEY, nextScope);
}

export async function purgePropertyOfflineState(): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  try {
    await Promise.all([purgePropertyDrafts(), clearPropertyUploadQueue()]);
  } finally {
    localStorage.removeItem(SCOPE_KEY);
  }
}

export async function putPropertyUploadQueueItem(item: PropertyUploadQueueItem): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }, UPLOAD_STORE);
}

export async function listPropertyUploadQueue(context: PropertyUploadContext): Promise<PropertyUploadQueueItem[]> {
  const contextKey = propertyUploadContextKey(context);
  const items = await transaction<PropertyUploadQueueItem[]>("readonly", (store, resolve, reject) => {
    const request = store.index("contextKey").getAll(contextKey);
    request.onsuccess = () => resolve(request.result as PropertyUploadQueueItem[]);
    request.onerror = () => reject(request.error);
  }, UPLOAD_STORE);
  const now = Date.now();
  const usable = items.filter((item) => isPropertyUploadQueueItemUsable(item, context, now));
  await Promise.all(items.filter((item) => !usable.includes(item)).map((item) => deletePropertyUploadQueueItem(item.id)));
  return usable;
}

export async function deletePropertyUploadQueueItem(id: string): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }, UPLOAD_STORE);
}

export async function clearPropertyUploadQueue(): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }, UPLOAD_STORE);
}

export async function purgeExpiredPropertyUploadQueue(now = Date.now()): Promise<void> {
  await transaction<void>("readwrite", (store, resolve, reject) => {
    const request = store.index("expiresAt").openKeyCursor(IDBKeyRange.upperBound(now));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const deletion = store.delete(cursor.primaryKey);
      deletion.onerror = () => reject(deletion.error);
      deletion.onsuccess = () => cursor.continue();
    };
    request.onerror = () => reject(request.error);
  }, UPLOAD_STORE);
}
