"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  capturePropertyOfflineGeneration,
  deletePropertyUploadQueueItem,
  disablePropertyUploadQueuePersistence,
  ensurePropertyOfflineScope,
  isPropertyOfflineGenerationCurrent,
  listPropertyUploadQueue,
  putPropertyUploadQueueItem
} from "./property-draft-store";
import { propertyUploadQueueV1Enabled } from "./property-reliability-flags";
import {
  notifyPropertyUploadQueueState,
  propertyUploadContextKey,
  propertyUploadQueueUiState,
  type PropertyUploadContext,
  type PropertyUploadQueueItem
} from "./property-upload-queue";

function useDisabledQueueCleanup(input: {
  enabled: boolean;
  generation: MutableRefObject<number | null>;
  messageCallback: MutableRefObject<(message: string) => void>;
  reset(): void;
}) {
  const { enabled, generation, messageCallback, reset } = input;
  useEffect(() => {
    if (enabled) return;
    generation.current = null;
    reset();
    void disablePropertyUploadQueuePersistence().catch(() => {
      messageCallback.current("本机临时图片清理被其他标签页阻止，请关闭其他标签页后刷新");
    });
  }, [enabled, generation, messageCallback, reset]);
}

function useQueueInitialization(input: {
  context: PropertyUploadContext | null;
  enabled: boolean;
  generation: MutableRefObject<number | null>;
  messageCallback: MutableRefObject<(message: string) => void>;
  reset(): void;
  setInitializedContextKey(value: string): void;
  setItems(value: PropertyUploadQueueItem[]): void;
}) {
  const {
    context, enabled, generation, messageCallback, reset,
    setInitializedContextKey, setItems
  } = input;
  useEffect(() => {
    let active = true;
    reset();
    if (!enabled || !context || typeof indexedDB === "undefined") {
      return () => { active = false; };
    }
    void ensurePropertyOfflineScope({
      tenantId: context.tenantId, parkId: context.parkId, userId: context.userId,
      module: context.module, permissionFingerprint: context.permissionFingerprint
    })
      .then((currentGeneration) => {
        generation.current = currentGeneration;
        return listPropertyUploadQueue(context);
      })
      .then((queuedItems) => {
        if (active && generation.current !== null
          && isPropertyOfflineGenerationCurrent(generation.current)) {
          setItems(queuedItems);
          setInitializedContextKey(propertyUploadContextKey(context));
        }
      })
      .catch(() => {
        if (active) messageCallback.current("离线图片恢复区暂不可用，提交保持锁定");
      });
    return () => { active = false; };
  }, [context, enabled, generation, messageCallback, reset, setInitializedContextKey, setItems]);
}

export function usePropertyUploadQueue({
  context,
  onMessage,
  onQueueStateChange,
  uploading
}: {
  context: PropertyUploadContext | null;
  onMessage(message: string): void;
  onQueueStateChange?: (state: { busy: boolean; count: number }) => void;
  uploading: boolean;
}) {
  const enabled = propertyUploadQueueV1Enabled();
  const activeContext = enabled ? context : null;
  const contextKey = activeContext ? propertyUploadContextKey(activeContext) : null;
  const [consent, setConsent] = useState(false);
  const [items, setItems] = useState<PropertyUploadQueueItem[]>([]);
  const [initializedContextKey, setInitializedContextKey] = useState<string | null>(null);
  const generation = useRef<number | null>(null);
  const messageCallback = useRef(onMessage);
  const stateCallback = useRef(onQueueStateChange);
  messageCallback.current = onMessage;
  stateCallback.current = onQueueStateChange;

  const uiState = propertyUploadQueueUiState({
    enabled,
    contextKey,
    initializedContextKey,
    uploading,
    count: items.length
  });
  const reset = useCallback(() => {
    setConsent(false);
    setItems([]);
    setInitializedContextKey(null);
  }, []);
  useDisabledQueueCleanup({ enabled, generation, messageCallback, reset });
  useQueueInitialization({
    context: activeContext,
    enabled,
    generation,
    messageCallback,
    reset,
    setInitializedContextKey,
    setItems
  });

  useEffect(() => {
    notifyPropertyUploadQueueState(stateCallback.current, uiState);
  }, [uiState.busy, uiState.count]);

  return {
    consent,
    context: activeContext,
    enabled,
    items,
    setConsent,
    uiState,
    captureGeneration: () => generation.current ?? capturePropertyOfflineGeneration(),
    generationIsCurrent: isPropertyOfflineGenerationCurrent,
    enqueue: async (item: PropertyUploadQueueItem, expectedGeneration: number) => {
      await putPropertyUploadQueueItem(item, expectedGeneration);
      setItems((current) => [...current, item]);
    },
    remove: async (item: PropertyUploadQueueItem) => {
      await deletePropertyUploadQueueItem(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    },
    recordFailure: async (item: PropertyUploadQueueItem, expectedGeneration: number) => {
      await putPropertyUploadQueueItem(item, expectedGeneration).catch(() => undefined);
      if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) return;
      setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
    }
  };
}
