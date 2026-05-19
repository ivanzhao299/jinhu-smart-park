"use client";
import { DataTable, Drawer, Card } from "@jinhu/ui";

import { Edit3, Link2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type Dispatch, type FormEvent, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { AttachmentList } from "../../../components/files/AttachmentList";
import { FileUploader } from "../../../components/files/FileUploader";
import { ApiError, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";
import { hasAccess, hasPermission } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const INVOICE_ENTITY = "leasing_invoice";
const INVOICE_FILE_BIZ_TYPE = "leasing_invoice";
const INVOICE_PERMISSIONS = {
  read: "leasing_invoice:read",
  create: "leasing_invoice:create",
  update: "leasing_invoice:update",
  delete: "leasing_invoice:delete"
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
  unifiedCreditCode?: string | null;
}

interface ContractRow {
  id: string;
  contractCode: string;
  contractName: string;
}

interface ReceivableRow {
  id: string;
  arCode: string;
  parkTenantId: string;
  contractId: string | null;
  contract?: ContractRow | null;
  feeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountDue?: string | null;
  amountRemain?: string | null;
  invoiceStatus: string;
  status: string;
}

interface InvoiceRow {
  id: string;
  code: string | null;
  invoiceCode: string;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  invoiceType: string;
  buyerName: string;
  buyerTaxNo?: string | null;
  amount: string;
  taxRate: string;
  invoiceNo: string | null;
  invoiceDate: string;
  fileId: string | null;
  status: string;
  remark: string | null;
  updateTime: string;
}

interface InvoiceReceivableRow {
  id: string;
  invoiceId: string;
  receivableId: string;
  invoiceAmount: string;
  createTime: string;
  receivable?: ReceivableRow | null;
}

interface InvoiceFormState {
  invoiceCode: string;
  parkTenantId: string;
  invoiceType: string;
  buyerName: string;
  buyerTaxNo: string;
  amount: string;
  taxRate: string;
  invoiceNo: string;
  invoiceDate: string;
  fileId: string;
  status: string;
  remark: string;
}

interface InvoiceReceivableFormRow {
  receivableId: string;
  invoiceAmount: string;
}

const initialPageData: PaginatedResult<InvoiceRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyForm: InvoiceFormState = {
  invoiceCode: "",
  parkTenantId: "",
  invoiceType: "normal",
  buyerName: "",
  buyerTaxNo: "",
  amount: "0",
  taxRate: "0",
  invoiceNo: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  fileId: "",
  status: "30",
  remark: ""
};

export default function LeasingInvoicesPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<InvoiceRow>>(initialPageData);
  const [filters, setFilters] = useState({ keyword: "", parkTenantId: "", invoiceType: "", status: "", invoiceStart: "", invoiceEnd: "" });
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [linkedReceivables, setLinkedReceivables] = useState<InvoiceReceivableRow[]>([]);
  const [editing, setEditing] = useState<InvoiceRow | null>(null);
  const [viewing, setViewing] = useState<InvoiceRow | null>(null);
  const [form, setForm] = useState<InvoiceFormState>(emptyForm);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceReceivableFormRow[]>([{ receivableId: "", invoiceAmount: "0" }]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRead = hasAccess(authUser, INVOICE_PERMISSIONS.read, LEASING_MODULE);
  const canCreate = hasPermission(authUser, INVOICE_PERMISSIONS.create);
  const canUpdate = hasPermission(authUser, INVOICE_PERMISSIONS.update);
  const canDelete = hasPermission(authUser, INVOICE_PERMISSIONS.delete);
  const canViewBuyerTaxNo = canViewField(authUser, LEASING_MODULE, INVOICE_ENTITY, "buyerTaxNo");
  const canViewInvoiceAmount = canViewField(authUser, LEASING_MODULE, INVOICE_ENTITY, "amount");
  const canViewInvoiceFile = canViewField(authUser, LEASING_MODULE, INVOICE_ENTITY, "fileId");

  const invoiceTypeItems = dicts.leasing_invoice_type ?? [];
  const invoiceStatusItems = dicts.leasing_invoice_status ?? [];
  const feeTypeItems = dicts.leasing_fee_type ?? [];
  const receivableStatusItems = dicts.leasing_receivable_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const invoiceRowsTotal = useMemo(
    () => invoiceRows.reduce((sum, row) => sum + Number(row.invoiceAmount || 0), 0),
    [invoiceRows]
  );

  const load = useCallback(async (page = 1) => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size) });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      if (filters.invoiceType) params.set("invoice_type", filters.invoiceType);
      if (filters.status) params.set("status", filters.status);
      if (filters.invoiceStart) params.set("invoice_start", filters.invoiceStart);
      if (filters.invoiceEnd) params.set("invoice_end", filters.invoiceEnd);
      const response = await apiRequest<PaginatedResult<InvoiceRow>>(`/leasing/invoices?${params.toString()}`, {
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
    const codes = ["leasing_invoice_type", "leasing_invoice_status", "leasing_fee_type", "leasing_receivable_status"];
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

  const loadParkTenants = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100&sort=companyName", {
      token: getAccessToken()
    });
    setParkTenants(response.data.items);
  }, []);

  const loadReceivables = useCallback(async (parkTenantId: string) => {
    if (!parkTenantId) {
      setReceivables([]);
      return;
    }
    const response = await apiRequest<PaginatedResult<ReceivableRow>>(`/leasing/receivables?page=1&page_size=100&park_tenant_id=${parkTenantId}&sort=dueDate`, {
      token: getAccessToken()
    });
    setReceivables(response.data.items.filter((item) => item.status !== "90"));
  }, []);

  const loadInvoiceReceivables = useCallback(async (invoiceId: string) => {
    const response = await apiRequest<InvoiceReceivableRow[]>(`/leasing/invoices/${invoiceId}/receivables`, {
      token: getAccessToken()
    });
    setLinkedReceivables(response.data);
    return response.data;
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void Promise.all([loadDicts(), loadParkTenants()]).catch((err) => setError(toErrorMessage(err)));
  }, [canRead, loadDicts, loadParkTenants]);

  useEffect(() => {
    void load(1);
  }, [load]);

  function openCreate() {
    const nextInvoiceType = invoiceTypeItems[0]?.itemValue ?? "normal";
    const nextStatus = invoiceStatusItems.find((item) => item.itemValue === "30")?.itemValue ?? invoiceStatusItems[0]?.itemValue ?? "30";
    setEditing(null);
    setForm({ ...emptyForm, invoiceType: nextInvoiceType, status: nextStatus });
    setInvoiceRows([{ receivableId: "", invoiceAmount: "0" }]);
    setReceivables([]);
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
  }

  async function openEdit(row: InvoiceRow) {
    setEditing(row);
    setForm({
      invoiceCode: row.invoiceCode,
      parkTenantId: row.parkTenantId,
      invoiceType: row.invoiceType,
      buyerName: row.buyerName,
      buyerTaxNo: row.buyerTaxNo ?? "",
      amount: normalizeAmount(row.amount),
      taxRate: normalizeAmount(row.taxRate),
      invoiceNo: row.invoiceNo ?? "",
      invoiceDate: dateOnly(row.invoiceDate),
      fileId: row.fileId ?? "",
      status: row.status,
      remark: row.remark ?? ""
    });
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
    await loadReceivables(row.parkTenantId);
    const rows = await loadInvoiceReceivables(row.id);
    setInvoiceRows(rows.map((item) => ({
      receivableId: item.receivableId,
      invoiceAmount: normalizeAmount(item.invoiceAmount)
    })));
  }

  async function openDetail(row: InvoiceRow) {
    setViewing(row);
    setDetailOpen(true);
    setError(null);
    await loadInvoiceReceivables(row.id);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        invoice_code: form.invoiceCode || undefined,
        park_tenant_id: form.parkTenantId,
        invoice_type: form.invoiceType,
        buyer_name: form.buyerName,
        buyer_tax_no: form.buyerTaxNo || undefined,
        amount: Number(form.amount || 0),
        tax_rate: Number(form.taxRate || 0),
        invoice_no: form.invoiceNo || undefined,
        invoice_date: form.invoiceDate,
        file_id: form.fileId || undefined,
        status: form.status || undefined,
        receivables: invoiceRows.map((row) => ({
          receivable_id: row.receivableId,
          invoice_amount: Number(row.invoiceAmount || 0)
        })),
        remark: form.remark || undefined
      };
      await apiRequest<InvoiceRow>(editing ? `/leasing/invoices/${editing.id}` : "/leasing/invoices", {
        method: editing ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editing ? "invoice-update" : "invoice-create"),
        body
      });
      setDrawerOpen(false);
      setNotice(editing ? "发票已更新" : "发票已登记");
      await load(editing ? pageData.page : 1);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: InvoiceRow) {
    if (!window.confirm(`确认删除发票 ${row.invoiceCode}？`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest<{ id: string }>(`/leasing/invoices/${row.id}`, {
        method: "DELETE",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("invoice-delete")
      });
      setNotice("发票已删除，应收开票状态已重算");
      await load(pageData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function changeParkTenant(parkTenantId: string) {
    const tenant = parkTenants.find((item) => item.id === parkTenantId);
    setForm((prev) => ({
      ...prev,
      parkTenantId,
      buyerName: tenant?.companyName ?? prev.buyerName,
      buyerTaxNo: tenant?.unifiedCreditCode ?? prev.buyerTaxNo
    }));
    setInvoiceRows([{ receivableId: "", invoiceAmount: "0" }]);
    await loadReceivables(parkTenantId);
  }

  function onFileUploaded(file: FileRecord) {
    setForm((current) => ({ ...current, fileId: file.id }));
    setFileRefreshKey((current) => current + 1);
  }

  if (!canRead) {
    return (
      <div className="page-container">
        <section className="module-denied">
          <strong>403</strong>
          <span>当前账号无发票登记读取权限，或租户未启用 leasing 模块。</span>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="page-header">
        <div className="header-title">
          <strong>发票登记</strong>
          <span>登记线下发票，并关联到一条或多条应收账单</span>
        </div>
        <div className="page-actions">
          <button className="primary-button" type="button" onClick={() => load(pageData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
          {canCreate ? (
            <button className="primary-button" type="button" onClick={openCreate}>
              <Plus size={16} /> 新增发票
            </button>
          ) : null}
        </div>
      </section>

      <section className="filter-bar">
        <div className="system-grid-three">
          <label className="field">
            <span>关键词</span>
            <input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="单号、发票号、购买方" />
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
          <DictSelect label="发票类型" value={filters.invoiceType} items={invoiceTypeItems} allowEmpty onChange={(value) => setFilters((prev) => ({ ...prev, invoiceType: value }))} />
          <DictSelect label="发票状态" value={filters.status} items={invoiceStatusItems} allowEmpty onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
          <DateField label="开票开始" value={filters.invoiceStart} onChange={(value) => setFilters((prev) => ({ ...prev, invoiceStart: value }))} />
          <DateField label="开票结束" value={filters.invoiceEnd} onChange={(value) => setFilters((prev) => ({ ...prev, invoiceEnd: value }))} />
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
          <span className="muted-text">{loading ? "加载中" : `第 ${pageData.page} / ${totalPages} 页`}</span>
        </div>
        <div className="table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>发票单号</th>
                <th>租户企业</th>
                <th>发票类型</th>
                <th>购买方</th>
                <th>购方税号</th>
                <th>发票号码</th>
                <th>发票日期</th>
                <th>金额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.invoiceCode}</td>
                  <td>{row.parkTenant?.companyName ?? tenantName(parkTenants, row.parkTenantId)}</td>
                  <td>{dictLabel(invoiceTypeItems, row.invoiceType)}</td>
                  <td>{row.buyerName}</td>
                  <td>{buyerTaxNoText(row.buyerTaxNo, canViewBuyerTaxNo, authUser)}</td>
                  <td>{row.invoiceNo ?? "-"}</td>
                  <td>{dateOnly(row.invoiceDate)}</td>
                  <td>{invoiceAmountText(row.amount, canViewInvoiceAmount, authUser)}</td>
                  <td><DictBadge items={invoiceStatusItems} value={row.status} /></td>
                  <td>
                    <span className="data-table-actions">
                      <button className="primary-button" type="button" onClick={() => void openDetail(row)}>
                        <Link2 size={14} /> 应收
                      </button>
                      {canUpdate ? (
                        <button className="primary-button" type="button" onClick={() => void openEdit(row)}>
                          <Edit3 size={14} /> 编辑
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
        {pageData.items.length === 0 && !loading ? <div className="empty-state">暂无发票登记</div> : null}
      </Card>

      {drawerOpen ? (
        <Drawer size="lg" onClose={() => setDrawerOpen(false)}>
          <div className="system-toolbar">
            <strong>{editing ? "编辑发票" : "新增发票"}</strong>
            <button className="primary-button" type="button" onClick={() => setDrawerOpen(false)}>
              <X size={16} /> 关闭
            </button>
          </div>
          <form className="form-stack" onSubmit={submit}>
            <div className="system-grid">
              <TextField label="发票单号" value={form.invoiceCode} onChange={(value) => setForm((prev) => ({ ...prev, invoiceCode: value }))} placeholder="为空则自动生成" />
              <label className="field">
                <span>租户企业</span>
                <select required value={form.parkTenantId} onChange={(event) => void changeParkTenant(event.target.value)}>
                  <option value="">请选择</option>
                  {parkTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
                  ))}
                </select>
              </label>
              <DictSelect label="发票类型" value={form.invoiceType} items={invoiceTypeItems} onChange={(value) => setForm((prev) => ({ ...prev, invoiceType: value }))} />
              <TextField label="购买方名称" value={form.buyerName} onChange={(value) => setForm((prev) => ({ ...prev, buyerName: value }))} required />
              <TextField label="购方税号" value={form.buyerTaxNo} onChange={(value) => setForm((prev) => ({ ...prev, buyerTaxNo: value }))} />
              <NumberField label="发票金额" value={form.amount} onChange={(value) => setForm((prev) => ({ ...prev, amount: value }))} required />
              <NumberField label="税率" value={form.taxRate} onChange={(value) => setForm((prev) => ({ ...prev, taxRate: value }))} step="0.0001" />
              <TextField label="发票号码" value={form.invoiceNo} onChange={(value) => setForm((prev) => ({ ...prev, invoiceNo: value }))} />
              <DateField label="发票日期" value={form.invoiceDate} onChange={(value) => setForm((prev) => ({ ...prev, invoiceDate: value }))} required />
              <DictSelect label="发票状态" value={form.status} items={invoiceStatusItems} onChange={(value) => setForm((prev) => ({ ...prev, status: value }))} />
              {canViewInvoiceFile ? (
                <TextField label="附件文件 ID" value={form.fileId} onChange={(value) => setForm((prev) => ({ ...prev, fileId: value }))} />
              ) : null}
            </div>
            <label className="field">
              <span>备注</span>
              <textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
            </label>
            <section className="detail-stack">
              <h3>关联应收</h3>
              <div className="system-toolbar">
                <span className="muted-text">发票金额 {formatMoney(form.amount)}，关联合计 {formatMoney(invoiceRowsTotal)}</span>
                <button className="primary-button" type="button" onClick={() => setInvoiceRows((current) => [...current, { receivableId: "", invoiceAmount: "0" }])}>
                  <Plus size={16} /> 添加应收
                </button>
              </div>
              {invoiceRows.map((row, index) => (
                <div className="system-grid" key={`${index}-${row.receivableId}`}>
                  <label className="field">
                    <span>应收账单</span>
                    <select required value={row.receivableId} onChange={(event) => updateInvoiceRow(index, "receivableId", event.target.value, setInvoiceRows)}>
                      <option value="">请选择</option>
                      {receivables.map((receivable) => (
                        <option key={receivable.id} value={receivable.id}>
                          {receivable.arCode} {dictLabel(feeTypeItems, receivable.feeType)} {receivable.periodStart} 至 {receivable.periodEnd} 应收 {formatMoney(receivable.amountDue)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField label="开票金额" value={row.invoiceAmount} onChange={(value) => updateInvoiceRow(index, "invoiceAmount", value, setInvoiceRows)} required />
                  <label className="field">
                    <span>操作</span>
                    <button className="primary-button" type="button" onClick={() => setInvoiceRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                      移除
                    </button>
                  </label>
                </div>
              ))}
            </section>
            <section className="detail-stack">
              <h3>发票附件</h3>
              {canViewInvoiceFile ? (
                <>
                  <FileUploader bizType={INVOICE_FILE_BIZ_TYPE} bizId={editing?.id} onUploaded={onFileUploaded} />
                  {editing ? <AttachmentList bizType={INVOICE_FILE_BIZ_TYPE} bizId={editing.id} refreshKey={fileRefreshKey} /> : null}
                </>
              ) : (
                <div className="empty-state">当前字段权限不允许查看发票附件</div>
              )}
            </section>
            <button className="primary-button" type="submit" disabled={saving || (editing ? !canUpdate : !canCreate)}>
              {saving ? "保存中" : "保存"}
            </button>
          </form>
        </Drawer>
      ) : null}

      {detailOpen && viewing ? (
        <Drawer size="lg" onClose={() => setDetailOpen(false)}>
          <div className="system-toolbar">
            <strong>发票关联应收：{viewing.invoiceCode}</strong>
            <button className="primary-button" type="button" onClick={() => setDetailOpen(false)}>
              <X size={16} /> 关闭
            </button>
          </div>
          <div className="system-grid">
            <MetricTile label="发票金额" value={invoiceAmountText(viewing.amount, canViewInvoiceAmount, authUser)} />
            <MetricTile label="购买方" value={viewing.buyerName} />
            <MetricTile label="发票状态" value={dictLabel(invoiceStatusItems, viewing.status)} />
          </div>
          <div className="table-scroll">
            <DataTable >
              <thead>
                <tr>
                  <th>应收单号</th>
                  <th>合同</th>
                  <th>费用类型</th>
                  <th>账期</th>
                  <th>应收金额</th>
                  <th>开票金额</th>
                  <th>开票状态</th>
                  <th>应收状态</th>
                </tr>
              </thead>
              <tbody>
                {linkedReceivables.length === 0 ? (
                  <tr><td colSpan={8}>暂无关联应收</td></tr>
                ) : linkedReceivables.map((item) => (
                  <tr key={item.id}>
                    <td>{item.receivable?.arCode ?? item.receivableId}</td>
                    <td>{item.receivable?.contract?.contractCode ?? "-"}</td>
                    <td>{dictLabel(feeTypeItems, item.receivable?.feeType)}</td>
                    <td>{item.receivable ? `${item.receivable.periodStart} 至 ${item.receivable.periodEnd}` : "-"}</td>
                    <td>{formatMoney(item.receivable?.amountDue)}</td>
                    <td>{formatMoney(item.invoiceAmount)}</td>
                    <td><DictBadge items={invoiceStatusItems} value={item.receivable?.invoiceStatus} /></td>
                    <td><DictBadge items={receivableStatusItems} value={item.receivable?.status} /></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
          {!canViewInvoiceFile ? (
            <div className="empty-state">当前字段权限不允许查看发票附件</div>
          ) : viewing.fileId ? (
            <section className="detail-stack">
              <h3>发票附件</h3>
              <AttachmentList bizType={INVOICE_FILE_BIZ_TYPE} bizId={viewing.id} refreshKey={fileRefreshKey} />
            </section>
          ) : (
            <div className="empty-state">暂无发票附件</div>
          )}
        </Drawer>
      ) : null}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input required={required} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange, required, step = "0.01" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; step?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" step={step} required={required} value={value} onFocus={(event) => event.target.select()} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DictSelect({ label, value, items, onChange, allowEmpty }: {
  label: string;
  value: string;
  items: DictItemRow[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">全部</option> : null}
        {items.map((item) => (
          <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
        ))}
      </select>
    </label>
  );
}

function DictBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  const item = items.find((entry) => entry.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function updateInvoiceRow(index: number, key: keyof InvoiceReceivableFormRow, value: string, setRows: Dispatch<SetStateAction<InvoiceReceivableFormRow[]>>) {
  setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
}

function statusClass(tagType?: string | null): string {
  if (tagType === "success") return "status-success";
  if (tagType === "warning") return "status-warning";
  if (tagType === "danger") return "status-danger";
  if (tagType === "primary") return "status-primary";
  if (tagType === "info") return "status-info";
  return "status-muted";
}

function dictLabel(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function tenantName(items: ParkTenantRow[], id: string): string {
  return items.find((item) => item.id === id)?.companyName ?? "-";
}

function buyerTaxNoText(value: unknown, canView: boolean, user: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, INVOICE_ENTITY, "buyerTaxNo", value);
  return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
}

function invoiceAmountText(value: unknown, canView: boolean, user: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, INVOICE_ENTITY, "amount", value);
  return formatMoney(masked as string | number | null | undefined);
}

function formatMoney(value?: string | number | null): string {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(value ?? "-");
}

function normalizeAmount(value: unknown): string {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : "0";
}

function dateOnly(value?: string | null): string {
  if (!value) return "-";
  return value.slice(0, 10);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
