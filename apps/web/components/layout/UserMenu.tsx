"use client";

import { LogOut, MapPin, UserRound } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuthSessionActions, useAuthUser } from "../../lib/auth-context";
import { getToken, logoutSession, switchParkContext } from "../../lib/auth";
import { resolvePostParkSwitchPath } from "../../lib/post-login-route";

interface UserMenuProps {
  compact?: boolean;
}

export function UserMenu({ compact = false }: UserMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthUser();
  const actions = useAuthSessionActions();
  const [switching, setSwitching] = useState(false);
  const [message, setMessage] = useState("");
  const displayName = user?.real_name ?? user?.username ?? "未登录";
  const accessibleParks = useMemo(() => (
    (user?.accessible_parks ?? []).filter((park) => park.status === "enabled")
  ), [user?.accessible_parks]);
  const currentParkName = user?.current_park?.park_name ?? user?.park_name ?? user?.park_id ?? "当前园区";

  async function switchPark(parkId: string) {
    if (!user || !parkId || parkId === user.park_id || switching) {
      return;
    }
    setSwitching(true);
    setMessage("");
    try {
      const nextUser = await switchParkContext(parkId);
      actions?.publishUser(nextUser, { remountScopedPages: true });
      const nextPath = resolvePostParkSwitchPath(nextUser, pathname);
      if (nextPath === pathname) router.refresh();
      else router.replace(nextPath as Route);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "园区切换失败");
      if (!getToken()) router.replace("/login");
    } finally {
      setSwitching(false);
    }
  }

  async function logout() {
    try {
      await logoutSession();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className={`user-menu${compact ? " user-menu-compact" : ""}`}>
      <span aria-label={`当前账号：${displayName}`} className="user-avatar user-profile-trigger" role="img" title={displayName}>
        <UserRound size={16} />
      </span>
      {compact ? null : <span className="user-menu-name">{displayName}</span>}
      <label className="user-park-switcher" title={currentParkName}>
        <MapPin size={15} />
        <select
          aria-label="切换园区"
          disabled={switching || accessibleParks.length <= 1}
          value={user?.park_id ?? ""}
          onChange={(event) => void switchPark(event.target.value)}
        >
          {accessibleParks.length === 0 ? <option value={user?.park_id ?? ""}>{currentParkName}</option> : null}
          {accessibleParks.map((park) => (
            <option key={park.park_id} value={park.park_id}>
              {park.park_code ? `${park.park_code} · ` : ""}{park.park_name}
            </option>
          ))}
        </select>
      </label>
      {message ? <span className="user-menu-message" role="alert">{message}</span> : null}
      <button className="user-logout-button" aria-label="退出登录" title="退出登录" type="button" onClick={() => void logout()}>
        <LogOut size={15} />
        <span>退出</span>
      </button>
    </div>
  );
}
