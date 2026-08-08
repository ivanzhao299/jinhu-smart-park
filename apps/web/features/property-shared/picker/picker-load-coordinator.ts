import {
  REMOTE_PICKER_DEBOUNCE_MS,
  isForbiddenPickerError,
  pickerErrorMessage,
  shouldLoadRemoteOptions
} from "./picker-state";
import type {
  RemoteEntityLoader,
  RemoteEntityPage,
  RemotePickerState
} from "./types";

export interface PickerTimer {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface PickerAuthorizationContext {
  invalidationKey: string;
  authorized: boolean;
  contextValid: boolean;
  hasSelection: boolean;
}

export interface PickerAuthorizationChange {
  epochChanged: boolean;
  keyChanged: boolean;
  clearSelection: boolean;
}

export interface PickerLoadCallbacks {
  onRequest(requestId: number): void;
  onSuccess(requestId: number, result: RemoteEntityPage): void;
  onFailure(
    requestId: number,
    failure: { message: string; forbidden: boolean }
  ): void;
}

export interface PickerLoadRequest extends PickerAuthorizationContext {
  disabled: boolean;
  state: Pick<
    RemotePickerState,
    "open" | "query" | "requestPage" | "requestPageSize"
  >;
  loadOptions: RemoteEntityLoader;
}

export type PickerScheduleResult =
  | "scheduled"
  | "not-allowed"
  | "too-short"
  | "forbidden-latched";

interface ActiveLoad {
  timer?: unknown;
  controller: AbortController;
  requestId: number;
}

const defaultTimer: PickerTimer = {
  set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clear: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

function authorizationEpoch(context: PickerAuthorizationContext): string {
  return [
    context.invalidationKey,
    context.authorized ? "authorized" : "denied",
    context.contextValid ? "valid" : "invalid"
  ].join(":");
}

export class RemotePickerLoadCoordinator {
  private readonly timer: PickerTimer;
  private readonly createAbortController: () => AbortController;
  private readonly debounceMs: number;
  private active?: ActiveLoad;
  private epoch?: string;
  private invalidationKey?: string;
  private forbiddenEpoch?: string;
  private sequence = 0;

  constructor(
    timer: PickerTimer = defaultTimer,
    createAbortController = () => new AbortController(),
    debounceMs = REMOTE_PICKER_DEBOUNCE_MS
  ) {
    this.timer = timer;
    this.createAbortController = createAbortController;
    this.debounceMs = debounceMs;
  }

  syncAuthorization(context: PickerAuthorizationContext): PickerAuthorizationChange {
    const nextEpoch = authorizationEpoch(context);
    const epochChanged = this.epoch !== nextEpoch;
    const keyChanged = this.invalidationKey !== undefined
      && this.invalidationKey !== context.invalidationKey;
    if (epochChanged) {
      this.cancel();
      this.forbiddenEpoch = undefined;
      this.epoch = nextEpoch;
      this.invalidationKey = context.invalidationKey;
    }
    return {
      epochChanged,
      keyChanged,
      clearSelection: context.hasSelection
        && (keyChanged || !context.authorized || !context.contextValid)
    };
  }

  schedule(
    request: PickerLoadRequest,
    callbacks: PickerLoadCallbacks
  ): PickerScheduleResult {
    this.syncAuthorization(request);
    this.cancel();
    if (!shouldLoadRemoteOptions({ ...request.state, ...request })) {
      return request.state.query.trim().length < 2
        ? "too-short"
        : "not-allowed";
    }
    if (this.forbiddenEpoch === this.epoch) return "forbidden-latched";

    const active: ActiveLoad = {
      controller: this.createAbortController(),
      requestId: 0
    };
    active.timer = this.timer.set(
      () => this.startLoad(active, request, callbacks),
      this.debounceMs
    );
    this.active = active;
    return "scheduled";
  }

  cancel() {
    if (!this.active) return;
    if (this.active.timer !== undefined) this.timer.clear(this.active.timer);
    this.active.controller.abort();
    this.active = undefined;
  }

  private startLoad(
    active: ActiveLoad,
    request: PickerLoadRequest,
    callbacks: PickerLoadCallbacks
  ) {
    if (this.active !== active || active.controller.signal.aborted) return;
    active.timer = undefined;
    this.sequence += 1;
    active.requestId = this.sequence;
    callbacks.onRequest(active.requestId);
    void request.loadOptions({
      query: request.state.query.trim(),
      page: request.state.requestPage,
      pageSize: request.state.requestPageSize,
      signal: active.controller.signal,
      invalidationKey: request.invalidationKey
    }).then((result) => this.finishSuccess(active, result, callbacks))
      .catch((error: unknown) => this.finishFailure(active, error, callbacks));
  }

  private finishSuccess(
    active: ActiveLoad,
    result: RemoteEntityPage,
    callbacks: PickerLoadCallbacks
  ) {
    if (this.active !== active || active.controller.signal.aborted) return;
    this.active = undefined;
    callbacks.onSuccess(active.requestId, result);
  }

  private finishFailure(
    active: ActiveLoad,
    error: unknown,
    callbacks: PickerLoadCallbacks
  ) {
    if (this.active !== active || active.controller.signal.aborted) return;
    this.active = undefined;
    const forbidden = isForbiddenPickerError(error);
    if (forbidden) this.forbiddenEpoch = this.epoch;
    callbacks.onFailure(active.requestId, {
      message: pickerErrorMessage(error),
      forbidden
    });
  }
}
