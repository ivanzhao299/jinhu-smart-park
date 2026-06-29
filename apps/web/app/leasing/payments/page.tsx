"use client";
import { DataTable, Drawer, Card, DrawerFooter, DrawerForm, DrawerHeader } from "@jinhu/ui";

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
const PAYMENT_ENTITY = "leasing_payment";
const PAYMENT_FILE_BIZ_TYPE = "leasing_payment";
const PAYMENT_PERMISSIONS = {
  read: "leasing_payment:read",
  create: "leasing_payment:create",
  update: "leasing_payment:update",
  delete: "leasing_payment:delete",
  apply: "leasing_payment:apply"
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

interface ReceivableRow {
  id: string;
  arCode: string;
  parkTenantId: string;
  feeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountRemain?: string | null;
  status: string;
}

interface PaymentRow {
  id: string;
  code: string | null;
  payCode: string;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  payTime: string;
  payMethod: string;
  payAmount: string;
  unappliedAmount: string;
  payerName: string | null;
  bankSerial?: string | null;
  receiptFileId: string | null;
  status: string;
  remark: string | null;
  updateTime: string;
}

interface PaymentApplicationRow {
  id: string;
  paymentId: string;
  receivableId: string;
  appliedAmount: string;
  createTime: string;
  receivable?: ReceivableRow | null;
}

interface PaymentFormState {
  payCode: string;
  parkTenantId: string;
  payTime: string;
  payMethod: string;
  payAmount: string;
  payerName: string;
  bankSerial: string;
  receiptFileId: string;
  status: string;
  remark: string;
}

interface ApplyFormRow {
  receivableId: string;
  appliedAmount: string;
}

const initialPageData: PaginatedResult<PaymentRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyForm: PaymentFormState = {
  payCode: "",
  parkTenantId: "",
  payTime: new Date().toISOString().slice(0, 16),
  payMethod: "bank_transfer",
  payAmount: "0",
  payerName: "",
  bankSerial: "",
  receiptFileId: "",
  status: "",
  remark: ""
};

export default function LeasingPaymentsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<PaymentRow>>(initialPageData);
  const [filters, setFilters] = useState({ keyword: "", parkTenantId: "", payMethod: "", status: "", payStart: "", payEnd: "" });
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [applications, setApplications] = useState<PaymentApplicationRow[]>([]);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [form, setForm] = useState<PaymentFormState>(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyRows, setApplyRows] = useState<ApplyFormRow[]>([{ receivableId: "", appliedAmount: "0" }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptRefreshKey, setReceiptRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRead = hasAccess(authUser, PAYMENT_PERMISSIONS.read, LEASING_MODULE);
  const canCreate = hasPermission(authUser, PAYMENT_PERMISSIONS.create);
  const canUpdate = hasPermission(authUser, PAYMENT_PERMISSIONS.update);
  const canDelete = hasPermission(authUser, PAYMENT_PERMISSIONS.delete);
  const canApply = hasPermission(authUser, PAYMENT_PERMISSIONS.apply);
  const canViewPayAmount = canViewField(authUser, LEASING_MODULE, PAYMENT_ENTITY, "payAmount");
  const canViewUnappliedAmount = canViewField(authUser, LEASING_MODULE, PAYMENT_ENTITY, "unappliedAmount");
  const canViewBankSerial = canViewField(authUser, LEASING_MODULE, PAYMENT_ENTITY, "bankSerial");
  const canViewReceiptFile = canViewField(authUser, LEASING_MODULE, PAYMENT_ENTITY, "receiptFileId");

  const payMethodItems = dicts.leasing_payment_method ?? [];
  const paymentStatusItems = dicts.leasing_payment_status ?? [];
  const feeTypeItems = dicts.leasing_fee_type ?? [];
  const receivableStatusItems = dicts.leasing_receivable_status ?? [];

  const load = useCallback(async (page = 1) => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size) });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      if (filters.payMethod) params.set("pay_method", filters.payMethod);
      if (filters.status) params.set("status", filters.status);
      if (filters.payStart) params.set("pay_start", filters.payStart);
      if (filters.payEnd) params.set("pay_end", filters.payEnd);
      const response = await apiRequest<PaginatedResult<PaymentRow>>(`/leasing/payments?${params.toString()}`, {
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
    const codes = ["leasing_payment_method", "leasing_payment_status", "leasing_fee_type", "leasing_receivable_status"];
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
    setReceivables(response.data.items.filter((item) => Number(item.amountRemain ?? 0) > 0 && !["50", "80", "90"].includes(item.status)));
  }, []);

  const loadApplications = useCallback(async (paymentId: string) => {
    const response = await apiRequest<PaymentApplicationRow[]>(`/leasing/payments/${paymentId}/applications`, {
      token: getAccessToken()
    });
    setApplications(response.data);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void Promise.all([loadDicts(), loadParkTenants()]).catch((err) => setError(toErrorMessage(err)));
  }, [canRead, loadDicts, loadParkTenants]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    if (!applyOpen || !editing) return;
    void loadReceivables(editing.parkTenantId).catch((err) => setError(toErrorMessage(err)));
    void loadApplications(editing.id).catch((err) => setError(toErrorMessage(err)));
  }, [applyOpen, editing, loadApplications, loadReceivables]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, payMethod: payMethodItems[0]?.itemValue ?? "bank_transfer", status: paymentStatusItems[0]?.itemValue ?? "" });
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
  }

  function openEdit(row: PaymentRow) {
    setEditing(row);
    setForm({
      payCode: row.payCode,
      parkTenantId: row.parkTenantId,
      payTime: toDateTimeInput(row.payTime),
      payMethod: row.payMethod,
      payAmount: normalizeAmount(row.payAmount),
      payerName: row.payerName ?? "",
      bankSerial: row.bankSerial ?? "",
      receiptFileId: row.receiptFileId ?? "",
      status: row.status,
      remark: row.remark ?? ""
    });
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
  }

  function openApply(row: PaymentRow) {
    setEditing(row);
    setApplyRows([{ receivableId: "", appliedAmount: normalizeAmount(row.unappliedAmount) }]);
    setApplications([]);
    setApplyOpen(true);
    setError(null);
    setNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        pay_code: form.payCode || undefined,
        park_tenant_id: form.parkTenantId,
        pay_time: form.payTime,
        pay_method: form.payMethod,
        pay_amount: Number(form.payAmount || 0),
        payer_name: form.payerName || undefined,
        bank_serial: form.bankSerial || undefined,
        receipt_file_id: form.receiptFileId || undefined,
        remark: form.remark || undefined
      };
      await apiRequest<PaymentRow>(editing ? `/leasing/payments/${editing.id}` : "/leasing/payments", {
        method: editing ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editing ? "payment-update" : "payment-create"),
        body
      });
      setDrawerOpen(false);
      setNotice(editing ? "收款已更新" : "收款已登记");
      await load(editing ? pageData.page : 1);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: PaymentRow) {
    if (!window.confirm(`确认删除收款 ${row.payCode}？`)) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest<{ id: string }>(`/leasing/payments/${row.id}`, {
        method: "DELETE",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("payment-delete")
      });
      setNotice("收款已删除");
      await load(pageData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function applyPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest<PaymentRow>(`/leasing/payments/${editing.id}/apply`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("payment-apply"),
        body: {
          applications: applyRows.map((row) => ({
            receivable_id: row.receivableId,
            applied_amount: Number(row.appliedAmount || 0)
          }))
        }
      });
      setNotice("收款核销完成");
      setApplyOpen(false);
      await load(pageData.page);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function onReceiptUploaded(file: FileRecord) {
    setForm((current) => ({ ...current, receiptFileId: file.id }));
    setReceiptRefreshKey((current) => current + 1);
  }

  if (!canRead) {
    return (
      <div className="page-container">
        <section className="module-denied">
          <strong>403</strong>
          <span>当前账号无收款登记读取权限，或租户未启用 leasing 模块。</span>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="page-header">
        <div className="header-title">
          <strong>收款登记</strong>
          <span>登记租户回款，并核销到一条或多条应收账单</span>
        </div>
        <div className="page-actions">
          <button className="primary-button" type="button" onClick={() => load(pageData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
          {canCreate ? (
            <button className="primary-button" type="button" onClick={openCreate}>
              <Plus size={16} /> 新增收款
            </button>
          ) : null}
        </div>
      </section>

      <section className="filter-bar">
        <div className="system-grid-three">
          <label className="field">
            <span>关键词</span>
            <input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="单号、付款人、流水号" />
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
          <DictSelect label="收款方式" value={filters.payMethod} items={payMethodItems} allowEmpty onChange={(value) => setFilters((prev) => ({ ...prev, payMethod: value }))} />
          <DictSelect label="核销状态" value={filters.status} items={paymentStatusItems} allowEmpty onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
          <DateField label="收款开始" value={filters.payStart} onChange={(value) => setFilters((prev) => ({ ...prev, payStart: value }))} />
          <DateField label="收款结束" value={filters.payEnd} onChange={(value) => setFilters((prev) => ({ ...prev, payEnd: value }))} />
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
                <th>收款单号</th>
                <th>租户企业</th>
                <th>收款时间</th>
                <th>收款方式</th>
                <th>收款金额</th>
                <th>未核销金额</th>
                <th>付款人</th>
                <th>银行流水号</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.payCode}</td>
                  <td>{row.parkTenant?.companyName ?? tenantName(parkTenants, row.parkTenantId)}</td>
                  <td>{formatDateTime(row.payTime)}</td>
                  <td>{dictLabel(payMethodItems, row.payMethod)}</td>
                  <td>{paymentAmountText(row.payAmount, "payAmount", canViewPayAmount, authUser)}</td>
                  <td>{paymentAmountText(row.unappliedAmount, "unappliedAmount", canViewUnappliedAmount, authUser)}</td>
                  <td>{row.payerName ?? "-"}</td>
                  <td>{bankSerialText(row.bankSerial, canViewBankSerial, authUser)}</td>
                  <td><DictBadge items={paymentStatusItems} value={row.status} /></td>
                  <td>
                    <span className="data-table-actions">
                      {canApply ? (
                        <button className="primary-button" type="button" onClick={() => openApply(row)}>
                          <Link2 size={14} /> 核销
                        </button>
                      ) : null}
                      {canUpdate ? (
                        <button className="primary-button" type="button" onClick={() => openEdit(row)}>
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
        {pageData.items.length === 0 && !loading ? <div className="empty-state">暂无收款登记</div> : null}
      </Card>

      {drawerOpen ? (
        <Drawer size="lg" onClose={() => setDrawerOpen(false)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title={editing ? "编辑收款" : "新增收款"}
            description="登记租户收款记录与收款凭证。"
            onClose={() => setDrawerOpen(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={submit}>
            <div className="system-grid">
              <TextField label="收款单号" value={form.payCode} onChange={(value) => setForm((prev) => ({ ...prev, payCode: value }))} placeholder="为空则自动生成" />
              <label className="field">
                <span>租户企业</span>
                <select required value={form.parkTenantId} onChange={(event) => setForm((prev) => ({ ...prev, parkTenantId: event.target.value }))}>
                  <option value="">请选择</option>
                  {parkTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>收款时间</span>
                <input required type="datetime-local" value={form.payTime} onChange={(event) => setForm((prev) => ({ ...prev, payTime: event.target.value }))} />
              </label>
              <DictSelect label="收款方式" value={form.payMethod} items={payMethodItems} onChange={(value) => setForm((prev) => ({ ...prev, payMethod: value }))} />
              <NumberField label="收款金额" value={form.payAmount} onChange={(value) => setForm((prev) => ({ ...prev, payAmount: value }))} required />
              <TextField label="付款人" value={form.payerName} onChange={(value) => setForm((prev) => ({ ...prev, payerName: value }))} />
              <TextField label="银行流水号" value={form.bankSerial} onChange={(value) => setForm((prev) => ({ ...prev, bankSerial: value }))} />
            </div>
            <label className="field">
              <span>备注</span>
              <textarea value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
            </label>
            {canViewReceiptFile ? (
              <section className="detail-stack">
                <h3>收款凭证</h3>
                <FileUploader bizType={PAYMENT_FILE_BIZ_TYPE} bizId={editing?.id} onUploaded={onReceiptUploaded} />
                {editing ? <AttachmentList bizType={PAYMENT_FILE_BIZ_TYPE} bizId={editing.id} refreshKey={receiptRefreshKey} /> : null}
              </section>
            ) : null}
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setDrawerOpen(false)}>取消</button>
              <button className="primary-button" type="submit" disabled={saving || (editing ? !canUpdate : !canCreate)}>
                {saving ? "保存中" : "保存"}
              </button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}

      {applyOpen && editing ? (
        <Drawer size="lg" onClose={() => setApplyOpen(false)}>
          <DrawerHeader
            eyebrow="招商租赁"
            title={`收款核销：${editing.payCode}`}
            description="将收款金额核销到对应的应收账单。"
            onClose={() => setApplyOpen(false)}
            closeIcon={<X size={18} />}
          />
          <div className="system-grid">
            <MetricTile label="收款金额" value={paymentAmountText(editing.payAmount, "payAmount", canViewPayAmount, authUser)} />
            <MetricTile label="未核销金额" value={paymentAmountText(editing.unappliedAmount, "unappliedAmount", canViewUnappliedAmount, authUser)} />
            <MetricTile label="租户企业" value={editing.parkTenant?.companyName ?? tenantName(parkTenants, editing.parkTenantId)} />
          </div>
          <DrawerForm onSubmit={applyPayment}>
            {applyRows.map((row, index) => (
              <div className="system-grid" key={`${index}-${row.receivableId}`}>
                <label className="field">
                  <span>应收账单</span>
                  <select required value={row.receivableId} onChange={(event) => updateApplyRow(index, "receivableId", event.target.value, setApplyRows)}>
                    <option value="">请选择</option>
                    {receivables.map((receivable) => (
                      <option key={receivable.id} value={receivable.id}>
                        {receivable.arCode} {dictLabel(feeTypeItems, receivable.feeType)} 未收 {formatMoney(receivable.amountRemain)}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField label="核销金额" value={row.appliedAmount} onChange={(value) => updateApplyRow(index, "appliedAmount", value, setApplyRows)} required />
                <label className="field">
                  <span>操作</span>
                  <button className="primary-button" type="button" onClick={() => setApplyRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                    移除
                  </button>
                </label>
              </div>
            ))}
            <div className="page-actions">
              <button className="secondary-button" type="button" onClick={() => setApplyRows((current) => [...current, { receivableId: "", appliedAmount: "0" }])}>
                <Plus size={16} /> 添加应收
              </button>
            </div>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setApplyOpen(false)}>取消</button>
              <button className="primary-button" type="submit" disabled={saving || !canApply}>
                {saving ? "核销中" : "确认核销"}
              </button>
            </DrawerFooter>
          </DrawerForm>
          <section className="detail-stack">
            <h3>已核销记录</h3>
            <div className="table-scroll">
              <DataTable >
                <thead>
                  <tr>
                    <th>应收单号</th>
                    <th>费用类型</th>
                    <th>账期</th>
                    <th>核销金额</th>
                    <th>应收状态</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.length === 0 ? (
                    <tr><td colSpan={6}>暂无核销记录</td></tr>
                  ) : applications.map((application) => (
                    <tr key={application.id}>
                      <td>{application.receivable?.arCode ?? application.receivableId}</td>
                      <td>{dictLabel(feeTypeItems, application.receivable?.feeType ?? "")}</td>
                      <td>{application.receivable ? `${application.receivable.periodStart} 至 ${application.receivable.periodEnd}` : "-"}</td>
                      <td>{formatMoney(application.appliedAmount)}</td>
                      <td><DictBadge items={receivableStatusItems} value={application.receivable?.status} /></td>
                      <td>{formatDateTime(application.createTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </section>
        </Drawer>
      ) : null}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
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

function NumberField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" step="0.01" required={required} value={value} onFocus={(event) => event.target.select()} onChange={(event) => onChange(event.target.value)} />
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

function updateApplyRow(index: number, key: keyof ApplyFormRow, value: string, setRows: Dispatch<SetStateAction<ApplyFormRow[]>>) {
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

function bankSerialText(value: unknown, canView: boolean, user: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, PAYMENT_ENTITY, "bankSerial", value);
  return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
}

function paymentAmountText(value: unknown, fieldKey: "payAmount" | "unappliedAmount", canView: boolean, user: ReturnType<typeof useAuthUser>): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, PAYMENT_ENTITY, fieldKey, value);
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

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

function toDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
