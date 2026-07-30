"use client";

import { useCallback, useRef } from "react";
import { createIdempotencyKey } from "../../../lib/api-client";
import { payloadFingerprint } from "./idempotency-logic";

export interface StableIdempotency {
  complete(operation: string): void;
  keyFor(operation: string, payload: unknown): string;
}

export function useStableIdempotency(): StableIdempotency {
  const keys = useRef(new Map<string, { fingerprint: string; key: string }>());
  const keyFor = useCallback((operation: string, payload: unknown) => {
    const fingerprint = payloadFingerprint(payload);
    const current = keys.current.get(operation);
    if (current?.fingerprint === fingerprint) return current.key;
    const next = createIdempotencyKey(operation);
    keys.current.set(operation, { fingerprint, key: next });
    return next;
  }, []);
  const complete = useCallback((operation: string) => {
    keys.current.delete(operation);
  }, []);
  return { complete, keyFor };
}
