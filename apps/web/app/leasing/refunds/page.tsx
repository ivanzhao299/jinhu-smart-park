"use client";

import { Card, DataTable, StatusPill } from "@jinhu/ui";
import { RefreshCw, Search } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { ApiError, apiRequest } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";
import { hasAccess } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const REFUND_ENTITY = "leasing_refund";
const REFUND_READ_PERMISSION = "leasing_refund:read";
const FIELD_REFUND_AMOUNT = "refundAmount";
const FIELD_RECEIVER_BANK_ACCOUNT = "receiverBankAccount";
const FIELD_BANK_SERIAL = "bankSerial";

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

interface ParkTenantRow {
  id: string;
  parkTenantCode: string;
  companyName: string;
}

interface ContractRow {
  id: string;
  contractCode: string;
  contractName: string;
}

interface CheckoutRow {
  id: string;
  checkoutCode: string;
}

interface RefundRow {
  id: string;
  refundCode: string;
  checkoutId: string;
  checkout?: CheckoutRow | null;
  contractId: string;
  contract?: ContractRow | null;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  refundAmount?: string | null;
  refundMethod: string;
  refundTime: string;
  receiverName: string | null;
  receiverBankAccount?: string | null;
  bankSerial?: string | null;
  receiptFileId?: string | null;
  status: string;
  remark: string | null;
}

interface FilterState {
  keyword: string;
  status: string;
  refundStart: string;
  refundEnd: string;
}

const emptyPage: PaginatedResult<RefundRow> = { items: [], total: 0, page: 1, page_size: 20 };
const initialFilters: FilterState = { keyword: "", status: "", refundStart: "", refundEnd: "" };
const PAGE_SIZE = 20;

export default function LeasingRefundsPage() {
  const authUser = useAuthUser();
  const canRead = hasAccess(authUser, REFUND_READ_PERMISSION, LEASING_MODULE);
  const [pageData, setPageData] = useState(emptyPage);
  const [filters, setFilters] = useState(initialFilters);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const canViewRefundAmount = canViewField(authUser, LEASING_MODULE, REFUND_ENTITY, FIELD_REFUND_AMOUNT);
  const canViewReceiverBankAccount = canViewField(authUser, LEASING_MODULE, REFUND_ENTITY, FIELD_RECEIVER_BANK_ACCOUNT);
  const canViewBankSerial = canViewField(authUser, LEASING_MODULE, REFUND_ENTITY, FIELD_BANK_SERIAL);

  const load = useCallback(async (page = 1) => {
    if (!canRead) return;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort: "-refundTime" });
      if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
      if (filters.status) params.set("status", filters.status);
      if (filters.refundStart) params.set("refund_start", filters.refundStart);
      if (filters.refundEnd) params.set("refund_end", filters.refundEnd);
      const response = await apiRequest<PaginatedResult<RefundRow>>(`/leasing/refunds?${params.toString()}`, { token: getAccessToken() });
      setPageData(response.data);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [canRead, filters]);

  const loadDicts = useCallback(async () => {
    if (!canRead) return;
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["leasing_refund_method", "leasing_refund_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const itemResponse = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?dict_type_id=${dictTypeId}&page=1&page_size=100`, { token: getAccessToken() });
      return [code, itemResponse.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, [canRead]);

  useEffect(() => {
    void loadDicts().catch((error) => setMessage(toErrorMessage(error)));
  }, [loadDicts]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const summary = useMemo(() => {
    const start = pageData.total === 0 ? 0 : (pageData.page - 1) * pageData.page_size + 1;
    const end = Math.min(pageData.total, pageData.page * pageData.page_size);
    return `${start}-${end} / ${pageData.total}`;
  }, [pageData]);

  if (!canRead) {
    return (
      <main className="page-container">
        <Card className="empty-state">
          <strong>403</strong>
          <span>无退款登记访问权限，或 leasing 模块未授权。</span>
        </Card>
      </main>
    );
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1);
  }

  return (
    <main className="page-container">
      <section className="page-header">
        <div>
          <h1>退款登记</h1>
          <p>查看退租结算后的退款登记记录，银行账号与流水号按字段权限脱敏。</p>
        </div>
        <div className="page-actions">
          <button className="secondary-button" type="button" onClick={() => void load(pageData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
        </div>
      </section>

      <form className="filter-bar" onSubmit={submitFilters}>
        <div className="system-grid-three">
          <label className="field">
            <span>关键词</span>
            <input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="退款单号 / 合同 / 租户" />
          </label>
          <label className="field">
            <span>退款状态</span>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">全部</option>
              {dicts.leasing_refund_status?.map((item) => (
                <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>退款开始</span>
            <input type="date" value={filters.refundStart} onChange={(event) => setFilters((prev) => ({ ...prev, refundStart: event.target.value }))} />
          </label>
          <label className="field">
            <span>退款结束</span>
            <input type="date" value={filters.refundEnd} onChange={(event) => setFilters((prev) => ({ ...prev, refundEnd: event.target.value }))} />
          </label>
        </div>
        <div className="system-actions">
          <button className="primary-button" type="submit" disabled={loading}>
            <Search size={16} /> 查询
          </button>
        </div>
      </form>

      {message ? <div className="alert-message">{message}</div> : null}

      <Card className="page-content">
        <div className="system-toolbar">
          <div>
            <h2>退款列表</h2>
            <p>{summary}</p>
          </div>
        </div>
        <DataTable>
          <thead>
            <tr>
              <th>退款单号</th>
              <th>租户企业</th>
              <th>合同</th>
              <th>退租单</th>
              <th>退款金额</th>
              <th>退款方式</th>
              <th>退款时间</th>
              <th>收款人</th>
              <th>收款账号</th>
              <th>银行流水</th>
              <th>状态</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.length === 0 ? (
              <tr><td colSpan={12}>暂无退款登记记录</td></tr>
            ) : pageData.items.map((row) => (
              <tr key={row.id}>
                <td>{row.refundCode}</td>
                <td>{row.parkTenant?.companyName ?? row.parkTenantId}</td>
                <td>{row.contract?.contractCode ?? row.contractId}</td>
                <td>{row.checkout?.checkoutCode ?? row.checkoutId}</td>
                <td>{moneyText(authUser, canViewRefundAmount, FIELD_REFUND_AMOUNT, row.refundAmount)}</td>
                <td>{dictLabel("leasing_refund_method", row.refundMethod, dicts)}</td>
                <td>{formatDateTime(row.refundTime)}</td>
                <td>{row.receiverName ?? "-"}</td>
                <td>{fieldText(authUser, canViewReceiverBankAccount, FIELD_RECEIVER_BANK_ACCOUNT, row.receiverBankAccount)}</td>
                <td>{fieldText(authUser, canViewBankSerial, FIELD_BANK_SERIAL, row.bankSerial)}</td>
                <td><StatusPill dictCode="leasing_refund_status" value={row.status} dicts={dicts} /></td>
                <td>{row.remark ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="pagination-bar">
          <span>共 {pageData.total} 条，第 {pageData.page} 页</span>
          <button type="button" disabled={loading || pageData.page <= 1} onClick={() => void load(pageData.page - 1)}>上一页</button>
          <button type="button" disabled={loading || pageData.page * pageData.page_size >= pageData.total} onClick={() => void load(pageData.page + 1)}>下一页</button>
        </div>
      </Card>
    </main>
  );
}

function dictLabel(dictCode: string, value: string, dicts: Record<string, DictItemRow[]>): string {
  return dicts[dictCode]?.find((item) => String(item.itemValue) === String(value))?.itemLabel ?? value ?? "-";
}

function moneyText(
  authUser: ReturnType<typeof useAuthUser>,
  canView: boolean,
  field: string,
  value?: string | null
): string {
  if (!canView) return "已隐藏";
  const masked = maskField(authUser, LEASING_MODULE, REFUND_ENTITY, field, value ?? "-");
  return typeof masked === "string" ? masked : String(masked ?? "-");
}

function fieldText(
  authUser: ReturnType<typeof useAuthUser>,
  canView: boolean,
  field: string,
  value?: string | null
): string {
  if (!canView) return "已隐藏";
  const masked = maskField(authUser, LEASING_MODULE, REFUND_ENTITY, field, value ?? "-");
  return typeof masked === "string" ? masked : String(masked ?? "-");
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
