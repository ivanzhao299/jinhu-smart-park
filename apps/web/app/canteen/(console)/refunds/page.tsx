"use client";

import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import {
  ContentCard,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerHeader,
  DrawerFooter,
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
import { AlertTriangle, Eye, RefreshCw, Search, Check, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenPage, CanteenRefund } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const emptyPage: CanteenPage<CanteenRefund> = { list: [], total: 0, page: 1, pageSize: 20 };

interface Filters {
  status: string;
  type: string;
}

export default function CanteenRefundsPage() {
  const [filters, setFilters] = useState<Filters>({ status: "", type: "" });
  const [pageData, setPageData] = useState<CanteenPage<CanteenRefund>>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<CanteenRefund | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.pageSize)), [pageData]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await canteenApi.listRefunds(
        { page, pageSize: 20, status: filters.status || undefined, type: filters.type || undefined },
        getAccessToken()
      );
      setPageData(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载退款单失败");
      setPageData(emptyPage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(1).catch((e: Error) => setLoadError(e.message));
  }, [load]);

  async function audit(verdict: "approve" | "reject") {
    if (!detail) return;
    setBusy(true);
    try {
      const updated = await canteenApi.auditRefund(detail.id, verdict, getAccessToken());
      setDetail(updated);
      setMessage(verdict === "approve" ? "已通过，原路退款" : "已拒绝");
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审核失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.REFUND_VIEW}>
      <PageShell className="canteen-refunds-page">
        <PageHeader
          title="退款/撤单"
          description="按状态审核退款单：真实收款原路退回、餐补回补钱包；撤单仅允许支付前。"
          actions={
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((e: Error) => setMessage(e.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          }
        />

        <FilterPanel>
          <Field label="状态">
            <select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="">全部</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="succeeded">已退款</option>
              <option value="failed">失败</option>
            </select>
          </Field>
          <Field label="类型">
            <select value={filters.type} onChange={(e) => setFilters((c) => ({ ...c, type: e.target.value }))}>
              <option value="">全部</option>
              <option value="void_before_pay">支付前撤单</option>
              <option value="refund_after_pay">支付后退款</option>
            </select>
          </Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((e: Error) => setLoadError(e.message))}>
            <Search size={16} />
            查询
          </button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>{message}</FeedbackNotice> : null}

        <ContentCard title="退款/撤单单" description={`共 ${pageData.total} 笔。`}>
          {loadError ? (
            <ErrorState title="退款单加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void load(pageData.page)}>重试</button>} />
          ) : loading ? (
            <LoadingState title="正在加载" />
          ) : (
            <DataTable className="allow-horizontal-table">
              <thead>
                <tr>
                  <th>退款单号</th>
                  <th>关联订单</th>
                  <th>类型</th>
                  <th>金额</th>
                  <th>退款渠道</th>
                  <th>状态</th>
                  <th>完成时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.refundNo}</td>
                    <td>{r.orderNo ?? r.orderId.slice(0, 8)}</td>
                    <td>{r.type === "void_before_pay" ? "撤单" : "退款"}</td>
                    <td>¥{r.amount}</td>
                    <td>{r.refundChannel === "subsidy" ? "餐补回补" : "原路退回"}</td>
                    <td><RefundStatusPill status={r.status} /></td>
                    <td>{r.finishTime ? new Date(r.finishTime).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                    <td>
                      <DataTableActions>
                        <button className="table-action-button" type="button" onClick={() => setDetail(r)}>
                          <Eye size={15} />
                          详情
                        </button>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {pageData.list.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState compact title="暂无退款单" description="退款/撤单在 POS 或订单流水发起。" /></td></tr>
                ) : null}
              </tbody>
            </DataTable>
          )}
          <PaginationBar page={pageData.page} totalPages={totalPages} total={pageData.total} onPage={(p) => void load(p).catch((e: Error) => setLoadError(e.message))} />
        </ContentCard>

        {detail ? (
          <Drawer size="md" onClose={() => setDetail(null)}>
            <DrawerHeader eyebrow="退款详情" title={detail.refundNo} description={`订单 ${detail.orderNo ?? detail.orderId}`} onClose={() => setDetail(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="状态" value={<RefundStatusPill status={detail.status} />} />
              <DrawerDetailItem label="类型" value={detail.type === "void_before_pay" ? "支付前撤单" : "支付后退款"} />
              <DrawerDetailItem label="退款金额" value={`¥${detail.amount}`} />
              <DrawerDetailItem label="退款渠道" value={detail.refundChannel === "subsidy" ? "餐补回补" : "原路退回"} />
              <DrawerDetailItem label="原因" value={detail.reason ?? "-"} />
              <DrawerDetailItem label="完成时间" value={detail.finishTime ? new Date(detail.finishTime).toLocaleString("zh-CN", { hour12: false }) : "-"} />
            </DrawerDetailGrid>
            {detail.status === "pending" ? (
              <PermissionGuard permission={CANTEEN_PERMISSIONS.ORDER_AUDIT} module={CANTEEN_MODULE}>
                <DrawerFooter>
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => void audit("reject").catch((e: Error) => setMessage(e.message))}>
                    <X size={16} />
                    拒绝
                  </button>
                  <button className="primary-button" type="button" disabled={busy} onClick={() => void audit("approve").catch((e: Error) => setMessage(e.message))}>
                    <Check size={16} />
                    审核通过·原路退款
                  </button>
                </DrawerFooter>
              </PermissionGuard>
            ) : null}
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

function RefundStatusPill({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "danger" | "warning" | "muted" | "info" | "primary"; label: string }> = {
    pending: { variant: "warning", label: "待审核" },
    approved: { variant: "primary", label: "已通过" },
    succeeded: { variant: "success", label: "已退款" },
    failed: { variant: "danger", label: "失败" }
  };
  const cfg = map[status] ?? { variant: "muted" as const, label: status };
  return <StatusPill variant={cfg.variant}>{cfg.label}</StatusPill>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
