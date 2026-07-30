import { Button } from "@jinhu/ui";
import type { MouseEvent } from "react";
import styles from "./RemoteEntityPicker.module.css";
import type { RemotePickerController } from "./picker-controller";
import { REMOTE_PICKER_MIN_QUERY_LENGTH } from "./picker-state";
import type {
  RemoteEntityOption,
  RemoteEntityPickerProps,
  RemotePickerStatus
} from "./types";

type ViewProps = RemoteEntityPickerProps & {
  controller: RemotePickerController;
};

function statusMessage(
  status: RemotePickerStatus,
  total: number,
  errorMessage?: string,
  noPermissionText = "无权读取候选项",
  invalidContextText = "请先选择有效的租户和园区"
): string {
  const messages: Record<RemotePickerStatus, string> = {
    idle: "",
    "too-short": `请输入至少 ${REMOTE_PICKER_MIN_QUERY_LENGTH} 个字符`,
    debouncing: "等待输入完成",
    loading: "正在加载候选项",
    ready: `已找到 ${total} 个候选项`,
    empty: "没有匹配结果",
    "no-permission": noPermissionText,
    "invalid-context": invalidContextText,
    failure: errorMessage ?? "加载失败，请重试"
  };
  return messages[status];
}

function PickerInput({
  label,
  value,
  required,
  placeholder = "输入关键词搜索",
  controller
}: Pick<ViewProps, "label" | "value" | "required" | "placeholder" | "controller">) {
  const { state } = controller;
  return (
    <div className={styles.inputRow}>
      <input
        id={controller.inputId}
        type="text"
        className={styles.input}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={state.open}
        aria-controls={controller.listboxId}
        aria-activedescendant={state.open ? controller.activeOptionId : undefined}
        aria-describedby={controller.describedBy}
        aria-invalid={state.status === "failure" || undefined}
        autoComplete="off"
        value={state.query}
        placeholder={placeholder}
        required={required}
        disabled={!controller.canInteract}
        onFocus={controller.handleInputFocus}
        onChange={controller.handleInputChange}
        onKeyDown={controller.handleKeyDown}
      />
      {value && controller.canInteract ? (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          aria-label={`清除${label}`}
          className={styles.clearButton}
          onClick={controller.clearSelection}
        >
          清除
        </Button>
      ) : null}
    </div>
  );
}

function PickerPagination({ controller }: { controller: RemotePickerController }) {
  const { state, totalPages } = controller;
  if (!state.open || state.status !== "ready" || totalPages <= 1) return null;
  const keepFocus = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();
  return (
    <nav className={styles.pagination} aria-label="候选项分页">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={state.page <= 1}
        onMouseDown={keepFocus}
        onClick={() => controller.setPage(state.page - 1)}
      >
        上一页
      </Button>
      <span aria-label={`第 ${state.page} 页，共 ${totalPages} 页`}>
        {state.page}/{totalPages}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={state.page >= totalPages}
        onMouseDown={keepFocus}
        onClick={() => controller.setPage(state.page + 1)}
      >
        下一页
      </Button>
    </nav>
  );
}

function PickerOption({
  option,
  index,
  selected,
  controller
}: {
  option: RemoteEntityOption;
  index: number;
  selected: boolean;
  controller: RemotePickerController;
}) {
  return (
    <Button
      id={`${controller.listboxId}-option-${index}`}
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={Boolean(option.disabledReason)}
      disabled={Boolean(option.disabledReason)}
      variant="secondary"
      size="lg"
      className={styles.option}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => controller.chooseOption(option)}
    >
      <span>{option.label}</span>
      {option.secondaryLabel ? <span>{option.secondaryLabel}</span> : null}
      {option.disabledReason ? <span>{option.disabledReason}</span> : null}
    </Button>
  );
}

function PickerResults({
  label,
  value,
  controller
}: Pick<ViewProps, "label" | "value" | "controller">) {
  if (!controller.state.open) return null;
  return (
    <div
      id={controller.listboxId}
      role="listbox"
      aria-label={`${label}候选项`}
      className={styles.listbox}
    >
      {controller.state.options.map((option, index) => (
        <PickerOption
          key={option.id}
          option={option}
          index={index}
          selected={value?.id === option.id}
          controller={controller}
        />
      ))}
    </div>
  );
}

function PickerStatus({
  noPermissionText,
  invalidContextText,
  controller
}: Pick<ViewProps, "noPermissionText" | "invalidContextText" | "controller">) {
  const { state } = controller;
  return (
    <div
      id={controller.statusId}
      role={state.status === "failure" ? "alert" : "status"}
      aria-live={state.status === "failure" ? "assertive" : "polite"}
    >
      {statusMessage(
        state.status,
        state.total,
        state.errorMessage,
        noPermissionText,
        invalidContextText
      )}
    </div>
  );
}

export function RemoteEntityPickerView(props: ViewProps) {
  const { controller, label, helperText } = props;
  return (
    <div
      ref={controller.rootRef}
      className={styles.root}
      onBlur={controller.handleBlur}
    >
      <label htmlFor={controller.inputId}>{label}</label>
      {helperText ? (
        <div id={controller.helperId} className="ds-field-help">{helperText}</div>
      ) : null}
      <PickerInput {...props} />
      <PickerResults {...props} />
      <PickerPagination controller={controller} />
      <PickerStatus {...props} />
    </div>
  );
}
