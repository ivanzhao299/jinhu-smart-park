"use client";
import { DataTable, Drawer, Card, DrawerFooter, DrawerForm, DrawerHeader } from "@jinhu/ui";

import { BadgePercent, Edit3, History, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { PaginatedResult } from "@jinhu/shared";
import { ApiError, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import { hasAccess, hasPermission } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const RECEIVABLE_ENTITY = "leasing_receivable";
const RECEIVABLE_PERMISSIONS = {
  read: "leasing_receivable:read",
  create: "leasing_receivable:create",
  update: "leasing_receivable:update",
  delete: "leasing_receivable:delete",
  generate: "leasing_receivable:generate",
  generateBatch: "leasing_receivable:generate_batch",
  statusLog: "leasing_receivable:status_log",
  waiverCreate: "leasing_waiver:create"
} as const;
const WAIVER_ALLOWED_RECEIVABLE_STATUSES = new Set(["20", "30", "40", "60", "70"]);

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
  code: string | null;
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
  amountWaived?: string | null;
  amountRemain?: string | null;
  lateFee?: string | null;
  invoiceStatus: string;
  overdueDays: number;
  status: string;
  sourceType: string;
  generateBatchNo: string | null;
  remark: string | null;
  updateTime: string;
}

interface ReceivableStatusLogRow {
  id: string;
  receivableId: string;
  beforeStatus: string | null;
  afterStatus: string;
  action: string;
  reason: string | null;
  operatorId: string | null;
  operatorName: string | null;
  opTime: string;
  remark: string | null;
}

interface ReceivableFormState {
  arCode: string;
  contractId: string;
  parkTenantId: string;
  feeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue: string;
  amountPaid: string;
  amountWaived: string;
  lateFee: string;
  invoiceStatus: string;
  status: string;
  sourceType: string;
  generateBatchNo: string;
  remark: string;
}

interface GenerationRow {
  contract_id: string;
  fee_type: string;
  period_start: string;
  period_end: string;
  due_date?: string;
  amount_due?: string;
  receivable_id?: string;
  ar_code?: string;
  status: "generated" | "regenerated" | "skipped" | "failed";
  message?: string;
}

interface GenerationResult {
  generated_count: number;
  skipped_count: number;
  failed_count: number;
  rows: GenerationRow[];
}

const initialPageData: PaginatedResult<ReceivableRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyForm: ReceivableFormState = {
  arCode: "",
  contractId: "",
  parkTenantId: "",
  feeType: "10",
  periodStart: "",
  periodEnd: "",
  dueDate: "",
  amountDue: "0",
  amountPaid: "0",
  amountWaived: "0",
  lateFee: "0",
  invoiceStatus: "10",
  status: "",
  sourceType: "manual",
  generateBatchNo: "",
  remark: ""
};

export default function LeasingReceivablesPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<ReceivableRow>>(initialPageData);
  const [filters, setFilters] = useState({
    keyword: "",
    parkTenantId: "",
    contractId: "",
    feeType: "",
    status: "",
    invoiceStatus: "",
    dueStart: "",
    dueEnd: "",
    overdueOnly: false
  });
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [editing, setEditing] = useState<ReceivableRow | null>(null);
  const [form, setForm] = useState<ReceivableFormState>(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [batchDrawerOpen, setBatchDrawerOpen] = useState(false);
  const [batchContractIds, setBatchContractIds] = useState<string[]>([]);
  const [billingMonth, setBillingMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [statusLogTarget, setStatusLogTarget] = useState<ReceivableRow | null>(null);
  const [statusLogs, setStatusLogs] = useState<ReceivableStatusLogRow[]>([]);
  const [statusLogLoading, setStatusLogLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRead = hasAccess(authUser, RECEIVABLE_PERMISSIONS.read, LEASING_MODULE);
  const canCreate = hasPermission(authUser, RECEIVABLE_PERMISSIONS.create);
  const canUpdate = hasPermission(authUser, RECEIVABLE_PERMISSIONS.update);
  const canDelete = hasPermission(authUser, RECEIVABLE_PERMISSIONS.delete);
  const canGenerateBatch = hasPermission(authUser, RECEIVABLE_PERMISSIONS.generateBatch);
  const canViewStatusLogs = hasPermission(authUser, RECEIVABLE_PERMISSIONS.statusLog);
  const canCreateWaiver = hasPermission(authUser, RECEIVABLE_PERMISSIONS.waiverCreate);
  const canViewAmountDue = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountDue");
  const canViewAmountPaid = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountPaid");
  const canViewAmountWaived = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountWaived");
  const canViewAmountRemain = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountRemain");
  const canViewLateFee = canViewField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "lateFee");
  const canEditAmountDue = canEditField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountDue");
  const canEditAmountPaid = canEditField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountPaid");
  const canEditAmountWaived = canEditField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "amountWaived");
  const canEditLateFee = canEditField(authUser, LEASING_MODULE, RECEIVABLE_ENTITY, "lateFee");

  const contractOptions = useMemo(() => {
    if (!form.parkTenantId) return contracts;
    return contracts.filter((contract) => contract.parkTenantId === form.parkTenantId);
  }, [contracts, form.parkTenantId]);

  const load = useCallback(async (page = 1) => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size) });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      if (filters.contractId) params.set("contract_id", filters.contractId);
      if (filters.feeType) params.set("fee_type", filters.feeType);
      if (filters.status) params.set("status", filters.status);
      if (filters.invoiceStatus) params.set("invoice_status", filters.invoiceStatus);
      if (filters.dueStart) params.set("due_start", filters.dueStart);
      if (filters.dueEnd) params.set("due_end", filters.dueEnd);
      if (filters.overdueOnly) params.set("overdue_only", "true");
      const response = await apiRequest<PaginatedResult<ReceivableRow>>(`/leasing/receivables?${params.toString()}`, {
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
    const codes = ["leasing_fee_type", "leasing_receivable_status", "leasing_invoice_status"];
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
    if (!canRead) return;
    void Promise.all([loadDicts(), loadLookups()]).catch((err) => setError(toErrorMessage(err)));
  }, [canRead, loadDicts, loadLookups]);

  useEffect(() => {
    void load(1);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
  }

  function openEdit(row: ReceivableRow) {
    setEditing(row);
    setForm({
      arCode: row.arCode,
      contractId: row.contractId ?? "",
      parkTenantId: row.parkTenantId,
      feeType: row.feeType,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      dueDate: row.dueDate,
      amountDue: normalizeFormAmount(row.amountDue),
      amountPaid: normalizeFormAmount(row.amountPaid),
      amountWaived: normalizeFormAmount(row.amountWaived),
      lateFee: normalizeFormAmount(row.lateFee),
      invoiceStatus: row.invoiceStatus,
      status: row.status,
      sourceType: row.sourceType,
      generateBatchNo: row.generateBatchNo ?? "",
      remark: row.remark ?? ""
    });
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const creating = !editing;
      const body: Record<string, unknown> = {
        ar_code: form.arCode || undefined,
        contract_id: form.contractId || undefined,
        park_tenant_id: form.parkTenantId,
        fee_type: form.feeType,
        period_start: form.periodStart,
        period_end: form.periodEnd,
        due_date: form.dueDate,
        invoice_status: form.invoiceStatus || undefined,
        status: form.status || undefined,
        source_type: form.sourceType || "manual",
        generate_batch_no: form.generateBatchNo || undefined,
        remark: form.remark || undefined
      };
      if (creating || canEditAmountDue) body.amount_due = Number(form.amountDue || 0);
      if (creating || canEditAmountPaid) body.amount_paid = Number(form.amountPaid || 0);
      if (creating || canEditAmountWaived) body.amount_waived = Number(form.amountWaived || 0);
      if (creating || canEditLateFee) body.late_fee = Number(form.lateFee || 0);
      await apiRequest<ReceivableRow>(editing ? `/leasing/receivables/${editing.id}` : "/leasing/receivables", {
        method: editing ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editing ? "receivable-update" : "receivable-create"),
        body
      });
      setDrawerOpen(false);
      setNotice(editing ? "应收账单已更新" : "应收账单已创建");
      await load(editing ? pageData.page : 1);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ReceivableRow) {
    if (!window.confirm(`确认删除应收账单 ${row.arCode}？`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest<{ id: string }>(`/leasing/receivables/${row.id}`, {
        method: "DELETE",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("receivable-delete")
      });
      setNotice("应收账单已删除");
      await load(pageData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function openStatusLogs(row: ReceivableRow) {
    if (!canViewStatusLogs) return;
    setStatusLogTarget(row);
    setStatusLogLoading(true);
    setError(null);
    try {
      const response = await apiRequest<PaginatedResult<ReceivableStatusLogRow>>(`/leasing/receivables/${row.id}/status-logs?page=1&page_size=100`, {
        token: getAccessToken()
      });
      setStatusLogs(response.data.items);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setStatusLogLoading(false);
    }
  }

  function openBatchGenerate() {
    setBatchContractIds([]);
    setBillingMonth(new Date().toISOString().slice(0, 7));
    setGenerationResult(null);
    setBatchDrawerOpen(true);
    setError(null);
    setNotice(null);
  }

  async function generateBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (batchContractIds.length === 0) {
      setError("请选择至少一个已生效合同");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiRequest<GenerationResult>("/leasing/receivables/generate-batch", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("receivable-generate-batch"),
        body: {
          contract_ids: batchContractIds,
          billing_month: billingMonth
        }
      });
      setGenerationResult(response.data);
      setNotice(`批量生成完成：新增 ${response.data.generated_count}，跳过 ${response.data.skipped_count}，失败 ${response.data.failed_count}`);
      await load(1);
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
          <span>当前账号无应收账单读取权限，或租户未启用 leasing 模块。</span>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="page-header">
        <div className="header-title">
          <strong>应收账单</strong>
          <span>承接合同、回款、欠费、开票和租户 360 财务视图的基础台账</span>
        </div>
        <div className="page-actions">
          <button className="primary-button" type="button" onClick={() => load(pageData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
          {canGenerateBatch ? (
            <button className="primary-button" type="button" onClick={openBatchGenerate}>
              <RefreshCw size={16} /> 批量生成
            </button>
          ) : null}
          {canCreate ? (
            <button className="primary-button" type="button" onClick={openCreate}>
              <Plus size={16} /> 新增应收
            </button>
          ) : null}
        </div>
      </section>

      <section className="filter-bar">
        <div className="system-grid-three">
          <label className="field">
            <span>关键词</span>
            <input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="单号、合同、租户" />
          </label>
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
              {contracts.filter((contract) => !filters.parkTenantId || contract.parkTenantId === filters.parkTenantId).map((contract) => (
                <option key={contract.id} value={contract.id}>{contract.contractCode}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>费用类型</span>
            <select value={filters.feeType} onChange={(event) => setFilters((prev) => ({ ...prev, feeType: event.target.value }))}>
              <option value="">全部</option>
              {dicts.leasing_fee_type?.map((item) => (
                <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>应收状态</span>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">全部</option>
              {dicts.leasing_receivable_status?.map((item) => (
                <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>开票状态</span>
            <select value={filters.invoiceStatus} onChange={(event) => setFilters((prev) => ({ ...prev, invoiceStatus: event.target.value }))}>
              <option value="">全部</option>
              {dicts.leasing_invoice_status?.map((item) => (
                <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>应收日开始</span>
            <input type="date" value={filters.dueStart} onChange={(event) => setFilters((prev) => ({ ...prev, dueStart: event.target.value }))} />
          </label>
          <label className="field">
            <span>应收日结束</span>
            <input type="date" value={filters.dueEnd} onChange={(event) => setFilters((prev) => ({ ...prev, dueEnd: event.target.value }))} />
          </label>
          <label className="field">
            <span>逾期</span>
            <select value={filters.overdueOnly ? "1" : ""} onChange={(event) => setFilters((prev) => ({ ...prev, overdueOnly: event.target.value === "1" }))}>
              <option value="">全部</option>
              <option value="1">仅看逾期</option>
            </select>
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
        {generationResult ? <GenerationResultTable result={generationResult} dicts={dicts} /> : null}
        <div className="system-toolbar">
          <span className="muted-text">共 {pageData.total} 条</span>
          <span className="muted-text">{loading ? "加载中" : `第 ${pageData.page} 页`}</span>
        </div>
        <div className="table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>应收单号</th>
                <th>租户企业</th>
                <th>合同编号</th>
                <th>费用类型</th>
                <th>账期</th>
                <th>应收日</th>
                <th>应收金额</th>
                <th>已收金额</th>
                <th>豁免金额</th>
                <th>未收金额</th>
                <th>滞纳金</th>
                <th>开票状态</th>
                <th>应收状态</th>
                <th>逾期天数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.arCode}</td>
                  <td>{row.parkTenant?.companyName ?? "-"}</td>
                  <td>{row.contract?.contractCode ?? "-"}</td>
                  <td>{dictLabel("leasing_fee_type", row.feeType, dicts)}</td>
                  <td>{row.periodStart} 至 {row.periodEnd}</td>
                  <td>{row.dueDate}</td>
                  <td>{formatFieldAmount(row.amountDue, "amountDue", canViewAmountDue, authUser)}</td>
                  <td>{formatFieldAmount(row.amountPaid, "amountPaid", canViewAmountPaid, authUser)}</td>
                  <td>{formatFieldAmount(row.amountWaived, "amountWaived", canViewAmountWaived, authUser)}</td>
                  <td>{formatFieldAmount(row.amountRemain, "amountRemain", canViewAmountRemain, authUser)}</td>
                  <td>{formatFieldAmount(row.lateFee, "lateFee", canViewLateFee, authUser)}</td>
                  <td><StatusPill dictCode="leasing_invoice_status" value={row.invoiceStatus} dicts={dicts} /></td>
                  <td><StatusPill dictCode="leasing_receivable_status" value={row.status} dicts={dicts} /></td>
                  <td>{row.overdueDays}</td>
                  <td>
                    <span className="data-table-actions">
                      {canUpdate ? (
                        <button className="primary-button" type="button" onClick={() => openEdit(row)}>
                          <Edit3 size={14} /> 编辑
                        </button>
                      ) : null}
                      {canCreateWaiver && canApplyWaiver(row) ? (
                        <button className="primary-button" type="button" onClick={() => window.location.href = `/leasing/waivers?receivable_id=${row.id}`}>
                          <BadgePercent size={14} /> 申请豁免
                        </button>
                      ) : null}
                      {canViewStatusLogs ? (
                        <button className="primary-button" type="button" onClick={() => void openStatusLogs(row)}>
                          <History size={14} /> 状态日志
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button className="primary-button" type="button" onClick={() => remove(row)}>
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
        {pageData.items.length === 0 && !loading ? <div className="empty-state">暂无应收账单</div> : null}
      </Card>

      {batchDrawerOpen ? (
        <Drawer size="md" onClose={() => setBatchDrawerOpen(false)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title="批量生成应收"
            description="按账单月份与合同范围批量生成应收账单。"
            onClose={() => setBatchDrawerOpen(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={generateBatch}>
            <div className="system-grid">
              <label className="field">
                <span>账单月份</span>
                <input required type="month" value={billingMonth} onChange={(event) => setBillingMonth(event.target.value)} />
              </label>
            </div>
            <div className="field">
              <span>合同（至少选择一个已生效合同）</span>
              <div className="checkbox-list">
                {contracts.map((contract) => {
                  const checked = batchContractIds.includes(contract.id);
                  return (
                    <label key={contract.id} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setBatchContractIds((current) =>
                            event.target.checked
                              ? [...current, contract.id]
                              : current.filter((id) => id !== contract.id)
                          )
                        }
                      />
                      <span>{contract.contractCode} {contract.contractName}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setBatchDrawerOpen(false)}>取消</button>
              <button className="primary-button" type="submit" disabled={saving || !canGenerateBatch}>
                {saving ? "生成中" : "生成应收"}
              </button>
            </DrawerFooter>
          </DrawerForm>
          {generationResult ? <GenerationResultTable result={generationResult} dicts={dicts} /> : null}
        </Drawer>
      ) : null}

      {drawerOpen ? (
        <Drawer size="lg" onClose={() => setDrawerOpen(false)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title={editing ? "编辑应收账单" : "新增应收账单"}
            description="维护应收账单的账期、金额与状态。"
            onClose={() => setDrawerOpen(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={submit}>
            <div className="system-grid">
              <label className="field">
                <span>应收单号</span>
                <input value={form.arCode} onChange={(event) => setForm((prev) => ({ ...prev, arCode: event.target.value }))} placeholder="为空则自动生成" />
              </label>
              <label className="field">
                <span>租户企业</span>
                <select required value={form.parkTenantId} onChange={(event) => setForm((prev) => ({ ...prev, parkTenantId: event.target.value, contractId: "" }))}>
                  <option value="">请选择</option>
                  {parkTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>合同</span>
                <select value={form.contractId} onChange={(event) => setForm((prev) => ({ ...prev, contractId: event.target.value, sourceType: event.target.value ? "contract" : "manual" }))}>
                  <option value="">不关联合同</option>
                  {contractOptions.map((contract) => (
                    <option key={contract.id} value={contract.id}>{contract.contractCode}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>费用类型</span>
                <select required value={form.feeType} onChange={(event) => setForm((prev) => ({ ...prev, feeType: event.target.value }))}>
                  {dicts.leasing_fee_type?.map((item) => (
                    <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>账期开始</span>
                <input required type="date" value={form.periodStart} onChange={(event) => setForm((prev) => ({ ...prev, periodStart: event.target.value }))} />
              </label>
              <label className="field">
                <span>账期结束</span>
                <input required type="date" value={form.periodEnd} onChange={(event) => setForm((prev) => ({ ...prev, periodEnd: event.target.value }))} />
              </label>
              <label className="field">
                <span>应收日</span>
                <input required type="date" value={form.dueDate} onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))} />
              </label>
              <label className="field">
                <span>应收金额</span>
                <input required type="number" min="0" step="0.01" value={form.amountDue} disabled={Boolean(editing) && !canEditAmountDue} onFocus={(event) => event.target.select()} onChange={(event) => setForm((prev) => ({ ...prev, amountDue: event.target.value }))} />
              </label>
              <label className="field">
                <span>已收金额</span>
                <input type="number" min="0" step="0.01" value={form.amountPaid} disabled={Boolean(editing) && !canEditAmountPaid} onFocus={(event) => event.target.select()} onChange={(event) => setForm((prev) => ({ ...prev, amountPaid: event.target.value }))} />
              </label>
              <label className="field">
                <span>豁免金额</span>
                <input type="number" min="0" step="0.01" value={form.amountWaived} disabled={Boolean(editing) && !canEditAmountWaived} onFocus={(event) => event.target.select()} onChange={(event) => setForm((prev) => ({ ...prev, amountWaived: event.target.value }))} />
              </label>
              <label className="field">
                <span>滞纳金</span>
                <input type="number" min="0" step="0.01" value={form.lateFee} disabled={Boolean(editing) && !canEditLateFee} onFocus={(event) => event.target.select()} onChange={(event) => setForm((prev) => ({ ...prev, lateFee: event.target.value }))} />
              </label>
              <label className="field">
                <span>开票状态</span>
                <select value={form.invoiceStatus} onChange={(event) => setForm((prev) => ({ ...prev, invoiceStatus: event.target.value }))}>
                  {dicts.leasing_invoice_status?.map((item) => (
                    <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>应收状态</span>
                <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="">自动计算</option>
                  {dicts.leasing_receivable_status?.map((item) => (
                    <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>来源类型</span>
                <select value={form.sourceType} onChange={(event) => setForm((prev) => ({ ...prev, sourceType: event.target.value }))}>
                  <option value="manual">手工创建</option>
                  <option value="contract">合同生成</option>
                  <option value="adjustment">调整</option>
                </select>
              </label>
              <label className="field">
                <span>生成批次</span>
                <input value={form.generateBatchNo} onChange={(event) => setForm((prev) => ({ ...prev, generateBatchNo: event.target.value }))} />
              </label>
            </div>
            <label className="field">
              <span>备注</span>
              <textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
            </label>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setDrawerOpen(false)}>取消</button>
              <button className="primary-button" type="submit" disabled={saving || (editing ? !canUpdate : !canCreate)}>
                {saving ? "保存中" : "保存"}
              </button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}

      {statusLogTarget ? (
        <Drawer size="md" onClose={() => setStatusLogTarget(null)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title={`应收状态日志 - ${statusLogTarget.arCode}`}
            description="查看应收账单的状态流转记录。"
            onClose={() => setStatusLogTarget(null)}
            closeIcon={<X size={18} />}
          />
          <ReceivableStatusTimeline logs={statusLogs} loading={statusLogLoading} dicts={dicts} />
        </Drawer>
      ) : null}
    </div>
  );
}

function ReceivableStatusTimeline({ logs, loading, dicts }: { logs: ReceivableStatusLogRow[]; loading: boolean; dicts: Record<string, DictItemRow[]> }) {
  return (
    <section className="table-scroll">
      <DataTable >
        <thead>
          <tr>
            <th>时间</th>
            <th>状态变化</th>
            <th>动作</th>
            <th>操作人</th>
            <th>原因</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6}>加载中</td></tr>
          ) : logs.length === 0 ? (
            <tr><td colSpan={6}>暂无状态日志</td></tr>
          ) : logs.map((log) => (
            <tr key={log.id}>
              <td>{formatDateTime(log.opTime)}</td>
              <td><StatusPill dictCode="leasing_receivable_status" value={log.beforeStatus ?? ""} dicts={dicts} /> → <StatusPill dictCode="leasing_receivable_status" value={log.afterStatus} dicts={dicts} /></td>
              <td>{receivableStatusActionText(log.action)}</td>
              <td>{log.operatorName ?? "-"}</td>
              <td>{log.reason ?? "-"}</td>
              <td>{log.remark ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}

function StatusPill({ dictCode, value, dicts }: { dictCode: string; value: string; dicts: Record<string, DictItemRow[]> }) {
  if (!value) return <span className="status-pill status-muted">-</span>;
  const item = dicts[dictCode]?.find((entry) => entry.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value}</span>;
}

function GenerationResultTable({ result, dicts }: { result: GenerationResult; dicts: Record<string, DictItemRow[]> }) {
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <strong>生成结果</strong>
        <span className="muted-text">新增 {result.generated_count} / 跳过 {result.skipped_count} / 失败 {result.failed_count}</span>
      </div>
      <div className="table-scroll">
        <DataTable >
          <thead>
            <tr>
              <th>费用类型</th>
              <th>账期</th>
              <th>应收日</th>
              <th>应收金额</th>
              <th>应收单号</th>
              <th>结果</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={7}>本次没有需要生成的应收</td></tr>
            ) : result.rows.map((row, index) => (
              <tr key={`${row.contract_id}-${row.fee_type}-${row.period_start}-${index}`}>
                <td>{row.fee_type ? dictLabel("leasing_fee_type", row.fee_type, dicts) : "-"}</td>
                <td>{row.period_start} 至 {row.period_end}</td>
                <td>{row.due_date ?? "-"}</td>
                <td>{formatPlainAmount(row.amount_due)}</td>
                <td>{row.ar_code ?? "-"}</td>
                <td><span className={`status-pill ${generationStatusClass(row.status)}`}>{generationStatusText(row.status)}</span></td>
                <td>{row.message ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </section>
  );
}

function dictLabel(dictCode: string, value: string, dicts: Record<string, DictItemRow[]>): string {
  return dicts[dictCode]?.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function generationStatusText(status: GenerationRow["status"]): string {
  if (status === "generated") return "已生成";
  if (status === "regenerated") return "已重生成";
  if (status === "skipped") return "已跳过";
  return "失败";
}

function generationStatusClass(status: GenerationRow["status"]): string {
  if (status === "generated" || status === "regenerated") return "status-success";
  if (status === "skipped") return "status-warning";
  return "status-danger";
}

function statusClass(tagType?: string | null): string {
  const normalized = tagType ?? "muted";
  if (["success", "warning", "danger", "info", "primary"].includes(normalized)) {
    return `status-${normalized}`;
  }
  return "status-muted";
}

function formatFieldAmount(value: unknown, fieldKey: string, canView: boolean, user: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, RECEIVABLE_ENTITY, fieldKey, value);
  if (masked === null || masked === undefined || masked === "") return "-";
  const numberValue = Number(masked);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(masked);
}

function normalizeFormAmount(value: unknown): string {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "0";
}

function formatPlainAmount(value: unknown): string {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "-";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function receivableStatusActionText(action: string): string {
  const labels: Record<string, string> = {
    create: "创建",
    generate: "合同生成",
    regenerate: "重新生成",
    adjust: "调整",
    payment: "收款核销",
    payment_apply: "收款核销",
    overdue: "逾期重算",
    waiver: "豁免审批",
    waiver_apply: "豁免申请",
    waiver_approve: "豁免审批",
    invoice: "发票登记",
    delete: "删除",
    void: "作废",
    system: "系统"
  };
  return labels[action] ?? action;
}

function canApplyWaiver(row: ReceivableRow): boolean {
  if (!WAIVER_ALLOWED_RECEIVABLE_STATUSES.has(row.status)) return false;
  const remain = Number(row.amountRemain);
  return !Number.isFinite(remain) || remain > 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
