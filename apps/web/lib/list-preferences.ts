"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserContext } from "@jinhu/shared";

const VERSION = 1;
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100] as const;
export type ListViewMode = "auto" | "table" | "cards";

export interface ListPreferences {
  filtersOpen: boolean;
  pageSize: number;
  viewMode: ListViewMode;
  visibleFields: string[];
}

interface Options {
  defaultPageSize?: number;
  allowedPageSizes?: readonly number[];
  allowedFields?: readonly string[];
}

export function listPreferenceKey(listId: string, user: UserContext | null): string | null {
  if (!user?.id || !user.tenant_id || !user.park_id) return null;
  return `jinhu_list_pref:v${VERSION}:${user.tenant_id}:${user.park_id}:${user.id}:${listId}`;
}

export function useListPreferences(listId: string, user: UserContext | null, options: Options = {}) {
  const allowedFieldsKey = (options.allowedFields ?? []).join("\u0000");
  const allowedPageSizesKey = (options.allowedPageSizes ?? DEFAULT_PAGE_SIZES).join(",");
  const allowedFields = useMemo(() => allowedFieldsKey ? allowedFieldsKey.split("\u0000") : undefined, [allowedFieldsKey]);
  const allowedPageSizes = useMemo(
    () => allowedPageSizesKey.split(",").map(Number).filter(Number.isFinite),
    [allowedPageSizesKey]
  );
  const defaults = useMemo<ListPreferences>(() => ({
    filtersOpen: true,
    pageSize: options.defaultPageSize ?? 20,
    viewMode: "auto",
    visibleFields: [...(allowedFields ?? [])]
  }), [allowedFields, options.defaultPageSize]);
  const key = listPreferenceKey(listId, user);
  const [preferences, setPreferences] = useState<ListPreferences>(defaults);

  useEffect(() => {
    if (!key) {
      setPreferences(defaults);
      return;
    }
    setPreferences(readListPreferences(key, defaults, allowedPageSizes, allowedFields));
  }, [allowedFields, allowedPageSizes, defaults, key]);

  const updatePreferences = useCallback((patch: Partial<ListPreferences>) => {
    setPreferences((current) => {
      const next = sanitizeListPreferences({ ...current, ...patch }, defaults, allowedPageSizes, allowedFields);
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify({ version: VERSION, ...next }));
        } catch {
          // Storage can be unavailable or full; keep the in-memory preference usable.
        }
      }
      return next;
    });
  }, [allowedFields, allowedPageSizes, defaults, key]);

  return {
    preferences,
    setFiltersOpen: useCallback((filtersOpen: boolean) => updatePreferences({ filtersOpen }), [updatePreferences]),
    updatePreferences
  };
}

function readListPreferences(
  key: string,
  defaults: ListPreferences,
  allowedPageSizes: readonly number[],
  allowedFields?: readonly string[]
): ListPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as (Partial<ListPreferences> & { version?: number }) | null;
    if (!parsed || parsed.version !== VERSION) return defaults;
    return sanitizeListPreferences(parsed, defaults, allowedPageSizes, allowedFields);
  } catch {
    return defaults;
  }
}

function sanitizeListPreferences(
  value: Partial<ListPreferences>,
  defaults: ListPreferences,
  allowedPageSizes: readonly number[],
  allowedFields?: readonly string[]
): ListPreferences {
  const allowedFieldSet = new Set(allowedFields ?? []);
  return {
    filtersOpen: typeof value.filtersOpen === "boolean" ? value.filtersOpen : defaults.filtersOpen,
    pageSize: allowedPageSizes.includes(value.pageSize ?? -1) ? value.pageSize! : defaults.pageSize,
    viewMode: value.viewMode === "table" || value.viewMode === "cards" || value.viewMode === "auto" ? value.viewMode : defaults.viewMode,
    visibleFields: allowedFields
      ? (Array.isArray(value.visibleFields) ? value.visibleFields : defaults.visibleFields).filter((field) => allowedFieldSet.has(field))
      : defaults.visibleFields
  };
}
