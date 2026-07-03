"use client";
import { DataTable, Card } from "@jinhu/ui";

import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { ApiError, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";
import { hasAccess, hasPermission } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const RECEIVABLE_ENTITY = "leasing_receivable";
const PERMISSIONS = {
  aging: "leasing_receivable:aging",
  overdue: "leasing_receivable:overdue"
} as const;

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
  parkTenantId: string;
}

interface ReceivableRow {
  id: string;
  arCode: string;
  contractId: string | null;
  contract?: ContractRow | null;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  feeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue?: string | null;
  amountPaid?: string | null;
  amountRemain?: string | null;
  lateFee?: string | null;
  invoiceStatus: string;
  overdueDays: number;
  status: string;
}

interface AgingBucket {
  bucket: "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
  count: number;
  amount: string | null;
}

interface AgingTenant {
  park_tenant_id: string;
  company_name: string;
  amount: string | null;
  max_overdue_days: number;
}

interface AgingResult {
  summary: {
    total_amount_remain: string | null;
    overdue_amount: string | null;
    overdue_count: number;
  };
  buckets: AgingBucket[];
  top_tenants: AgingTenant[];
}

const emptyAging: AgingResult = {
  summary: { total_amount_remain: "0.00", overdue_amount: "0.00", overdue_count: 0 },
  buckets: [
    { bucket: "current", count: 0, amount: "0.00" },
    { bucket: "d1_30", count: 0, amount: "0.00" },
    { bucket: "d31_60", count: 0, amount: "0.00" },
    { bucket: "d61_90", count: 0, amount: "0.00" },
    { bucket: "d90_plus", count: 0, amount: "0.00" }
  ],
  top_tenants: []
};

const initialOverdueData: PaginatedResult<ReceivableRow> = { items: [], total: 0, page: 1, page_size: 20 };
const bucketLabels: Record<AgingBucket["bucket"], string> = {
  current: "未逾期",
  d1_30: "逾期 1-30 天",
  d31_60: "逾期 31-60 天",
  d61_90: "逾期 61-90 天",
  d90_plus: "逾期 90 天以上"
};

export default function LeasingAgingPage() {
  const authUser = useAuthUser();
  const [aging, setAging] = useState<AgingResult>(emptyAging);
  const [overdueData, setOverdueData] = useState<PaginatedResult<ReceivableRow>>(initialOverdueData);
  const [filters, setFilters] = useState({ parkTenantId: "", contractId: "", startDate: "", endDate: "" });
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canAging = hasAccess(authUser, PERMISSIONS.aging, LEASING_MODULE);
  const canOverdue = hasPermission(authUser, PERMISSIONS.overdue);
  const canViewAmountRemain = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountRemain");

  const visibleContracts = useMemo(() => {
    if (!filters.parkTenantId) return contracts;
    return contracts.filter((contract) => contract.parkTenantId === filters.parkTenantId);
  }, [contracts, filters.parkTenantId]);

  const d90PlusAmount = useMemo(() => {
    return aging.buckets.find((bucket) => bucket.bucket === "d90_plus")?.amount ?? "0.00";
  }, [aging.buckets]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(overdueData.total / overdueData.page_size)), [overdueData]);

  const buildParams = useCallback((page?: number) => {
    const params = new URLSearchParams();
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    if (filters.contractId) params.set("contract_id", filters.contractId);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    if (page) {
      params.set("page", String(page));
      params.set("page_size", String(overdueData.page_size));
    }
    return params;
  }, [filters, overdueData.page_size]);

  const loadAging = useCallback(async () => {
    if (!canAging) return;
    const params = buildParams();
    const response = await apiRequest<AgingResult>(`/leasing/receivables/aging?${params.toString()}`, {
      token: getAccessToken()
    });
    setAging(response.data);
  }, [buildParams, canAging]);

  const loadOverdue = useCallback(async (page = 1) => {
    if (!canOverdue) return;
    const params = buildParams(page);
    const response = await apiRequest<PaginatedResult<ReceivableRow>>(`/leasing/receivables/overdue?${params.toString()}`, {
      token: getAccessToken()
    });
    setOverdueData(response.data);
  }, [buildParams, canOverdue]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadAging(), loadOverdue(page)]);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadAging, loadOverdue]);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["leasing_fee_type", "leasing_receivable_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = dictTypeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadLookups = useCallback(async () => {
    const [tenantResponse, contractResponse] = await Promise.all([
      apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100&sort=companyName", { token: getAccessToken() }),
      apiRequest<PaginatedResult<ContractRow>>("/leasing/contracts?page=1&page_size=100&sort=contractCode", { token: getAccessToken() })
    ]);
    setParkTenants(tenantResponse.data.items);
    setContracts(contractResponse.data.items);
  }, []);

  useEffect(() => {
    if (!canAging) return;
    void Promise.all([loadDicts(), loadLookups()]).catch((err) => setError(toErrorMessage(err)));
  }, [canAging, loadDicts, loadLookups]);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function recalculateOverdue() {
    setRecalculating(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiRequest<{ checked_count: number; updated_count: number; status_changed_count: number }>("/leasing/receivables/recalculate-overdue", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("receivable-overdue-recalculate")
      });
      setNotice(`已重算 ${response.data.checked_count} 条，应收更新 ${response.data.updated_count} 条，状态变化 ${response.data.status_changed_count} 条`);
      await load(overdueData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRecalculating(false);
    }
  }

  if (!canAging) {
    return (
      <main className="page-container">
        <section className="module-denied">
          <strong>403</strong>
          <span>当前账号暂无应收账龄分析权限，或当前租户未开通招商租赁能力。</span>
        </section>
      </main>
    );
  }

  return (
    <main className="page-container">
      <section className="page-header">
        <div className="header-title">
          <strong>欠费账龄</strong>
          <span>识别逾期应收、账龄结构和欠费租户排行</span>
        </div>
        <div className="page-actions">
          <button className="primary-button" type="button" onClick={() => load(overdueData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
          {canOverdue ? (
            <button className="primary-button" type="button" onClick={recalculateOverdue} disabled={recalculating}>
              <RefreshCw size={16} /> {recalculating ? "重算中" : "重算逾期"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="filter-bar">
        <div className="system-grid">
          <label className="field">
            <span>租户企业</span>
            <select value={filters.parkTenantId} onChange={(event) => setFilters((prev) => ({ ...prev, parkTenantId: event.target.value, contractId: "" }))}>
              <option value="">全部</option>
              {parkTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>合同</span>
            <select value={filters.contractId} onChange={(event) => setFilters((prev) => ({ ...prev, contractId: event.target.value }))}>
              <option value="">全部</option>
              {visibleContracts.map((contract) => (
                <option key={contract.id} value={contract.id}>{contract.contractCode} {contract.contractName}</option>
              ))}
            </select>
          </label>
          <DateField label="应收开始" value={filters.startDate} onChange={(value) => setFilters((prev) => ({ ...prev, startDate: value }))} />
          <DateField label="应收结束" value={filters.endDate} onChange={(value) => setFilters((prev) => ({ ...prev, endDate: value }))} />
        </div>
        <div className="filter-actions">
          <button className="primary-button" type="button" onClick={() => load(1)}>
            <Search size={16} /> 查询
          </button>
        </div>
      </section>

      {error ? <section className="module-denied">{error}</section> : null}
      {notice ? <section className="empty-state">{notice}</section> : null}

      <section className="dashboard-grid">
        <MetricCard label="未收总额" value={amountText(aging.summary.total_amount_remain, authUser, canViewAmountRemain)} />
        <MetricCard label="逾期金额" value={amountText(aging.summary.overdue_amount, authUser, canViewAmountRemain)} />
        <MetricCard label="逾期单数" value={String(aging.summary.overdue_count)} />
        <MetricCard label="90 天以上欠费金额" value={amountText(d90PlusAmount, authUser, canViewAmountRemain)} />
      </section>

      <Card className=" table-scroll">
        <div className="system-toolbar">
          <strong>账龄分布</strong>
          <span className="muted-text">{loading ? "加载中" : "按未收金额统计"}</span>
        </div>
        <DataTable >
          <thead>
            <tr>
              <th>账龄桶</th>
              <th>应收单数</th>
              <th>未收金额</th>
            </tr>
          </thead>
          <tbody>
            {aging.buckets.map((bucket) => (
              <tr key={bucket.bucket}>
                <td>{bucketLabels[bucket.bucket]}</td>
                <td>{bucket.count}</td>
                <td>{amountText(bucket.amount, authUser, canViewAmountRemain)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>

      <Card className=" table-scroll">
        <div className="system-toolbar">
          <strong>欠费租户排行</strong>
          <span className="muted-text">最多显示前 10 名</span>
        </div>
        <DataTable >
          <thead>
            <tr>
              <th>租户企业</th>
              <th>欠费金额</th>
              <th>最大逾期天数</th>
            </tr>
          </thead>
          <tbody>
            {aging.top_tenants.map((tenant) => (
              <tr key={tenant.park_tenant_id}>
                <td>{tenant.company_name}</td>
                <td>{amountText(tenant.amount, authUser, canViewAmountRemain)}</td>
                <td>{tenant.max_overdue_days}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {aging.top_tenants.length === 0 ? <div className="empty-state">暂无欠费租户</div> : null}
      </Card>

      <Card className=" table-scroll">
        <div className="system-toolbar">
          <strong>逾期应收列表</strong>
          <span className="muted-text">共 {overdueData.total} 条，第 {overdueData.page} / {totalPages} 页</span>
        </div>
        <DataTable >
          <thead>
            <tr>
              <th>应收单号</th>
              <th>租户企业</th>
              <th>合同</th>
              <th>费用类型</th>
              <th>账期</th>
              <th>应收日</th>
              <th>未收金额</th>
              <th>状态</th>
              <th>逾期天数</th>
            </tr>
          </thead>
          <tbody>
            {overdueData.items.map((row) => (
              <tr key={row.id}>
                <td>{row.arCode}</td>
                <td>{row.parkTenant?.companyName ?? tenantName(parkTenants, row.parkTenantId)}</td>
                <td>{row.contract?.contractCode ?? contractName(contracts, row.contractId)}</td>
                <td>{dictLabel(dicts.leasing_fee_type, row.feeType)}</td>
                <td>{formatDate(row.periodStart)} 至 {formatDate(row.periodEnd)}</td>
                <td>{formatDate(row.dueDate)}</td>
                <td>{amountText(row.amountRemain, authUser, canViewAmountRemain)}</td>
                <td><DictBadge items={dicts.leasing_receivable_status} value={row.status} /></td>
                <td>{row.overdueDays}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        {overdueData.items.length === 0 && !loading ? <div className="empty-state">暂无逾期应收</div> : null}
        <div className="system-actions">
          <button className="primary-button" type="button" disabled={overdueData.page <= 1} onClick={() => load(overdueData.page - 1)}>上一页</button>
          <button className="primary-button" type="button" disabled={overdueData.page >= totalPages} onClick={() => load(overdueData.page + 1)}>下一页</button>
        </div>
      </Card>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DictBadge({ items, value }: { items?: DictItemRow[]; value: string }) {
  const item = items?.find((option) => option.itemValue === value);
  return <span className={`status-badge status-${item?.tagType ?? "default"}`}>{item?.itemLabel ?? value}</span>;
}

function dictLabel(items: DictItemRow[] | undefined, value: string): string {
  return items?.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function tenantName(tenants: ParkTenantRow[], id: string): string {
  return tenants.find((tenant) => tenant.id === id)?.companyName ?? id;
}

function contractName(contracts: ContractRow[], id: string | null): string {
  if (!id) return "-";
  const contract = contracts.find((item) => item.id === id);
  return contract ? contract.contractCode : id;
}

function amountText(value: string | null | undefined, authUser: ReturnType<typeof useAuthUser>, canView: boolean): string {
  if (!canView) return "";
  const masked = maskField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountRemain", value ?? "0.00");
  if (masked === null || masked === undefined || masked === "") return "";
  const text = String(masked);
  const numberValue = Number(text);
  if (!Number.isFinite(numberValue)) return text;
  return numberValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
