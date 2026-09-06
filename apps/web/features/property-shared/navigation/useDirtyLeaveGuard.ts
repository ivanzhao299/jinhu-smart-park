"use client";

import { useCallback, useEffect } from "react";

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

interface NavigationEventLike extends Event {
  canIntercept?: boolean;
  destination?: { url?: string };
  hashChange?: boolean;
}

interface NavigationLike {
  addEventListener(type: "navigate", listener: (event: NavigationEventLike) => void): void;
  removeEventListener(type: "navigate", listener: (event: NavigationEventLike) => void): void;
}

const activeGuards = new Map<symbol, string>();
let removeGlobalListeners: (() => void) | null = null;

function confirmActiveGuards(): boolean {
  const message = activeGuards.values().next().value as string | undefined;
  return !message || window.confirm(message);
}

function installGlobalListeners(): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!activeGuards.size) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const onDocumentClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
    const next = new URL(target.href, window.location.href);
    if (next.href === window.location.href || (next.pathname === window.location.pathname && next.search === window.location.search && next.hash)) return;
    if (!confirmActiveGuards()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onNavigate = (event: NavigationEventLike) => {
    if (event.hashChange || event.canIntercept === false || !event.destination?.url) return;
    if (!confirmActiveGuards()) event.preventDefault();
  };
  const navigation = (window as Window & { navigation?: NavigationLike }).navigation;

  window.addEventListener("beforeunload", onBeforeUnload);
  if (navigation) navigation.addEventListener("navigate", onNavigate);
  else document.addEventListener("click", onDocumentClick, true);
  return () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
    if (navigation) navigation.removeEventListener("navigate", onNavigate);
    else document.removeEventListener("click", onDocumentClick, true);
  };
}

export function useDirtyLeaveGuard(options: DirtyLeaveGuardOptions): DirtyLeaveGuard {
  const guarded = shouldGuardDirtyLeave(options);
  const message = options.message?.trim() || DEFAULT_DIRTY_LEAVE_MESSAGE;
  const confirmLeave = useCallback(() => !guarded || window.confirm(message), [guarded, message]);

  useEffect(() => {
    if (!guarded) return;
    const id = Symbol("dirty-leave-guard");
    activeGuards.set(id, message);
    if (!removeGlobalListeners) removeGlobalListeners = installGlobalListeners();
    return () => {
      activeGuards.delete(id);
      if (!activeGuards.size && removeGlobalListeners) {
        removeGlobalListeners();
        removeGlobalListeners = null;
      }
    };
  }, [guarded, message]);

  return { confirmLeave };
}
