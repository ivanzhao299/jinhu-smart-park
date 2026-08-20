"use client";

import type { UserContext, UserParkContext } from "@jinhu/shared";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, getToken, switchParkContext } from "../../lib/auth";
import { useAuthSessionActions, useAuthUser } from "../../lib/auth-context";

export interface AssetParkContextSelectorProps {
  value: string;
  parks: UserParkContext[];
  disabled?: boolean;
  label?: string;
  fallbackLabel?: string;
  onChange: (parkId: string) => void;
}

export function AssetParkContextSelector({
  value,
  parks,
  disabled = false,
  label = "查看园区",
  fallbackLabel = "当前园区",
  onChange
}: AssetParkContextSelectorProps) {
  return (
    <label className="form-field asset-park-context-selector">
      <span>{label}</span>
      <select
        aria-label={label}
        disabled={disabled || parks.length <= 1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {parks.length === 0 ? <option value={value}>{fallbackLabel}</option> : null}
        {parks.map((park) => (
          <option key={park.park_id} value={park.park_id}>
            {park.park_code ? `${park.park_code} ` : ""}{park.park_name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useAssetParkContextSwitch() {
  const router = useRouter();
  const authUser = useAuthUser();
  const sessionActions = useAuthSessionActions();
  const storedUser = getStoredUser();
  const currentUser = storedUser ?? authUser;
  const [selectedParkId, setSelectedParkId] = useState(currentUser?.park_id ?? "");
  const [switching, setSwitching] = useState(false);

  const accessibleParks = useMemo(() => (
    (currentUser?.accessible_parks ?? []).filter((park) => park.status === "enabled")
  ), [currentUser?.accessible_parks]);

  const effectiveParkId = selectedParkId || currentUser?.park_id || "";
  const currentParkName = currentUser?.current_park?.park_name ?? currentUser?.park_name ?? currentUser?.park_id ?? "当前园区";

  useEffect(() => {
    setSelectedParkId(currentUser?.park_id ?? "");
  }, [currentUser?.park_id]);

  async function switchToPark(targetParkId: string): Promise<UserContext | null> {
    if (switching || !targetParkId) return currentUser ?? null;
    if (!accessibleParks.some((park) => park.park_id === targetParkId)) {
      throw new Error("当前账号无法访问所选园区");
    }
    if (targetParkId === effectiveParkId && currentUser?.park_id === targetParkId) {
      return currentUser ?? null;
    }

    setSwitching(true);
    try {
      const nextUser = await switchParkContext(targetParkId);
      sessionActions?.publishUser(nextUser);
      setSelectedParkId(nextUser.park_id);
      return nextUser;
    } catch (error) {
      if (!getToken()) router.replace("/login");
      throw error;
    } finally {
      setSwitching(false);
    }
  }

  return {
    accessibleParks,
    currentParkName,
    effectiveParkId,
    switching,
    setSelectedParkId,
    switchToPark
  };
}
