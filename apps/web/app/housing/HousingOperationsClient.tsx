"use client";

import type { PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Building2, CircleDollarSign, ClipboardCheck, RefreshCw, ShoppingCart, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionButton } from "../../components/auth/PermissionButton";
import { FileUploader } from "../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { addBusinessDateMonths, businessDate } from "../../lib/business-date";
import { hasPermission } from "../../lib/permissions";
import type { UnitRow } from "../assets/units/types";
import { canActivateHousingLease, housingLedgerChargeType } from "./housing-operations.logic";
import styles from "./housing-operations.module.css";

interface Dashboard {
  draft_leases: number;
  pending_approval: number;
  pending_signature: number;
  active_leases: number;
  checkout_pending: number;
  receivable_amount: string;
  collected_amount: string;
  outstanding_amount: string;
  approved_purchase_cost: string;
}

interface Party {
  id: string;
  displayName: string;
  mobile: string | null;
  identityNumberMasked: string | null;
  verificationStatus: string;
}

interface Lease {
  id: string;
  leaseCode: string;
  unitId: string;
  tenantPartyId: string;
  status: string;
  startDate: string;
  endDate: string;
  paymentCycleMonths: number;
  monthlyRent: string;
  depositAmount: string;
  signatureFileId: string | null;
}

interface Receivable {
  id: string;
  chargeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: string;
  paidAmount: string;
  waivedAmount: string;
  status: string;
}

interface RepairWorkOrder {
  id: string;
  woCode: string;
  title: string;
  priority: string;
  urgency: string | null;
  status: string;
  createTime: string;
}

interface LeaseDetail {
  lease: Lease;
  receivables: Receivable[];
  repairs: RepairWorkOrder[];
  finance_summary: {
    receivable: string;
    paid: string;
    waived: string;
    outstanding: string;
    deposit_balance: string;
  } | null;
}

interface Purchase {
  id: string;
  purchaseCode: string;
  unitId: string | null;
  vendorName: string;
  purchaseDate: string;
  costCategory: string;
  totalAmount: string;
  approvalStatus: string;
  paymentStatus: string;
}

interface PurchaseDetail {
  purchase: Purchase;
  items: Array<{ id: string; itemName: string; amount: string; transferredReceivableId: string | null }>;
}

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

type OptionalLoad<T> = { data: T } | { error: string } | null;

const PAGE_SIZE = 20;
const today = () => businessDate();
const nextYear = () => addBusinessDateMonths(today(), 12);
const nextMonth = () => addBusinessDateMonths(today(), 1);
const emptyPageMeta = (): PageMeta => ({ page: 1, pageSize: PAGE_SIZE, total: 0 });

async function loadOptional<T>(
  enabled: boolean,
  loader: () => Promise<{ data: T }>
): Promise<OptionalLoad<T>> {
  if (!enabled) return null;
  try {
    return { data: (await loader()).data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "数据加载失败" };
  }
}

function PaginationControls({
  meta,
  disabled,
  onPageChange
}: {
  meta: PageMeta;
  disabled: boolean;
  onPageChange(page: number): void;
}) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  return (
    <span className="pagination-actions">
      <span>共 {meta.total} 条，第 {meta.page}/{totalPages} 页</span>
      <button className="pagination-button" type="button" disabled={disabled || meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>上一页</button>
      <button className="pagination-button" type="button" disabled={disabled || meta.page >= totalPages} onClick={() => onPageChange(meta.page + 1)}>下一页</button>
    </span>
  );
}

const emptyDashboard: Dashboard = {
  draft_leases: 0,
  pending_approval: 0,
  pending_signature: 0,
  active_leases: 0,
  checkout_pending: 0,
  receivable_amount: "0.00",
  collected_amount: "0.00",
  outstanding_amount: "0.00",
  approved_purchase_cost: "0.00"
};

export function HousingOperationsClient() {
  const user = useAuthUser();
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [tenants, setTenants] = useState<Party[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [unitPage, setUnitPage] = useState(emptyPageMeta);
  const [tenantPage, setTenantPage] = useState(emptyPageMeta);
  const [leasePage, setLeasePage] = useState(emptyPageMeta);
  const [purchasePage, setPurchasePage] = useState(emptyPageMeta);
  const [selectedLeaseId, setSelectedLeaseId] = useState("");
  const [detail, setDetail] = useState<LeaseDetail | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [financeSubmitting, setFinanceSubmitting] = useState(false);
  const [signatureFileId, setSignatureFileId] = useState("");
  const [handoverPhotos, setHandoverPhotos] = useState<string[]>([]);
  const [repairPhotos, setRepairPhotos] = useState<string[]>([]);
  const [purchaseReceipts, setPurchaseReceipts] = useState<string[]>([]);
  const [tenantForm, setTenantForm] = useState({
    displayName: "",
    mobile: "",
    identityDocumentType: "id_card",
    identityNumber: ""
  });
  const [leaseForm, setLeaseForm] = useState({
    unitId: "",
    tenantPartyId: "",
    startDate: today(),
    endDate: nextYear(),
    cycleMonths: "1",
    billingDay: "1",
    monthlyRent: "2500",
    depositAmount: "2500",
    firstDueDate: today()
  });
  const [chargeForm, setChargeForm] = useState({
    chargeType: "property",
    billingSource: "fixed",
    cycleMonths: "1",
    amount: "100",
    unitPrice: "0",
    meterId: ""
  });
  const [billForm, setBillForm] = useState({
    periodStart: today(),
    periodEnd: nextMonth(),
    openingReading: "0",
    closingReading: "0",
    manualAmount: "0"
  });
  const [financeForm, setFinanceForm] = useState({
    receivableId: "",
    entryType: "payment",
    amount: "0",
    paymentMethod: "bank_transfer",
    reason: "人工收款登记"
  });
  const [handoverForm, setHandoverForm] = useState({
    handoverType: "move_in",
    itemText: "家具家电完好",
    meterText: "水电表底已核对",
    credentialText: "门卡 2 张",
    damageAmount: "0",
    unsettledAmount: "0",
    deductionAmount: "0"
  });
  const [repairForm, setRepairForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    urgency: "normal"
  });
  const [purchaseForm, setPurchaseForm] = useState({
    unitId: "",
    vendorName: "",
    purchaseDate: today(),
    costCategory: "consumable",
    itemName: "",
    quantity: "1",
    unit: "件",
    unitPrice: "0"
  });
  const [transferForm, setTransferForm] = useState({
    purchaseId: "",
    itemIds: "",
    dueDate: today(),
    reason: "租客责任耗材代购转收费"
  });

  const unitName = useMemo(
    () => new Map(units.map((unit) => [unit.id, `${unit.unitCode} · ${unit.unitName}`])),
    [units]
  );
  const tenantName = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant.displayName])), [tenants]);
  const leaseLoadSequence = useRef(0);
  const financeSubmissionLock = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const canReadDashboard = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_DASHBOARD_READ);
      const canReadUnits = hasPermission(user, SYSTEM_PERMISSIONS.UNIT_READ);
      const canManageTenants = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE);
      const canReadLeases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_LEASE_READ);
      const canReadPurchases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
      const [dashboardResult, unitsResult, tenantsResult, leasesResult, purchasesResult] = await Promise.all([
        loadOptional(canReadDashboard, () => apiRequest<Dashboard>("/housing/dashboard", { token })),
        loadOptional(canReadUnits, () => apiRequest<PaginatedResult<UnitRow>>(`/park-units?page=${unitPage.page}&page_size=${PAGE_SIZE}`, { token })),
        loadOptional(canManageTenants, () => apiRequest<PaginatedResult<Party>>(`/housing/tenants?page=${tenantPage.page}&page_size=${PAGE_SIZE}`, { token })),
        loadOptional(canReadLeases, () => apiRequest<PaginatedResult<Lease>>(`/housing/leases?page=${leasePage.page}&page_size=${PAGE_SIZE}`, { token })),
        loadOptional(canReadPurchases, () => apiRequest<PaginatedResult<Purchase>>(`/housing/purchases?page=${purchasePage.page}&page_size=${PAGE_SIZE}`, { token }))
      ]);

      const errors = [dashboardResult, unitsResult, tenantsResult, leasesResult, purchasesResult]
        .flatMap((result) => result && "error" in result ? [result.error] : []);
      if (errors.length) setMessage(`部分数据加载失败：${errors.join("；")}`);

      if (!dashboardResult) setDashboard(emptyDashboard);
      else if ("data" in dashboardResult) setDashboard(dashboardResult.data);

      const loadedUnits = unitsResult && "data" in unitsResult ? unitsResult.data.items : [];
      const loadedTenants = tenantsResult && "data" in tenantsResult ? tenantsResult.data.items : [];
      if (!unitsResult) {
        setUnits([]);
        setUnitPage(emptyPageMeta());
      } else if ("data" in unitsResult) {
        setUnits(loadedUnits);
        setUnitPage({ page: unitsResult.data.page, pageSize: unitsResult.data.page_size, total: unitsResult.data.total });
      }
      if (!tenantsResult) {
        setTenants([]);
        setTenantPage(emptyPageMeta());
      } else if ("data" in tenantsResult) {
        setTenants(loadedTenants);
        setTenantPage({ page: tenantsResult.data.page, pageSize: tenantsResult.data.page_size, total: tenantsResult.data.total });
      }
      if (!leasesResult) {
        setLeases([]);
        setLeasePage(emptyPageMeta());
      } else if ("data" in leasesResult) {
        setLeases(leasesResult.data.items);
        setLeasePage({ page: leasesResult.data.page, pageSize: leasesResult.data.page_size, total: leasesResult.data.total });
      }
      if (!purchasesResult) {
        setPurchases([]);
        setPurchasePage(emptyPageMeta());
      } else if ("data" in purchasesResult) {
        setPurchases(purchasesResult.data.items);
        setPurchasePage({ page: purchasesResult.data.page, pageSize: purchasesResult.data.page_size, total: purchasesResult.data.total });
      }
      const firstUnit = loadedUnits[0]?.id ?? "";
      const firstTenant = loadedTenants[0]?.id ?? "";
      setLeaseForm((current) => ({
        ...current,
        unitId: loadedUnits.some((unit) => unit.id === current.unitId) ? current.unitId : firstUnit,
        tenantPartyId: loadedTenants.some((tenant) => tenant.id === current.tenantPartyId) ? current.tenantPartyId : firstTenant
      }));
      setPurchaseForm((current) => ({
        ...current,
        unitId: loadedUnits.some((unit) => unit.id === current.unitId) ? current.unitId : firstUnit
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载住房出租数据失败");
    } finally {
      setLoading(false);
    }
  }, [leasePage.page, purchasePage.page, tenantPage.page, unitPage.page, user]);

  const loadLease = useCallback(async (id: string) => {
    const sequence = leaseLoadSequence.current + 1;
    leaseLoadSequence.current = sequence;
    setSelectedLeaseId(id);
    setDetail(null);
    setSignatureFileId("");
    setHandoverPhotos([]);
    setRepairPhotos([]);
    try {
      const response = await apiRequest<LeaseDetail>(`/housing/leases/${id}`, { token: getAccessToken() });
      if (leaseLoadSequence.current !== sequence) return;
      setDetail(response.data);
      const firstReceivable = response.data.receivables.find((item) => !["paid", "waived", "void"].includes(item.status));
      setFinanceForm((current) => ({ ...current, receivableId: firstReceivable?.id ?? "" }));
    } catch (error) {
      if (leaseLoadSequence.current !== sequence) return;
      setSelectedLeaseId("");
      setMessage(error instanceof Error ? error.message : "加载租约详情失败");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(success: string, action: () => Promise<unknown>, reloadLease = false) {
    setLoading(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
      if (reloadLease && selectedLeaseId) await loadLease(selectedLeaseId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoading(false);
    }
  }

  async function createTenant(event: FormEvent) {
    event.preventDefault();
    await runAction("租客档案已建立", async () => {
      const response = await apiRequest<Party>("/housing/tenants", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("housing-tenant"),
        body: {
          party_type: "person",
          display_name: tenantForm.displayName,
          mobile: tenantForm.mobile || undefined,
          identity_document_type: tenantForm.identityNumber ? tenantForm.identityDocumentType : undefined,
          identity_number: tenantForm.identityNumber || undefined,
          verification_status: tenantForm.identityNumber ? "verified" : "unverified",
          consent_status: "granted"
        }
      });
      setLeaseForm((current) => ({ ...current, tenantPartyId: response.data.id }));
      setTenantForm((current) => ({ ...current, displayName: "", mobile: "", identityNumber: "" }));
    });
  }

  async function createLease(event: FormEvent) {
    event.preventDefault();
    await runAction("租约草稿已创建", () => apiRequest("/housing/leases", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("housing-lease"),
      body: {
        unit_id: leaseForm.unitId,
        tenant_party_id: leaseForm.tenantPartyId,
        start_date: leaseForm.startDate,
        end_date: leaseForm.endDate,
        payment_cycle_months: Number(leaseForm.cycleMonths),
        billing_day: Number(leaseForm.billingDay),
        monthly_rent: Number(leaseForm.monthlyRent),
        deposit_amount: Number(leaseForm.depositAmount),
        first_due_date: leaseForm.firstDueDate,
        tail_period_rule: "prorate"
      }
    }));
  }

  async function leaseAction(lease: Lease, action: "submit" | "approve" | "sign" | "activate" | "checkout" | "void") {
    if (action === "sign" && selectedLeaseId !== lease.id) {
      setMessage("请先打开该租约详情并上传对应的线下签署 PDF");
      return;
    }
    if (action === "sign" && !signatureFileId) {
      setMessage("请先上传线下签署 PDF");
      return;
    }
    await runAction(`租约操作已完成：${action}`, () => apiRequest(`/housing/leases/${lease.id}/${action}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`housing-lease-${action}`),
      body: action === "sign"
        ? { signature_file_id: signatureFileId }
        : action === "approve"
          ? { approval_note: "线下审批通过" }
          : ["checkout", "void"].includes(action)
            ? { reason: action === "checkout" ? "退租交割及费用结清" : "草稿作废" }
            : undefined
    }), selectedLeaseId === lease.id);
  }

  async function saveChargePlan(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    await runAction("周期费用计划已保存", () => apiRequest(`/housing/leases/${selectedLeaseId}/charge-plans`, {
      method: "PUT",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("housing-charge-plan"),
      body: {
        charge_type: chargeForm.chargeType,
        billing_source: chargeForm.billingSource,
        cycle_months: Number(chargeForm.cycleMonths),
        amount: chargeForm.billingSource === "fixed" ? Number(chargeForm.amount) : undefined,
        unit_price: chargeForm.billingSource === "energy_meter" ? Number(chargeForm.unitPrice) : undefined,
        meter_id: chargeForm.billingSource === "energy_meter" ? chargeForm.meterId : undefined,
        enabled: true
      }
    }), true);
  }

  async function generateBills(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    await runAction("周期账单已生成", () => apiRequest(`/housing/leases/${selectedLeaseId}/generate-bills`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("housing-bill"),
      body: {
        period_start: billForm.periodStart,
        period_end: billForm.periodEnd,
        opening_reading: Number(billForm.openingReading),
        closing_reading: Number(billForm.closingReading),
        manual_amount: Number(billForm.manualAmount),
        reason: "运营人员生成周期账单"
      }
    }), true);
  }

  async function registerFinance(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId || !detail || financeSubmissionLock.current) return;
    const chargeType = housingLedgerChargeType(financeForm.entryType, financeForm.receivableId, detail.receivables);
    if (!chargeType) {
      setMessage("请选择与本次流水对应的应收账单");
      return;
    }
    financeSubmissionLock.current = true;
    setFinanceSubmitting(true);
    const idempotencyKey = createIdempotencyKey("housing-ledger");
    try {
      await runAction("财务流水已登记并核销", () => apiRequest(`/housing/leases/${selectedLeaseId}/ledger`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey,
        body: {
          receivable_id: financeForm.entryType.startsWith("deposit_") ? undefined : financeForm.receivableId,
          entry_type: financeForm.entryType,
          charge_type: chargeType,
          amount: Number(financeForm.amount),
          payment_method: financeForm.paymentMethod,
          reason: financeForm.reason
        }
      }), true);
    } finally {
      financeSubmissionLock.current = false;
      setFinanceSubmitting(false);
    }
  }

  async function completeHandover(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    await runAction("现场交割已完成", async () => {
      await apiRequest(`/housing/leases/${selectedLeaseId}/handovers`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("housing-handover"),
        body: {
          handover_type: handoverForm.handoverType,
          item_snapshot: [{ description: handoverForm.itemText, checked: true }],
          meter_readings: [{ description: handoverForm.meterText }],
          credentials: [{ description: handoverForm.credentialText, managed_offline: true }],
          photo_file_ids: handoverPhotos,
          damage_amount: Number(handoverForm.damageAmount),
          unsettled_amount: Number(handoverForm.unsettledAmount),
          deposit_deduction_amount: Number(handoverForm.deductionAmount),
          remark: handoverForm.handoverType === "move_out" ? "退租现场验收" : "入住现场交割"
        }
      });
      setHandoverPhotos([]);
    }, true);
  }

  async function createRepair(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    await runAction("住房报修已代录并生成工单", async () => {
      await apiRequest(`/housing/leases/${selectedLeaseId}/repairs`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("housing-repair"),
        body: {
          title: repairForm.title,
          description: repairForm.description,
          priority: repairForm.priority,
          urgency: repairForm.urgency,
          image_file_ids: repairPhotos
        }
      });
      setRepairForm((current) => ({ ...current, title: "", description: "" }));
      setRepairPhotos([]);
    }, true);
  }

  async function createPurchase(event: FormEvent) {
    event.preventDefault();
    await runAction("采购成本单已创建", async () => {
      await apiRequest("/housing/purchases", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("housing-purchase"),
        body: {
          unit_id: purchaseForm.unitId || undefined,
          vendor_name: purchaseForm.vendorName,
          purchase_date: purchaseForm.purchaseDate,
          cost_category: purchaseForm.costCategory,
          items: [{
            item_name: purchaseForm.itemName,
            quantity: Number(purchaseForm.quantity),
            unit: purchaseForm.unit,
            unit_price: Number(purchaseForm.unitPrice)
          }],
          receipt_file_ids: purchaseReceipts
        }
      });
      setPurchaseReceipts([]);
    });
  }

  async function purchaseAction(purchase: Purchase, action: "approve" | "pay") {
    await runAction(`采购单已${action === "approve" ? "审批" : "登记付款"}`, () => apiRequest(`/housing/purchases/${purchase.id}/actions`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`housing-purchase-${action}`),
      body: { action, reason: action === "approve" ? "采购成本审批通过" : "线下采购付款登记" }
    }));
  }

  async function transferPurchase(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    const itemIds = transferForm.itemIds.split(/[\s,，]+/).filter(Boolean);
    await runAction("采购明细已受控转为租客应收", () => apiRequest(`/housing/purchases/${transferForm.purchaseId}/transfer`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("housing-purchase-transfer"),
      body: {
        lease_id: selectedLeaseId,
        item_ids: itemIds,
        due_date: transferForm.dueDate,
        reason: transferForm.reason
      }
    }), true);
  }

  async function selectPurchaseForTransfer(purchaseId: string) {
    setTransferForm((current) => ({ ...current, purchaseId, itemIds: "" }));
    if (!purchaseId) return;
    try {
      const response = await apiRequest<PurchaseDetail>(`/housing/purchases/${purchaseId}`, {
        token: getAccessToken()
      });
      setTransferForm((current) => ({
        ...current,
        itemIds: response.data.items
          .filter((item) => !item.transferredReceivableId)
          .map((item) => item.id)
          .join(",")
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载采购明细失败");
    }
  }

  const kpis: Array<{ label: string; value: string | number; Icon: typeof Building2 }> = [
    { label: "有效租约", value: dashboard.active_leases, Icon: Building2 },
    { label: "待审批", value: dashboard.pending_approval, Icon: ClipboardCheck },
    { label: "待签署", value: dashboard.pending_signature, Icon: ClipboardCheck },
    { label: "待退租", value: dashboard.checkout_pending, Icon: Building2 },
    { label: "累计应收", value: `¥${dashboard.receivable_amount}`, Icon: CircleDollarSign },
    { label: "未结费用", value: `¥${dashboard.outstanding_amount}`, Icon: CircleDollarSign },
    { label: "采购成本", value: `¥${dashboard.approved_purchase_cost}`, Icon: ShoppingCart },
    { label: "租客档案", value: tenants.length, Icon: Users }
  ];

  return (
    <main className={`ds-page ${styles.page}`}>
      <section className={`ds-hero ${styles.hero}`}>
        <div><span className={styles.eyebrow}>集中式公寓 · 整套长租</span><h1>住房出租运营台</h1><p>租客、租约、交割、周期账单与采购成本在同一条可审计链路中协同。</p></div>
        <button className="ds-button ds-button-secondary" type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} />刷新</button>
      </section>
      {message ? <div className={styles.message}>{message}</div> : null}

      <section className="ds-kpi-grid">
        {kpis.map(({ label, value, Icon }) => (
          <article className="ds-kpi-card" key={label}><Icon size={20} /><span>{label}</span><strong>{String(value)}</strong></article>
        ))}
      </section>

      <section className={styles.commandGrid}>
        <form className="ds-panel" onSubmit={createTenant}>
          <h2>建立个人租客档案</h2>
          <div className={styles.formGrid}>
            <label>姓名<input required maxLength={200} value={tenantForm.displayName} onChange={(event) => setTenantForm({ ...tenantForm, displayName: event.target.value })} /></label>
            <label>手机号<input type="tel" maxLength={32} value={tenantForm.mobile} onChange={(event) => setTenantForm({ ...tenantForm, mobile: event.target.value })} /></label>
            <label>证件类型<select value={tenantForm.identityDocumentType} onChange={(event) => setTenantForm({ ...tenantForm, identityDocumentType: event.target.value })}><option value="id_card">居民身份证</option><option value="passport">护照</option></select></label>
            <label>证件号码<input maxLength={128} value={tenantForm.identityNumber} onChange={(event) => setTenantForm({ ...tenantForm, identityNumber: event.target.value })} /></label>
          </div>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE} className="ds-button ds-button-primary" type="submit">保存租客档案</PermissionButton>
        </form>

        <form className="ds-panel" onSubmit={createLease}>
          <h2>创建住房租约草稿</h2>
          <div className={styles.formGrid}>
            <label>整套房源<select required value={leaseForm.unitId} onChange={(event) => setLeaseForm({ ...leaseForm, unitId: event.target.value })}><option value="">选择房源</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unitName.get(unit.id)}</option>)}</select></label>
            <label>主租客<select required value={leaseForm.tenantPartyId} onChange={(event) => setLeaseForm({ ...leaseForm, tenantPartyId: event.target.value })}><option value="">选择租客</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.displayName} · {tenant.mobile ?? "无手机号"}</option>)}</select></label>
            <label>租期开始<input type="date" required value={leaseForm.startDate} onChange={(event) => setLeaseForm({ ...leaseForm, startDate: event.target.value, firstDueDate: event.target.value })} /></label>
            <label>租期结束<input type="date" required min={leaseForm.startDate} value={leaseForm.endDate} onChange={(event) => setLeaseForm({ ...leaseForm, endDate: event.target.value })} /></label>
            <label>支付周期<select value={leaseForm.cycleMonths} onChange={(event) => setLeaseForm({ ...leaseForm, cycleMonths: event.target.value })}><option value="1">月付</option><option value="3">季付</option><option value="6">半年付</option><option value="12">年付</option></select></label>
            <label>自定义月数<input type="number" min="1" max="120" step="1" value={leaseForm.cycleMonths} onFocus={(event) => event.target.select()} onChange={(event) => setLeaseForm({ ...leaseForm, cycleMonths: event.target.value })} /></label>
            <label>月租金<input type="number" min="0" step="0.01" value={leaseForm.monthlyRent} onFocus={(event) => event.target.select()} onChange={(event) => setLeaseForm({ ...leaseForm, monthlyRent: event.target.value })} /></label>
            <label>押金<input type="number" min="0" step="0.01" value={leaseForm.depositAmount} onFocus={(event) => event.target.select()} onChange={(event) => setLeaseForm({ ...leaseForm, depositAmount: event.target.value })} /></label>
            <label>每期应收日<input type="number" min="1" max="28" step="1" value={leaseForm.billingDay} onFocus={(event) => event.target.select()} onChange={(event) => setLeaseForm({ ...leaseForm, billingDay: event.target.value })} /></label>
            <label>首期应收日<input type="date" value={leaseForm.firstDueDate} onChange={(event) => setLeaseForm({ ...leaseForm, firstDueDate: event.target.value })} /></label>
          </div>
          <div className={styles.selectorPagination}>
            <div><small>房源候选</small><PaginationControls meta={unitPage} disabled={loading} onPageChange={(page) => setUnitPage((current) => ({ ...current, page }))} /></div>
            <div><small>租客候选</small><PaginationControls meta={tenantPage} disabled={loading} onPageChange={(page) => setTenantPage((current) => ({ ...current, page }))} /></div>
          </div>
          <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE} className="ds-button ds-button-primary" type="submit">创建租约草稿</PermissionButton>
        </form>
      </section>

      <section className="ds-panel">
        <div className={styles.sectionTitle}><div><h2>住房租约</h2><p>审批、线下签署登记和生效按顺序执行；生效时写入共享占用并校验长短租互斥。</p></div><PaginationControls meta={leasePage} disabled={loading} onPageChange={(page) => setLeasePage((current) => ({ ...current, page }))} /></div>
        <div className="ds-table-shell"><table><thead><tr><th>租约</th><th>房源 / 租客</th><th>租期</th><th>租金 / 押金</th><th>状态</th><th>操作</th></tr></thead><tbody>{leases.map((lease) => <tr key={lease.id}><td>{lease.leaseCode}</td><td>{unitName.get(lease.unitId) ?? lease.unitId}<br />{tenantName.get(lease.tenantPartyId) ?? lease.tenantPartyId}</td><td>{lease.startDate} → {lease.endDate}</td><td>¥{lease.monthlyRent} / ¥{lease.depositAmount}</td><td><span className={styles.status}>{lease.status}</span></td><td><LeaseActions lease={lease} onSelect={() => void loadLease(lease.id)} onAction={(action) => void leaseAction(lease, action)} /></td></tr>)}</tbody></table></div>
        <div className="ds-mobile-record-list">{leases.map((lease) => <article className="ds-mobile-record" key={lease.id}><strong>{lease.leaseCode}</strong><span>{unitName.get(lease.unitId)}</span><span>{tenantName.get(lease.tenantPartyId)} · {lease.startDate} → {lease.endDate}</span><span>{lease.status} · 月租 ¥{lease.monthlyRent}</span><LeaseActions lease={lease} onSelect={() => void loadLease(lease.id)} onAction={(action) => void leaseAction(lease, action)} /></article>)}</div>
      </section>

      {selectedLeaseId && detail?.lease.id === selectedLeaseId ? <section className={`ds-panel ${styles.detailPanel}`}>
        <div className={styles.sectionTitle}><div><h2>租约现场与财务闭环</h2><p>{detail.lease.leaseCode}{detail.finance_summary ? ` · 未结 ¥${detail.finance_summary.outstanding} · 押金余额 ¥${detail.finance_summary.deposit_balance}` : ""}</p></div></div>
        <div className={styles.workflowGrid}>
          <form onSubmit={saveChargePlan}><h3>周期费用计划</h3><label>费用类型<select value={chargeForm.chargeType} onChange={(event) => setChargeForm({ ...chargeForm, chargeType: event.target.value })}><option value="property">物业费</option><option value="water">水费</option><option value="electricity">电费</option><option value="gas">燃气费</option><option value="other">其他费用</option></select></label><label>计费来源<select value={chargeForm.billingSource} onChange={(event) => setChargeForm({ ...chargeForm, billingSource: event.target.value })}><option value="fixed">固定金额</option><option value="energy_meter">能源表计</option><option value="manual">人工录入</option></select></label><label>周期（月）<input type="number" min="1" max="120" value={chargeForm.cycleMonths} onChange={(event) => setChargeForm({ ...chargeForm, cycleMonths: event.target.value })} /></label>{chargeForm.billingSource === "fixed" ? <label>每月金额<input type="number" min="0" step="0.01" value={chargeForm.amount} onChange={(event) => setChargeForm({ ...chargeForm, amount: event.target.value })} /></label> : null}{chargeForm.billingSource === "energy_meter" ? <><label>表计 ID<input value={chargeForm.meterId} placeholder="UUID" onChange={(event) => setChargeForm({ ...chargeForm, meterId: event.target.value })} /></label><label>单价<input type="number" min="0" step="0.000001" value={chargeForm.unitPrice} onChange={(event) => setChargeForm({ ...chargeForm, unitPrice: event.target.value })} /></label></> : null}<PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE} type="submit">保存费用计划</PermissionButton></form>
          <form onSubmit={generateBills}><h3>生成周期账单</h3><label>账期开始<input type="date" value={billForm.periodStart} onChange={(event) => setBillForm({ ...billForm, periodStart: event.target.value })} /></label><label>账期结束<input type="date" value={billForm.periodEnd} onChange={(event) => setBillForm({ ...billForm, periodEnd: event.target.value })} /></label><label>起始表底<input type="number" min="0" step="0.000001" value={billForm.openingReading} onChange={(event) => setBillForm({ ...billForm, openingReading: event.target.value })} /></label><label>截止表底<input type="number" min="0" step="0.000001" value={billForm.closingReading} onChange={(event) => setBillForm({ ...billForm, closingReading: event.target.value })} /></label><label>人工金额<input type="number" min="0" step="0.01" value={billForm.manualAmount} onChange={(event) => setBillForm({ ...billForm, manualAmount: event.target.value })} /></label><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_BILLING_GENERATE} type="submit">生成账单</PermissionButton></form>
          {detail.finance_summary ? <form onSubmit={registerFinance}><h3>人工收退款与押金</h3><label>应收账单<select value={financeForm.receivableId} onChange={(event) => setFinanceForm({ ...financeForm, receivableId: event.target.value })}><option value="">押金流水无需选择</option>{detail.receivables.map((item) => <option value={item.id} key={item.id}>{item.chargeType} · ¥{item.amount} · {item.status}</option>)}</select></label><label>流水类型<select value={financeForm.entryType} onChange={(event) => setFinanceForm({ ...financeForm, entryType: event.target.value })}><option value="payment">人工收款核销</option><option value="refund">人工退款确认</option><option value="waiver">费用减免</option><option value="deposit_receipt">押金收取</option><option value="deposit_refund">押金退还</option></select></label><label>金额<input type="number" min="0.01" step="0.01" value={financeForm.amount} onChange={(event) => setFinanceForm({ ...financeForm, amount: event.target.value })} /></label><label>原因<input maxLength={500} value={financeForm.reason} onChange={(event) => setFinanceForm({ ...financeForm, reason: event.target.value })} /></label><PermissionButton className="ds-button ds-button-primary" permission={financeForm.entryType === "waiver" ? SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE : SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER} type="submit" disabled={financeSubmitting}>{financeSubmitting ? "登记中…" : "登记并核销"}</PermissionButton></form> : null}
          <form onSubmit={completeHandover}><h3>入住 / 退租交割</h3><label>交割类型<select value={handoverForm.handoverType} onChange={(event) => { setHandoverForm({ ...handoverForm, handoverType: event.target.value }); setHandoverPhotos([]); }}><option value="move_in">入住交割</option><option value="move_out">退租验收</option></select></label><label>物品清单<input value={handoverForm.itemText} onChange={(event) => setHandoverForm({ ...handoverForm, itemText: event.target.value })} /></label><label>表底记录<input value={handoverForm.meterText} onChange={(event) => setHandoverForm({ ...handoverForm, meterText: event.target.value })} /></label><label>钥匙 / 门卡<input value={handoverForm.credentialText} onChange={(event) => setHandoverForm({ ...handoverForm, credentialText: event.target.value })} /></label>{handoverForm.handoverType === "move_out" ? <><label>损坏金额<input type="number" min="0" step="0.01" value={handoverForm.damageAmount} onChange={(event) => setHandoverForm({ ...handoverForm, damageAmount: event.target.value })} /></label><label>未结费用<input type="number" min="0" step="0.01" value={handoverForm.unsettledAmount} onChange={(event) => setHandoverForm({ ...handoverForm, unsettledAmount: event.target.value })} /></label><label>押金抵扣<input type="number" min="0" step="0.01" max={String(Number(handoverForm.damageAmount) + Number(handoverForm.unsettledAmount))} value={handoverForm.deductionAmount} onChange={(event) => setHandoverForm({ ...handoverForm, deductionAmount: event.target.value })} /></label></> : null}<FileUploader bizType="housing_handover" bizId={selectedLeaseId} policyKey="image" compact label="上传现场照片" onUploaded={(file) => setHandoverPhotos((current) => [...current, file.id])} /><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE} type="submit">完成现场交割</PermissionButton></form>
          <form onSubmit={createRepair}><h3>租客报修代录</h3><label>报修标题<input required maxLength={200} value={repairForm.title} onChange={(event) => setRepairForm({ ...repairForm, title: event.target.value })} /></label><label>问题描述<textarea required maxLength={2000} value={repairForm.description} onChange={(event) => setRepairForm({ ...repairForm, description: event.target.value })} /></label><label>优先级<select value={repairForm.priority} onChange={(event) => setRepairForm({ ...repairForm, priority: event.target.value })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label>紧急程度<select value={repairForm.urgency} onChange={(event) => setRepairForm({ ...repairForm, urgency: event.target.value })}><option value="normal">一般</option><option value="urgent">紧急</option><option value="critical">特急</option></select></label><FileUploader bizType="workorder_create" policyKey="image" compact label="上传报修照片" onUploaded={(file) => setRepairPhotos((current) => [...current, file.id])} /><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE} type="submit">生成维修工单</PermissionButton></form>
        </div>
        <div className={styles.repairList}><h3>关联维修工单</h3>{detail.repairs.length ? detail.repairs.map((repair) => <article key={repair.id}><div><strong>{repair.woCode}</strong><span className={styles.status}>{repair.status}</span></div><span>{repair.title}</span><small>{repair.priority} / {repair.urgency ?? "normal"} · {new Date(repair.createTime).toLocaleString()}</small></article>) : <p>暂无关联报修工单。</p>}</div>
        <div className={styles.signature}><FileUploader bizType="housing_lease_signature" bizId={selectedLeaseId} policyKey="pdf" compact label="上传线下签署 PDF" onUploaded={(file) => setSignatureFileId(file.id)} /><span>{signatureFileId ? "签署件已就绪，可执行签署登记" : "待上传签署件"}</span></div>
      </section> : null}

      <section className={styles.commandGrid}>
        <form className="ds-panel" onSubmit={createPurchase}><h2>内部采购成本</h2><div className={styles.formGrid}><label>归集房源<select value={purchaseForm.unitId} onChange={(event) => setPurchaseForm({ ...purchaseForm, unitId: event.target.value })}><option value="">项目公共成本</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unitName.get(unit.id)}</option>)}</select></label><label>供应商<input required value={purchaseForm.vendorName} onChange={(event) => setPurchaseForm({ ...purchaseForm, vendorName: event.target.value })} /></label><label>采购日期<input type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm({ ...purchaseForm, purchaseDate: event.target.value })} /></label><label>成本分类<select value={purchaseForm.costCategory} onChange={(event) => setPurchaseForm({ ...purchaseForm, costCategory: event.target.value })}><option value="consumable">耗材</option><option value="repair">维修</option><option value="cleaning">保洁</option><option value="other">其他</option></select></label><label>采购明细<input required value={purchaseForm.itemName} onChange={(event) => setPurchaseForm({ ...purchaseForm, itemName: event.target.value })} /></label><label>数量<input type="number" min="0.001" step="0.001" value={purchaseForm.quantity} onChange={(event) => setPurchaseForm({ ...purchaseForm, quantity: event.target.value })} /></label><label>单位<input value={purchaseForm.unit} onChange={(event) => setPurchaseForm({ ...purchaseForm, unit: event.target.value })} /></label><label>单价<input type="number" min="0" step="0.01" value={purchaseForm.unitPrice} onChange={(event) => setPurchaseForm({ ...purchaseForm, unitPrice: event.target.value })} /></label></div><FileUploader bizType="housing_purchase" policyKey="receipt" compact label="上传采购票据" onUploaded={(file) => setPurchaseReceipts((current) => [...current, file.id])} /><PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} className="ds-button ds-button-primary" type="submit">创建采购成本单</PermissionButton></form>
        <form className="ds-panel" onSubmit={transferPurchase}><h2>受控转租客收费</h2><p>内部成本与租客应收保持分账；仅审批后的指定明细可转收费。</p><label>采购单<select required value={transferForm.purchaseId} onChange={(event) => void selectPurchaseForTransfer(event.target.value)}><option value="">选择已审批采购单</option>{purchases.filter((item) => item.approvalStatus === "approved" && item.paymentStatus !== "refunded").map((item) => <option key={item.id} value={item.id}>{item.purchaseCode} · ¥{item.totalAmount}</option>)}</select></label><label>待转采购明细<input readOnly required value={transferForm.itemIds} placeholder="选择采购单后自动装载未转收费明细" /></label><label>租客应收日<input type="date" value={transferForm.dueDate} onChange={(event) => setTransferForm({ ...transferForm, dueDate: event.target.value })} /></label><label>转收费依据<input maxLength={500} value={transferForm.reason} onChange={(event) => setTransferForm({ ...transferForm, reason: event.target.value })} /></label><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER} type="submit" disabled={!selectedLeaseId}>转为当前租约应收</PermissionButton></form>
      </section>

      <section className="ds-panel"><div className={styles.sectionTitle}><div><h2>采购成本台账</h2><p>首期仅做采购单、成本归集、审批和付款登记，不建立库存。</p></div><PaginationControls meta={purchasePage} disabled={loading} onPageChange={(page) => setPurchasePage((current) => ({ ...current, page }))} /></div><div className={styles.purchaseGrid}>{purchases.map((purchase) => <article className={styles.purchaseCard} key={purchase.id}><div><strong>{purchase.purchaseCode}</strong><span>¥{purchase.totalAmount}</span></div><span>{purchase.vendorName} · {purchase.costCategory}</span><span>{purchase.approvalStatus} / {purchase.paymentStatus}</span><div className={styles.actions}>{purchase.approvalStatus === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} onClick={() => void purchaseAction(purchase, "approve")}>审批通过</PermissionButton> : null}{purchase.approvalStatus === "approved" && purchase.paymentStatus === "unpaid" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} onClick={() => void purchaseAction(purchase, "pay")}>登记付款</PermissionButton> : null}</div></article>)}</div></section>
    </main>
  );
}

function LeaseActions({
  lease,
  onSelect,
  onAction
}: {
  lease: Lease;
  onSelect(): void;
  onAction(action: "submit" | "approve" | "sign" | "activate" | "checkout" | "void"): void;
}) {
  return <div className={styles.actions}><button type="button" onClick={onSelect}>详情</button>{lease.status === "draft" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE} onClick={() => onAction("submit")}>提交</PermissionButton> : null}{lease.status === "pending_approval" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_APPROVE} onClick={() => onAction("approve")}>审批</PermissionButton> : null}{lease.status === "pending_signature" && !lease.signatureFileId ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN} onClick={() => onAction("sign")}>登记签署</PermissionButton> : null}{canActivateHousingLease(lease) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_ACTIVATE} onClick={() => onAction("activate")}>生效</PermissionButton> : null}{lease.status === "checkout_pending" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_CHECKOUT} onClick={() => onAction("checkout")}>结清退租</PermissionButton> : null}{["draft", "pending_approval", "pending_signature"].includes(lease.status) ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE} onClick={() => onAction("void")}>作废</PermissionButton> : null}</div>;
}
