import assert from "node:assert/strict";
import test from "node:test";
import {
  REMOTE_PICKER_DEBOUNCE_MS,
  createRemotePickerState,
  isForbiddenPickerError,
  remotePickerReducer,
  shouldLoadRemoteOptions
} from "./picker-state";

test("load decision enforces authorization, valid context, two characters and open state", () => {
  const base = {
    open: true,
    disabled: false,
    authorized: true,
    contextValid: true,
    query: "住房"
  };
  assert.equal(REMOTE_PICKER_DEBOUNCE_MS, 300);
  assert.equal(shouldLoadRemoteOptions(base), true);
  assert.equal(shouldLoadRemoteOptions({ ...base, authorized: false }), false);
  assert.equal(shouldLoadRemoteOptions({ ...base, contextValid: false }), false);
  assert.equal(shouldLoadRemoteOptions({ ...base, disabled: true }), false);
  assert.equal(shouldLoadRemoteOptions({ ...base, open: false }), false);
  assert.equal(shouldLoadRemoteOptions({ ...base, query: "A" }), false);
});

test("reducer ignores stale requests and pages server results", () => {
  let state = createRemotePickerState(null, 10);
  state = remotePickerReducer(state, { type: "input", query: "人才" });
  state = remotePickerReducer(state, { type: "request", requestId: 2 });
  const stale = remotePickerReducer(state, {
    type: "success",
    requestId: 1,
    result: { items: [{ id: "old", label: "旧值" }], page: 1, pageSize: 10, total: 1 }
  });
  assert.equal(stale, state);

  state = remotePickerReducer(state, {
    type: "success",
    requestId: 2,
    result: {
      items: [
        { id: "disabled", label: "停用", disabledReason: "已停用" },
        { id: "enabled", label: "可选" }
      ],
      page: 1,
      pageSize: 10,
      total: 12
    }
  });
  assert.equal(state.status, "ready");
  assert.equal(state.activeIndex, 1);
  state = remotePickerReducer(state, { type: "page", page: 2 });
  assert.equal(state.page, 2);
  assert.equal(state.status, "debouncing");
});

test("reducer selection and invalidation reset clear the old selection snapshot", () => {
  const option = { id: "unit-1", label: "A-101" };
  let state = createRemotePickerState(null);
  state = remotePickerReducer(state, { type: "select", option });
  assert.equal(state.query, "A-101");
  assert.equal(state.open, false);
  state = remotePickerReducer(state, { type: "reset", value: null });
  assert.equal(state.query, "");
  assert.deepEqual(state.options, []);
  assert.equal(state.status, "idle");
});

test("forbidden errors are separate from generic failures", () => {
  assert.equal(isForbiddenPickerError({ status: 403 }), true);
  assert.equal(isForbiddenPickerError({ statusCode: 403 }), true);
  assert.equal(isForbiddenPickerError({ status: 500 }), false);
  assert.equal(isForbiddenPickerError(new Error("failed")), false);
});
