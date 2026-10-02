"use client";

import { CANTEEN_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
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
import { AlertTriangle, Eye, RefreshCw, Search, Receipt, Wallet, QrCode } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenOrder, CanteenOrderItem, CanteenOutlet } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const emptyPage: PaginatedResult<CanteenOrder> = { items: [], total: 0, page: 1, page_size: 20 };

interface Filters {
  outletId: string;
  businessDate: string;
  status: string;
  channel: string;
}

export default function CanteenOrdersPage() {
  const [outlets, setOutlets] = useState<CanteenOutlet[]>([]);
  const [filters, setFilters] = useState<Filters>({ outletId: "", businessDate: "", status: "", channel: "" });
  const [pageData, setPageData] = useState<PaginatedResult<CanteenOrder>>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  const [detail, setDetail] = useState<CanteenOrder | null>(null);
  const [detailItems, setDetailItems] = useState<CanteenOrderItem[]>([]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  useEffect(() => {
    canteenApi.listOutlets(getAccessToken()).then(setOutlets).catch((e: Error) => setMessage(e.message));
  }, []);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await canteenApi.listOrders(
        {
          page,
          pageSize: 20,
          outlet_id: filters.outletId || undefined,
          business_date: filters.businessDate || undefined,
          status: filters.status || undefined,
          channel: filters.channel || undefined
        },
        getAccessToken()
      );
      setPageData(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载订单失败");
      setPageData(emptyPage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(1).catch((e: Error) => setLoadError(e.message));
  }, [load]);

  const summary = useMemo(() => {
    const pay = pageData.items.filter((o) => o.status === "paid" || o.status === "completed");
    const qr = pay.reduce((s, o) => s + Number(o.qr_pay_amount || 0), 0);
    const sub = pay.reduce((s, o) => s + Number(o.subsidy_amount || 0), 0);
    return { count: pay.length, qr, sub };
  }, [pageData]);

  async function openDetail(order: CanteenOrder) {
    setDetail(order);
    setDetailItems([]);
    try {
      const items = await canteenApi.listOrderItems(order.id, getAccessToken());
      setDetailItems(items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载订单明细失败");
    }
  }

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.ORDER_VIEW}>
      <PageShell className="canteen-orders-page">
        <PageHeader
          title="订单与流水"
          description="按档口、业务日期、订单状态与收款渠道查询真实收款与员工餐补核销订单。"
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
          <Field label="业务日期">
            <input type="date" value={filters.businessDate} onChange={(e) => setFilters((c) => ({ ...c, businessDate: e.target.value }))} />
          </Field>
          <Field label="订单状态">
            <select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="">全部</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
              <option value="refunded">已退款</option>
              <option value="partial_refunded">部分退款</option>
            </select>
          </Field>
          <Field label="收款渠道">
            <select value={filters.channel} onChange={(e) => setFilters((c) => ({ ...c, channel: e.target.value }))}>
              <option value="">全部</option>
              <option value="qr_pay">扫码收款</option>
              <option value="subsidy">员工餐补</option>
              <option value="mixed">混合支付</option>
            </select>
          </Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((e: Error) => setLoadError(e.message))}>
            <Search size={16} />
            查询
          </button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>{message}</FeedbackNotice> : null}

        <section className="dashboard-grid canteen-summary-grid">
          <MetricCard icon={<Receipt size={18} />} label="已完成订单" value={summary.count} />
          <MetricCard icon={<QrCode size={18} />} label="扫码收款合计(元)" value={summary.qr.toFixed(2)} />
          <MetricCard icon={<Wallet size={18} />} label="餐补核销合计(元)" value={summary.sub.toFixed(2)} />
        </section>

        <ContentCard title="订单流水" description={`共 ${pageData.total} 笔订单；金额单位元。`}>
          {loadError ? (
            <ErrorState title="订单加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void load(pageData.page)}>重试</button>} />
          ) : loading ? (
            <LoadingState title="正在加载订单" />
          ) : (
            <DataTable className="allow-horizontal-table">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>业务日期</th>
                  <th>餐段</th>
                  <th>渠道</th>
                  <th>应付</th>
                  <th>扫码收款</th>
                  <th>餐补</th>
                  <th>状态</th>
                  <th>支付时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((order) => (
                  <tr key={order.id}>
                    <td>{order.order_no}</td>
                    <td>{order.business_date}</td>
                    <td>{order.meal_period ?? "-"}</td>
                    <td><ChannelPill channel={order.channel} /></td>
                    <td>¥{order.pay_amount}</td>
                    <td>¥{order.qr_pay_amount}</td>
                    <td>¥{order.subsidy_amount}</td>
                    <td><OrderStatusPill status={order.status} /></td>
                    <td>{order.paid_time ? new Date(order.paid_time).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                    <td>
                      <DataTableActions>
                        <button className="table-action-button" type="button" onClick={() => void openDetail(order).catch((e: Error) => setMessage(e.message))}>
                          <Eye size={15} />
                          详情
                        </button>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {pageData.items.length === 0 ? (
                  <tr>
                    <td colSpan={10}><EmptyState compact title="暂无订单" description="调整筛选条件，或等待 POS 终端产生收款流水。" /></td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          )}
          <PaginationBar
            page={pageData.page}
            totalPages={totalPages}
            total={pageData.total}
            onPage={(p) => void load(p).catch((e: Error) => setLoadError(e.message))}
          />
        </ContentCard>

        {detail ? (
          <Drawer size="lg" onClose={() => setDetail(null)}>
            <DrawerHeader eyebrow="订单详情" title={detail.order_no} description={`业务日期 ${detail.business_date} · ${detail.meal_period ?? "—"}`} onClose={() => setDetail(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="订单状态" value={<OrderStatusPill status={detail.status} />} />
              <DrawerDetailItem label="收款渠道" value={<ChannelPill channel={detail.channel} />} />
              <DrawerDetailItem label="商品合计" value={`¥${detail.total_amount}`} />
              <DrawerDetailItem label="折扣" value={`-¥${detail.discount_amount}`} />
              <DrawerDetailItem label="应付金额" value={`¥${detail.pay_amount}`} />
              <DrawerDetailItem label="真实收款(扫码)" value={`¥${detail.qr_pay_amount}`} />
              <DrawerDetailItem label="餐补核销(虚拟)" value={`¥${detail.subsidy_amount}`} />
              <DrawerDetailItem label="支付时间" value={detail.paid_time ? new Date(detail.paid_time).toLocaleString("zh-CN", { hour12: false }) : "-"} />
            </DrawerDetailGrid>
            <div className="page-content">
              <h2 className="panel-title">订单明细</h2>
              <DataTable>
                <thead>
                  <tr>
                    <th>餐品</th>
                    <th>单价</th>
                    <th>数量</th>
                    <th>小计</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.dish_name_snapshot}</td>
                      <td>¥{item.price_snapshot}</td>
                      <td>{item.qty}</td>
                      <td>¥{item.amount}</td>
                    </tr>
                  ))}
                  {detailItems.length === 0 ? (
                    <tr><td colSpan={4}><p className="muted-text">暂无明细</p></td></tr>
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

function OrderStatusPill({ status }: { status: string }) {
  const map: Record<string, { variant: "success" | "danger" | "warning" | "info" | "muted"; label: string }> = {
    pending: { variant: "warning", label: "待支付" },
    paid: { variant: "success", label: "已支付" },
    completed: { variant: "success", label: "已完成" },
    cancelled: { variant: "danger", label: "已取消" },
    refunded: { variant: "danger", label: "已退款" },
    partial_refunded: { variant: "warning", label: "部分退款" }
  };
  const cfg = map[status] ?? { variant: "muted" as const, label: status };
  return <StatusPill variant={cfg.variant}>{cfg.label}</StatusPill>;
}

function ChannelPill({ channel }: { channel: string }) {
  if (channel === "qr_pay") return <StatusPill variant="info">扫码收款</StatusPill>;
  if (channel === "subsidy") return <StatusPill variant="primary">员工餐补</StatusPill>;
  if (channel === "mixed") return <StatusPill variant="warning">混合支付</StatusPill>;
  return <StatusPill variant="muted">{channel}</StatusPill>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
