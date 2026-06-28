"use client";
import { DataTable, Drawer, Card, DrawerFooter, DrawerForm, DrawerHeader } from "@jinhu/ui";

import { CheckCircle2, Edit3, Eye, PlayCircle, Plus, RefreshCw, Search, Send, Trash2, X, XCircle } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { ApiError, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import { hasAccess, hasPermission } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const CHANGE_ENTITY = "leasing_contract_change";
const CONTRACT_ENTITY = "leasing_contract";
const RECEIVABLE_ENTITY = "leasing_receivable";
const CHANGE_PERMISSIONS = {
  read: "leasing_contract_change:read",
  create: "leasing_contract_change:create",
  update: "leasing_contract_change:update",
  delete: "leasing_contract_change:delete",
  preview: "leasing_contract_change:preview",
  submit: "leasing_contract_change:submit",
  approve: "leasing_contract_change:approve",
  reject: "leasing_contract_change:reject",
  effective: "leasing_contract_change:effective"
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
  parkTenant?: ParkTenantRow | null;
  startDate: string;
  endDate: string;
  rentUnitPrice?: string | null;
  totalArea?: string | null;
  rentPerMonth?: string | null;
  totalAmount?: string | null;
  depositMonths?: string | null;
  depositAmount?: string | null;
  freeRentMonths?: string | null;
  paymentPeriod?: string | null;
  paymentAdvanceDays?: number | null;
  propertyFeeUnitPrice?: string | null;
  status: string;
  remark?: string | null;
}

interface ContractChangeRow {
  id: string;
  code: string | null;
  changeCode: string;
  contractId: string;
  contract?: ContractRow | null;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  changeType: string;
  changeReason: string;
  effectiveDate: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  financeImpact?: unknown;
  receivablePolicy: string;
  status: string;
  approveRecords: unknown[];
  remark: string | null;
  updateTime: string;
}

interface FinanceImpactReceivableRow {
  receivable_id: string;
  ar_code: string;
  fee_type: string;
  period_start: string;
  period_end: string;
  old_amount_due: string;
  new_amount_due: string;
  diff_amount: string;
  can_adjust: boolean;
  reason: string;
}

interface FinanceImpactBlockedRow {
  receivable_id: string;
  ar_code: string;
  reason: string;
}

interface FinanceImpactPreview {
  contract_id: string;
  change_id: string;
  affected_receivables: FinanceImpactReceivableRow[];
  blocked_receivables: FinanceImpactBlockedRow[];
  summary: {
    increase_amount: string;
    decrease_amount: string;
    blocked_count: number;
  };
}

interface ChangeFormState {
  changeCode: string;
  contractId: string;
  changeType: string;
  changeReason: string;
  effectiveDate: string;
  receivablePolicy: string;
  startDate: string;
  endDate: string;
  rentUnitPrice: string;
  rentPerMonth: string;
  depositMonths: string;
  depositAmount: string;
  paymentPeriod: string;
  propertyFeeUnitPrice: string;
  remark: string;
}

const initialPageData: PaginatedResult<ContractChangeRow> = { items: [], total: 0, page: 1, page_size: 20 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: ChangeFormState = {
  changeCode: "",
  contractId: "",
  changeType: "mixed",
  changeReason: "",
  effectiveDate: today(),
  receivablePolicy: "manual_review",
  startDate: "",
  endDate: "",
  rentUnitPrice: "0",
  rentPerMonth: "0",
  depositMonths: "0",
  depositAmount: "0",
  paymentPeriod: "",
  propertyFeeUnitPrice: "0",
  remark: ""
};

export default function LeasingContractChangesPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<ContractChangeRow>>(initialPageData);
  const [filters, setFilters] = useState({
    keyword: "",
    contractId: "",
    parkTenantId: "",
    changeType: "",
    status: "",
    effectiveStart: "",
    effectiveEnd: ""
  });
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [editing, setEditing] = useState<ContractChangeRow | null>(null);
  const [detail, setDetail] = useState<ContractChangeRow | null>(null);
  const [financeImpact, setFinanceImpact] = useState<FinanceImpactPreview | null>(null);
  const [form, setForm] = useState<ChangeFormState>(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRead = hasAccess(authUser, CHANGE_PERMISSIONS.read, LEASING_MODULE);
  const canCreate = hasPermission(authUser, CHANGE_PERMISSIONS.create);
  const canUpdate = hasPermission(authUser, CHANGE_PERMISSIONS.update);
  const canDelete = hasPermission(authUser, CHANGE_PERMISSIONS.delete);
  const canPreview = hasPermission(authUser, CHANGE_PERMISSIONS.preview);
  const canSubmit = hasPermission(authUser, CHANGE_PERMISSIONS.submit);
  const canApprove = hasPermission(authUser, CHANGE_PERMISSIONS.approve);
  const canReject = hasPermission(authUser, CHANGE_PERMISSIONS.reject);
  const canEffective = hasPermission(authUser, CHANGE_PERMISSIONS.effective);
  const canViewRentPerMonth = canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "rentPerMonth");
  const canViewTotalAmount = canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "totalAmount");
  const canViewBeforeSnapshot = canViewField(authUser, LEASING_MODULE, CHANGE_ENTITY, "beforeSnapshot");
  const canViewAfterSnapshot = canViewField(authUser, LEASING_MODULE, CHANGE_ENTITY, "afterSnapshot");
  const canViewFinanceImpact = canViewField(authUser, LEASING_MODULE, CHANGE_ENTITY, "financeImpact");
  const canEditAfterSnapshot = canEditField(authUser, LEASING_MODULE, CHANGE_ENTITY, "afterSnapshot");
  const canEditRentUnitPrice = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "rentUnitPrice");
  const canEditRentPerMonth = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "rentPerMonth");
  const canEditDepositAmount = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "depositAmount");
  const canEditPropertyFeeUnitPrice = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "propertyFeeUnitPrice");

  const selectedContract = useMemo(() => contracts.find((contract) => contract.id === form.contractId) ?? null, [contracts, form.contractId]);
  const contractOptions = useMemo(() => contracts.filter((contract) => ["70", "75"].includes(contract.status)), [contracts]);

  const load = useCallback(async (page = 1) => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size), sort: "-updateTime" });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.contractId) params.set("contract_id", filters.contractId);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      if (filters.changeType) params.set("change_type", filters.changeType);
      if (filters.status) params.set("status", filters.status);
      if (filters.effectiveStart) params.set("effective_start", filters.effectiveStart);
      if (filters.effectiveEnd) params.set("effective_end", filters.effectiveEnd);
      const response = await apiRequest<PaginatedResult<ContractChangeRow>>(`/leasing/contract-changes?${params.toString()}`, {
        token: getAccessToken()
      });
      setPageData(response.data);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canRead, filters, pageData.page_size]);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "leasing_contract_change_type",
      "leasing_contract_change_status",
      "leasing_receivable_adjust_policy",
      "leasing_payment_period",
      "leasing_contract_status"
    ];
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
    const params = new URLSearchParams(window.location.search);
    const contractId = params.get("contract_id") ?? "";
    if (contractId) {
      setFilters((prev) => ({ ...prev, contractId }));
      setForm((prev) => ({ ...prev, contractId }));
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void Promise.all([loadDicts(), loadLookups()]).catch((err) => setError(toErrorMessage(err)));
  }, [canRead, loadDicts, loadLookups]);

  useEffect(() => {
    if (!canRead) return;
    void load(1);
  }, [canRead, load]);

  function openCreate(contractId?: string) {
    const contract = contracts.find((item) => item.id === (contractId ?? filters.contractId));
    setEditing(null);
    setForm(formFromContract(contract ?? null));
    setDrawerOpen(true);
    setNotice(null);
    setError(null);
  }

  function openEdit(row: ContractChangeRow) {
    if (!canViewAfterSnapshot || !canEditAfterSnapshot) {
      setError("变更后快照已按字段权限隐藏，无法编辑该变更单");
      return;
    }
    setEditing(row);
    setForm(formFromChange(row));
    setDrawerOpen(true);
    setNotice(null);
    setError(null);
  }

  function openDetail(row: ContractChangeRow) {
    setDetail(row);
    setFinanceImpact(canViewFinanceImpact ? normalizeFinanceImpact(row.financeImpact) : null);
    setNotice(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.contractId) {
      setError("请选择已签章或已生效合同");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        change_code: form.changeCode || undefined,
        change_type: form.changeType,
        change_reason: form.changeReason,
        effective_date: form.effectiveDate,
        receivable_policy: form.receivablePolicy,
        after_snapshot: {
          start_date: form.startDate,
          end_date: form.endDate,
          rent_unit_price: form.rentUnitPrice,
          rent_per_month: form.rentPerMonth,
          deposit_months: form.depositMonths,
          deposit_amount: form.depositAmount,
          payment_period: form.paymentPeriod || null,
          property_fee_unit_price: form.propertyFeeUnitPrice,
          remark: form.remark || null
        },
        remark: form.remark || undefined
      };
      await apiRequest<ContractChangeRow>(editing ? `/leasing/contract-changes/${editing.id}` : `/leasing/contracts/${form.contractId}/changes`, {
        method: editing ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editing ? "contract-change-update" : "contract-change-create"),
        body: JSON.stringify(payload)
      });
      setNotice(editing ? "合同变更草稿已更新" : "合同变更草稿已创建");
      setDrawerOpen(false);
      await load(editing ? pageData.page : 1);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ContractChangeRow) {
    if (!window.confirm(`确认删除变更单 ${row.changeCode}？`)) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest<{ id: string }>(`/leasing/contract-changes/${row.id}`, {
        method: "DELETE",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("contract-change-delete"),
        body: JSON.stringify({})
      });
      setNotice("合同变更草稿已删除");
      await load(pageData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function previewImpact(row: ContractChangeRow) {
    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest<FinanceImpactPreview>(`/leasing/contract-changes/${row.id}/preview-finance-impact`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("contract-change-preview"),
        body: JSON.stringify({})
      });
      setFinanceImpact(response.data);
      setDetail((prev) => prev && prev.id === row.id ? { ...prev, financeImpact: response.data } : prev);
      setNotice("财务影响预览已更新");
      await load(pageData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function actionChange(row: ContractChangeRow, action: "submit" | "approve" | "reject" | "effective") {
    const promptText = action === "reject" ? "请输入驳回原因" : "请输入审批意见";
    const text = window.prompt(promptText, action === "submit" ? "提交审批" : action === "approve" ? "同意" : action === "effective" ? "确认生效" : "");
    if (text === null) return;
    if (action === "reject" && !text.trim()) {
      setError("驳回原因必填");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest<ContractChangeRow>(`/leasing/contract-changes/${row.id}/${action}`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(`contract-change-${action}`),
        body: JSON.stringify(action === "reject" ? { reject_reason: text, opinion: text } : { opinion: text || undefined })
      });
      setNotice(actionNotice(action));
      setDetail(null);
      setFinanceImpact(null);
      await load(pageData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div className="page-container">
        <section className="module-denied">
          <strong>403</strong>
          <span>当前账号无合同变更读取权限，或租户未启用 leasing 模块。</span>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="page-header">
        <div className="header-title">
          <strong>合同变更</strong>
          <span>已签章、已生效合同的租期、金额和付款条件变更申请台账</span>
        </div>
        <div className="page-actions">
          <button className="primary-button" type="button" onClick={() => load(pageData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
          {canCreate ? (
            <button className="primary-button" type="button" onClick={() => openCreate()}>
              <Plus size={16} /> 发起变更
            </button>
          ) : null}
        </div>
      </section>

      <section className="filter-bar">
        <div className="system-grid-three">
          <label className="field">
            <span>关键词</span>
            <input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="变更单、合同、租户" />
          </label>
          <label className="field">
            <span>合同</span>
            <select value={filters.contractId} onChange={(event) => setFilters((prev) => ({ ...prev, contractId: event.target.value }))}>
              <option value="">全部</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>{contract.contractCode} {contract.contractName}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>租户企业</span>
            <select value={filters.parkTenantId} onChange={(event) => setFilters((prev) => ({ ...prev, parkTenantId: event.target.value }))}>
              <option value="">全部</option>
              {parkTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>变更类型</span>
            <select value={filters.changeType} onChange={(event) => setFilters((prev) => ({ ...prev, changeType: event.target.value }))}>
              <option value="">全部</option>
              {dicts.leasing_contract_change_type?.map((item) => (
                <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>状态</span>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">全部</option>
              {dicts.leasing_contract_change_status?.map((item) => (
                <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>生效日开始</span>
            <input type="date" value={filters.effectiveStart} onChange={(event) => setFilters((prev) => ({ ...prev, effectiveStart: event.target.value }))} />
          </label>
          <label className="field">
            <span>生效日结束</span>
            <input type="date" value={filters.effectiveEnd} onChange={(event) => setFilters((prev) => ({ ...prev, effectiveEnd: event.target.value }))} />
          </label>
        </div>
        <div className="filter-actions">
          <button className="primary-button" type="button" onClick={() => load(1)}>
            <Search size={16} /> 查询
          </button>
        </div>
      </section>

      <Card >
        {error ? <div className="module-denied">{error}</div> : null}
        {notice ? <div className="empty-state">{notice}</div> : null}
        <div className="system-toolbar">
          <span className="muted-text">共 {pageData.total} 条</span>
          <span className="muted-text">{loading ? "加载中" : `第 ${pageData.page} 页`}</span>
        </div>
        <div className="table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>变更单号</th>
                <th>合同</th>
                <th>租户企业</th>
                <th>变更类型</th>
                <th>生效日期</th>
                <th>月租金变化</th>
                <th>合同总额变化</th>
                <th>应收策略</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.changeCode}</td>
                  <td>{row.contract?.contractCode ?? "-"}</td>
                  <td>{row.parkTenant?.companyName ?? row.contract?.parkTenant?.companyName ?? "-"}</td>
                  <td>{dictLabel("leasing_contract_change_type", row.changeType, dicts)}</td>
                  <td>{row.effectiveDate}</td>
                  <td>{snapshotDiff(row.beforeSnapshot, row.afterSnapshot, "rent_per_month", "rentPerMonth", canViewRentPerMonth && canViewBeforeSnapshot && canViewAfterSnapshot, authUser)}</td>
                  <td>{snapshotDiff(row.beforeSnapshot, row.afterSnapshot, "total_amount", "totalAmount", canViewTotalAmount && canViewBeforeSnapshot && canViewAfterSnapshot, authUser)}</td>
                  <td>{dictLabel("leasing_receivable_adjust_policy", row.receivablePolicy, dicts)}</td>
                  <td><StatusPill dictCode="leasing_contract_change_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>
                    <span className="data-table-actions">
                      <button className="primary-button" type="button" onClick={() => openDetail(row)}>
                        <Eye size={14} /> 详情
                      </button>
                      {canUpdate && canViewAfterSnapshot && canEditAfterSnapshot && row.status === "10" ? (
                        <button className="primary-button" type="button" onClick={() => openEdit(row)}>
                          <Edit3 size={14} /> 编辑
                        </button>
                      ) : null}
                      {canSubmit && ["10", "50"].includes(row.status) ? (
                        <button className="primary-button" type="button" onClick={() => void actionChange(row, "submit")} disabled={saving}>
                          <Send size={14} /> 提交
                        </button>
                      ) : null}
                      {canApprove && row.status === "30" ? (
                        <button className="primary-button" type="button" onClick={() => void actionChange(row, "approve")} disabled={saving}>
                          <CheckCircle2 size={14} /> 通过
                        </button>
                      ) : null}
                      {canReject && row.status === "30" ? (
                        <button className="primary-button" type="button" onClick={() => void actionChange(row, "reject")} disabled={saving}>
                          <XCircle size={14} /> 驳回
                        </button>
                      ) : null}
                      {canEffective && row.status === "40" ? (
                        <button className="primary-button" type="button" onClick={() => void actionChange(row, "effective")} disabled={saving}>
                          <PlayCircle size={14} /> 生效
                        </button>
                      ) : null}
                      {canDelete && ["10", "50"].includes(row.status) ? (
                        <button className="primary-button" type="button" onClick={() => void remove(row)}>
                          <Trash2 size={14} /> 删除
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        {pageData.items.length === 0 && !loading ? <div className="empty-state">暂无合同变更申请</div> : null}
      </Card>

      {detail ? (
        <Drawer size="lg" onClose={() => { setDetail(null); setFinanceImpact(null); }}>
          <DrawerHeader
            eyebrow="招商租赁"
            title={`变更详情：${detail.changeCode}`}
            description="查看合同变更的基础信息、金额变化与审批轨迹。"
            onClose={() => { setDetail(null); setFinanceImpact(null); }}
            closeIcon={<X size={18} />}
          />
          {canPreview && canViewFinanceImpact ? (
            <div className="drawer-action-bar">
              <button className="drawer-action-button" type="button" onClick={() => void previewImpact(detail)} disabled={saving}>
                <RefreshCw size={16} /> 财务影响预览
              </button>
            </div>
          ) : null}
          <div className="system-grid">
            <div className="empty-state">
              <strong>基础信息</strong>
              <span>合同：{detail.contract?.contractCode ?? "-"}</span>
              <span>租户企业：{detail.parkTenant?.companyName ?? detail.contract?.parkTenant?.companyName ?? "-"}</span>
              <span>变更类型：{dictLabel("leasing_contract_change_type", detail.changeType, dicts)}</span>
              <span>生效日期：{detail.effectiveDate}</span>
              <span>应收策略：{dictLabel("leasing_receivable_adjust_policy", detail.receivablePolicy, dicts)}</span>
              <span>状态：{dictLabel("leasing_contract_change_status", detail.status, dicts)}</span>
            </div>
            <div className="empty-state">
              <strong>金额变化</strong>
              <span>租金单价：{snapshotDiff(detail.beforeSnapshot, detail.afterSnapshot, "rent_unit_price", "rentUnitPrice", canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "rentUnitPrice") && canViewBeforeSnapshot && canViewAfterSnapshot, authUser)}</span>
              <span>月租金：{snapshotDiff(detail.beforeSnapshot, detail.afterSnapshot, "rent_per_month", "rentPerMonth", canViewRentPerMonth && canViewBeforeSnapshot && canViewAfterSnapshot, authUser)}</span>
              <span>合同总额：{snapshotDiff(detail.beforeSnapshot, detail.afterSnapshot, "total_amount", "totalAmount", canViewTotalAmount && canViewBeforeSnapshot && canViewAfterSnapshot, authUser)}</span>
              <span>押金：{snapshotDiff(detail.beforeSnapshot, detail.afterSnapshot, "deposit_amount", "depositAmount", canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "depositAmount") && canViewBeforeSnapshot && canViewAfterSnapshot, authUser)}</span>
            </div>
          </div>

          {!canViewFinanceImpact ? (
            <div className="empty-state">财务影响预览已按字段权限隐藏</div>
          ) : financeImpact ? (
            <FinanceImpactPanel
              impact={financeImpact}
              dicts={dicts}
              authUser={authUser}
            />
          ) : (
            <div className="empty-state">尚未生成财务影响预览</div>
          )}

          <div className="system-toolbar">
            <strong>审批轨迹</strong>
          </div>
          <div className="table-scroll">
            <DataTable >
              <thead>
                <tr>
                  <th>动作</th>
                  <th>操作人</th>
                  <th>状态变化</th>
                  <th>意见</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {detail.approveRecords.map((record, index) => (
                  <tr key={`${detail.id}-record-${index}`}>
                    <td>{recordValue(record, "action")}</td>
                    <td>{recordValue(record, "operatorName")}</td>
                    <td>{recordValue(record, "fromStatus") || "-"} → {recordValue(record, "toStatus") || "-"}</td>
                    <td>{recordValue(record, "rejectReason") || recordValue(record, "opinion") || "-"}</td>
                    <td>{formatDateTime(recordValue(record, "opTime"))}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </Drawer>
      ) : null}

      {drawerOpen ? (
        <Drawer size="lg" onClose={() => setDrawerOpen(false)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title={editing ? "编辑合同变更草稿" : "发起合同变更"}
            description="填写拟变更后的合同信息，保存为草稿不会直接修改合同与应收。"
            onClose={() => setDrawerOpen(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={submit}>
            <div className="system-grid">
              <label className="field">
                <span>变更单号</span>
                <input value={form.changeCode} onChange={(event) => setForm((prev) => ({ ...prev, changeCode: event.target.value }))} placeholder="为空则自动生成" disabled={Boolean(editing)} />
              </label>
              <label className="field">
                <span>合同</span>
                <select required value={form.contractId} disabled={Boolean(editing)} onChange={(event) => setForm(formFromContract(contracts.find((contract) => contract.id === event.target.value) ?? null))}>
                  <option value="">请选择已签章或已生效合同</option>
                  {contractOptions.map((contract) => (
                    <option key={contract.id} value={contract.id}>{contract.contractCode} {contract.contractName}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>变更类型</span>
                <select required value={form.changeType} onChange={(event) => setForm((prev) => ({ ...prev, changeType: event.target.value }))}>
                  {dicts.leasing_contract_change_type?.map((item) => (
                    <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>拟生效日期</span>
                <input required type="date" value={form.effectiveDate} onChange={(event) => setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))} />
              </label>
              <label className="field">
                <span>应收处理策略</span>
                <select required value={form.receivablePolicy} onChange={(event) => setForm((prev) => ({ ...prev, receivablePolicy: event.target.value }))}>
                  {dicts.leasing_receivable_adjust_policy?.map((item) => (
                    <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedContract ? <CurrentContractPanel contract={selectedContract} dicts={dicts} authUser={authUser} /> : null}

            <div className="system-toolbar">
              <strong>拟变更后信息</strong>
              <span className="muted-text">本申请保存为草稿，不会直接修改合同、应收或房源状态</span>
            </div>
            <div className="system-grid">
              <label className="field">
                <span>合同开始日期</span>
                <input required type="date" value={form.startDate} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} />
              </label>
              <label className="field">
                <span>合同结束日期</span>
                <input required type="date" value={form.endDate} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} />
              </label>
              <MoneyInput label="租金单价" value={form.rentUnitPrice} disabled={!canEditRentUnitPrice} onChange={(value) => setForm((prev) => ({ ...prev, rentUnitPrice: value }))} />
              <MoneyInput label="月租金" value={form.rentPerMonth} disabled={!canEditRentPerMonth} onChange={(value) => setForm((prev) => ({ ...prev, rentPerMonth: value }))} />
              <label className="field">
                <span>押金月数</span>
                <input type="number" min="0" step="0.01" value={form.depositMonths} onFocus={(event) => event.target.select()} onChange={(event) => setForm((prev) => ({ ...prev, depositMonths: event.target.value }))} />
              </label>
              <MoneyInput label="押金金额" value={form.depositAmount} disabled={!canEditDepositAmount} onChange={(value) => setForm((prev) => ({ ...prev, depositAmount: value }))} />
              <label className="field">
                <span>付款周期</span>
                <select value={form.paymentPeriod} onChange={(event) => setForm((prev) => ({ ...prev, paymentPeriod: event.target.value }))}>
                  <option value="">请选择</option>
                  {dicts.leasing_payment_period?.map((item) => (
                    <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
                  ))}
                </select>
              </label>
              <MoneyInput label="物业费单价" value={form.propertyFeeUnitPrice} disabled={!canEditPropertyFeeUnitPrice} onChange={(value) => setForm((prev) => ({ ...prev, propertyFeeUnitPrice: value }))} />
            </div>
            <label className="field">
              <span>变更原因</span>
              <textarea required value={form.changeReason} onChange={(event) => setForm((prev) => ({ ...prev, changeReason: event.target.value }))} />
            </label>
            <label className="field">
              <span>备注</span>
              <textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
            </label>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setDrawerOpen(false)}>取消</button>
              <button className="primary-button" type="submit" disabled={saving || (editing ? !canUpdate : !canCreate)}>
                {saving ? "保存中" : "保存草稿"}
              </button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
    </div>
  );

  function formFromContract(contract: ContractRow | null): ChangeFormState {
    if (!contract) return { ...emptyForm };
    return {
      ...emptyForm,
      contractId: contract.id,
      effectiveDate: today(),
      startDate: contract.startDate,
      endDate: contract.endDate,
      rentUnitPrice: normalizeAmount(contract.rentUnitPrice),
      rentPerMonth: normalizeAmount(contract.rentPerMonth),
      depositMonths: normalizeAmount(contract.depositMonths),
      depositAmount: normalizeAmount(contract.depositAmount),
      paymentPeriod: contract.paymentPeriod ?? "",
      propertyFeeUnitPrice: normalizeAmount(contract.propertyFeeUnitPrice),
      remark: contract.remark ?? ""
    };
  }

  function formFromChange(row: ContractChangeRow): ChangeFormState {
    const after = safeRecord(row.afterSnapshot);
    return {
      changeCode: row.changeCode,
      contractId: row.contractId,
      changeType: row.changeType,
      changeReason: row.changeReason,
      effectiveDate: row.effectiveDate,
      receivablePolicy: row.receivablePolicy,
      startDate: snapshotValue(after, "start_date", "startDate"),
      endDate: snapshotValue(after, "end_date", "endDate"),
      rentUnitPrice: snapshotValue(after, "rent_unit_price", "rentUnitPrice"),
      rentPerMonth: snapshotValue(after, "rent_per_month", "rentPerMonth"),
      depositMonths: snapshotValue(after, "deposit_months", "depositMonths"),
      depositAmount: snapshotValue(after, "deposit_amount", "depositAmount"),
      paymentPeriod: snapshotValue(after, "payment_period", "paymentPeriod"),
      propertyFeeUnitPrice: snapshotValue(after, "property_fee_unit_price", "propertyFeeUnitPrice"),
      remark: row.remark ?? snapshotValue(after, "remark", "remark")
    };
  }
}

function CurrentContractPanel({ contract, dicts, authUser }: { contract: ContractRow; dicts: Record<string, DictItemRow[]>; authUser: ReturnType<typeof useAuthUser> }) {
  return (
    <section className="empty-state">
      <strong>当前合同信息</strong>
      <span>{contract.contractCode} {contract.contractName}</span>
      <span>租户企业：{contract.parkTenant?.companyName ?? "-"}</span>
      <span>租期：{contract.startDate} 至 {contract.endDate}</span>
      <span>合同状态：{dictLabel("leasing_contract_status", contract.status, dicts)}</span>
      <span>月租金：{formatAmount(contract.rentPerMonth, "rentPerMonth", canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "rentPerMonth"), authUser)}</span>
      <span>合同总额：{formatAmount(contract.totalAmount, "totalAmount", canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "totalAmount"), authUser)}</span>
    </section>
  );
}

function FinanceImpactPanel({ impact, dicts, authUser }: { impact: FinanceImpactPreview; dicts: Record<string, DictItemRow[]>; authUser: ReturnType<typeof useAuthUser> }) {
  const canViewAmountDue = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountDue");
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <strong>财务影响预览</strong>
        <span className="muted-text">增加 {formatReceivableAmount(impact.summary.increase_amount, "amountDue", canViewAmountDue, authUser)} / 减少 {formatReceivableAmount(impact.summary.decrease_amount, "amountDue", canViewAmountDue, authUser)} / 阻断 {impact.summary.blocked_count}</span>
      </div>
      <div className="table-scroll">
        <DataTable >
          <thead>
            <tr>
              <th>应收单号</th>
              <th>费用类型</th>
              <th>账期</th>
              <th>原应收</th>
              <th>新应收</th>
              <th>差额</th>
              <th>是否可调整</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {impact.affected_receivables.length === 0 ? (
              <tr><td colSpan={8}>暂无可调整的未来应收</td></tr>
            ) : impact.affected_receivables.map((row) => (
              <tr key={row.receivable_id}>
                <td>{row.ar_code}</td>
                <td>{dictLabel("leasing_fee_type", row.fee_type, dicts)}</td>
                <td>{row.period_start} 至 {row.period_end}</td>
                <td>{formatReceivableAmount(row.old_amount_due, "amountDue", canViewAmountDue, authUser)}</td>
                <td>{formatReceivableAmount(row.new_amount_due, "amountDue", canViewAmountDue, authUser)}</td>
                <td>{formatReceivableAmount(row.diff_amount, "amountDue", canViewAmountDue, authUser)}</td>
                <td><span className={`status-badge status-${row.can_adjust ? "success" : "warning"}`}>{row.can_adjust ? "可调整" : "仅预览"}</span></td>
                <td>{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      <div className="system-toolbar">
        <strong>需人工复核应收</strong>
      </div>
      <div className="table-scroll">
        <DataTable >
          <thead>
            <tr>
              <th>应收单号</th>
              <th>原因</th>
            </tr>
          </thead>
          <tbody>
            {impact.blocked_receivables.length === 0 ? (
              <tr><td colSpan={2}>暂无阻断账单</td></tr>
            ) : impact.blocked_receivables.map((row) => (
              <tr key={row.receivable_id}>
                <td>{row.ar_code}</td>
                <td>{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </section>
  );
}

function MoneyInput({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" step="0.01" value={value} disabled={disabled} onFocus={(event) => event.target.select()} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StatusPill({ dictCode, value, dicts }: { dictCode: string; value: string; dicts: Record<string, DictItemRow[]> }) {
  const item = dicts[dictCode]?.find((entry) => entry.itemValue === value);
  return <span className={`status-badge status-${item?.tagType ?? "default"}`}>{(item?.itemLabel ?? value) || "-"}</span>;
}

function dictLabel(dictCode: string, value: string | null | undefined, dicts: Record<string, DictItemRow[]>): string {
  if (!value) return "-";
  return dicts[dictCode]?.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function snapshotDiff(beforeSnapshot: unknown, afterSnapshot: unknown, snakeKey: string, camelKey: string, canView: boolean, authUser: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const beforeValue = snapshotValue(safeRecord(beforeSnapshot), snakeKey, camelKey);
  const afterValue = snapshotValue(safeRecord(afterSnapshot), snakeKey, camelKey);
  if (beforeValue === afterValue) return formatAmount(afterValue, camelKey, canView, authUser);
  return `${formatAmount(beforeValue, camelKey, canView, authUser)} → ${formatAmount(afterValue, camelKey, canView, authUser)}`;
}

function formatAmount(value: unknown, fieldKey: string, canView: boolean, authUser: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(authUser, LEASING_MODULE, CONTRACT_ENTITY, fieldKey, value);
  if (masked === "" || masked === null || masked === undefined) return "-";
  const numberValue = Number(masked);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(masked);
}

function formatReceivableAmount(value: unknown, fieldKey: string, canView: boolean, authUser: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, fieldKey, value);
  if (masked === "" || masked === null || masked === undefined) return "-";
  const numberValue = Number(masked);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(masked);
}

function snapshotValue(snapshot: Record<string, unknown>, snakeKey: string, camelKey: string): string {
  const value = snapshot[snakeKey] ?? snapshot[camelKey];
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeAmount(value: string | number | null | undefined): string {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "0.00";
}

function normalizeFinanceImpact(value: unknown): FinanceImpactPreview | null {
  const record = safeRecord(value);
  if (!Array.isArray(record.affected_receivables) || !Array.isArray(record.blocked_receivables)) return null;
  return value as unknown as FinanceImpactPreview;
}

function recordValue(record: unknown, key: string): string {
  if (!record || typeof record !== "object") return "";
  const value = (record as Record<string, unknown>)[key];
  if (value === null || value === undefined) return "";
  return String(value);
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actionNotice(action: "submit" | "approve" | "reject" | "effective"): string {
  if (action === "submit") return "合同变更已提交审批";
  if (action === "approve") return "合同变更已审批通过";
  if (action === "reject") return "合同变更已驳回";
  return "合同变更已生效";
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function toErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "操作失败，请稍后重试";
}
