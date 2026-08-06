"use client";

import {
  type RefObject,
  type ReactNode,
  useEffect,
  useId,
  useRef
} from "react";
import styles from "./CanonicalDetailShell.module.css";
import { resolveDrawerDialogCommand } from "./drawer-dialog-state";

export type CanonicalDetailState =
  | { kind: "loading" }
  | { kind: "ready"; stale?: boolean }
  | { kind: "forbidden" }
  | { kind: "not-found" }
  | { kind: "failure"; message: string }
  | { kind: "conflict"; message: string };

interface CanonicalDetailShellBaseProps {
  entityKey: string;
  title: ReactNode;
  state: CanonicalDetailState;
  children?: ReactNode;
  actions?: ReactNode;
  loadingSlot?: ReactNode;
  forbiddenSlot?: ReactNode;
  notFoundSlot?: ReactNode;
  failureSlot?: ReactNode;
  staleSlot?: ReactNode;
  conflictSlot?: ReactNode;
  returnControl?: ReactNode;
  className?: string;
}

export type CanonicalDetailShellProps = CanonicalDetailShellBaseProps & (
  | { presentation: "drawer"; onRequestClose: () => void }
  | { presentation: "full"; onRequestClose?: never }
);

function assertNever(value: never): never {
  throw new Error(`Unhandled canonical detail state: ${JSON.stringify(value)}`);
}

export function CanonicalDetailShell({
  presentation,
  entityKey,
  title,
  state,
  children,
  actions,
  loadingSlot,
  forbiddenSlot,
  notFoundSlot,
  failureSlot,
  staleSlot,
  conflictSlot,
  returnControl,
  onRequestClose,
  className
}: CanonicalDetailShellProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useDrawerDialogLifecycle({ dialogRef, presentation, titleRef, triggerRef });

  useEffect(() => {
    if (state.kind === "ready") {
      titleRef.current?.focus();
    }
  }, [entityKey, state.kind]);

  const content = renderDetailState({
    state, children, loadingSlot, forbiddenSlot, notFoundSlot,
    failureSlot, staleSlot, conflictSlot
  });
  const shellClassName = [
    "ds-panel",
    presentation === "full" ? "ds-page" : "",
    className ?? ""
  ].filter(Boolean).join(" ");
  const common = {
    "aria-labelledby": titleId,
    className: shellClassName
  };

  const body = (
    <>
      <DetailHeader
        actions={actions}
        onRequestClose={onRequestClose}
        presentation={presentation}
        returnControl={returnControl}
        title={title}
        titleId={titleId}
        titleRef={titleRef}
      />
      {content}
    </>
  );

  return presentation === "drawer" ? (
    <dialog
      {...common}
      onCancel={(event) => {
        event.preventDefault();
        onRequestClose?.();
      }}
      onClose={() => restoreDrawerTriggerFocus(triggerRef)}
      ref={dialogRef}
    >
      {body}
    </dialog>
  ) : (
    <main {...common}>{body}</main>
  );
}

interface DrawerLifecycleInput {
  dialogRef: RefObject<HTMLDialogElement | null>;
  presentation: "full" | "drawer";
  titleRef: RefObject<HTMLHeadingElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
}

function useDrawerDialogLifecycle({
  dialogRef,
  presentation,
  titleRef,
  triggerRef
}: DrawerLifecycleInput) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const command = resolveDrawerDialogCommand(presentation, dialog.open);
    if (command === "show-modal") {
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      dialog.showModal();
      titleRef.current?.focus();
    } else if (command === "close") {
      dialog.close();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
        restoreDrawerTriggerFocus(triggerRef);
      }
    };
  }, [dialogRef, presentation, titleRef, triggerRef]);
}

function restoreDrawerTriggerFocus(triggerRef: RefObject<HTMLElement | null>) {
  const trigger = triggerRef.current;
  triggerRef.current = null;
  queueMicrotask(() => trigger?.focus());
}

interface DetailHeaderProps {
  actions?: ReactNode;
  onRequestClose?: () => void;
  presentation: "full" | "drawer";
  returnControl?: ReactNode;
  title: ReactNode;
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
}

function DetailHeader({
  actions,
  onRequestClose,
  presentation,
  returnControl,
  title,
  titleId,
  titleRef
}: DetailHeaderProps) {
  return (
    <header className="ds-panel-heading">
      <div>
        {returnControl}
        <h1 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h1>
      </div>
      <div>
        {actions}
        {presentation === "drawer" && onRequestClose ? (
          <button
            aria-label="关闭详情"
            className={`${styles.touchTarget} ds-button`}
            onClick={onRequestClose}
            type="button"
          >
            关闭
          </button>
        ) : null}
      </div>
    </header>
  );
}

interface DetailStateRenderInput {
  state: CanonicalDetailState;
  children?: ReactNode;
  loadingSlot?: ReactNode;
  forbiddenSlot?: ReactNode;
  notFoundSlot?: ReactNode;
  failureSlot?: ReactNode;
  staleSlot?: ReactNode;
  conflictSlot?: ReactNode;
}

function renderDetailState(input: DetailStateRenderInput): ReactNode {
  switch (input.state.kind) {
    case "loading":
      return input.loadingSlot ?? <p aria-live="polite" role="status">正在加载详情…</p>;
    case "ready":
      return (
        <>
          {input.state.stale ? input.staleSlot ?? (
            <p aria-live="polite" role="status">当前显示的是最近一次成功加载的内容。</p>
          ) : null}
          {input.children}
        </>
      );
    case "forbidden":
      return input.forbiddenSlot ?? (
        <section>
          <h2>无法查看此详情</h2>
          <p>你没有查看该内容的权限，或该内容不在当前范围内。</p>
        </section>
      );
    case "not-found":
      return input.notFoundSlot ?? (
        <section>
          <h2>无法查看此详情</h2>
          <p>该内容不存在，或不在当前可访问范围内。</p>
        </section>
      );
    case "failure":
      return (
        <>
          {input.failureSlot ?? (
            <section aria-live="assertive" role="alert">
              <h2>详情加载失败</h2>
              <p>{input.state.message}</p>
            </section>
          )}
          {input.children}
        </>
      );
    case "conflict":
      return input.conflictSlot ?? (
        <section aria-live="assertive" role="alert">
          <h2>内容已发生变化</h2>
          <p>{input.state.message}</p>
        </section>
      );
    default:
      return assertNever(input.state);
  }
}
