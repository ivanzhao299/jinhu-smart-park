"use client";

import { useEffect } from "react";

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

export function useDirtyLeaveGuard(options: DirtyLeaveGuardOptions): void {
  const guarded = shouldGuardDirtyLeave(options);
  const message = options.message?.trim() || DEFAULT_DIRTY_LEAVE_MESSAGE;

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
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [guarded, message]);
}
