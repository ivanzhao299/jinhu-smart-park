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
  visibleDialogReason,
  type SingleFlightGate
} from "./dialog-state";
import type {
  ConsequenceReasonPolicy,
  ConsequenceTarget
} from "./types";

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
  children?: ReactNode;
  onConfirm: (reason: string | undefined) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

function reasonIsValid(reason: string, policy: ConsequenceReasonPolicy): boolean {
  if (policy.kind !== "required") {
    return true;
  }
  return reason.trim().length >= (policy.minLength ?? 1);
}

function useNativeDialogLifecycle(
  open: boolean,
  dialogRef: RefObject<HTMLDialogElement | null>,
  triggerRef: RefObject<HTMLElement | null>
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
        restoreTriggerFocus(triggerRef);
      }
    };
  }, [dialogRef, open, triggerRef]);
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
  children,
  onConfirm,
  onOpenChange
}: ConsequenceDialogProps) {
  const controller = useConsequenceDialogController({
    busy, onConfirm, onOpenChange, open, reasonPolicy, targetId: target.id
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
  busy: boolean;
  onConfirm: (reason: string | undefined) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  reasonPolicy: ConsequenceReasonPolicy;
  targetId: string;
}

function useConsequenceDialogController(input: ConsequenceDialogControllerInput) {
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

  useNativeDialogLifecycle(input.open, dialogRef, triggerRef);
  useEffect(() => {
    dispatchDraft({ type: "synchronize", open: input.open, targetId: input.targetId });
  }, [input.open, input.targetId]);

  function requestClose() {
    dispatchDraft({ type: "synchronize", open: false, targetId: input.targetId });
    input.onOpenChange(false);
  }
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!input.busy) {
      requestClose();
    }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const gate = gateRef.current;
    if (input.busy || !reasonIsValid(reason, input.reasonPolicy) || !gate?.tryEnter()) {
      return;
    }
    const submittedTargetId = input.targetId;
    try {
      const value = input.reasonPolicy.kind === "none" ? undefined : reason.trim() || undefined;
      await input.onConfirm(value);
      dispatchDraft({ type: "confirmed", targetId: submittedTargetId });
      if (activeTargetRef.current === submittedTargetId) {
        input.onOpenChange(false);
      }
    } finally {
      gate.leave();
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
  busy: boolean;
  cancelLabel: string;
  children?: ReactNode;
  descriptionId: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
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
      className="ds-panel"
      onCancel={props.onCancel}
      onClose={() => restoreTriggerFocus(props.triggerRef)}
      onKeyDown={trapDialogFocus}
      ref={props.dialogRef}
    >
      <form method="dialog" onSubmit={(event) => void props.onConfirm(event)}>
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
  )).filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function restoreTriggerFocus(triggerRef: RefObject<HTMLElement | null>) {
  const trigger = triggerRef.current;
  triggerRef.current = null;
  queueMicrotask(() => trigger?.focus());
}
