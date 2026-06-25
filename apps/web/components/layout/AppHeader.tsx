"use client";

import { Button } from "antd";
import { ListTodo, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { useAuthUser } from "../../lib/auth-context";
import { hasAccess } from "../../lib/permissions";
import { useAppBranding } from "../branding/useAppBranding";
import { useTheme } from "../theme/ThemeProvider";
import { UserMenu } from "./UserMenu";

interface AppHeaderProps {
  breadcrumb?: ReactNode;
  sidebarCollapsed: boolean;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
}

export function AppHeader({ breadcrumb, sidebarCollapsed, onSidebarCollapsedChange }: AppHeaderProps) {
  const branding = useAppBranding();
  const user = useAuthUser();
  const { theme, setTheme, resolvedTheme, themeLabel } = useTheme();
  const canOpenWorkflowInbox = hasAccess(user, SYSTEM_PERMISSIONS.WORKORDER_READ, "workorder");

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
        <div className="header-brand-lockup">
          <img alt={branding.logoAlt} className="header-brand-symbol" src="/brand/jinhupark-symbol.svg" />
          <strong>{branding.systemName}</strong>
        </div>
        {breadcrumb ? <div className="header-context-line header-breadcrumb-slot">{breadcrumb}</div> : null}
      </div>
      <div className="header-actions">
        {canOpenWorkflowInbox ? (
          <Link aria-label="流程收件箱" className="header-icon-link header-workflow-link" href="/workflow/inbox" title="流程收件箱">
            <ListTodo size={16} />
          </Link>
        ) : null}
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
