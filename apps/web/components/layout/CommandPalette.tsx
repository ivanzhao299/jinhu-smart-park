"use client";

import { Search } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthUser } from "../../lib/auth-context";
import { buildNavigationCommands, filterNavigationCommands } from "../../lib/command-palette";
import { getUserCommandMenus } from "../../lib/menu";
import styles from "./CommandPalette.module.css";

export function CommandPalette() {
  const user = useAuthUser();
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const scopeKey = JSON.stringify([
    user?.tenant_id, user?.park_id, user?.id, user?.permissions,
    user?.enabled_modules?.map(({ module_code, enabled }) => [module_code, enabled]),
    user?.menu_tree ?? user?.menus
  ]);
  const commands = useMemo(() => buildNavigationCommands(getUserCommandMenus(user), user), [user]);
  const results = useMemo(() => filterNavigationCommands(commands, query), [commands, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  useEffect(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, [scopeKey]);

  useEffect(() => {
    if (open) queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  const navigate = (href: string) => {
    close();
    router.push(href as Route);
  };

  return <>
    <button ref={triggerRef} aria-label="打开全局导航" className={`header-icon-button ${styles.trigger}`} type="button" onClick={() => setOpen(true)}>
      <Search size={16} />
      <span className={styles.shortcut}>⌘K</span>
    </button>
    {open ? <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        ref={dialogRef}
        aria-label="全局导航"
        aria-modal="true"
        className={`ds-panel ${styles.palette}`}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); return; }
          if (event.key !== "Tab") return;
          const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input, button:not([disabled])') ?? [])];
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
      >
        <label className={styles.search}>
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">搜索可访问页面</span>
          <input
            ref={inputRef}
            aria-activedescendant={results[activeIndex] ? `command-${activeIndex}` : undefined}
            aria-controls="command-palette-results"
            aria-expanded="true"
            aria-label="搜索可访问页面"
            role="combobox"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, results.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)); }
              if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); navigate(results[activeIndex].href); }
            }}
          />
        </label>
        <div className={styles.results} id="command-palette-results" role="listbox">
          {results.length ? results.map((command, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? styles.active : undefined}
              id={`command-${index}`}
              key={command.href}
              role="option"
              type="button"
              onClick={() => navigate(command.href)}
            >
              <span>{command.label}</span><small>{command.group}</small>
            </button>
          )) : <p className={styles.empty}>没有匹配的可访问页面</p>}
        </div>
        <footer>仅显示当前园区与当前权限下的导航入口 · Esc 关闭</footer>
      </div>
    </div> : null}
  </>;
}
