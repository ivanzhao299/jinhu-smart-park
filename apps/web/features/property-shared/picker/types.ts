export interface RemoteEntityOption {
  id: string;
  label: string;
  secondaryLabel?: string;
  disabledReason?: string;
}

export interface RemoteEntityPage {
  items: readonly RemoteEntityOption[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RemoteEntityLoadInput {
  query: string;
  page: number;
  pageSize: number;
  signal: AbortSignal;
  invalidationKey: string;
}

export type RemoteEntityLoader = (
  input: RemoteEntityLoadInput
) => Promise<RemoteEntityPage>;

export interface RemoteEntityPickerProps {
  id?: string;
  label: string;
  value: RemoteEntityOption | null;
  onChange(value: RemoteEntityOption | null): void;
  loadOptions: RemoteEntityLoader;
  authorized: boolean;
  contextValid: boolean;
  invalidationKey: string;
  pageSize?: number;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  helperText?: string;
  noPermissionText?: string;
  invalidContextText?: string;
}

export type RemotePickerStatus =
  | "idle"
  | "too-short"
  | "debouncing"
  | "loading"
  | "ready"
  | "empty"
  | "no-permission"
  | "invalid-context"
  | "failure";

export interface RemotePickerState {
  query: string;
  requestPage: number;
  requestPageSize: number;
  page: number;
  pageSize: number;
  total: number;
  options: readonly RemoteEntityOption[];
  activeIndex: number;
  open: boolean;
  status: RemotePickerStatus;
  requestId: number;
  errorMessage?: string;
}

export type RemotePickerAction =
  | { type: "external-value"; value: RemoteEntityOption | null }
  | { type: "input"; query: string }
  | { type: "open" }
  | { type: "close" }
  | { type: "too-short" }
  | { type: "debouncing" }
  | { type: "invalid-context" }
  | { type: "no-permission" }
  | { type: "request"; requestId: number }
  | { type: "success"; requestId: number; result: RemoteEntityPage }
  | { type: "failure"; requestId: number; message: string; forbidden: boolean }
  | { type: "page"; page: number }
  | { type: "move"; direction: 1 | -1 | "first" | "last" }
  | { type: "select"; option: RemoteEntityOption }
  | { type: "reset"; value: RemoteEntityOption | null };
