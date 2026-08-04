"use client";

import { useEffect, useRef, useState } from "react";
import type { PropertyDraftContext, PropertyOfflineScope } from "./property-draft-contract";
import {
  deletePropertyDraft,
  ensurePropertyOfflineScope,
  loadPropertyDraft,
  savePropertyDraft
} from "./property-draft-store";

const SAVE_DELAY_MS = 350;

export function usePropertyDraft<T extends Record<string, unknown>>({
  context,
  enabled = process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1 !== "false",
  onRestore,
  scope,
  value
}: {
  context: PropertyDraftContext | null;
  enabled?: boolean;
  onRestore(value: T): void;
  scope: PropertyOfflineScope | null;
  value: T;
}) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"disabled" | "loading" | "ready" | "saved" | "error">(
    enabled ? "loading" : "disabled"
  );
  const restore = useRef(onRestore);
  restore.current = onRestore;
  const contextKey = context ? JSON.stringify(context) : "";
  const scopeKey = scope ? JSON.stringify(scope) : "";

  useEffect(() => {
    let active = true;
    setReady(false);
    if (!enabled || !context || !scope) {
      setStatus("disabled");
      return () => { active = false; };
    }
    setStatus("loading");
    void ensurePropertyOfflineScope(scope)
      .then(() => loadPropertyDraft<T>(context))
      .then((draft) => {
        if (!active) return;
        if (draft) restore.current(draft.value);
        setReady(true);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => { active = false; };
  }, [contextKey, enabled, scopeKey]);

  useEffect(() => {
    if (!enabled || !context || !ready) return;
    const timer = window.setTimeout(() => {
      void savePropertyDraft(context, value)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [contextKey, enabled, ready, value]);

  return {
    clear: async () => {
      if (context) await deletePropertyDraft(context);
      setStatus(enabled ? "ready" : "disabled");
    },
    status
  };
}
