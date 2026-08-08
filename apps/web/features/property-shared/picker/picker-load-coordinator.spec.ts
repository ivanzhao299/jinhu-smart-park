import assert from "node:assert/strict";
import test from "node:test";
import {
  RemotePickerLoadCoordinator,
  type PickerLoadCallbacks,
  type PickerTimer
} from "./picker-load-coordinator";
import {
  createRemotePickerState,
  remotePickerReducer
} from "./picker-state";
import type {
  RemoteEntityLoader,
  RemoteEntityPage
} from "./types";

class FakeTimer implements PickerTimer {
  private nextId = 0;
  private tasks = new Map<number, () => void>();
  readonly delays: number[] = [];

  set(callback: () => void, delayMs: number): number {
    this.nextId += 1;
    this.tasks.set(this.nextId, callback);
    this.delays.push(delayMs);
    return this.nextId;
  }

  clear(handle: unknown) {
    this.tasks.delete(handle as number);
  }

  runAll() {
    const pending = [...this.tasks.values()];
    this.tasks.clear();
    pending.forEach((task) => task());
  }
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function page(label: string, overrides: Partial<RemoteEntityPage> = {}): RemoteEntityPage {
  return {
    items: [{ id: label, label }],
    page: 1,
    pageSize: 20,
    total: 1,
    ...overrides
  };
}

const baseState = {
  open: true,
  query: "人才",
  requestPage: 1,
  requestPageSize: 20
};

const noopCallbacks: PickerLoadCallbacks = {
  onRequest: () => undefined,
  onSuccess: () => undefined,
  onFailure: () => undefined
};

test("coordinator proves 300ms debounce and unauthorized or invalid contexts call loader zero times", () => {
  const timer = new FakeTimer();
  let calls = 0;
  const loader: RemoteEntityLoader = async () => {
    calls += 1;
    return page("unit-1");
  };
  const coordinator = new RemotePickerLoadCoordinator(timer);
  const request = {
    invalidationKey: "scope-1",
    authorized: true,
    contextValid: true,
    hasSelection: false,
    disabled: false,
    state: baseState,
    loadOptions: loader
  };

  assert.equal(
    coordinator.schedule({ ...request, authorized: false }, noopCallbacks),
    "not-allowed"
  );
  assert.equal(
    coordinator.schedule({ ...request, contextValid: false }, noopCallbacks),
    "not-allowed"
  );
  assert.equal(calls, 0);
  assert.equal(coordinator.schedule(request, noopCallbacks), "scheduled");
  assert.equal(calls, 0);
  assert.deepEqual(timer.delays, [300]);
  timer.runAll();
  assert.equal(calls, 1);
});

test("new searches abort the old request and discard a loader that ignores abort", async () => {
  const timer = new FakeTimer();
  const controllers: AbortController[] = [];
  const oldResult = deferred<RemoteEntityPage>();
  const newResult = deferred<RemoteEntityPage>();
  const loader: RemoteEntityLoader = ({ query }) =>
    query === "旧值" ? oldResult.promise : newResult.promise;
  const successes: string[] = [];
  const callbacks: PickerLoadCallbacks = {
    ...noopCallbacks,
    onSuccess: (_requestId, result) => successes.push(result.items[0]?.id ?? "")
  };
  const coordinator = new RemotePickerLoadCoordinator(timer, () => {
    const controller = new AbortController();
    controllers.push(controller);
    return controller;
  });
  const request = {
    invalidationKey: "scope-1",
    authorized: true,
    contextValid: true,
    hasSelection: false,
    disabled: false,
    state: { ...baseState, query: "旧值" },
    loadOptions: loader
  };

  coordinator.schedule(request, callbacks);
  timer.runAll();
  coordinator.schedule(
    { ...request, state: { ...baseState, query: "新值" } },
    callbacks
  );
  assert.equal(controllers[0]?.signal.aborted, true);
  timer.runAll();
  oldResult.resolve(page("old"));
  newResult.resolve(page("new"));
  await flushPromises();
  assert.deepEqual(successes, ["new"]);
});

test("403 latches the current authorization epoch until scope or authorization changes", async () => {
  const timer = new FakeTimer();
  let calls = 0;
  const loader: RemoteEntityLoader = async () => {
    calls += 1;
    if (calls === 1) throw { status: 403 };
    return page("allowed");
  };
  const failures: boolean[] = [];
  const callbacks: PickerLoadCallbacks = {
    ...noopCallbacks,
    onFailure: (_requestId, failure) => failures.push(failure.forbidden)
  };
  const coordinator = new RemotePickerLoadCoordinator(timer);
  const request = {
    invalidationKey: "scope-1",
    authorized: true,
    contextValid: true,
    hasSelection: false,
    disabled: false,
    state: baseState,
    loadOptions: loader
  };

  coordinator.schedule(request, callbacks);
  timer.runAll();
  await flushPromises();
  assert.deepEqual(failures, [true]);
  assert.equal(
    coordinator.schedule(
      { ...request, state: { ...baseState, query: "后续输入" } },
      callbacks
    ),
    "forbidden-latched"
  );
  timer.runAll();
  assert.equal(calls, 1);

  const changed = coordinator.syncAuthorization({
    ...request,
    invalidationKey: "scope-2",
    hasSelection: true
  });
  assert.equal(changed.keyChanged, true);
  assert.equal(changed.clearSelection, true);
  assert.equal(
    coordinator.schedule({ ...request, invalidationKey: "scope-2" }, callbacks),
    "scheduled"
  );
  timer.runAll();
  assert.equal(calls, 2);
});

test("authorization synchronization clears selection on invalidation and revocation", () => {
  const coordinator = new RemotePickerLoadCoordinator(new FakeTimer());
  const initial = coordinator.syncAuthorization({
    invalidationKey: "scope-1",
    authorized: true,
    contextValid: true,
    hasSelection: true
  });
  assert.equal(initial.clearSelection, false);
  const invalidated = coordinator.syncAuthorization({
    invalidationKey: "scope-2",
    authorized: true,
    contextValid: true,
    hasSelection: true
  });
  assert.equal(invalidated.clearSelection, true);
  const revoked = coordinator.syncAuthorization({
    invalidationKey: "scope-2",
    authorized: false,
    contextValid: true,
    hasSelection: true
  });
  assert.equal(revoked.clearSelection, true);
});

test("normalized server pagination is absorbed once and keeps the next page reachable", async () => {
  const timer = new FakeTimer();
  let calls = 0;
  const requestedPages: Array<[number, number]> = [];
  const loader: RemoteEntityLoader = async ({ page: requestedPage, pageSize }) => {
    calls += 1;
    requestedPages.push([requestedPage, pageSize]);
    return calls === 1
      ? page("unit", { page: 2, pageSize: 10, total: 35 })
      : page("next", { page: 3, pageSize: 10, total: 35 });
  };
  let state = createRemotePickerState(null, 20);
  state = remotePickerReducer(state, { type: "input", query: "人才" });
  state = remotePickerReducer(state, { type: "page", page: 99 });
  const callbacks: PickerLoadCallbacks = {
    onRequest: (requestId) => {
      state = remotePickerReducer(state, { type: "request", requestId });
    },
    onSuccess: (requestId, result) => {
      state = remotePickerReducer(state, { type: "success", requestId, result });
    },
    onFailure: () => undefined
  };
  const coordinator = new RemotePickerLoadCoordinator(timer);

  coordinator.schedule({
    invalidationKey: "scope-1",
    authorized: true,
    contextValid: true,
    hasSelection: false,
    disabled: false,
    state,
    loadOptions: loader
  }, callbacks);
  timer.runAll();
  await flushPromises();
  assert.equal(calls, 1);
  assert.deepEqual(requestedPages, [[99, 20]]);
  assert.equal(state.page, 2);
  assert.equal(state.pageSize, 10);
  assert.equal(state.requestPage, 99);
  assert.equal(state.requestPageSize, 20);
  assert.equal(Math.ceil(state.total / state.pageSize), 4);

  state = remotePickerReducer(state, { type: "page", page: state.page + 1 });
  coordinator.schedule({
    invalidationKey: "scope-1",
    authorized: true,
    contextValid: true,
    hasSelection: false,
    disabled: false,
    state,
    loadOptions: loader
  }, callbacks);
  timer.runAll();
  await flushPromises();
  assert.equal(calls, 2);
  assert.deepEqual(requestedPages, [[99, 20], [3, 10]]);
  assert.equal(state.page, 3);
});
