"use client";

import { Button } from "antd";
import { Building2, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useAppBranding } from "../branding/useAppBranding";
import { useTheme } from "../theme/ThemeProvider";
import { useAuthUser } from "../../lib/auth-context";
import { UserMenu } from "./UserMenu";

interface AppHeaderProps {
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
}

export function AppHeader({ sidebarCollapsed, onSidebarCollapsedChange }: AppHeaderProps) {
  const user = useAuthUser();
  const branding = useAppBranding();
  const { theme, setTheme, resolvedTheme, themeLabel } = useTheme();

  const roleNames = user?.roles.map((role) => role.role_name).join(" / ") || "-";
  const currentParkName = user?.current_park?.park_name ?? user?.park_name ?? user?.park_id ?? "-";
  const handleThemeChange = () => {
    setTheme(theme === "command-dark" || theme === "dark" ? "enterprise-light" : "command-dark");
  };

  return (
    <header className="app-header">
      <div className="header-leading">
        <Button
          aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          className="header-icon-button header-sidebar-toggle"
          icon={sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          type="text"
          onClick={() => onSidebarCollapsedChange(!sidebarCollapsed)}
        />
        <div className="header-title">
          <strong>{branding.systemName}</strong>
          <span>
            <Building2 size={14} />
            园区：{currentParkName} · 角色：{roleNames}
          </span>
        </div>
      </div>
      <div className="header-actions">
        <Button
          aria-label={`切换深浅色，当前为${themeLabel}`}
          className="header-icon-button"
          icon={resolvedTheme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          title={`切换深浅色：${themeLabel}`}
          type="text"
          onClick={handleThemeChange}
        />
        <UserMenu />
      </div>
    </header>
  );
}
