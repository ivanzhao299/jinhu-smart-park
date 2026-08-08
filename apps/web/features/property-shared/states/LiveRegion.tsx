"use client";

import { useEffect, useRef, useState } from "react";

export interface LiveRegionProps {
  message: string | null | undefined;
  mode?: "polite" | "assertive";
  dedupeKey?: string;
  className?: string;
}

export function LiveRegion({
  message,
  mode = "polite",
  dedupeKey,
  className
}: LiveRegionProps) {
  const lastKeyRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const normalized = message?.trim() ?? "";
    if (!normalized) {
      lastKeyRef.current = null;
      setAnnouncement("");
      return;
    }
    const nextKey = dedupeKey ?? normalized;
    if (nextKey !== lastKeyRef.current) {
      lastKeyRef.current = nextKey;
      setAnnouncement(normalized);
    }
  }, [dedupeKey, message]);

  return (
    <div
      aria-atomic="true"
      aria-live={mode}
      className={className}
      role={mode === "assertive" ? "alert" : "status"}
    >
      {announcement}
    </div>
  );
}
