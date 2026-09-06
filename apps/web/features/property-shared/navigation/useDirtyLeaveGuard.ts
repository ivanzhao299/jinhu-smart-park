"use client";

import { useCallback, useEffect, useRef } from "react";

const DEFAULT_DIRTY_LEAVE_MESSAGE = "有未保存的修改，确定离开吗？";

export interface DirtyLeaveGuardOptions {
  dirty: boolean;
  busy?: boolean;
  enabled?: boolean;
  message?: string;
}

export function shouldGuardDirtyLeave(options: DirtyLeaveGuardOptions): boolean {
  return options.enabled !== false && (options.dirty || options.busy === true);
}

export interface DirtyLeaveGuard {
  confirmLeave: () => boolean;
}

export function useDirtyLeaveGuard(options: DirtyLeaveGuardOptions): DirtyLeaveGuard {
  const guarded = shouldGuardDirtyLeave(options);
  const message = options.message?.trim() || DEFAULT_DIRTY_LEAVE_MESSAGE;
  const suppressNextPop = useRef(false);
  const confirmLeave = useCallback(() => !guarded || window.confirm(message), [guarded, message]);

  useEffect(() => {
    if (!guarded) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const next = new URL(target.href, window.location.href);
      if (next.href === window.location.href || (next.pathname === window.location.pathname && next.search === window.location.search && next.hash)) return;
      if (!confirmLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onPopState = (event: PopStateEvent) => {
      if (suppressNextPop.current) {
        suppressNextPop.current = false;
        return;
      }
      if (confirmLeave()) return;
      event.stopImmediatePropagation();
      suppressNextPop.current = true;
      window.history.forward();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [confirmLeave, guarded]);

  return { confirmLeave };
}
