"use client";

import { CANTEEN_PERMISSIONS } from "@jinhu/shared";
import {
  ContentCard,
  DataTable,
  DataTableActions,
  EmptyState,
  ErrorState,
  FeedbackNotice,
  LoadingState,
  PageHeader,
  PageShell,
  StatusPill
} from "@jinhu/ui";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { canteenApi } from "../../../lib/canteen-api";
import type { CanteenPage, CanteenSettlement } from "../../../lib/canteen-types";
import { getAccessToken } from "../../../lib/authz";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";

const CANTEEN_MODULE = "canteen";
const emptyPage: CanteenPage<CanteenSettlement> = { list: [], total: 0, page: 1, pageSize: 20 };
/** 财务待办：进入对账及以后、尚未结算的单。 */
const TODO_STATUSES = ["submitted", "reconciling", "disputed", "approved"];

export default function FinanceCanteenSettlementsPage() {
  const [pageData, setPageData] = useState<CanteenPage<CanteenSettlement>>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await canteenApi.listSettlements({ page: 1, pageSize: 20 }, getAccessToken());
      // 前端筛出财务待办（后端后续可加 status__in）
      setPageData({ ...data, list: data.list.filter((s) => TODO_STATUSES.includes(s.status)) });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载待办失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((e: Error) => setLoadError(e.message));
  }, [load]);

  const todoCount = pageData.list.length;
  const totalPayable = pageData.list.reduce((s, x) => s + Number(x.companyPayable || 0), 0);

  return (
    <PermissionGuard module={CANTEEN_MODULE} permission={CANTEEN_PERMISSIONS.SETTLEMENT_VIEW}>
      <PageShell className="finance-canteen-settlements-page">
        <PageHeader
          title="园区餐厅结算"
          description="财务侧待办：待核对/待审批/待付款的承包方月度结算单。操作请到「园区餐厅 → 结算与对账」。"
          actions={
            <button className="secondary-button" type="button" onClick={() => void load().catch((e: Error) => setMessage(e.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
          }
        />

        {message ? <FeedbackNotice variant="info" icon={<AlertTriangle size={16} />}>{message}</FeedbackNotice> : null}

        <ContentCard
          title="财务待办"
          description={`${todoCount} 笔待处理；待付公司应付合计 ¥${totalPayable.toFixed(2)}。`}
        >
          {loadError ? (
            <ErrorState title="待办加载失败" description={loadError} action={<button className="secondary-button" type="button" onClick={() => void load()}>重试</button>} />
          ) : loading ? (
            <LoadingState title="正在加载待办" />
          ) : (
            <DataTable className="allow-horizontal-table">
              <thead>
                <tr>
                  <th>结算单号</th>
                  <th>账期</th>
                  <th>档口</th>
                  <th>公司应付</th>
                  <th>当前环节</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.list.map((row) => (
                  <tr key={row.id}>
                    <td>{row.settlementNo}</td>
                    <td>{row.period}</td>
                    <td>{row.outletName ?? row.outletId.slice(0, 8)}</td>
                    <td><strong>¥{row.companyPayable}</strong></td>
                    <td><StatusPill variant="warning">{row.status}</StatusPill></td>
                    <td>
                      <DataTableActions>
                        <a className="table-action-button" href="/canteen/settlements">
                          <ExternalLink size={15} />
                          去处理
                        </a>
                      </DataTableActions>
                    </td>
                  </tr>
                ))}
                {pageData.list.length === 0 ? (
                  <tr>
                    <td colSpan={6}><EmptyState compact title="暂无待办" description="没有待核对/待审批/待付款的结算单。" /></td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          )}
        </ContentCard>
      </PageShell>
    </PermissionGuard>
  );
}
