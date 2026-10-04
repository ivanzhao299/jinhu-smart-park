"use client";

import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import {
  ContentCard,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
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
import { AlertTriangle, RefreshCw, Search, Plus, FileCheck, Wallet, Receipt, Building2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { canteenApi } from "../../../../lib/canteen-api";
import type { CanteenOutlet, CanteenPage, CanteenSettlement, CanteenSettlementItem } from "../../../../lib/canteen-types";
import { getAccessToken } from "../../../../lib/authz";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const emptyPage: CanteenPage<CanteenSettlement> = { list: [], total: 0, page: 1, pageSize: 20 };

interface Filters {
  period: string;
  outletId: string;
  status: string;
}

const STATUS_FLOW: Record<string, { label: string; variant: "success" | "danger" | "warning" | "info" | "muted" | "primary" }> = {  draft: { label: "草稿", variant: "muted" },
  submitted: { label: "已提交", variant: "info" },
  reconciling: { label: "对账中", variant: "warning" },
  approved: { label: "已审批", variant: "primary" },
  settled: { label: "已结算", variant: "success" },
  disputed: { label: "差异挂起", variant: "danger" }
};

export default function CanteenSettlementsPage() {
  const [outlets, setOutlets] = useState<CanteenOutlet[]>([]);
  const [filters, setFilters] = useState<Filters>({ period: "", outletId: "", status: "" });
  const [pageData, setPageData] = useState<CanteenPage<CanteenSettlement>>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<CanteenSettlement | null>(null);
  const [items, setItems] = useState<CanteenSettlementItem[]>([]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.pageSize)), [pageData]);

  useEffect(() => {
    canteenApi.listOutlets(getAccessToken()).then(setOutlets).catch((e: Error) => setMessage(e.message));
  }, []);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await canteenApi.listSettlements(
        {
          page,
          pageSize: 20,
          period: filters.period || undefined,
          outlet_id: filters.outletId || undefined,
          status: filters.status || undefined
        },
        getAccessToken()
      );
      setPageData(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载结算单失败");
      setPageData(emptyPage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(1).catch((e: Error) => setLoadError(e.message));
  }, [load]);

  async function openDetail(row: CanteenSettlement) {
    setDetail(row);
    setItems([]);
    try {
      const list = await canteenApi.listSettlementItems(row.id, getAccessToken());
      setItems(list);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载对账明细失败");
    }
  }

  async function generate() {
    if (!filters.period || !filters.outletId) {
      setMessage("生成结算需选择账期与档口");
      return;
    }
    setBusy(true);
    try {
      await canteenApi.generateSettlement({ period: filters.period, outlet_id: filters.outletId }, getAccessToken());
      setMessage(`已生成 ${filters.period} 结算单`);
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "submit" | "reconcile" | "dispute" | "approve" | "settle") {
    if (!detail) return;
    setBusy(true);
    try {
      const updated = await canteenApi.settlementTransition(detail.id, action, {}, getAccessToken());
      setDetail(updated);
      setMessage(`已执行：${action}`);
      await load(pageData.page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.SETTLEMENT_VIEW}>
      <PageShell className="canteen-settlements-page">
        <PageHeader
          title="结算与对账"
          description="按账期/档口聚合月度结算单，核对真实收款与餐补公司应付，推进审批与付款归档。"
          actions={
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((e: Error) => setMessage(e.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          }
        />

        <FilterPanel>
          <Field label="账期(YYYY-MM)">
            <input type="month" value={filters.period} onChange={(e) => setFilters((c) => ({ ...c, period: e.target.value }))} />
          </Field>
          <Field label="档口">
            <select value={filters.outletId} onChange={(e) => setFilters((c) => ({ ...c, outletId: e.target.value }))}>
              <option value="">全部档口</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </Field>
          <Field label="状态">
            <select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="submitted">已提交</option>
              <option value="reconciling">对账中</option>
              <option value="approved">已审批</option>
              <option value="settled">已结算</option>
              <option value="disputed">差异挂起</option>
            </select>
          </Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((e: Error) => setLoadError(e.message))}>
            <Search size={16} />
            查询
          </button>
          <PermissionGuard permission={CANTEEN_PERMISSIONS.SETTLEMENT_GENERATE} module={CANTEEN_MODULE}>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void generate().catch((e: Error) => setMessage(e.message))}>
              <Plus size={16} />
              生成结算
            </button>
          </PermissionGuard>
        </FilterPanel>

        {message ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>{message}</FeedbackNotice> : null}

        <section className="dashboard-grid canteen-summary-grid">
          <MetricCard icon={<Receipt size={18} />} label="结算单总数" value={pageData.total} />
          <MetricCard icon={<Building2 size={18} />} label="已结算档口" value={pageData.list.filter((s) => s.status === "settled").length} />
          <MetricCard icon={<FileCheck size={18} />} label="对账/审批中" value={pageData.list.filter((s) => ["submitted", "reconciling", "disputed"].includes(s.status)).length} />
          <MetricCard icon={<Wallet size={18} />} label="本期公司应付(元)" value={pageData.list.reduce((s, x) => s + Number(x.companyPayable || 0), 0).toFixed(2)} />
        </section>

        <ContentCard title="结算单列表" description={`共 ${pageData.total} 张；金额单位元。`}>
          {loadError ? (
            <ErrorState title="结算单加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void load(pageData.page)}>重试</button>} />
          ) : loading ? (
            <LoadingState title="正在加载结算单" />
          ) : (
            <DataTable className="allow-horizontal-table">
              <thead>
                <tr>
                  <th>结算单号</th>
                  <th>账期</th>
                  <th>档口</th>
                  <th>营业额</th>
                  <th>扫码收款</th>
                  <th>餐补核销</th>
                  <th>退款</th>
                  <th>公司应付</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.list.map((row) => (
                  <tr key={row.id}>
                    <td>{row.settlementNo}</td>
                    <td>{row.period}</td>
                    <td>{row.outletName ?? row.outletId.slice(0, 8)}</td>
                    <td>¥{row.salesTotal}</td>
                    <td>¥{row.qrPayTotal}</td>
                    <td>¥{row.subsidyTotal}</td>
                    <td>¥{row.refundTotal}</td>
                    <td><strong>¥{row.companyPayable}</strong></td>
                    <td><SettlementStatusPill status={row.status} /></td>
                    <td>
                      <DataTableActions>
                        <button className="table-action-button" type="button" onClick={() => void openDetail(row).catch((e: Error) => setMessage(e.message))}>
                          <Search size={15} />
                          详情
                        </button>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {pageData.list.length === 0 ? (
                  <tr>
                    <td colSpan={10}><EmptyState compact title="暂无结算单" description="选择账期与档口后点「生成结算」，或等待月结对账。" /></td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          )}
          <PaginationBar page={pageData.page} totalPages={totalPages} total={pageData.total} onPage={(p) => void load(p).catch((e: Error) => setLoadError(e.message))} />
        </ContentCard>

        {detail ? (
          <Drawer size="lg" onClose={() => setDetail(null)}>
            <DrawerHeader eyebrow="结算详情" title={detail.settlementNo} description={`账期 ${detail.period} · 档口 ${detail.outletName ?? detail.outletId}`} onClose={() => setDetail(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="状态" value={<SettlementStatusPill status={detail.status} />} />
              <DrawerDetailItem label="营业额" value={`¥${detail.salesTotal}`} />
              <DrawerDetailItem label="扫码收款合计" value={`¥${detail.qrPayTotal}`} />
              <DrawerDetailItem label="餐补核销合计" value={`¥${detail.subsidyTotal}`} />
              <DrawerDetailItem label="退款合计" value={`¥${detail.refundTotal}`} />
              <DrawerDetailItem label="公司应付" value={`¥${detail.companyPayable}`} />
            </DrawerDetailGrid>

            <div className="page-content">
              <h2 className="panel-title">对账明细（按日/餐段）</h2>
              <DataTable>
                <thead>
                  <tr>
                    <th>业务日期</th>
                    <th>餐段</th>
                    <th>单数</th>
                    <th>扫码收款</th>
                    <th>餐补</th>
                    <th>退款</th>
                    <th>差异额</th>
                    <th>差异原因</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.bizDate}</td>
                      <td>{it.mealPeriod ?? "-"}</td>
                      <td>{it.orderCount}</td>
                      <td>¥{it.qrPayAmount}</td>
                      <td>¥{it.subsidyAmount}</td>
                      <td>¥{it.refundAmount}</td>
                      <td>{Number(it.diffAmount) !== 0 ? <StatusPill variant="danger">¥{it.diffAmount}</StatusPill> : "¥0.00"}</td>
                      <td>{it.diffReason ?? "-"}</td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr><td colSpan={8}><p className="muted-text">暂无对账明细</p></td></tr>
                  ) : null}
                </tbody>
              </DataTable>
            </div>

            <DrawerFooter>
              <ActionRow status={detail.status} busy={busy} onAction={(a) => void transition(a).catch((e: Error) => setMessage(e.message))} />
            </DrawerFooter>
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

/** 按状态机给出可用操作按钮（权限点在各按钮上控制）。 */
function ActionRow({ status, busy, onAction }: { status: string; busy: boolean; onAction: (a: "submit" | "reconcile" | "dispute" | "approve" | "settle") => void }) {
  return (
    <>
      {status === "draft" ? (
        <PermissionGuard permission={CANTEEN_PERMISSIONS.SETTLEMENT_SUBMIT} module={CANTEEN_MODULE}>
          <button className="primary-button" type="button" disabled={busy} onClick={() => onAction("submit")}>提交</button>
        </PermissionGuard>
      ) : null}
      {status === "submitted" ? (
        <PermissionGuard permission={CANTEEN_PERMISSIONS.SETTLEMENT_RECONCILE} module={CANTEEN_MODULE}>
          <button className="primary-button" type="button" disabled={busy} onClick={() => onAction("reconcile")}>开始对账</button>
        </PermissionGuard>
      ) : null}
      {(status === "submitted" || status === "reconciling") ? (
        <PermissionGuard permission={CANTEEN_PERMISSIONS.SETTLEMENT_DISPUTE} module={CANTEEN_MODULE}>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => onAction("dispute")}>挂差异</button>
        </PermissionGuard>
      ) : null}
      {(status === "reconciling" || status === "disputed") ? (
        <PermissionGuard permission={CANTEEN_PERMISSIONS.SETTLEMENT_APPROVE} module={CANTEEN_MODULE}>
          <button className="primary-button" type="button" disabled={busy} onClick={() => onAction("approve")}>审批通过</button>
        </PermissionGuard>
      ) : null}
      {status === "approved" ? (
        <PermissionGuard permission={CANTEEN_PERMISSIONS.SETTLEMENT_SETTLE} module={CANTEEN_MODULE}>
          <button className="primary-button" type="button" disabled={busy} onClick={() => onAction("settle")}>确认结算</button>
        </PermissionGuard>
      ) : null}
    </>
  );
}

function SettlementStatusPill({ status }: { status: string }) {
  const cfg = STATUS_FLOW[status] ?? { variant: "muted" as const, label: status };
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
