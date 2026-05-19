"use client";

import { Button } from "antd";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { UserMenu } from "./UserMenu";

const THEME_KEY = "jinhu_theme";

export function AppHeader() {
  const user = useAuthUser();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const roleNames = user?.roles.map((role) => role.role_name).join(" / ") || "-";
  const currentParkName = user?.current_park?.park_name ?? user?.park_name ?? user?.park_id ?? "-";

  return (
    <header className="app-header">
      <div className="header-title">
        <strong>金湖科创产业园 SaaS</strong>
        <span>园区：{currentParkName} · 角色：{roleNames}</span>
      </div>
      <div className="header-actions">
        <Button
          aria-label="切换主题"
          className="header-icon-button"
          icon={theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          title="切换主题"
          type="text"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        />
        <UserMenu />
      </div>
    </header>
  );
}
