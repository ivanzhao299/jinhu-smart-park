"use client";

import { useEffect } from "react";

const owners = new Set<symbol>();
let previousOverflow = "";
let previousPriority = "";

/** Scoped to opted-in property overlays; nested owners release independently. */
export function useOwnedScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const owner = Symbol();
    const style = document.documentElement.style;
    if (owners.size === 0) {
      previousOverflow = style.getPropertyValue("overflow");
      previousPriority = style.getPropertyPriority("overflow");
      style.setProperty("overflow", "hidden");
    }
    owners.add(owner);
    return () => {
      owners.delete(owner);
      if (owners.size === 0 && style.getPropertyValue("overflow") === "hidden"
        && style.getPropertyPriority("overflow") === "") {
        if (previousOverflow) style.setProperty("overflow", previousOverflow, previousPriority);
        else style.removeProperty("overflow");
      }
    };
  }, [open]);
}
