export async function completeIndexedDbTransaction<T>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, setResult: (value: T) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let result: T;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error("offline transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("offline transaction aborted"));
    operation(transaction.objectStore(storeName), (value) => { result = value; });
  });
}

export function sweepIndexedDbKeys(
  store: IDBObjectStore,
  indexName: string,
  keyRange: IDBKeyRange,
  done: () => void
): void {
  const request = store.index(indexName).openKeyCursor(keyRange);
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      done();
      return;
    }
    store.delete(cursor.primaryKey).onsuccess = () => cursor.continue();
  };
}
