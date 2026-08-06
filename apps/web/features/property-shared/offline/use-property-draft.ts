"use client";

import { useEffect, useRef, useState } from "react";
import type { PropertyDraftContext, PropertyDraftSchema, PropertyOfflineScope } from "./property-draft-contract";
import {
  deletePropertyDraft,
  disablePropertyDraftPersistence,
  ensurePropertyOfflineScope,
  loadPropertyDraft,
  savePropertyDraft
} from "./property-draft-store";
import { propertyOfflineDraftsV1Enabled } from "./property-reliability-flags";

const SAVE_DELAY_MS = 350;

export function usePropertyDraft<T extends Record<string, unknown>>({
  context,
  enabled = true,
  onRestore,
  schema,
  scope,
  value
}: {
  context: PropertyDraftContext | null;
  enabled?: boolean;
  onRestore(value: T): void;
  schema: PropertyDraftSchema;
  scope: PropertyOfflineScope | null;
  value: T;
}) {
  const featureEnabled = propertyOfflineDraftsV1Enabled();
  const persistenceEnabled = enabled && featureEnabled;
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"disabled" | "loading" | "ready" | "saved" | "error">(
    persistenceEnabled ? "loading" : "disabled"
  );
  const restore = useRef(onRestore);
  const generation = useRef<number | null>(null);
  restore.current = onRestore;
  const contextKey = context ? JSON.stringify(context) : "";
  const scopeKey = scope ? JSON.stringify(scope) : "";

  useEffect(() => {
    let active = true;
    setReady(false);
    if (!persistenceEnabled || !context || !scope) {
      setStatus("disabled");
      if (!featureEnabled) {
        void disablePropertyDraftPersistence().catch(() => setStatus("error"));
      }
      return () => { active = false; };
    }
    setStatus("loading");
    void ensurePropertyOfflineScope(scope)
      .then((currentGeneration) => {
        generation.current = currentGeneration;
        return loadPropertyDraft<T>(context);
      })
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
  }, [contextKey, featureEnabled, persistenceEnabled, scopeKey]);

  useEffect(() => {
    if (!persistenceEnabled || !context || !ready) return;
    const timer = window.setTimeout(() => {
      const expectedGeneration = generation.current;
      if (expectedGeneration === null) return;
      void savePropertyDraft(context, value, schema, null, expectedGeneration)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [contextKey, persistenceEnabled, ready, schema, value]);

  return {
    clear: async () => {
      if (context) await deletePropertyDraft(context);
      setStatus(persistenceEnabled ? "ready" : "disabled");
    },
    status
  };
}
