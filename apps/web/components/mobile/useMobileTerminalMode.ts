"use client";

import { useLayoutEffect } from "react";

export function useMobileTerminalMode(classes: string[]): void {
  const classKey = classes.filter(Boolean).sort().join(" ");

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const uniqueClasses = Array.from(new Set(classKey.split(" ").filter(Boolean)));
    const targets = [document.documentElement, document.body];

    for (const target of targets) {
      target.classList.add(...uniqueClasses);
    }

    return () => {
      for (const target of targets) {
        target.classList.remove(...uniqueClasses);
      }
    };
  }, [classKey]);
}
