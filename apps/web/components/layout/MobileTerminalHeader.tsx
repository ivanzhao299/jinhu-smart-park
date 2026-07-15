"use client";

import { Home, LogOut, Moon, RefreshCw, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutSession } from "../../lib/auth";
import { useAppBranding } from "../branding/useAppBranding";
import { useTheme } from "../theme/ThemeProvider";

export function MobileTerminalHeader() {
  const branding = useAppBranding();
  const router = useRouter();
  const { theme, setTheme, resolvedTheme, themeLabel } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <header className="mobile-terminal-header">
      <div className="mobile-terminal-brand">
        <img alt={branding.logoAlt} src="/brand/jinhupark-symbol.svg" />
        <span>
          <strong>{branding.systemName}</strong>
          <small>移动作业终端</small>
        </span>
      </div>
      <nav aria-label="终端快捷操作" className="mobile-terminal-actions">
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
    </header>
  );
}
