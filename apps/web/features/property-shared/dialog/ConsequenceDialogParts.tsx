import type { ReactNode } from "react";
import type {
  ConsequenceReasonPolicy,
  ConsequenceTarget
} from "./types";
import styles from "./ConsequenceDialog.module.css";

interface DialogActionsProps {
  actionLabel: string;
  busy: boolean;
  cancelLabel: string;
  confirmDisabled: boolean;
  onCancel: () => void;
}

export function DialogActions({
  actionLabel,
  busy,
  cancelLabel,
  confirmDisabled,
  onCancel
}: DialogActionsProps) {
  return (
    <footer>
      <button
        autoFocus
        className={`${styles.touchTarget} ds-button`}
        disabled={busy}
        onClick={(event) => {
          event.preventDefault();
          onCancel();
        }}
        type="button"
      >
        {cancelLabel}
      </button>
      <button
        className={`${styles.touchTarget} ds-button ds-button-primary`}
        disabled={busy || confirmDisabled}
        type="submit"
      >
        {busy ? "正在提交…" : actionLabel}
      </button>
    </footer>
  );
}

interface DialogContentProps {
  consequences: readonly string[];
  descriptionId: string;
  resultingState: string;
  target: ConsequenceTarget;
  title: string;
  titleId: string;
  children?: ReactNode;
}

export function DialogContent({
  consequences,
  descriptionId,
  resultingState,
  target,
  title,
  titleId,
  children
}: DialogContentProps) {
  return (
    <>
      <header className="ds-panel-heading">
        <h2 id={titleId} tabIndex={-1}>{title}</h2>
      </header>
      <div id={descriptionId}>
        <p>
          操作对象：<strong>{target.label}</strong>
          <span>（标识：{target.id}）</span>
        </p>
        <p>执行后状态：{resultingState}</p>
        <ul>
          {consequences.map((consequence, index) => (
            <li key={`${index}:${consequence}`}>{consequence}</li>
          ))}
        </ul>
        {children}
      </div>
    </>
  );
}

interface ReasonFieldProps {
  busy: boolean;
  onChange: (reason: string) => void;
  policy: ConsequenceReasonPolicy;
  reason: string;
  reasonId: string;
}

export function ReasonField({
  busy,
  onChange,
  policy,
  reason,
  reasonId
}: ReasonFieldProps) {
  if (policy.kind === "none") {
    return null;
  }
  return (
    <div>
      <label htmlFor={reasonId}>
        {policy.label ?? "操作原因"}
        {policy.kind === "required" ? "（必填）" : "（选填）"}
      </label>
      <textarea
        aria-required={policy.kind === "required"}
        disabled={busy}
        id={reasonId}
        maxLength={policy.maxLength}
        minLength={policy.kind === "required" ? policy.minLength ?? 1 : undefined}
        onChange={(event) => onChange(event.target.value)}
        required={policy.kind === "required"}
        value={reason}
      />
    </div>
  );
}
