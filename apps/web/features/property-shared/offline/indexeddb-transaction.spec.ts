import assert from "node:assert/strict";
import test from "node:test";
import { completeIndexedDbTransaction, sweepIndexedDbKeys } from "./indexeddb-transaction";

test("indexeddb operation reports success only after transaction oncomplete", async () => {
  let transactionComplete: (() => void) | null = null;
  const transaction = {
    error: null,
    objectStore: () => ({ name: "drafts" }),
    set oncomplete(callback: (() => void) | null) { transactionComplete = callback; },
    set onerror(_callback: (() => void) | null) {},
    set onabort(_callback: (() => void) | null) {}
  };
  const database = { transaction: () => transaction };
  let settled = false;
  const pending = completeIndexedDbTransaction(
    database as unknown as IDBDatabase,
    "drafts",
    "readwrite",
    (_store, setResult) => setResult("written")
  ).then((value) => { settled = true; return value; });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.ok(transactionComplete);
  (transactionComplete as unknown as () => void)();
  assert.equal(await pending, "written");
});

test("expired-key sweep physically deletes every indexed record before finishing", () => {
  const deleted: IDBValidKey[] = [];
  const cursors = ["expired-1", "expired-2"];
  let requestSuccess: (() => void) | null = null;
  const request = {
    get result() {
      const key = cursors[0];
      return key === undefined ? null : {
        primaryKey: key,
        continue: () => { cursors.shift(); requestSuccess?.(); }
      };
    },
    set onsuccess(callback: (() => void) | null) { requestSuccess = callback; }
  };
  const store = {
    index: () => ({ openKeyCursor: () => request }),
    delete: (key: IDBValidKey) => {
      deleted.push(key);
      return { set onsuccess(callback: (() => void) | null) { callback?.(); } };
    }
  };
  let done = false;
  sweepIndexedDbKeys(store as unknown as IDBObjectStore, "expiresAt", {} as IDBKeyRange, () => { done = true; });
  (requestSuccess as unknown as () => void)();
  assert.deepEqual(deleted, ["expired-1", "expired-2"]);
  assert.equal(done, true);
});
