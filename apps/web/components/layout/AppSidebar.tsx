"use client";

import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { getDashboardMenus, type MenuNode } from "../../lib/menu";
import { hasAccess, hasAnyPermission, hasModule } from "../../lib/permissions";

interface AppSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function AppSidebar({ collapsed, onCollapsedChange }: AppSidebarProps) {
  const pathname = usePathname();
  const user = useAuthUser();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [suppressPreview, setSuppressPreview] = useState(false);
  const sourceMenus = useMemo(() => getDashboardMenus(user?.menus ?? user?.menu_tree), [user]);
  const menus = useMemo(
    () =>
      sourceMenus
        .map((menu) => ({
          ...menu,
          children: menu.children?.filter((child) => hasAccess(user, child.permission, child.module ?? menu.module))
        }))
        .filter(
          (menu) =>
            hasModule(user, menu.module) &&
            ((menu.href && hasAccess(user, menu.permission, menu.module)) ||
              hasAnyPermission(user, menu.children?.map((child) => child.permission ?? "") ?? []) ||
              Boolean(menu.children?.some((child) => !child.permission)))
        ),
    [sourceMenus, user]
  );

  useEffect(() => {
    const activeMenu = menus.find((menu) => isMenuActive(menu, pathname));
    if (!activeMenu) {
      return;
    }
    setOpenGroup(activeMenu.label);
  }, [menus, pathname]);

  const isPreviewing = collapsed && previewOpen;
  const toggleGroup = (label: string) => {
    if (collapsed && !isPreviewing) {
      setPreviewOpen(true);
      setSuppressPreview(false);
    }
    setOpenGroup((current) => (current === label ? null : label));
  };

  return (
    <aside
      aria-label="主导航"
      className={`app-sidebar${collapsed ? " sidebar-collapsed" : ""}${isPreviewing ? " sidebar-preview" : ""}`}
      data-collapsed={collapsed ? "true" : "false"}
      onBlur={(event) => {
        const nextFocusedElement = event.relatedTarget;
        if (!nextFocusedElement || !event.currentTarget.contains(nextFocusedElement)) {
          setPreviewOpen(false);
        }
      }}
      onFocus={() => {
        if (collapsed && !suppressPreview) {
          setPreviewOpen(true);
        }
      }}
      onMouseEnter={() => {
        if (collapsed && !suppressPreview) {
          setPreviewOpen(true);
        }
      }}
      onMouseLeave={() => {
        setPreviewOpen(false);
        setSuppressPreview(false);
      }}
    >
      <div className="sidebar-brand-row">
        <div className="brand">
          <span className="brand-mark">
            <img alt="金湖科创产业园" className="brand-mark-image" src="/brand/jinhu-park-symbol.png" />
          </span>
          <span className="brand-title">金湖科创产业园</span>
        </div>
        <button
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          className="sidebar-collapse-button"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          type="button"
          onClick={(event) => {
            const nextCollapsed = !collapsed;
            onCollapsedChange(nextCollapsed);
            if (nextCollapsed) {
              setPreviewOpen(false);
              setSuppressPreview(true);
              event.currentTarget.blur();
            } else {
              setSuppressPreview(false);
            }
          }}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav className="sidebar-menu">
        {menus.map((menu) => (
          <MenuGroup
            key={menu.label}
            menu={menu}
            pathname={pathname}
            open={openGroup === menu.label}
            onToggle={() => toggleGroup(menu.label)}
          />
        ))}
      </nav>
    </aside>
  );
}

function MenuGroup({
  menu,
  pathname,
  open,
  onToggle
}: {
  menu: MenuNode;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = menu.icon;
  return (
    <section className={`menu-group${open ? " menu-group-open" : ""}`}>
      <button className="menu-group-title" type="button" aria-expanded={open} onClick={onToggle}>
        {Icon ? <Icon className="menu-group-icon" size={18} /> : null}
        <span>{menu.label}</span>
        <ChevronRight className="menu-group-chevron" size={14} />
      </button>
      <div className={`menu-group-items${open ? "" : " menu-group-items-closed"}`} aria-hidden={!open}>
        {menu.children?.map((child) => {
          const isActive = isChildActive(pathname, child.href, true);
          return (
            <Link
              className={`nav-link${isActive ? " active" : ""}`}
              href={(child.href ?? "/dashboard") as Route}
              key={child.href}
              tabIndex={open ? undefined : -1}
            >
              {child.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function isMenuActive(menu: MenuNode, pathname: string): boolean {
  return isChildActive(pathname, menu.href) || Boolean(menu.children?.some((child) => isChildActive(pathname, child.href)));
}

function isChildActive(pathname: string, href?: string, exact = false): boolean {
  if (!href) return false;
  if (pathname === href) return true;
  if (pathname === "/assets/rooms" && href === "/assets/units") return true;
  if (exact) return false;
  return pathname.startsWith(`${href}/`);
}
