"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Mail, RefreshCw } from "lucide-react";
import { SYSTEM_PERMISSIONS as P } from "@jinhu/shared";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { apiRequest, isForbiddenError } from "../../../lib/api-client";
import { getToken } from "../../../lib/auth";
import { hasAccess } from "../../../lib/permissions";
import { useScopedOperation } from "../../../lib/use-scoped-operation";
import { operationScopeKey } from "../../../lib/runtime-context";
import { findMenusByPath, getUserDashboardAuthorizationMenus } from "../../../lib/menu";
import { resolveDashboardRouteDenial } from "../../../lib/dashboard-route-access";
import styles from "./messages.module.css";

interface Message { id: string; title: string; content: string | null; senderName: string | null; createTime: string; readAt: string | null; targetUrl?: string | null }
interface Page { items: Message[]; total: number; page: number; page_size: number }

export function MessagesClient() {
  const user = useAuthUser();
  const enterprise = user?.runtime_mode === "hr_enterprise";
  const allowed = hasAccess(user, enterprise ? undefined : P.WORKORDER_READ, enterprise ? "workflow" : "workorder");
  const scope = operationScopeKey(user);
  const [page, setPage] = useState(1), [status, setStatus] = useState("all"), [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<Page | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [denied, setDenied] = useState(false);
  const sequence = useRef(0);
  const operation = useScopedOperation(`${scope}:${denied}`);
  const reload = () => setRefresh((value) => value + 1);
  useEffect(() => { setRows(null); setPage(1); setStatus("all"); }, [scope]);
  useEffect(() => {
    const generation = ++sequence.current;
    if (!allowed) { setRows(null); return; }
    setLoading(true); setError(""); setDenied(false);
    void apiRequest<Page>(`/workflow/messages?page=${page}&page_size=20&read_status=${status}`, { token: getToken() }).then(({ data }) => {
      if (generation !== sequence.current) return;
      if (!Array.isArray(data.items) || !Number.isInteger(data.total)) throw new Error("消息响应不完整，请刷新读取");
      const last = Math.max(1, Math.ceil(data.total / 20));
      if (page > last) { setPage(last); return; }
      setRows(data);
    }).catch((cause: unknown) => {
      if (generation !== sequence.current) return;
      if (isForbiddenError(cause)) { setRows(null); setDenied(true); }
      setError(cause instanceof Error ? cause.message : "消息读取失败");
    }).finally(() => { if (generation === sequence.current) setLoading(false); });
    return () => { sequence.current++; };
  }, [scope, allowed, page, status, refresh]);
  const committed = () => { setRows(null); reload(); };
  const businessTarget = (target: string | null | undefined): Route | null => {
    if (!user || !target || !/^\/hr(?:\/|$)/.test(target) || target.includes("\\") || [...target].some(character => character.charCodeAt(0) <= 32)) return null;
    try {
      const parsed = new URL(target, "https://hr.invalid");
      if (parsed.origin !== "https://hr.invalid" || `${parsed.pathname}${parsed.search}${parsed.hash}` !== target) return null;
      const requirements = findMenusByPath(parsed.pathname, getUserDashboardAuthorizationMenus(user));
      return requirements.length > 0 && !resolveDashboardRouteDenial(user, requirements) ? target as Route : null;
    } catch { return null; }
  };

  return <PermissionGuard permission={enterprise ? undefined : P.WORKORDER_READ} module={enterprise ? "workflow" : "workorder"} fallback={<main className="ds-page"><p role="alert">没有消息读取权限。</p></main>}>
    <main className={`ds-page ${styles.page}`}>
      <header className="ds-hero"><div><h1><Mail size={24} /> 我的消息</h1><p>查看本企业范围内发送给本人的通知。</p></div><button className="ds-button ds-button-secondary" disabled={loading || operation.writing} onClick={reload}><RefreshCw size={16} /> 刷新读取</button></header>
      {operation.success ? <p role="status">{operation.success}</p> : null}
      {operation.error ? <p role="alert">{operation.error}</p> : null}
      {operation.pending ? <button className="ds-button ds-button-primary" disabled={operation.writing} onClick={operation.retry}>重试原请求</button> : null}
      {error ? <p role="alert">{error}；已完成的标记无需重复提交。</p> : null}
      <section className={`ds-panel ${styles.panel}`}><div className={styles.actions}>
        <label className="form-field">阅读状态<select value={status} disabled={operation.locked} onChange={(event) => { setStatus(event.target.value); setPage(1); setRows(null); }}><option value="all">全部</option><option value="unread">未读</option><option value="read">已读</option></select></label>
        <button className="ds-button ds-button-secondary" disabled={operation.locked || denied || !rows?.total} onClick={() => operation.write("/workflow/messages/read-all", "POST", undefined, (value) => Boolean(value && typeof value === "object" && Number.isInteger((value as { updated?: unknown }).updated)), committed)}>全部标为已读</button>
      </div>
      {loading ? <p role="status">正在读取消息…</p> : null}
      <div className="ds-scene-grid">{rows?.items.map((item) => {
        const target = businessTarget(item.targetUrl);
        return <article className={`ds-panel ${styles.record}`} key={item.id}><h2>{item.title}</h2><p>{item.readAt ? "已读" : "未读"} · {item.senderName || "系统通知"}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.content || "请查看相关业务记录。"}</p><p>{new Date(item.createTime).toLocaleString("zh-CN")}</p>{target ? <Link className="ds-button ds-button-primary" href={target}>查看业务</Link> : null}{!item.readAt ? <button className="ds-button ds-button-secondary" disabled={operation.locked || denied} onClick={() => operation.write(`/workflow/messages/${item.id}/read`, "POST", undefined, (value) => Boolean(value && typeof value === "object" && (value as Message).id === item.id && typeof (value as Message).readAt === "string"), committed)}>标为已读</button> : null}</article>;
      })}</div>
      {!loading && rows?.total === 0 ? <p>暂无符合条件的消息。</p> : null}
      <div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={page <= 1 || loading || operation.locked} onClick={() => { setRows(null); setPage(page - 1); }}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil((rows?.total ?? 0) / 20))} 页 · 共 {rows?.total ?? 0} 条</span><button className="ds-button ds-button-secondary" disabled={!rows || page * 20 >= rows.total || loading || operation.locked} onClick={() => { setRows(null); setPage(page + 1); }}>下一页</button></div>
      </section>
    </main>
  </PermissionGuard>;
}
