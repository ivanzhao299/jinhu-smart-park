"use client";

import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import {
  ContentCard,
  DataTable,
  EmptyState,
  ErrorState,
  FeedbackNotice,
  FilterPanel,
  LoadingState,
  PageHeader,
  PageShell,
  PaginationBar,
  StatusPill
} from "@jinhu/ui";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenPage, CanteenStatusLog } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const emptyPage: CanteenPage<CanteenStatusLog> = { list: [], total: 0, page: 1, pageSize: 20 };

const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: "order", label: "订单" },
  { value: "payment", label: "支付" },
  { value: "settlement", label: "结算" },
  { value: "grant", label: "补贴发放" },
  { value: "refund", label: "退款" },
  { value: "session", label: "收银班次" },
  { value: "dish", label: "菜品" }
];

const ENTITY_VARIANT: Record<string, "info" | "success" | "warning" | "danger" | "primary" | "muted"> = {
  order: "info",
  payment: "primary",
  settlement: "warning",
  grant: "success",
  refund: "danger",
  session: "primary",
  dish: "muted"
};

interface Filters {
  entityType: string;
  action: string;
  operatorName: string;
  startDate: string;
  endDate: string;
}

const emptyFilters: Filters = { entityType: "", action: "", operatorName: "", startDate: "", endDate: "" };

export default function CanteenAuditPage() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [pageData, setPageData] = useState<CanteenPage<CanteenStatusLog>>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.pageSize)), [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await canteenApi.listStatusLogs(
        {
          page,
          pageSize: 20,
          entity_type: filters.entityType || undefined,
          action: filters.action || undefined,
          operator_name: filters.operatorName || undefined,
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined
        },
        getAccessToken()
      );
      setPageData(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载日志失败");
      setPageData(emptyPage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(1).catch((e: Error) => setLoadError(e.message));
  }, [load]);

  const fmtTime = (v?: string | null) =>
    v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "-";
  const entityLabel = (v: string) => ENTITY_TYPES.find((t) => t.value === v)?.label ?? v;

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.SETTLEMENT_VIEW}>
      <PageShell className="canteen-audit-page">
        <PageHeader
          title="操作审计 / 状态日志"
          description="订单/支付/结算/发放/退款/班次/菜品的状态迁移流水，追加不可改，审计留存。"
          actions={
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((e: Error) => setMessage(e.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          }
        />

        <FilterPanel>
          <Field label="对象类型">
            <select value={filters.entityType} onChange={(e) => setFilters((c) => ({ ...c, entityType: e.target.value }))}>
              <option value="">全部</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="动作">
            <input value={filters.action} placeholder="如 settle / shelf_on" onChange={(e) => setFilters((c) => ({ ...c, action: e.target.value }))} />
          </Field>
          <Field label="操作人">
            <input value={filters.operatorName} placeholder="姓名/账号模糊" onChange={(e) => setFilters((c) => ({ ...c, operatorName: e.target.value }))} />
          </Field>
          <Field label="开始日期">
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((c) => ({ ...c, startDate: e.target.value }))} />
          </Field>
          <Field label="结束日期">
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((c) => ({ ...c, endDate: e.target.value }))} />
          </Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((e: Error) => setLoadError(e.message))}>
            <Search size={16} />
            查询
          </button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>{message}</FeedbackNotice> : null}

        <ContentCard title="状态变更日志" description={`共 ${pageData.total} 条。`}>
          {loadError ? (
            <ErrorState title="日志加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void load(pageData.page)}>重试</button>} />
          ) : loading ? (
            <LoadingState title="正在加载日志" />
          ) : (
            <DataTable className="allow-horizontal-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>对象类型</th>
                  <th>动作</th>
                  <th>变更前 → 后</th>
                  <th>操作人</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {pageData.list.map((log) => (
                  <tr key={log.id}>
                    <td>{fmtTime(log.opTime ?? log.createdAt)}</td>
                    <td><StatusPill variant={ENTITY_VARIANT[log.entityType] ?? "muted"}>{entityLabel(log.entityType)}</StatusPill></td>
                    <td>{log.action}</td>
                    <td>{log.beforeStatus ?? "—"} → {log.afterStatus}</td>
                    <td>{log.operatorName ?? "-"}</td>
                    <td>{log.reason ?? "-"}</td>
                  </tr>
                ))}
                {pageData.list.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState compact title="暂无日志" description="调整筛选条件。" /></td></tr>
                ) : null}
              </tbody>
            </DataTable>
          )}
          <PaginationBar page={pageData.page} totalPages={totalPages} total={pageData.total} onPage={(p) => void load(p).catch((e: Error) => setLoadError(e.message))} />
        </ContentCard>
      </PageShell>
    </PermissionGuard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
