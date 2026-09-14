"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useReducer,
  useRef,
} from "react";
import {
  DialogActions,
  DialogContent,
  ReasonField
} from "./ConsequenceDialogParts";
import {
  createSingleFlightGate,
  reduceDialogDraft,
  runDialogConfirmation,
  visibleDialogReason,
  type SingleFlightGate
} from "./dialog-state";
import type {
  ConsequenceReasonPolicy,
  ConsequenceTarget
} from "./types";
import styles from "./ConsequenceDialog.module.css";
import { useOwnedScrollLock } from "./useOwnedScrollLock";

export type {
  ConsequenceReasonPolicy,
  ConsequenceTarget
} from "./types";

export interface ConsequenceDialogProps {
  open: boolean;
  title: string;
  target: ConsequenceTarget;
  consequences: readonly string[];
  resultingState: string;
  reasonPolicy: ConsequenceReasonPolicy;
  actionLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  errorMessage?: string;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
  onConfirm: (reason: string | undefined) => boolean | void | Promise<boolean | void>;
  onOpenChange: (open: boolean) => void;
}

function reasonIsValid(reason: string, policy: ConsequenceReasonPolicy): boolean {
  if (policy.kind === "none") return true;
  const length = reason.trim().length;
  return (policy.maxLength === undefined || length <= policy.maxLength)
    && (policy.kind !== "required" || length >= (policy.minLength ?? 1));
}

function useNativeDialogLifecycle(
  open: boolean,
  dialogRef: RefObject<HTMLDialogElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  fallbackFocusRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
        restoreTriggerFocus(triggerRef, fallbackFocusRef);
      }
    };
  }, [dialogRef, open, triggerRef, fallbackFocusRef]);
}

export function ConsequenceDialog({
  open,
  title,
  target,
  consequences,
  resultingState,
  reasonPolicy,
  actionLabel,
  cancelLabel = "取消",
  busy = false,
  errorMessage,
  fallbackFocusRef,
  children,
  onConfirm,
  onOpenChange
}: ConsequenceDialogProps) {
  const controller = useConsequenceDialogController({
    busy, fallbackFocusRef, onConfirm, onOpenChange, open, reasonPolicy, targetId: target.id
  });

  if (!isValidDialogContract({
    actionLabel,
    consequences,
    resultingState,
    target,
    title
  })) {
    throw new Error("ConsequenceDialog requires a stable target, outcome, action, and consequences.");
  }

  return (
    <ConsequenceDialogSurface
      actionLabel={actionLabel}
      busy={busy}
      cancelLabel={cancelLabel}
      consequences={consequences}
      descriptionId={controller.descriptionId}
      dialogRef={controller.dialogRef}
      errorMessage={errorMessage}
      fallbackFocusRef={fallbackFocusRef}
      onCancel={controller.handleCancel}
      onConfirm={controller.handleSubmit}
      onReasonChange={controller.changeReason}
      onRequestClose={controller.requestClose}
      reason={controller.reason}
      reasonId={controller.reasonId}
      reasonPolicy={reasonPolicy}
      resultingState={resultingState}
      target={target}
      title={title}
      titleId={controller.titleId}
      triggerRef={controller.triggerRef}
    >
      {children}
    </ConsequenceDialogSurface>
  );
}

interface ConsequenceDialogControllerInput {
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  busy: boolean;
  onConfirm: (reason: string | undefined) => boolean | void | Promise<boolean | void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reasonPolicy: ConsequenceReasonPolicy;
  targetId: string;
}

function useConsequenceDialogController(input: ConsequenceDialogControllerInput) {
  useOwnedScrollLock(input.open);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const activeTargetRef = useRef(input.targetId);
  const gateRef = useRef<SingleFlightGate | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const [draft, dispatchDraft] = useReducer(reduceDialogDraft, {
    targetId: input.targetId,
    reason: ""
  });
  activeTargetRef.current = input.targetId;
  gateRef.current ??= createSingleFlightGate();
  const reason = visibleDialogReason(draft, input.open, input.targetId);

  useNativeDialogLifecycle(input.open, dialogRef, triggerRef, input.fallbackFocusRef);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !input.open) return;
    // Next's React root delegates at document, alongside Drawer listeners.
    // Stop at the owning native dialog before Escape reaches that shared node.
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || !(event.target instanceof Element)
        || event.target.closest("dialog") !== dialog) return;
      event.stopPropagation();
      if (input.busy) event.preventDefault();
    }
    dialog.addEventListener("keydown", handleEscape);
    return () => dialog.removeEventListener("keydown", handleEscape);
  }, [input.open, input.busy]);
  useEffect(() => {
    if (input.open && input.busy) dialogRef.current?.focus();
  }, [input.open, input.busy]);
  useEffect(() => {
    dispatchDraft({ type: "synchronize", open: input.open, targetId: input.targetId });
  }, [input.open, input.targetId]);

  function requestClose() {
    dispatchDraft({ type: "synchronize", open: false, targetId: input.targetId });
    input.onOpenChange(false);
  }
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    event.stopPropagation();
    event.preventDefault();
    if (!input.busy) {
      requestClose();
    }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    const gate = gateRef.current;
    if (input.busy || !reasonIsValid(reason, input.reasonPolicy) || !gate?.tryEnter()) {
      return;
    }
    const submittedTargetId = input.targetId;
    const value = input.reasonPolicy.kind === "none" ? undefined : reason.trim() || undefined;
    const shouldClose = await runDialogConfirmation(gate, () => input.onConfirm(value));
    if (!shouldClose) {
      return;
    }
    dispatchDraft({ type: "confirmed", targetId: submittedTargetId });
    if (activeTargetRef.current === submittedTargetId) {
      input.onOpenChange(false);
    }
  }
  function changeReason(nextReason: string) {
    dispatchDraft({ type: "change-reason", targetId: input.targetId, reason: nextReason });
  }
  return {
    changeReason, descriptionId, dialogRef, handleCancel, handleSubmit,
    reason, reasonId, requestClose, titleId, triggerRef
  };
}

interface DialogContractInput {
  actionLabel: string;
  consequences: readonly string[];
  resultingState: string;
  target: ConsequenceTarget;
  title: string;
}

function isValidDialogContract(input: DialogContractInput): boolean {
  return Boolean(
    input.title.trim()
    && input.target.id.trim()
    && input.target.label.trim()
    && input.resultingState.trim()
    && input.actionLabel.trim()
    && input.consequences.length > 0
    && input.consequences.every((consequence) => consequence.trim())
  );
}

interface ConsequenceDialogSurfaceProps extends DialogContractInput {
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  busy: boolean;
  cancelLabel: string;
  children?: ReactNode;
  descriptionId: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
  errorMessage?: string;
  onCancel: (event: SyntheticEvent<HTMLDialogElement>) => void;
  onConfirm: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onReasonChange: (reason: string) => void;
  onRequestClose: () => void;
  reason: string;
  reasonId: string;
  reasonPolicy: ConsequenceReasonPolicy;
  titleId: string;
  triggerRef: RefObject<HTMLElement | null>;
}

function ConsequenceDialogSurface(props: ConsequenceDialogSurfaceProps) {
  return (
    <dialog
      aria-describedby={props.descriptionId}
      aria-labelledby={props.titleId}
      className={`${styles.dialog} ds-panel`}
      onCancel={props.onCancel}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        restoreTriggerFocus(props.triggerRef, props.fallbackFocusRef);
      }}
      onKeyDown={(event) => {
        if (!(event.target instanceof Element)
          || event.target.closest("dialog") !== event.currentTarget) return;
        trapDialogFocus(event);
      }}
      ref={props.dialogRef}
      tabIndex={-1}
    >
      <form className={styles.form} method="dialog" onSubmit={(event) => void props.onConfirm(event)}>
        <DialogContent
          consequences={props.consequences}
          descriptionId={props.descriptionId}
          resultingState={props.resultingState}
          target={props.target}
          title={props.title}
          titleId={props.titleId}
        >
          {props.children}
        </DialogContent>
        <ReasonField
          busy={props.busy}
          onChange={props.onReasonChange}
          policy={props.reasonPolicy}
          reason={props.reason}
          reasonId={props.reasonId}
        />
        {props.errorMessage ? (
          <p aria-live="assertive" className="ds-field-error" role="alert">
            {props.errorMessage}
          </p>
        ) : null}
        <DialogActions
          actionLabel={props.actionLabel}
          busy={props.busy}
          cancelLabel={props.cancelLabel}
          confirmDisabled={!reasonIsValid(props.reason, props.reasonPolicy)}
          onCancel={props.onRequestClose}
        />
      </form>
    </dialog>
  );
}

function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]'
  )).filter((element) => element.getClientRects().length > 0
    && element.closest("dialog") === event.currentTarget && !element.closest("[inert]"));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    event.currentTarget.focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function restoreTriggerFocus(
  triggerRef: RefObject<HTMLElement | null>,
  fallbackFocusRef?: RefObject<HTMLElement | null>
) {
  const trigger = triggerRef.current;
  triggerRef.current = null;
  if (!trigger) return;
  queueMicrotask(() => {
    const candidate = canRestoreFocus(trigger) ? trigger : fallbackFocusRef?.current;
    if (!candidate || !canRestoreFocus(candidate)) return;
    const activeModal = document.activeElement?.closest("dialog[open]");
    if (activeModal && !activeModal.contains(candidate)) return;
    candidate.focus({ preventScroll: true });
  });
}

function canRestoreFocus(element: HTMLElement): boolean {
  return element.isConnected && !element.matches(":disabled")
    && !element.closest("[inert], [hidden]") && element.getClientRects().length > 0;
}
