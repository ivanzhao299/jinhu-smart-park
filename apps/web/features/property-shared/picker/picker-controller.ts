import {
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useReducer,
  useRef
} from "react";
import {
  createRemotePickerState,
  remotePickerReducer
} from "./picker-state";
import { RemotePickerLoadCoordinator } from "./picker-load-coordinator";
import type {
  RemoteEntityOption,
  RemoteEntityPickerProps,
  RemotePickerAction,
  RemotePickerState
} from "./types";

type PickerDispatch = Dispatch<RemotePickerAction>;

export interface RemotePickerController {
  inputId: string;
  listboxId: string;
  statusId: string;
  helperId?: string;
  rootRef: RefObject<HTMLDivElement | null>;
  state: RemotePickerState;
  activeOptionId?: string;
  totalPages: number;
  describedBy: string;
  canInteract: boolean;
  chooseOption(option: RemoteEntityOption): void;
  clearSelection(): void;
  setPage(page: number): void;
  handleInputFocus(): void;
  handleInputChange(event: ChangeEvent<HTMLInputElement>): void;
  handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
  handleBlur(event: FocusEvent<HTMLDivElement>): void;
}

function useExternalValue(
  value: RemoteEntityOption | null,
  dispatch: PickerDispatch
) {
  useEffect(() => {
    dispatch({ type: "external-value", value });
  }, [dispatch, value]);
}

function usePickerInvalidation(
  props: Pick<
    RemoteEntityPickerProps,
    "authorized" | "contextValid" | "invalidationKey" | "onChange" | "value"
  >,
  dispatch: PickerDispatch,
  coordinator: RemotePickerLoadCoordinator
) {
  useEffect(() => {
    const change = coordinator.syncAuthorization({
      invalidationKey: props.invalidationKey,
      authorized: props.authorized,
      contextValid: props.contextValid,
      hasSelection: Boolean(props.value)
    });
    if (change.keyChanged) dispatch({ type: "reset", value: null });
    if (!props.authorized || !props.contextValid) {
      dispatch({ type: props.authorized ? "invalid-context" : "no-permission" });
    }
    if (change.clearSelection) props.onChange(null);
  }, [
    coordinator,
    dispatch,
    props.authorized,
    props.contextValid,
    props.invalidationKey,
    props.onChange,
    props.value
  ]);
}

function useRemoteOptions(
  props: Pick<
    RemoteEntityPickerProps,
    | "authorized"
    | "contextValid"
    | "disabled"
    | "invalidationKey"
    | "loadOptions"
  >,
  state: RemotePickerState,
  dispatch: PickerDispatch,
  coordinator: RemotePickerLoadCoordinator
) {
  useEffect(() => {
    const result = coordinator.schedule({
      invalidationKey: props.invalidationKey,
      authorized: props.authorized,
      contextValid: props.contextValid,
      hasSelection: false,
      disabled: props.disabled ?? false,
      state,
      loadOptions: props.loadOptions
    }, {
      onRequest: (requestId) => dispatch({ type: "request", requestId }),
      onSuccess: (requestId, loaded) =>
        dispatch({ type: "success", requestId, result: loaded }),
      onFailure: (requestId, failure) =>
        dispatch({ type: "failure", requestId, ...failure })
    });
    if (result === "scheduled") dispatch({ type: "debouncing" });
    if (result === "too-short") dispatch({ type: "too-short" });
    if (result === "forbidden-latched") dispatch({ type: "no-permission" });
    return () => coordinator.cancel();
  }, [
    coordinator,
    dispatch,
    props.authorized,
    props.contextValid,
    props.disabled,
    props.invalidationKey,
    props.loadOptions,
    state.open,
    state.requestPage,
    state.requestPageSize,
    state.query
  ]);
}

function handlePickerKey(
  event: KeyboardEvent<HTMLInputElement>,
  state: RemotePickerState,
  dispatch: PickerDispatch,
  chooseOption: (option: RemoteEntityOption) => void
) {
  const movements = {
    ArrowDown: 1,
    ArrowUp: -1,
    Home: "first",
    End: "last"
  } as const;
  const movement = movements[event.key as keyof typeof movements];
  if (movement && (state.open || event.key.startsWith("Arrow"))) {
    event.preventDefault();
    dispatch({ type: "move", direction: movement });
    return;
  }
  if (event.key === "Enter" && state.open) {
    const option = state.options[state.activeIndex];
    if (option) {
      event.preventDefault();
      chooseOption(option);
    }
  } else if (event.key === "Escape" && state.open) {
    event.preventDefault();
    dispatch({ type: "close" });
  }
}

export function useRemotePickerController(
  props: RemoteEntityPickerProps
): RemotePickerController {
  const generatedId = useId();
  const inputId = props.id ?? `remote-entity-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const helperId = props.helperText ? `${inputId}-helper` : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef<RemotePickerLoadCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new RemotePickerLoadCoordinator();
  }
  const coordinator = coordinatorRef.current;
  const [state, dispatch] = useReducer(
    remotePickerReducer,
    createRemotePickerState(props.value, props.pageSize)
  );
  useExternalValue(props.value, dispatch);
  usePickerInvalidation(props, dispatch, coordinator);
  useRemoteOptions(props, state, dispatch, coordinator);

  const chooseOption = (option: RemoteEntityOption) => {
    if (option.disabledReason) return;
    dispatch({ type: "select", option });
    props.onChange(option);
  };
  const clearSelection = () => {
    dispatch({ type: "reset", value: null });
    props.onChange(null);
  };
  return {
    inputId,
    listboxId,
    statusId,
    helperId,
    rootRef,
    state,
    activeOptionId: state.activeIndex >= 0
      ? `${listboxId}-option-${state.activeIndex}`
      : undefined,
    totalPages: Math.max(1, Math.ceil(state.total / state.pageSize)),
    describedBy: [helperId, statusId].filter(Boolean).join(" "),
    canInteract: props.authorized && props.contextValid && !props.disabled,
    chooseOption,
    clearSelection,
    setPage: (page) => dispatch({ type: "page", page }),
    handleInputFocus: () => dispatch({ type: "open" }),
    handleInputChange: (event) => {
      dispatch({ type: "input", query: event.target.value });
      if (props.value) props.onChange(null);
    },
    handleKeyDown: (event) =>
      handlePickerKey(event, state, dispatch, chooseOption),
    handleBlur: (event) => {
      if (!rootRef.current?.contains(event.relatedTarget)) {
        dispatch({ type: "close" });
      }
    }
  };
}
