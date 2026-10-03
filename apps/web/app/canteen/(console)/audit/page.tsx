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
  PaginationBar
} from "@jinhu/ui";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenPage, CanteenStatusLog } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const emptyPage: CanteenPage<CanteenStatusLog> = { list: [], total: 0, page: 1, pageSize: 20 };

interface Filters {
  entityType: string;
}

export default function CanteenAuditPage() {
  const [filters, setFilters] = useState<Filters>({ entityType: "" });
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
        { page, pageSize: 20, entity_type: filters.entityType || undefined },
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

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.SETTLEMENT_VIEW}>
      <PageShell className="canteen-audit-page">
        <PageHeader
          title="操作审计 / 状态日志"
          description="订单/支付/结算/发放/退款的状态迁移流水，追加不可改，审计留存。"
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
              <option value="order">订单</option>
              <option value="payment">支付</option>
              <option value="settlement">结算</option>
              <option value="grant">补贴发放</option>
              <option value="refund">退款</option>
            </select>
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
                  <th>对象</th>
                  <th>动作</th>
                  <th>变更前 → 后</th>
                  <th>操作人</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {pageData.list.map((log) => (
                  <tr key={log.id}>
                    <td>{log.createdAt ? new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                    <td>{log.entityType}</td>
                    <td>{log.action}</td>
                    <td>{log.beforeStatus ?? "—"} → {log.afterStatus}</td>
                    <td>{log.operatorName ?? "-"}</td>
                    <td>{log.reason ?? "-"}</td>
                  </tr>
                ))}
                {pageData.list.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState compact title="暂无日志" description="调整对象类型筛选。" /></td></tr>
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
