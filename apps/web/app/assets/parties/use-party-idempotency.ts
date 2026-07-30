"use client";

import { useCallback, useRef } from "react";
import { createIdempotencyKey } from "../../../lib/api-client";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

export function usePartyIdempotency() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);
  const keyFor = useCallback((operation: string, payload: unknown) => {
    const fingerprint = JSON.stringify(normalize(payload));
    if (current.current?.fingerprint === fingerprint) return current.current.key;
    const key = createIdempotencyKey(operation);
    current.current = { fingerprint, key };
    return key;
  }, []);
  const complete = useCallback(() => { current.current = null; }, []);
  return { complete, keyFor };
}
