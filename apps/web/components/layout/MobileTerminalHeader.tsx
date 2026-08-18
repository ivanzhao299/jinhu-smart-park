"use client";

import { Download, Home, LogOut, MapPin, Moon, RefreshCw, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuthSessionActions, useAuthUser } from "../../lib/auth-context";
import { getToken, logoutSession, switchParkContext } from "../../lib/auth";
import { useAppBranding } from "../branding/useAppBranding";
import { resolveBrandLogo } from "../../lib/app-branding";
import { useTheme } from "../theme/ThemeProvider";

export function MobileTerminalHeader() {
  const branding = useAppBranding();
  const router = useRouter();
  const user = useAuthUser();
  const sessionActions = useAuthSessionActions();
  const { theme, setTheme, resolvedTheme, themeLabel } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [switchingPark, setSwitchingPark] = useState(false);
  const [parkMessage, setParkMessage] = useState("");
  const accessibleParks = useMemo(() => (
    (user?.accessible_parks ?? []).filter((park) => park.status === "enabled")
  ), [user?.accessible_parks]);
  const currentParkName = user?.current_park?.park_name ?? user?.park_name ?? user?.park_id ?? "当前园区";

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 650);
  };

  const logout = async () => {
    try {
      await logoutSession();
    } finally {
      router.replace("/login");
    }
  };

  const switchPark = async (parkId: string) => {
    if (!user || !parkId || parkId === user.park_id || switchingPark) return;
    setSwitchingPark(true);
    setParkMessage("");
    try {
      const nextUser = await switchParkContext(parkId);
      sessionActions?.publishUser(nextUser, { remountScopedPages: true });
      router.refresh();
    } catch (error) {
      setParkMessage(error instanceof Error ? error.message : "园区切换失败");
      if (!getToken()) router.replace("/login");
    } finally {
      setSwitchingPark(false);
    }
  };

  return (
    <header className="mobile-terminal-header">
      <div className="mobile-terminal-brand">
        <img alt={branding.logoAlt} src={resolveBrandLogo(branding, "/brand/jinhupark-symbol.svg")} />
        <span>
          <strong>{branding.systemName}</strong>
          <small>移动作业终端</small>
        </span>
      </div>
      <nav aria-label="终端快捷操作" className="mobile-terminal-actions">
        <label className="mobile-terminal-park-switcher" title={currentParkName}>
          <MapPin size={18} />
          <select
            aria-label="切换园区"
            disabled={switchingPark || accessibleParks.length <= 1}
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
        <Link aria-label="客户端下载" href="/system/client-downloads" title="客户端下载">
          <Download size={18} />
        </Link>
        <Link aria-label="返回作业终端" href="/operations/terminal" title="返回作业终端">
          <Home size={18} />
        </Link>
        <button aria-label="刷新当前任务" className={refreshing ? "is-refreshing" : undefined} title="刷新当前任务" type="button" onClick={refresh}>
          <RefreshCw size={18} />
        </button>
        <button
          aria-label={`切换深浅色，当前为${themeLabel}`}
          title={`切换深浅色：${themeLabel}`}
          type="button"
          onClick={() => setTheme(theme === "command-dark" || theme === "dark" ? "enterprise-light" : "command-dark")}
        >
          {resolvedTheme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button aria-label="退出登录" title="退出登录" type="button" onClick={() => void logout()}>
          <LogOut size={18} />
        </button>
      </nav>
      {parkMessage ? <span className="mobile-terminal-park-message" role="alert">{parkMessage}</span> : null}
    </header>
  );
}
