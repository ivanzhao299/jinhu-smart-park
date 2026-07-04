"use client";

import { Button } from "antd";
import { ListTodo, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  terminalMode?: boolean;
}

export function AppHeader({ breadcrumb, sidebarCollapsed, onSidebarCollapsedChange, terminalMode }: AppHeaderProps) {
  const branding = useAppBranding();
  const user = useAuthUser();
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme, themeLabel } = useTheme();
  const canOpenWorkflowInbox = hasAccess(user, SYSTEM_PERMISSIONS.WORKORDER_READ, "workorder");
  const isTerminalRoute = terminalMode ?? (pathname ? TERMINAL_HEADER_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) : false);

  const handleThemeChange = () => {
    setTheme(theme === "command-dark" || theme === "dark" ? "enterprise-light" : "command-dark");
  };

  const sidebarToggleButton = (placement: "leading" | "actions") => (
    <Button
      aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
      className={`header-icon-button header-sidebar-toggle header-sidebar-toggle-${placement}`}
      icon={sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
      type="text"
      onClick={() => onSidebarCollapsedChange(!sidebarCollapsed)}
    />
  );

  return (
    <header className={`app-header${isTerminalRoute ? " app-header-terminal" : ""}`} data-terminal-header={isTerminalRoute ? "true" : "false"}>
      <div className="header-leading">
        {sidebarToggleButton("leading")}
        <div className="header-brand-lockup">
          <img alt={branding.logoAlt} className="header-brand-symbol" src="/brand/jinhupark-symbol.svg" />
          <div className="header-brand-copy">
            <strong>{branding.systemName}</strong>
            <span>{branding.shortName}</span>
          </div>
        </div>
        {breadcrumb ? <div className="header-context-line header-breadcrumb-slot">{breadcrumb}</div> : null}
      </div>
      <div className="header-actions">
        {sidebarToggleButton("actions")}
        {!isTerminalRoute && canOpenWorkflowInbox ? (
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
        <UserMenu compact />
      </div>
    </header>
  );
}

const TERMINAL_HEADER_PATHS = [
  "/operations/terminal",
  "/preview/operations-terminal",
  "/engineering/terminal",
  "/tenant/service",
  "/preview/tenant-service",
  "/safety/my-inspect-tasks"
] as const;
