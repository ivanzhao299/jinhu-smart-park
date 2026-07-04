"use client";
import { Card, DataTable, DataTableActions, Drawer, DrawerFooter, DrawerForm, DrawerHeader } from "@jinhu/ui";

import { CheckCircle2, Edit3, Eye, Plus, RefreshCw, Search, Send, Trash2, X, XCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { FileUploader } from "../../../components/files/FileUploader";
import { ApiError, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canViewField, maskField } from "../../../lib/field-policy";
import { hasAccess, hasPermission } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const CHECKOUT_ENTITY = "leasing_checkout";
const REFUND_ENTITY = "leasing_refund";
const CHECKOUT_PERMISSIONS = {
  read: "leasing_checkout:read",
  create: "leasing_checkout:create",
  update: "leasing_checkout:update",
  delete: "leasing_checkout:delete",
  submit: "leasing_checkout:submit",
  approve: "leasing_checkout:approve",
  reject: "leasing_checkout:reject",
  previewSettlement: "leasing_checkout:preview_settlement",
  confirmSettlement: "leasing_checkout:confirm_settlement",
  effective: "leasing_checkout:effective",
  refundRead: "leasing_refund:read",
  refundCreate: "leasing_refund:create"
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
  depositAmount?: string | null;
  status: string;
}

interface CheckoutRow {
  id: string;
  code: string | null;
  checkoutCode: string;
  contractId: string;
  contract?: ContractRow | null;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  checkoutType: string;
  plannedCheckoutDate: string;
  actualCheckoutDate: string | null;
  reason: string;
  releaseUnitStatus: string;
  unpaidAmount?: string | null;
  lateFeeAmount?: string | null;
  depositAmount?: string | null;
  deductionAmount?: string | null;
  additionalChargeAmount?: string | null;
  refundAmount?: string | null;
  amountDueFromTenant?: string | null;
  settlementRemark: string | null;
  settlementStatus: string;
  status: string;
  rejectReason: string | null;
  approveRecords: unknown[];
  remark: string | null;
  updateTime: string;
}

interface RefundRow {
  id: string;
  refundCode: string;
  checkoutId: string;
  contractId: string;
  parkTenantId: string;
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

interface SettlementPreview {
  contract_id: string;
  checkout_id: string;
  unpaid_receivables: Array<{
    receivable_id: string;
    ar_code: string;
    fee_type: string;
    period_start: string;
    period_end: string;
    due_date: string;
    amount_remain?: string | null;
    late_fee?: string | null;
  }>;
  summary: {
    unpaid_amount?: string | null;
    late_fee_amount?: string | null;
    deposit_amount?: string | null;
    deduction_amount?: string | null;
    additional_charge_amount?: string | null;
    refund_amount?: string | null;
    amount_due_from_tenant?: string | null;
  };
}

interface EffectiveResult {
  checkout: CheckoutRow;
  contract: ContractRow;
  released_units: Array<{
    unit_id: string;
    unit_code: string;
    before_status: number;
    after_status: number;
  }>;
  canceled_receivables: Array<{
    receivable_id: string;
    ar_code: string;
    before_status: string;
    after_status: string;
    period_start: string;
    period_end: string;
    amount_remain?: string | null;
  }>;
  skipped_receivables: Array<{
    receivable_id: string;
    ar_code: string;
    reason: string;
  }>;
}

interface CheckoutFormState {
  checkoutCode: string;
  contractId: string;
  checkoutType: string;
  plannedCheckoutDate: string;
  actualCheckoutDate: string;
  reason: string;
  releaseUnitStatus: string;
  settlementRemark: string;
  remark: string;
}

interface SettlementFormState {
  deductionAmount: string;
  additionalChargeAmount: string;
  settlementRemark: string;
}

interface RefundFormState {
  refundCode: string;
  refundAmount: string;
  refundMethod: string;
  refundTime: string;
  receiverName: string;
  receiverBankAccount: string;
  bankSerial: string;
  receiptFileId: string;
  receiptFileName: string;
  remark: string;
}

const emptyPage: PaginatedResult<CheckoutRow> = { items: [], total: 0, page: 1, page_size: 20 };
const today = () => new Date().toISOString().slice(0, 10);
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const emptyCheckoutForm: CheckoutFormState = {
  checkoutCode: "",
  contractId: "",
  checkoutType: "normal",
  plannedCheckoutDate: today(),
  actualCheckoutDate: "",
  reason: "",
  releaseUnitStatus: "rentable",
  settlementRemark: "",
  remark: ""
};

const emptySettlementForm: SettlementFormState = {
  deductionAmount: "0",
  additionalChargeAmount: "0",
  settlementRemark: ""
};

const emptyRefundForm: RefundFormState = {
  refundCode: "",
  refundAmount: "",
  refundMethod: "bank_transfer",
  refundTime: nowLocal(),
  receiverName: "",
  receiverBankAccount: "",
  bankSerial: "",
  receiptFileId: "",
  receiptFileName: "",
  remark: ""
};

export default function LeasingCheckoutsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<CheckoutRow>>(emptyPage);
  const [filters, setFilters] = useState({ keyword: "", contractId: "", parkTenantId: "", checkoutType: "", status: "" });
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [editing, setEditing] = useState<CheckoutRow | null>(null);
  const [detail, setDetail] = useState<CheckoutRow | null>(null);
  const [form, setForm] = useState<CheckoutFormState>(emptyCheckoutForm);
  const [settlementForm, setSettlementForm] = useState<SettlementFormState>(emptySettlementForm);
  const [refundForm, setRefundForm] = useState<RefundFormState>(emptyRefundForm);
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreview | null>(null);
  const [effectiveResult, setEffectiveResult] = useState<EffectiveResult | null>(null);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canRead = hasAccess(authUser, CHECKOUT_PERMISSIONS.read, LEASING_MODULE);
  const canCreate = hasPermission(authUser, CHECKOUT_PERMISSIONS.create);
  const canUpdate = hasPermission(authUser, CHECKOUT_PERMISSIONS.update);
  const canDelete = hasPermission(authUser, CHECKOUT_PERMISSIONS.delete);
  const canSubmit = hasPermission(authUser, CHECKOUT_PERMISSIONS.submit);
  const canApprove = hasPermission(authUser, CHECKOUT_PERMISSIONS.approve);
  const canReject = hasPermission(authUser, CHECKOUT_PERMISSIONS.reject);
  const canPreviewSettlement = hasPermission(authUser, CHECKOUT_PERMISSIONS.previewSettlement);
  const canConfirmSettlement = hasPermission(authUser, CHECKOUT_PERMISSIONS.confirmSettlement);
  const canEffective = hasPermission(authUser, CHECKOUT_PERMISSIONS.effective);
  const canReadRefund = hasPermission(authUser, CHECKOUT_PERMISSIONS.refundRead);
  const canCreateRefund = hasPermission(authUser, CHECKOUT_PERMISSIONS.refundCreate);

  const checkoutTypeItems = dicts.leasing_checkout_type ?? [];
  const releaseStatusItems = dicts.leasing_release_unit_status ?? [];
  const settlementStatusItems = dicts.leasing_settlement_status ?? [];
  const checkoutStatusItems = dicts.leasing_checkout_status ?? [];
  const refundMethodItems = dicts.leasing_refund_method ?? [];
  const refundStatusItems = dicts.leasing_refund_status ?? [];
  const feeTypeItems = dicts.leasing_fee_type ?? [];
  const contractStatusItems = dicts.leasing_contract_status ?? [];
  const unitRentalStatusItems = dicts.unit_rental_status ?? [];
  const activeContracts = useMemo(() => contracts.filter((item) => item.status === "75"), [contracts]);

  const load = useCallback(async (page = 1) => {
    if (!canRead) return;
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size), sort: "-updateTime" });
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.contractId) params.set("contract_id", filters.contractId);
      if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
      if (filters.checkoutType) params.set("checkout_type", filters.checkoutType);
      if (filters.status) params.set("status", filters.status);
      const response = await apiRequest<PaginatedResult<CheckoutRow>>(`/leasing/checkouts?${params.toString()}`, { token: getAccessToken() });
      setPageData(response.data);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [canRead, filters, pageData.page_size]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "leasing_checkout_type",
      "leasing_release_unit_status",
      "leasing_settlement_status",
      "leasing_checkout_status",
      "leasing_refund_method",
      "leasing_refund_status",
      "leasing_fee_type",
      "leasing_contract_status",
      "unit_rental_status"
    ];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
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

  async function loadRefunds(checkoutId: string) {
    if (!canReadRefund) return;
    const response = await apiRequest<RefundRow[]>(`/leasing/checkouts/${checkoutId}/refunds`, { token: getAccessToken() });
    setRefunds(response.data);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const contractId = params.get("contract_id") ?? "";
    if (contractId) {
      setFilters((prev) => ({ ...prev, contractId }));
      setForm((prev) => ({ ...prev, contractId }));
      setDrawerOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void Promise.all([loadDicts(), loadLookups()]).catch((error) => setMessage(toErrorMessage(error)));
  }, [canRead, loadDicts, loadLookups]);

  useEffect(() => {
    void load(1);
  }, [load]);

  function openCreate(contractId?: string) {
    setEditing(null);
    setDetail(null);
    setSettlementPreview(null);
    setEffectiveResult(null);
    setRefunds([]);
    setForm({ ...emptyCheckoutForm, contractId: contractId ?? filters.contractId });
    setSettlementForm(emptySettlementForm);
    setRefundForm(emptyRefundForm);
    setDrawerOpen(true);
  }

  function openEdit(row: CheckoutRow) {
    setEditing(row);
    setDetail(row);
    setForm(formFromCheckout(row));
    setSettlementForm({
      deductionAmount: row.deductionAmount ?? "0",
      additionalChargeAmount: row.additionalChargeAmount ?? "0",
      settlementRemark: row.settlementRemark ?? ""
    });
    setRefundForm((current) => ({ ...current, refundAmount: row.refundAmount ?? "" }));
    setSettlementPreview(null);
    setEffectiveResult(null);
    void loadRefunds(row.id).catch((error) => setMessage(toErrorMessage(error)));
    setDrawerOpen(true);
  }

  async function saveCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.contractId) {
      setMessage("请选择已生效合同");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        checkout_code: form.checkoutCode || undefined,
        checkout_type: form.checkoutType,
        planned_checkout_date: form.plannedCheckoutDate,
        actual_checkout_date: form.actualCheckoutDate || undefined,
        reason: form.reason,
        release_unit_status: form.releaseUnitStatus,
        settlement_remark: form.settlementRemark || undefined,
        remark: form.remark || undefined
      };
      const response = await apiRequest<CheckoutRow>(editing ? `/leasing/checkouts/${editing.id}` : `/leasing/contracts/${form.contractId}/checkouts`, {
        method: editing ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editing ? "checkout-update" : "checkout-create"),
        body: payload
      });
      setMessage(editing ? "退租申请已更新" : "退租申请已创建");
      setEditing(response.data);
      setDetail(response.data);
      await load(editing ? pageData.page : 1);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CheckoutRow) {
    if (!window.confirm(`确认删除退租单 ${row.checkoutCode}？`)) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest<{ id: string }>(`/leasing/checkouts/${row.id}`, {
        method: "DELETE",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("checkout-delete"),
        body: {}
      });
      setMessage("退租申请已删除");
      if (detail?.id === row.id) setDrawerOpen(false);
      await load(pageData.page);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function actionCheckout(row: CheckoutRow, action: "submit" | "approve" | "reject") {
    const text = window.prompt(action === "reject" ? "请输入驳回原因" : "请输入审批意见", action === "submit" ? "提交审批" : action === "approve" ? "同意" : "");
    if (text === null) return;
    if (action === "reject" && !text.trim()) {
      setMessage("驳回原因必填");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiRequest<CheckoutRow>(`/leasing/checkouts/${row.id}/${action}`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(`checkout-${action}`),
        body: action === "reject" ? { reject_reason: text, opinion: text } : { opinion: text || undefined }
      });
      setMessage(action === "submit" ? "退租申请已提交" : action === "approve" ? "退租申请已审批通过" : "退租申请已驳回");
      setEditing(response.data);
      setDetail(response.data);
      await load(pageData.page);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function previewSettlement(row: CheckoutRow) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiRequest<SettlementPreview>(`/leasing/checkouts/${row.id}/preview-settlement`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("checkout-preview-settlement"),
        body: {
          deduction_amount: settlementForm.deductionAmount || "0",
          additional_charge_amount: settlementForm.additionalChargeAmount || "0",
          settlement_remark: settlementForm.settlementRemark || undefined
        }
      });
      setSettlementPreview(response.data);
      setMessage("结算预览已更新");
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmSettlement(row: CheckoutRow) {
    if (!window.confirm("确认结算后，本轮不会自动生成应收或释放房源，后续可登记退款。是否继续？")) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiRequest<CheckoutRow>(`/leasing/checkouts/${row.id}/confirm-settlement`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("checkout-confirm-settlement"),
        body: {
          deduction_amount: settlementForm.deductionAmount || "0",
          additional_charge_amount: settlementForm.additionalChargeAmount || "0",
          settlement_remark: settlementForm.settlementRemark || undefined
        }
      });
      setEditing(response.data);
      setDetail(response.data);
      setRefundForm((current) => ({ ...current, refundAmount: response.data.refundAmount ?? current.refundAmount }));
      setMessage("退租结算已确认");
      await load(pageData.page);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function createRefund(row: CheckoutRow) {
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest<RefundRow>(`/leasing/checkouts/${row.id}/refunds`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("checkout-refund-create"),
        body: {
          refund_code: refundForm.refundCode || undefined,
          refund_amount: refundForm.refundAmount,
          refund_method: refundForm.refundMethod,
          refund_time: refundForm.refundTime,
          receiver_name: refundForm.receiverName || undefined,
          receiver_bank_account: refundForm.receiverBankAccount || undefined,
          bank_serial: refundForm.bankSerial || undefined,
          receipt_file_id: refundForm.receiptFileId || undefined,
          remark: refundForm.remark || undefined
        }
      });
      setMessage("退款登记已保存");
      setRefundForm(emptyRefundForm);
      await loadRefunds(row.id);
      await load(pageData.page);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function effectiveCheckout(row: CheckoutRow) {
    const defaultDate = form.actualCheckoutDate || row.actualCheckoutDate || row.plannedCheckoutDate || today();
    const actualCheckoutDate = window.prompt("请输入实际退租日期", defaultDate);
    if (actualCheckoutDate === null) return;
    if (!actualCheckoutDate.trim()) {
      setMessage("实际退租日期必填");
      return;
    }
    const opinion = window.prompt("请输入生效意见", "退租完成，房源释放");
    if (opinion === null) return;
    if (!window.confirm("退租生效后将终止合同、释放房源，并取消符合条件的未来未收应收。是否继续？")) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiRequest<EffectiveResult>(`/leasing/checkouts/${row.id}/effective`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("checkout-effective"),
        body: {
          actual_checkout_date: actualCheckoutDate,
          opinion: opinion || undefined
        }
      });
      setEffectiveResult(response.data);
      setEditing(response.data.checkout);
      setDetail(response.data.checkout);
      setForm(formFromCheckout(response.data.checkout));
      setMessage("退租已生效，合同已终止并释放房源");
      await load(pageData.page);
      await loadLookups();
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div className="page-container">
        <section className="module-denied">
          <strong>403</strong>
          <span>当前账号暂无退租管理读取权限，或当前租户未开通招商租赁能力。</span>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="page-header">
        <div className="header-title">
          <strong>退租管理</strong>
          <span>处理正常到期、提前退租与违约终止申请，审批后进入结算和退款登记</span>
        </div>
        <div className="page-actions">
          <button className="primary-button" type="button" onClick={() => load(pageData.page)} disabled={loading}>
            <RefreshCw size={16} /> 刷新
          </button>
          {canCreate ? (
            <button className="primary-button" type="button" onClick={() => openCreate()}>
              <Plus size={16} /> 发起退租
            </button>
          ) : null}
        </div>
      </section>

      <section className="filter-bar">
        <div className="system-grid-three">
          <label className="field">
            <span>关键词</span>
            <input value={filters.keyword} onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))} placeholder="退租单、合同、租户" />
          </label>
          <label className="field">
            <span>合同</span>
            <select value={filters.contractId} onChange={(event) => setFilters((prev) => ({ ...prev, contractId: event.target.value }))}>
              <option value="">全部</option>
              {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractCode} {contract.contractName}</option>)}
            </select>
          </label>
          <label className="field">
            <span>租户企业</span>
            <select value={filters.parkTenantId} onChange={(event) => setFilters((prev) => ({ ...prev, parkTenantId: event.target.value }))}>
              <option value="">全部</option>
              {parkTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>)}
            </select>
          </label>
          <label className="field">
            <span>退租类型</span>
            <select value={filters.checkoutType} onChange={(event) => setFilters((prev) => ({ ...prev, checkoutType: event.target.value }))}>
              <option value="">全部</option>
              {checkoutTypeItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
            </select>
          </label>
          <label className="field">
            <span>状态</span>
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">全部</option>
              {checkoutStatusItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
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
        {message ? <div className="empty-state">{message}</div> : null}
        <div className="system-toolbar">
          <span className="muted-text">共 {pageData.total} 条</span>
          <span className="muted-text">{loading ? "加载中" : `第 ${pageData.page} 页`}</span>
        </div>
        <div className="table-scroll">
          <DataTable className="allow-horizontal-table">
            <thead>
              <tr>
                <th>退租单</th>
                <th>合同 / 租户</th>
                <th>类型 / 日期</th>
                <th>房源 / 结算</th>
                <th>状态 / 金额</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.length === 0 ? (
                <tr><td colSpan={6}>暂无退租申请</td></tr>
              ) : pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <StackedCell primary={row.checkoutCode} secondary={row.code ?? "退租申请"} />
                  </td>
                  <td>
                    <StackedCell
                      primary={row.contract ? `${row.contract.contractCode} ${row.contract.contractName}` : row.contractId}
                      secondary={row.parkTenant?.companyName ?? row.contract?.parkTenant?.companyName ?? row.parkTenantId}
                    />
                  </td>
                  <td>
                    <StackedCell
                      primary={<DictBadge items={checkoutTypeItems} value={row.checkoutType} />}
                      secondary={`计划 ${formatDate(row.plannedCheckoutDate)}`}
                    />
                  </td>
                  <td>
                    <StackedCell
                      primary={<DictBadge items={releaseStatusItems} value={row.releaseUnitStatus} />}
                      secondary={<DictBadge items={settlementStatusItems} value={row.settlementStatus} />}
                    />
                  </td>
                  <td>
                    <StackedCell
                      primary={<DictBadge items={checkoutStatusItems} value={row.status} />}
                      secondary={`应退 ${moneyText(authUser, CHECKOUT_ENTITY, "refundAmount", row.refundAmount)}`}
                    />
                  </td>
                  <td>
                    <DataTableActions>
                      <button className="ds-row-action ds-row-action-view" type="button" onClick={() => openEdit(row)} title="查看">
                        <Eye size={16} />
                        <span className="ds-row-action-label">查看</span>
                      </button>
                      {canUpdate && row.status === "10" ? (
                        <button className="ds-row-action ds-row-action-edit" type="button" onClick={() => openEdit(row)} title="编辑">
                          <Edit3 size={16} />
                          <span className="ds-row-action-label">编辑</span>
                        </button>
                      ) : null}
                      {canDelete && ["10", "50"].includes(row.status) ? (
                        <button className="ds-row-action ds-row-action-danger" type="button" onClick={() => void remove(row)} title="删除">
                          <Trash2 size={16} />
                          <span className="ds-row-action-label">删除</span>
                        </button>
                      ) : null}
                    </DataTableActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>

      {drawerOpen ? (
          <Drawer size="lg" onClose={() => setDrawerOpen(false)}>
            <DrawerHeader
              eyebrow="招商租赁"
              title={editing ? `退租单 ${editing.checkoutCode}` : "发起退租申请"}
              description="维护退租申请、结算预览、退款登记与房源释放。"
              onClose={() => setDrawerOpen(false)}
              closeIcon={<X size={18} />}
            />

            <DrawerForm onSubmit={saveCheckout}>
              <div className="system-grid">
                <TextField label="退租单号" value={form.checkoutCode} onChange={(value) => setFormValue("checkoutCode", value, setForm)} placeholder="为空时自动生成" disabled={Boolean(editing)} />
                <SelectField label="已生效合同" value={form.contractId} onChange={(value) => setFormValue("contractId", value, setForm)} options={activeContracts.map((contract) => ({ id: contract.id, itemValue: contract.id, itemLabel: `${contract.contractCode} ${contract.contractName}`, status: "enabled" }))} disabled={Boolean(editing)} required />
                <SelectField label="退租类型" value={form.checkoutType} onChange={(value) => setFormValue("checkoutType", value, setForm)} options={checkoutTypeItems} required />
                <DateField label="计划退租日期" value={form.plannedCheckoutDate} onChange={(value) => setFormValue("plannedCheckoutDate", value, setForm)} required />
                <DateField label="实际退租日期" value={form.actualCheckoutDate} onChange={(value) => setFormValue("actualCheckoutDate", value, setForm)} />
                <SelectField label="退租后房源状态" value={form.releaseUnitStatus} onChange={(value) => setFormValue("releaseUnitStatus", value, setForm)} options={releaseStatusItems} required />
              </div>
              <TextAreaField label="退租原因" value={form.reason} onChange={(value) => setFormValue("reason", value, setForm)} />
              <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue("remark", value, setForm)} />
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setDrawerOpen(false)}>取消</button>
                {(!editing || editing.status === "10") && (editing ? canUpdate : canCreate) ? (
                  <button className="primary-button" disabled={saving} type="submit">
                    <CheckCircle2 size={16} /> 保存
                  </button>
                ) : null}
                {editing && ["10", "50"].includes(editing.status) && canSubmit ? (
                  <button className="primary-button" disabled={saving} type="button" onClick={() => void actionCheckout(editing, "submit")}>
                    <Send size={16} /> 提交审批
                  </button>
                ) : null}
                {editing && editing.status === "30" ? (
                  <>
                    {canApprove ? (
                      <button className="primary-button" disabled={saving} type="button" onClick={() => void actionCheckout(editing, "approve")}>
                        <CheckCircle2 size={16} /> 审批通过
                      </button>
                    ) : null}
                    {canReject ? (
                      <button className="primary-button" disabled={saving} type="button" onClick={() => void actionCheckout(editing, "reject")}>
                        <XCircle size={16} /> 审批驳回
                      </button>
                    ) : null}
                  </>
                ) : null}
              </DrawerFooter>
            </DrawerForm>

            {detail ? (
              <section className="detail-stack">
                <div className="system-toolbar">
                  <h3>结算预览</h3>
                  <span className="muted-text">仅预览和确认结算，不自动生成应收、不释放房源</span>
                </div>
                <div className="system-grid">
                  <NumberField label="扣款金额" value={settlementForm.deductionAmount} onChange={(value) => setSettlementValue("deductionAmount", value, setSettlementForm)} />
                  <NumberField label="追加费用" value={settlementForm.additionalChargeAmount} onChange={(value) => setSettlementValue("additionalChargeAmount", value, setSettlementForm)} />
                </div>
                <TextAreaField label="结算备注" value={settlementForm.settlementRemark} onChange={(value) => setSettlementValue("settlementRemark", value, setSettlementForm)} />
                <div className="page-actions">
                  {canPreviewSettlement ? (
                    <button className="primary-button" disabled={saving || detail.status !== "40"} type="button" onClick={() => void previewSettlement(detail)}>
                      <RefreshCw size={16} /> 预览结算
                    </button>
                  ) : null}
                  {canConfirmSettlement ? (
                    <button className="primary-button" disabled={saving || detail.status !== "40"} type="button" onClick={() => void confirmSettlement(detail)}>
                      <CheckCircle2 size={16} /> 确认结算
                    </button>
                  ) : null}
                </div>
                {settlementPreview ? <SettlementPreviewTable preview={settlementPreview} authUser={authUser} feeTypeItems={feeTypeItems} /> : null}
              </section>
            ) : null}

            {detail ? (
              <section className="detail-stack">
                <div className="system-toolbar">
                  <h3>退款登记</h3>
                  <span className="muted-text">不对接银行接口，仅登记线下退款结果</span>
                </div>
                <RefundTable rows={refunds} methodItems={refundMethodItems} statusItems={refundStatusItems} authUser={authUser} />
                {canCreateRefund && detail.settlementStatus === "30" && Number(detail.refundAmount ?? 0) > 0 ? (
                  <div className="form-stack">
                    <div className="system-grid">
                      <TextField label="退款单号" value={refundForm.refundCode} onChange={(value) => setRefundValue("refundCode", value, setRefundForm)} placeholder="为空时自动生成" />
                      <NumberField label="退款金额" value={refundForm.refundAmount} onChange={(value) => setRefundValue("refundAmount", value, setRefundForm)} required />
                      <SelectField label="退款方式" value={refundForm.refundMethod} onChange={(value) => setRefundValue("refundMethod", value, setRefundForm)} options={refundMethodItems} required />
                      <label className="field">
                        <span>退款时间</span>
                        <input type="datetime-local" value={refundForm.refundTime} required onChange={(event) => setRefundValue("refundTime", event.target.value, setRefundForm)} />
                      </label>
                      <TextField label="收款人" value={refundForm.receiverName} onChange={(value) => setRefundValue("receiverName", value, setRefundForm)} />
                      <TextField label="收款账号" value={refundForm.receiverBankAccount} onChange={(value) => setRefundValue("receiverBankAccount", value, setRefundForm)} />
                      <TextField label="银行流水号" value={refundForm.bankSerial} onChange={(value) => setRefundValue("bankSerial", value, setRefundForm)} />
                    </div>
                    <FileUploader
                      bizType="leasing_refund"
                      onUploaded={(file: FileRecord) => setRefundForm((prev) => ({ ...prev, receiptFileId: file.id, receiptFileName: file.originalName }))}
                    />
                    {refundForm.receiptFileName ? <span className="status-pill">已上传：{refundForm.receiptFileName}</span> : null}
                    <TextAreaField label="退款备注" value={refundForm.remark} onChange={(value) => setRefundValue("remark", value, setRefundForm)} />
                    <div className="page-actions">
                      <PermissionButton className="primary-button" permission={CHECKOUT_PERMISSIONS.refundCreate} disabled={saving} type="button" onClick={() => void createRefund(detail)}>
                        <Plus size={16} /> 登记退款
                      </PermissionButton>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {detail ? (
              <section className="detail-stack">
                <div className="system-toolbar">
                  <h3>退租生效与房源释放</h3>
                  <span className="muted-text">结算完成后终止合同，释放房源，并处理未来未收应收</span>
                </div>
                <div className="system-grid">
                  <MetricTile label="退租后房源状态" value={dictText(releaseStatusItems, detail.releaseUnitStatus)} />
                  <MetricTile label="当前退租状态" value={dictText(checkoutStatusItems, detail.status)} />
                  <MetricTile label="结算状态" value={dictText(settlementStatusItems, detail.settlementStatus)} />
                </div>
                {canEffective ? (
                  <div className="page-actions">
                    <button className="primary-button" disabled={saving || detail.status !== "60" || !["30", "40"].includes(detail.settlementStatus)} type="button" onClick={() => void effectiveCheckout(detail)}>
                      <CheckCircle2 size={16} /> 退租生效
                    </button>
                  </div>
                ) : null}
                {effectiveResult ? <EffectiveResultTable result={effectiveResult} authUser={authUser} contractStatusItems={contractStatusItems} unitStatusItems={unitRentalStatusItems} /> : null}
              </section>
            ) : null}
          </Drawer>
      ) : null}
    </div>
  );
}

function DictBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  const item = items.find((entry) => entry.itemValue === String(value ?? ""));
  return <span className={`status-badge status-${item?.tagType ?? "default"}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function StackedCell({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <span className="ds-table-stacked-cell">
      <strong>{primary}</strong>
      {secondary ? <small>{secondary}</small> : null}
    </span>
  );
}

function TextField({ label, value, onChange, disabled, required, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} disabled={disabled} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" step="0.01" value={value} required={required} onFocus={(event) => event.target.select()} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options, disabled, required }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DictItemRow[];
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {options.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SettlementPreviewTable({ preview, authUser, feeTypeItems }: { preview: SettlementPreview; authUser: ReturnType<typeof useAuthUser>; feeTypeItems: DictItemRow[] }) {
  return (
    <section className="table-scroll">
      <div className="system-grid">
        <MetricTile label="未收金额" value={moneyText(authUser, CHECKOUT_ENTITY, "unpaidAmount", preview.summary.unpaid_amount)} />
        <MetricTile label="滞纳金" value={moneyText(authUser, CHECKOUT_ENTITY, "lateFeeAmount", preview.summary.late_fee_amount)} />
        <MetricTile label="押金" value={moneyText(authUser, CHECKOUT_ENTITY, "depositAmount", preview.summary.deposit_amount)} />
        <MetricTile label="应退金额" value={moneyText(authUser, CHECKOUT_ENTITY, "refundAmount", preview.summary.refund_amount)} />
        <MetricTile label="租户应补" value={moneyText(authUser, CHECKOUT_ENTITY, "amountDueFromTenant", preview.summary.amount_due_from_tenant)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>应收单号</th>
            <th>费用类型</th>
            <th>账期</th>
            <th>未收金额</th>
            <th>滞纳金</th>
          </tr>
        </thead>
        <tbody>
          {preview.unpaid_receivables.length === 0 ? (
            <tr><td colSpan={5}>无截止退租日的未结清应收</td></tr>
          ) : preview.unpaid_receivables.map((row) => (
            <tr key={row.receivable_id}>
              <td>{row.ar_code}</td>
              <td><DictBadge items={feeTypeItems} value={row.fee_type} /></td>
              <td>{formatDate(row.period_start)} 至 {formatDate(row.period_end)}</td>
              <td>{moneyText(authUser, "leasing_receivable", "amountRemain", row.amount_remain)}</td>
              <td>{moneyText(authUser, "leasing_receivable", "lateFee", row.late_fee)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}

function RefundTable({ rows, methodItems, statusItems, authUser }: { rows: RefundRow[]; methodItems: DictItemRow[]; statusItems: DictItemRow[]; authUser: ReturnType<typeof useAuthUser> }) {
  return (
    <section className="table-scroll">
      <DataTable >
        <thead>
          <tr>
            <th>退款单号</th>
            <th>退款金额</th>
            <th>方式</th>
            <th>时间</th>
            <th>收款人</th>
            <th>收款账号</th>
            <th>流水号</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8}>暂无退款记录</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td>{row.refundCode}</td>
              <td>{moneyText(authUser, REFUND_ENTITY, "refundAmount", row.refundAmount)}</td>
              <td><DictBadge items={methodItems} value={row.refundMethod} /></td>
              <td>{formatDateTime(row.refundTime)}</td>
              <td>{row.receiverName ?? "-"}</td>
              <td>{fieldText(authUser, REFUND_ENTITY, "receiverBankAccount", row.receiverBankAccount)}</td>
              <td>{fieldText(authUser, REFUND_ENTITY, "bankSerial", row.bankSerial)}</td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}

function EffectiveResultTable({ result, authUser, contractStatusItems, unitStatusItems }: {
  result: EffectiveResult;
  authUser: ReturnType<typeof useAuthUser>;
  contractStatusItems: DictItemRow[];
  unitStatusItems: DictItemRow[];
}) {
  return (
    <section className="table-scroll">
      <div className="system-grid">
        <MetricTile label="合同状态" value={dictText(contractStatusItems, result.contract.status)} />
        <MetricTile label="释放房源数" value={String(result.released_units.length)} />
        <MetricTile label="取消未来应收" value={String(result.canceled_receivables.length)} />
        <MetricTile label="需人工复核" value={String(result.skipped_receivables.length)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>房源编码</th>
            <th>原状态</th>
            <th>释放后状态</th>
          </tr>
        </thead>
        <tbody>
          {result.released_units.length === 0 ? (
            <tr><td colSpan={3}>暂无释放房源</td></tr>
          ) : result.released_units.map((row) => (
            <tr key={row.unit_id}>
              <td>{row.unit_code}</td>
              <td>{dictText(unitStatusItems, String(row.before_status))}</td>
              <td>{dictText(unitStatusItems, String(row.after_status))}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <DataTable >
        <thead>
          <tr>
            <th>未来应收单号</th>
            <th>账期</th>
            <th>取消前未收金额</th>
            <th>处理结果</th>
          </tr>
        </thead>
        <tbody>
          {result.canceled_receivables.length === 0 && result.skipped_receivables.length === 0 ? (
            <tr><td colSpan={4}>无未来应收需要处理</td></tr>
          ) : (
            <>
              {result.canceled_receivables.map((row) => (
                <tr key={row.receivable_id}>
                  <td>{row.ar_code}</td>
                  <td>{formatDate(row.period_start)} 至 {formatDate(row.period_end)}</td>
                  <td>{moneyText(authUser, "leasing_receivable", "amountRemain", row.amount_remain)}</td>
                  <td>已取消</td>
                </tr>
              ))}
              {result.skipped_receivables.map((row) => (
                <tr key={row.receivable_id}>
                  <td>{row.ar_code}</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </DataTable>
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function dictText(items: DictItemRow[], value?: string | null): string {
  return items.find((entry) => entry.itemValue === String(value ?? ""))?.itemLabel ?? value ?? "-";
}

function formFromCheckout(row: CheckoutRow): CheckoutFormState {
  return {
    checkoutCode: row.checkoutCode,
    contractId: row.contractId,
    checkoutType: row.checkoutType,
    plannedCheckoutDate: row.plannedCheckoutDate,
    actualCheckoutDate: row.actualCheckoutDate ?? "",
    reason: row.reason,
    releaseUnitStatus: row.releaseUnitStatus,
    settlementRemark: row.settlementRemark ?? "",
    remark: row.remark ?? ""
  };
}

function setFormValue(key: keyof CheckoutFormState, value: string, setter: (fn: (prev: CheckoutFormState) => CheckoutFormState) => void) {
  setter((prev) => ({ ...prev, [key]: value }));
}

function setSettlementValue(key: keyof SettlementFormState, value: string, setter: (fn: (prev: SettlementFormState) => SettlementFormState) => void) {
  setter((prev) => ({ ...prev, [key]: value }));
}

function setRefundValue(key: keyof RefundFormState, value: string, setter: (fn: (prev: RefundFormState) => RefundFormState) => void) {
  setter((prev) => ({ ...prev, [key]: value }));
}

function moneyText(authUser: ReturnType<typeof useAuthUser>, entity: string, field: string, value?: string | null): string {
  if (!canViewField(authUser, LEASING_MODULE, entity, field)) return "-";
  if (value === null || value === undefined || value === "") return "-";
  return String(maskField(authUser, LEASING_MODULE, entity, field, value));
}

function fieldText(authUser: ReturnType<typeof useAuthUser>, entity: string, field: string, value?: string | null): string {
  if (!canViewField(authUser, LEASING_MODULE, entity, field)) return "-";
  if (!value) return "-";
  return String(maskField(authUser, LEASING_MODULE, entity, field, value));
}

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.response?.message ?? error.message;
  if (error instanceof Error) return error.message;
  return "操作失败";
}
