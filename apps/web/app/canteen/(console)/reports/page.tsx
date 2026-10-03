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
  MetricCard,
  PageHeader,
  PageShell,
  ShareBar
} from "@jinhu/ui";
import { AlertTriangle, RefreshCw, Search, Receipt, QrCode, Wallet, Undo2, Users } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenOutlet, CanteenReportShareRow, CanteenReportSummary } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const EMPTY_SUMMARY: CanteenReportSummary = {};

interface Filters {
  outletId: string;
  startDate: string;
  endDate: string;
}

export default function CanteenReportsPage() {
  const [outlets, setOutlets] = useState<CanteenOutlet[]>([]);
  const [filters, setFilters] = useState<Filters>({ outletId: "", startDate: "", endDate: "" });
  const [summary, setSummary] = useState<CanteenReportSummary>(EMPTY_SUMMARY);
  const [rows, setRows] = useState<CanteenReportShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    canteenApi.listOutlets(getAccessToken()).then(setOutlets).catch((e: Error) => setMessage(e.message));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [s, r] = await Promise.all([
        canteenApi.getReportSummary({
          outlet_id: filters.outletId || undefined,
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined
        }, getAccessToken()),
        canteenApi.getReportShareRows({
          outlet_id: filters.outletId || undefined,
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined
        }, getAccessToken()).catch(() => [] as CanteenReportShareRow[])
      ]);
      setSummary(s ?? EMPTY_SUMMARY);
      setRows(r ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载报表失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load().catch((e: Error) => setLoadError(e.message));
  }, [load]);

  const fmt = (v?: string) => `¥${Number(v || 0).toFixed(2)}`;

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.REPORT_VIEW}>
      <PageShell className="canteen-reports-page">
        <PageHeader
          title="经营报表"
          description="按档口与日期区间查看销售额、订单量、客单价、餐补核销与退款（轻量占比条形，无图表依赖）。"
          actions={
            <button className="secondary-button" type="button" onClick={() => void load().catch((e: Error) => setMessage(e.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          }
        />

        <FilterPanel>
          <Field label="档口">
            <select value={filters.outletId} onChange={(e) => setFilters((c) => ({ ...c, outletId: e.target.value }))}>
              <option value="">全部档口</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
          <Field label="开始日期">
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((c) => ({ ...c, startDate: e.target.value }))} />
          </Field>
          <Field label="结束日期">
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((c) => ({ ...c, endDate: e.target.value }))} />
          </Field>
          <button className="primary-button" type="button" onClick={() => void load().catch((e: Error) => setLoadError(e.message))}>
            <Search size={16} />
            查询
          </button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>{message}</FeedbackNotice> : null}

        {loadError ? (
          <ErrorState title="报表加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void load()}>重试</button>} />
        ) : loading ? (
          <LoadingState title="正在生成报表" />
        ) : (
          <>
            <section className="dashboard-grid canteen-summary-grid">
              <MetricCard icon={<Receipt size={18} />} label="订单量" value={summary.orderCount ?? 0} />
              <MetricCard icon={<Users size={18} />} label="客单价" value={fmt(summary.avgTicket)} />
              <MetricCard icon={<QrCode size={18} />} label="扫码收款(元)" value={Number(summary.qrPayTotal || 0).toFixed(2)} />
              <MetricCard icon={<Wallet size={18} />} label="餐补核销(元)" value={Number(summary.subsidyTotal || 0).toFixed(2)} />
              <MetricCard icon={<Undo2 size={18} />} label="退款(元)" value={Number(summary.refundTotal || 0).toFixed(2)} />
              <MetricCard icon={<Receipt size={18} />} label="总营业额(元)" value={Number(summary.totalSales || 0).toFixed(2)} />
            </section>

            <ContentCard title="餐品/品类销售占比" description="按销售额降序，条形长度为占区间最大值比例。">
              {rows.length === 0 ? (
                <EmptyState compact title="暂无数据" description="调整日期区间，或等待 POS 产生销售。" />
              ) : (
                <ShareBar rows={rows} formatAmount={(a) => fmt(a)} aria-label="销售占比" />
              )}
            </ContentCard>

            <ContentCard title="销售明细" description="按后端报表口径返回的分类行。">
              <DataTable>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>金额</th>
                    <th>订单量</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{fmt(r.amount)}</td>
                      <td>{r.orderCount ?? "-"}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr><td colSpan={3}><p className="muted-text">暂无明细</p></td></tr>
                  ) : null}
                </tbody>
              </DataTable>
            </ContentCard>
          </>
        )}
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
