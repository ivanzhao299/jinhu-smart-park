import type {
  RemoteEntityOption,
  RemotePickerAction,
  RemotePickerState
} from "./types";
import { isForbiddenError } from "../../../lib/api-client";

export const REMOTE_PICKER_MIN_QUERY_LENGTH = 2;
export const REMOTE_PICKER_DEBOUNCE_MS = 300;
export const REMOTE_PICKER_DEFAULT_PAGE_SIZE = 20;

export function createRemotePickerState(
  value: RemoteEntityOption | null,
  pageSize = REMOTE_PICKER_DEFAULT_PAGE_SIZE
): RemotePickerState {
  return {
    query: value?.label ?? "",
    requestPage: 1,
    requestPageSize: pageSize,
    page: 1,
    pageSize,
    total: 0,
    options: [],
    activeIndex: -1,
    open: false,
    status: "idle",
    requestId: 0
  };
}

function findEnabledIndex(
  options: readonly RemoteEntityOption[],
  current: number,
  direction: 1 | -1 | "first" | "last"
): number {
  if (!options.length) return -1;
  const first = direction === "last" ? options.length - 1 : 0;
  const step = direction === -1 || direction === "last" ? -1 : 1;
  let index = direction === "first" || direction === "last"
    ? first
    : current < 0
      ? first
      : current + step;
  while (index >= 0 && index < options.length) {
    const option = options[index];
    if (option && !option.disabledReason) return index;
    index += step;
  }
  return current;
}

type LifecycleAction = Extract<
  RemotePickerAction,
  {
    type:
      | "external-value"
      | "input"
      | "open"
      | "close"
      | "too-short"
      | "debouncing"
      | "invalid-context"
      | "no-permission";
  }
>;
type RequestAction = Extract<
  RemotePickerAction,
  { type: "request" | "success" | "failure" }
>;
type InteractionAction = Exclude<
  RemotePickerAction,
  LifecycleAction | RequestAction
>;

function isLifecycleAction(action: RemotePickerAction): action is LifecycleAction {
  return [
    "external-value",
    "input",
    "open",
    "close",
    "too-short",
    "debouncing",
    "invalid-context",
    "no-permission"
  ].includes(action.type);
}

function isRequestAction(action: RemotePickerAction): action is RequestAction {
  return ["request", "success", "failure"].includes(action.type);
}

function clearedOptions(
  state: RemotePickerState,
  status: "too-short" | "invalid-context" | "no-permission"
): RemotePickerState {
  return { ...state, status, options: [], total: 0, activeIndex: -1 };
}

function reduceLifecycle(
  state: RemotePickerState,
  action: LifecycleAction
): RemotePickerState {
  switch (action.type) {
    case "external-value":
      return { ...state, query: action.value?.label ?? "" };
    case "input":
      return {
        ...state,
        query: action.query,
        requestPage: 1,
        requestPageSize: state.pageSize,
        page: 1,
        total: 0,
        options: [],
        activeIndex: -1,
        open: true,
        status: action.query.trim().length < REMOTE_PICKER_MIN_QUERY_LENGTH
          ? "too-short"
          : "debouncing",
        errorMessage: undefined
      };
    case "open":
      return { ...state, open: true };
    case "close":
      return { ...state, open: false, activeIndex: -1 };
    case "too-short":
      return clearedOptions(state, "too-short");
    case "debouncing":
      return { ...state, status: "debouncing", errorMessage: undefined };
    case "invalid-context":
      return clearedOptions(state, "invalid-context");
    case "no-permission":
      return clearedOptions(state, "no-permission");
  }
}

function reduceRequest(
  state: RemotePickerState,
  action: RequestAction
): RemotePickerState {
  switch (action.type) {
    case "request":
      return {
        ...state,
        requestId: action.requestId,
        status: "loading",
        errorMessage: undefined
      };
    case "success":
      if (action.requestId !== state.requestId) return state;
      return {
        ...state,
        page: Math.max(1, action.result.page),
        pageSize: Math.max(1, action.result.pageSize),
        total: action.result.total,
        options: action.result.items,
        activeIndex: findEnabledIndex(action.result.items, -1, "first"),
        status: action.result.items.length ? "ready" : "empty"
      };
    case "failure":
      if (action.requestId !== state.requestId) return state;
      return {
        ...state,
        options: [],
        total: 0,
        activeIndex: -1,
        status: action.forbidden ? "no-permission" : "failure",
        errorMessage: action.forbidden ? undefined : action.message
      };
  }
}

function reduceInteraction(
  state: RemotePickerState,
  action: InteractionAction
): RemotePickerState {
  switch (action.type) {
    case "page":
      return {
        ...state,
        requestPage: action.page,
        requestPageSize: state.pageSize,
        page: action.page,
        activeIndex: -1,
        status: "debouncing"
      };
    case "move":
      return {
        ...state,
        open: true,
        activeIndex: findEnabledIndex(
          state.options,
          state.activeIndex,
          action.direction
        )
      };
    case "select":
      if (action.option.disabledReason) return state;
      return {
        ...state,
        query: action.option.label,
        open: false,
        activeIndex: -1
      };
    case "reset":
      return createRemotePickerState(action.value, state.pageSize);
  }
}

export function remotePickerReducer(
  state: RemotePickerState,
  action: RemotePickerAction
): RemotePickerState {
  if (isLifecycleAction(action)) return reduceLifecycle(state, action);
  if (isRequestAction(action)) return reduceRequest(state, action);
  return reduceInteraction(state, action);
}

export function isForbiddenPickerError(error: unknown): boolean {
  return isForbiddenError(error);
}

export function pickerErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "加载失败，请重试";
}

export function shouldLoadRemoteOptions(input: {
  open: boolean;
  disabled: boolean;
  authorized: boolean;
  contextValid: boolean;
  query: string;
}): boolean {
  return input.open
    && !input.disabled
    && input.authorized
    && input.contextValid
    && input.query.trim().length >= REMOTE_PICKER_MIN_QUERY_LENGTH;
}
