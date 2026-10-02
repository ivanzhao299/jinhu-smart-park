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
  EmptyState,
  ErrorState,
  FeedbackNotice,
  FilterPanel,
  LoadingState,
  MetricCard,
  PageHeader,
  PageShell,
  PaginationBar,
  StatusPill
} from "@jinhu/ui";
import { AlertTriangle, Eye, RefreshCw, Search, Clock, QrCode, Wallet, Receipt } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenCashierSession, CanteenOutlet, CanteenPage } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const emptyPage: CanteenPage<CanteenCashierSession> = { list: [], total: 0, page: 1, pageSize: 20 };

interface Filters {
  outletId: string;
  status: string;
}

export default function CanteenSessionsPage() {
  const [outlets, setOutlets] = useState<CanteenOutlet[]>([]);
  const [filters, setFilters] = useState<Filters>({ outletId: "", status: "" });
  const [pageData, setPageData] = useState<CanteenPage<CanteenCashierSession>>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<CanteenCashierSession | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.pageSize)), [pageData]);

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? id;

  useEffect(() => {
    canteenApi.listOutlets(getAccessToken()).then(setOutlets).catch((e: Error) => setMessage(e.message));
  }, []);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await canteenApi.listSessions(
        { page, pageSize: 20, outlet_id: filters.outletId || undefined, status: filters.status || undefined },
        getAccessToken()
      );
      setPageData(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载班次失败");
      setPageData(emptyPage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(1).catch((e: Error) => setLoadError(e.message));
  }, [load]);

  const summary = useMemo(() => {
    return pageData.list.reduce(
      (s, it) => ({
        open: s.open + (it.status === "open" ? 1 : 0),
        qr: s.qr + Number(it.qrPayTotal || 0),
        sub: s.sub + Number(it.subsidyTotal || 0),
        orders: s.orders + (it.orderCount || 0)
      }),
      { open: 0, qr: 0, sub: 0, orders: 0 }
    );
  }, [pageData]);

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.SESSION_VIEW}>
      <PageShell className="canteen-sessions-page">
        <PageHeader
          title="收银班次 / 日结"
          description="查看各档口 POS 开班/结班班次与日结汇总：真实扫码收款与餐补核销分列。"
          actions={
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((e: Error) => setMessage(e.message))}>
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
          <Field label="班次状态">
            <select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="">全部</option>
              <option value="open">进行中</option>
              <option value="closed">已结班</option>
            </select>
          </Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((e: Error) => setLoadError(e.message))}>
            <Search size={16} />
            查询
          </button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>{message}</FeedbackNotice> : null}

        <section className="dashboard-grid canteen-summary-grid">
          <MetricCard icon={<Clock size={18} />} label="进行中班次" value={summary.open} />
          <MetricCard icon={<QrCode size={18} />} label="扫码收款合计(元)" value={summary.qr.toFixed(2)} />
          <MetricCard icon={<Wallet size={18} />} label="餐补核销合计(元)" value={summary.sub.toFixed(2)} />
          <MetricCard icon={<Receipt size={18} />} label="累计订单数" value={summary.orders} />
        </section>

        <ContentCard title="班次列表" description={`共 ${pageData.total} 个班次。`}>
          {loadError ? (
            <ErrorState title="班次加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void load(pageData.page)}>重试</button>} />
          ) : loading ? (
            <LoadingState title="正在加载班次" />
          ) : (
            <DataTable className="allow-horizontal-table">
              <thead>
                <tr>
                  <th>班次号</th>
                  <th>档口</th>
                  <th>开班时间</th>
                  <th>结班时间</th>
                  <th>扫码收款</th>
                  <th>餐补核销</th>
                  <th>订单数</th>
                  <th>退款</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.list.map((s) => (
                  <tr key={s.id}>
                    <td>{s.sessionNo}</td>
                    <td>{outletName(s.outletId)}</td>
                    <td>{s.openTime ? new Date(s.openTime).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                    <td>{s.closeTime ? new Date(s.closeTime).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                    <td>¥{s.qrPayTotal}</td>
                    <td>¥{s.subsidyTotal}</td>
                    <td>{s.orderCount}</td>
                    <td>¥{s.refundTotal}</td>
                    <td><StatusPill variant={s.status === "open" ? "success" : "muted"}>{s.status === "open" ? "进行中" : "已结班"}</StatusPill></td>
                    <td>
                      <DataTableActions>
                        <button className="table-action-button" type="button" onClick={() => setDetail(s)}>
                          <Eye size={15} />
                          日结
                        </button>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {pageData.list.length === 0 ? (
                  <tr>
                    <td colSpan={10}><EmptyState compact title="暂无班次" description="收银员在 POS 终端开班后，班次会在此汇总。" /></td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          )}
          <PaginationBar page={pageData.page} totalPages={totalPages} total={pageData.total} onPage={(p) => void load(p).catch((e: Error) => setLoadError(e.message))} />
        </ContentCard>

        {detail ? (
          <Drawer size="md" onClose={() => setDetail(null)}>
            <DrawerHeader eyebrow="班次日结" title={detail.sessionNo} description={outletName(detail.outletId)} onClose={() => setDetail(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="班次状态" value={<StatusPill variant={detail.status === "open" ? "success" : "muted"}>{detail.status === "open" ? "进行中" : "已结班"}</StatusPill>} />
              <DrawerDetailItem label="备用金" value={`¥${detail.openingFloat}`} />
              <DrawerDetailItem label="扫码收款合计" value={`¥${detail.qrPayTotal}`} />
              <DrawerDetailItem label="餐补核销合计" value={`¥${detail.subsidyTotal}`} />
              <DrawerDetailItem label="订单数" value={detail.orderCount} />
              <DrawerDetailItem label="退款合计" value={`¥${detail.refundTotal}`} />
              <DrawerDetailItem label="开班时间" value={detail.openTime ? new Date(detail.openTime).toLocaleString("zh-CN", { hour12: false }) : "-"} />
              <DrawerDetailItem label="结班时间" value={detail.closeTime ? new Date(detail.closeTime).toLocaleString("zh-CN", { hour12: false }) : "-"} />
            </DrawerDetailGrid>
          </Drawer>
        ) : null}
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
