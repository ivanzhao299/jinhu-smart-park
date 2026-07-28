"use client";

import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Building2, CircleDollarSign, ClipboardCheck, RefreshCw, ShoppingCart, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionButton } from "../../components/auth/PermissionButton";
import { FileUploader } from "../../components/files/FileUploader";
import { PendingAttachmentList } from "../../components/files/PendingAttachmentList";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { addBusinessDateMonths, businessDate } from "../../lib/business-date";
import { hasPermission } from "../../lib/permissions";
import type { UnitRow } from "../assets/units/types";
import {
  canRechargeHousingLease,
  canActivateHousingLease,
  housingLeaseContextStillCurrent,
  housingLedgerChargeType,
  housingSelectionAfterLoad
} from "./housing-operations.logic";
import styles from "./housing-operations.module.css";

interface Dashboard {
  draft_leases: number;
  pending_approval: number;
  pending_signature: number;
  active_leases: number;
  checkout_pending: number;
  receivable_amount?: string;
  collected_amount?: string;
  outstanding_amount?: string;
  approved_purchase_cost?: string;
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

interface ChargePlan {
  id: string;
  chargeType: string;
  billingSource: "fixed" | "energy_meter" | "manual";
  enabled: boolean;
}

interface LedgerEntry {
  id: string;
  receivableId: string | null;
  entryType: string;
  chargeType: string;
  amount: string;
  paymentMethod: string | null;
  status: string;
  reason: string;
  occurredAt: string;
}

interface LeaseOccupant {
  id: string;
  partyId: string;
  occupantRole: string;
  emergencyContact: boolean;
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
  occupants: LeaseOccupant[];
  charge_plans: ChargePlan[];
  receivables: Receivable[];
  ledger: LedgerEntry[];
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
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [signatureFileId, setSignatureFileId] = useState("");
  const [handoverPhotos, setHandoverPhotos] = useState<FileRecord[]>([]);
  const [repairPhotos, setRepairPhotos] = useState<FileRecord[]>([]);
  const [purchaseReceipts, setPurchaseReceipts] = useState<FileRecord[]>([]);
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
    chargePlanId: "",
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
  const [occupantForm, setOccupantForm] = useState({
    partyId: "",
    occupantRole: "cohabitant",
    emergencyContact: false
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
    itemIds: [] as string[],
    dueDate: today(),
    reason: "租客责任耗材代购转收费"
  });
  const [transferItems, setTransferItems] = useState<PurchaseDetail["items"]>([]);

  const unitName = useMemo(
    () => new Map(units.map((unit) => [unit.id, `${unit.unitCode} · ${unit.unitName}`])),
    [units]
  );
  const tenantName = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant.displayName])), [tenants]);
  const leaseLoadSequence = useRef(0);
  const refreshSequence = useRef(0);
  const transferLoadSequence = useRef(0);
  const selectedLeaseIdRef = useRef("");
  const financeSubmissionLock = useRef(false);
  const financeSubmissionKey = useRef<string | null>(null);
  const financeSubmissionSignature = useRef("");
  const purchaseSubmissionLock = useRef(false);
  const purchaseSubmissionKey = useRef<string | null>(null);
  const purchaseSubmissionSignature = useRef("");
  const pendingTenantSelection = useRef<Party | null>(null);

  const refresh = useCallback(async () => {
    const sequence = refreshSequence.current + 1;
    refreshSequence.current = sequence;
    setLoading(true);
    try {
      const token = getAccessToken();
      const canReadDashboard = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_DASHBOARD_READ);
      const canReadUnits = hasPermission(user, SYSTEM_PERMISSIONS.UNIT_READ);
      const canManageTenants = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE);
      const canReadLeases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_LEASE_READ);
      const canReadPurchases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
      const canManagePurchases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE);
      const canAccessPurchaseReceipts =
        canManagePurchases && hasPermission(user, SYSTEM_PERMISSIONS.FILE_READ);
      const [dashboardResult, unitsResult, tenantsResult, leasesResult, purchasesResult, pendingReceiptResult] = await Promise.all([
        loadOptional(canReadDashboard, () => apiRequest<Dashboard>("/housing/dashboard", { token })),
        loadOptional(canReadUnits, () => apiRequest<PaginatedResult<UnitRow>>(`/park-units?page=${unitPage.page}&page_size=${PAGE_SIZE}`, { token })),
        loadOptional(canManageTenants, () => apiRequest<PaginatedResult<Party>>(`/housing/tenants?page=${tenantPage.page}&page_size=${PAGE_SIZE}`, { token })),
        loadOptional(canReadLeases, () => apiRequest<PaginatedResult<Lease>>(`/housing/leases?page=${leasePage.page}&page_size=${PAGE_SIZE}`, { token })),
        loadOptional(canReadPurchases, () => apiRequest<PaginatedResult<Purchase>>(`/housing/purchases?page=${purchasePage.page}&page_size=${PAGE_SIZE}`, { token })),
        loadOptional(canAccessPurchaseReceipts, () => apiRequest<PaginatedResult<FileRecord>>(
          "/files?biz_type=housing_purchase&page=1&page_size=100",
          { token }
        ))
      ]);
      if (refreshSequence.current !== sequence) return;

      const errors = [dashboardResult, unitsResult, tenantsResult, leasesResult, purchasesResult, pendingReceiptResult]
        .flatMap((result) => result && "error" in result ? [result.error] : []);
      if (errors.length) setMessage(`部分数据加载失败：${errors.join("；")}`);

      if (!dashboardResult) setDashboard(emptyDashboard);
      else if ("data" in dashboardResult) setDashboard(dashboardResult.data);

      const loadedUnits = unitsResult && "data" in unitsResult ? unitsResult.data.items : [];
      const loadedTenants = tenantsResult && "data" in tenantsResult ? tenantsResult.data.items : [];
      const pendingTenant = pendingTenantSelection.current;
      const visibleTenants = pendingTenant && !loadedTenants.some((tenant) => tenant.id === pendingTenant.id)
        ? [pendingTenant, ...loadedTenants]
        : loadedTenants;
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
        setTenants(visibleTenants);
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
      if (!pendingReceiptResult) {
        setPurchaseReceipts([]);
      } else if ("data" in pendingReceiptResult) {
        setPurchaseReceipts(pendingReceiptResult.data.items);
      }
      if (unitsResult && "data" in unitsResult) {
        const loadedUnitIds = loadedUnits.map((unit) => unit.id);
        setLeaseForm((current) => ({
          ...current,
          unitId: housingSelectionAfterLoad(current.unitId, loadedUnitIds)
        }));
        setPurchaseForm((current) => ({
          ...current,
          unitId: housingSelectionAfterLoad(current.unitId, loadedUnitIds)
        }));
      } else if (!unitsResult) {
        setLeaseForm((current) => ({ ...current, unitId: "" }));
        setPurchaseForm((current) => ({ ...current, unitId: "" }));
      }
      if (tenantsResult && "data" in tenantsResult) {
        const loadedTenantIds = visibleTenants.map((tenant) => tenant.id);
        setLeaseForm((current) => ({
          ...current,
          tenantPartyId: pendingTenant?.id ?? housingSelectionAfterLoad(current.tenantPartyId, loadedTenantIds)
        }));
        if (pendingTenant && loadedTenants.some((tenant) => tenant.id === pendingTenant.id)) {
          pendingTenantSelection.current = null;
        }
      } else if (!tenantsResult) {
        setLeaseForm((current) => ({ ...current, tenantPartyId: "" }));
      }
    } catch (error) {
      if (refreshSequence.current === sequence) {
        setMessage(error instanceof Error ? error.message : "加载住房出租数据失败");
      }
    } finally {
      if (refreshSequence.current === sequence) setLoading(false);
    }
  }, [leasePage.page, purchasePage.page, tenantPage.page, unitPage.page, user]);

  const loadLease = useCallback(async (id: string) => {
    const sequence = leaseLoadSequence.current + 1;
    leaseLoadSequence.current = sequence;
    selectedLeaseIdRef.current = id;
    setSelectedLeaseId(id);
    setDetail(null);
    setSignatureFileId("");
    setHandoverPhotos([]);
    setRepairPhotos([]);
    transferLoadSequence.current += 1;
    setTransferItems([]);
    setTransferForm((current) => ({ ...current, purchaseId: "", itemIds: [] }));
    try {
      const response = await apiRequest<LeaseDetail>(`/housing/leases/${id}`, { token: getAccessToken() });
      if (leaseLoadSequence.current !== sequence) return;
      setDetail(response.data);
      const firstChargePlan = response.data.charge_plans.find((item) => item.enabled);
      setBillForm((current) => ({ ...current, chargePlanId: firstChargePlan?.id ?? "" }));
      setOccupantForm((current) => ({
        ...current,
        partyId: housingSelectionAfterLoad(current.partyId, tenants.map((tenant) => tenant.id))
      }));
      const firstReceivable = response.data.receivables.find((item) => !["paid", "waived", "void"].includes(item.status));
      setFinanceForm((current) => ({ ...current, receivableId: firstReceivable?.id ?? "" }));
    } catch (error) {
      if (leaseLoadSequence.current !== sequence) return;
      selectedLeaseIdRef.current = "";
      setSelectedLeaseId("");
      setMessage(error instanceof Error ? error.message : "加载租约详情失败");
    }
  }, [tenants]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(success: string, action: () => Promise<unknown>, reloadLease = false): Promise<boolean> {
    const originatingLeaseId = selectedLeaseId;
    setLoading(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
      if (
        reloadLease
        && housingLeaseContextStillCurrent(originatingLeaseId, selectedLeaseIdRef.current)
      ) {
        await loadLease(originatingLeaseId);
      }
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function createTenant(event: FormEvent) {
    event.preventDefault();
    const succeeded = await runAction("租客档案已建立", async () => {
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
          consent_status: "granted"
        }
      });
      pendingTenantSelection.current = response.data;
      setLeaseForm((current) => ({ ...current, tenantPartyId: response.data.id }));
      setTenantForm((current) => ({ ...current, displayName: "", mobile: "", identityNumber: "" }));
    });
    if (succeeded) setTenantPage((current) => ({ ...current, page: 1 }));
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
        monthly_rent: leaseForm.monthlyRent,
        deposit_amount: leaseForm.depositAmount,
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
        amount: chargeForm.billingSource === "fixed" ? chargeForm.amount : undefined,
        unit_price: chargeForm.billingSource === "energy_meter" ? chargeForm.unitPrice : undefined,
        meter_id: chargeForm.billingSource === "energy_meter" ? chargeForm.meterId : undefined,
        enabled: true
      }
    }), true);
  }

  async function generateBills(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    const selectedPlan = detail?.charge_plans.find((item) => item.id === billForm.chargePlanId);
    await runAction("周期账单已生成", () => apiRequest(`/housing/leases/${selectedLeaseId}/generate-bills`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("housing-bill"),
      body: {
        charge_plan_id: billForm.chargePlanId,
        period_start: billForm.periodStart,
        period_end: billForm.periodEnd,
        opening_reading: selectedPlan?.billingSource === "energy_meter" ? billForm.openingReading : undefined,
        closing_reading: selectedPlan?.billingSource === "energy_meter" ? billForm.closingReading : undefined,
        manual_amount: selectedPlan?.billingSource === "manual" ? billForm.manualAmount : undefined,
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
    const submissionSignature = JSON.stringify({
      leaseId: selectedLeaseId,
      receivableId: financeForm.receivableId,
      entryType: financeForm.entryType,
      amount: financeForm.amount,
      paymentMethod: financeForm.paymentMethod,
      reason: financeForm.reason
    });
    if (!financeSubmissionKey.current || financeSubmissionSignature.current !== submissionSignature) {
      financeSubmissionKey.current = createIdempotencyKey("housing-ledger");
      financeSubmissionSignature.current = submissionSignature;
    }
    try {
      const succeeded = await runAction("财务流水已登记并核销", () => apiRequest(`/housing/leases/${selectedLeaseId}/ledger`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: financeSubmissionKey.current!,
        body: {
          receivable_id: financeForm.entryType.startsWith("deposit_") ? undefined : financeForm.receivableId,
          entry_type: financeForm.entryType,
          charge_type: chargeType,
          amount: financeForm.amount,
          payment_method: financeForm.paymentMethod,
          reason: financeForm.reason
        }
      }), true);
      if (succeeded) {
        financeSubmissionKey.current = null;
        financeSubmissionSignature.current = "";
      }
    } finally {
      financeSubmissionLock.current = false;
      setFinanceSubmitting(false);
    }
  }

  async function completeHandover(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    const originatingLeaseId = selectedLeaseId;
    await runAction("现场交割已完成", async () => {
      await apiRequest(`/housing/leases/${originatingLeaseId}/handovers`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("housing-handover"),
        body: {
          handover_type: handoverForm.handoverType,
          item_snapshot: [{ description: handoverForm.itemText, checked: true }],
          meter_readings: [{ description: handoverForm.meterText }],
          credentials: [{ description: handoverForm.credentialText, managed_offline: true }],
          photo_file_ids: handoverPhotos.map((file) => file.id),
          damage_amount: handoverForm.handoverType === "move_out" ? handoverForm.damageAmount : undefined,
          unsettled_amount: handoverForm.handoverType === "move_out" ? handoverForm.unsettledAmount : undefined,
          deposit_deduction_amount: handoverForm.handoverType === "move_out" ? handoverForm.deductionAmount : undefined,
          remark: handoverForm.handoverType === "move_out" ? "退租现场验收" : "入住现场交割"
        }
      });
      if (housingLeaseContextStillCurrent(originatingLeaseId, selectedLeaseIdRef.current)) {
        setHandoverPhotos([]);
      }
    }, true);
  }

  async function createRepair(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    const originatingLeaseId = selectedLeaseId;
    await runAction("住房报修已代录并生成工单", async () => {
      await apiRequest(`/housing/leases/${originatingLeaseId}/repairs`, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("housing-repair"),
        body: {
          title: repairForm.title,
          description: repairForm.description,
          priority: repairForm.priority,
          urgency: repairForm.urgency,
          image_file_ids: repairPhotos.map((file) => file.id)
        }
      });
      if (housingLeaseContextStillCurrent(originatingLeaseId, selectedLeaseIdRef.current)) {
        setRepairForm((current) => ({ ...current, title: "", description: "" }));
        setRepairPhotos([]);
      }
    }, true);
  }

  async function createPurchase(event: FormEvent) {
    event.preventDefault();
    if (purchaseSubmissionLock.current) return;
    const payload = {
      unit_id: purchaseForm.unitId || undefined,
      vendor_name: purchaseForm.vendorName,
      purchase_date: purchaseForm.purchaseDate,
      cost_category: purchaseForm.costCategory,
      items: [{
        item_name: purchaseForm.itemName,
        quantity: purchaseForm.quantity,
        unit: purchaseForm.unit,
        unit_price: purchaseForm.unitPrice
      }],
      receipt_file_ids: purchaseReceipts.map((file) => file.id)
    };
    const submissionSignature = JSON.stringify(payload);
    if (!purchaseSubmissionKey.current || purchaseSubmissionSignature.current !== submissionSignature) {
      purchaseSubmissionKey.current = createIdempotencyKey("housing-purchase");
      purchaseSubmissionSignature.current = submissionSignature;
    }
    purchaseSubmissionLock.current = true;
    setPurchaseSubmitting(true);
    try {
      const succeeded = await runAction("采购成本单已创建", async () => {
        await apiRequest("/housing/purchases", {
          method: "POST",
          token: getAccessToken(),
          idempotencyKey: purchaseSubmissionKey.current!,
          body: payload
        });
      });
      if (succeeded) {
        setPurchaseReceipts([]);
        purchaseSubmissionKey.current = null;
        purchaseSubmissionSignature.current = "";
      }
    } finally {
      purchaseSubmissionLock.current = false;
      setPurchaseSubmitting(false);
    }
  }

  async function purchaseAction(
    purchase: Purchase,
    action: "approve" | "reject" | "pay" | "refund" | "void"
  ) {
    const actionLabel = {
      approve: "审批",
      reject: "驳回",
      pay: "登记付款",
      refund: "登记退款",
      void: "作废"
    }[action];
    await runAction(`采购单已${actionLabel}`, () => apiRequest(`/housing/purchases/${purchase.id}/actions`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`housing-purchase-${action}`),
      body: { action, reason: `运营人员${actionLabel}确认` }
    }));
  }

  async function transferPurchase(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId) return;
    await runAction("采购明细已受控转为租客应收", () => apiRequest(`/housing/purchases/${transferForm.purchaseId}/transfer`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("housing-purchase-transfer"),
      body: {
        lease_id: selectedLeaseId,
        item_ids: transferForm.itemIds,
        due_date: transferForm.dueDate,
        reason: transferForm.reason
      }
    }), true);
  }

  async function selectPurchaseForTransfer(purchaseId: string) {
    const sequence = transferLoadSequence.current + 1;
    transferLoadSequence.current = sequence;
    setTransferItems([]);
    setTransferForm((current) => ({ ...current, purchaseId, itemIds: [] }));
    if (!purchaseId) return;
    try {
      const response = await apiRequest<PurchaseDetail>(`/housing/purchases/${purchaseId}`, {
        token: getAccessToken()
      });
      if (transferLoadSequence.current !== sequence) return;
      setTransferItems(response.data.items.filter((item) => !item.transferredReceivableId));
    } catch (error) {
      if (transferLoadSequence.current !== sequence) return;
      setMessage(error instanceof Error ? error.message : "加载采购明细失败");
    }
  }

  async function addOccupant(event: FormEvent) {
    event.preventDefault();
    if (!selectedLeaseId || !occupantForm.partyId) return;
    await runAction("入住人员已登记", () => apiRequest(`/housing/leases/${selectedLeaseId}/occupants`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("housing-occupant"),
      body: {
        party_id: occupantForm.partyId,
        occupant_role: occupantForm.occupantRole,
        emergency_contact: occupantForm.emergencyContact
      }
    }), true);
  }

  const canManageTenants = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE);
  const canReadDashboard = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_DASHBOARD_READ);
  const canReadFinance = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ);
  const canReadPurchases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ);
  const canManageHandovers = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE);
  const canManageRepairs = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE);
  const canSignLeases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_LEASE_SIGN);
  const canManagePurchases = hasPermission(user, SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE);
  const canUploadFiles = hasPermission(user, SYSTEM_PERMISSIONS.FILE_UPLOAD);
  const canUploadHandoverPhotos = canManageHandovers && canUploadFiles;
  const canUploadRepairPhotos = canManageRepairs && canUploadFiles;
  const canUploadLeaseSignature = canSignLeases && canUploadFiles;
  const canUploadPurchaseReceipts = canManagePurchases && canUploadFiles;
  const kpis: Array<{ label: string; value: string | number; Icon: typeof Building2 }> = [
    ...(canReadDashboard ? [
      { label: "有效租约", value: dashboard.active_leases, Icon: Building2 },
      { label: "待审批", value: dashboard.pending_approval, Icon: ClipboardCheck },
      { label: "待签署", value: dashboard.pending_signature, Icon: ClipboardCheck },
      { label: "待退租", value: dashboard.checkout_pending, Icon: Building2 }
    ] : []),
    ...(canReadDashboard && canReadFinance ? [
      { label: "累计应收", value: `¥${dashboard.receivable_amount ?? "0.00"}`, Icon: CircleDollarSign },
      { label: "未结费用", value: `¥${dashboard.outstanding_amount ?? "0.00"}`, Icon: CircleDollarSign }
    ] : []),
    ...(canReadDashboard && canReadPurchases ? [
      { label: "采购成本", value: `¥${dashboard.approved_purchase_cost ?? "0.00"}`, Icon: ShoppingCart }
    ] : []),
    ...(canManageTenants ? [{ label: "租客档案", value: tenantPage.total, Icon: Users }] : [])
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
            <label>证件号码<input minLength={tenantForm.identityDocumentType === "id_card" ? 18 : 5} maxLength={tenantForm.identityDocumentType === "id_card" ? 18 : 20} pattern={tenantForm.identityDocumentType === "id_card" ? String.raw`\d{17}[\dXx]` : "[A-Za-z0-9]{5,20}"} title={tenantForm.identityDocumentType === "id_card" ? "请输入 18 位居民身份证号码" : "请输入 5 至 20 位字母或数字"} value={tenantForm.identityNumber} onChange={(event) => setTenantForm({ ...tenantForm, identityNumber: event.target.value })} /></label>
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
        <div className={`ds-table-shell ${styles.leaseTable}`}><table><thead><tr><th>租约</th><th>房源 / 租客</th><th>租期</th><th>租金 / 押金</th><th>状态</th><th>操作</th></tr></thead><tbody>{leases.map((lease) => <tr key={lease.id}><td>{lease.leaseCode}</td><td>{unitName.get(lease.unitId) ?? lease.unitId}<br />{tenantName.get(lease.tenantPartyId) ?? lease.tenantPartyId}</td><td>{lease.startDate} → {lease.endDate}</td><td>¥{lease.monthlyRent} / ¥{lease.depositAmount}</td><td><span className={styles.status}>{lease.status}</span></td><td><LeaseActions lease={lease} onSelect={() => void loadLease(lease.id)} onAction={(action) => void leaseAction(lease, action)} /></td></tr>)}</tbody></table></div>
        <div className="ds-mobile-record-list">{leases.map((lease) => <article className="ds-mobile-record" key={lease.id}><strong>{lease.leaseCode}</strong><span>{unitName.get(lease.unitId) ?? lease.unitId}</span><span>{tenantName.get(lease.tenantPartyId) ?? lease.tenantPartyId} · {lease.startDate} → {lease.endDate}</span><span>{lease.status} · 月租 ¥{lease.monthlyRent}</span><LeaseActions lease={lease} onSelect={() => void loadLease(lease.id)} onAction={(action) => void leaseAction(lease, action)} /></article>)}</div>
      </section>

      {selectedLeaseId && detail?.lease.id === selectedLeaseId ? <section className={`ds-panel ${styles.detailPanel}`}>
        <div className={styles.sectionTitle}><div><h2>租约现场与财务闭环</h2><p>{detail.lease.leaseCode}{detail.finance_summary ? ` · 未结 ¥${detail.finance_summary.outstanding} · 押金余额 ¥${detail.finance_summary.deposit_balance}` : ""}</p></div></div>
        <div className={styles.workflowGrid}>
          <form onSubmit={saveChargePlan}><h3>周期费用计划</h3><label>费用类型<select value={chargeForm.chargeType} onChange={(event) => setChargeForm({ ...chargeForm, chargeType: event.target.value })}><option value="property">物业费</option><option value="water">水费</option><option value="electricity">电费</option><option value="gas">燃气费</option><option value="other">其他费用</option></select></label><label>计费来源<select value={chargeForm.billingSource} onChange={(event) => setChargeForm({ ...chargeForm, billingSource: event.target.value })}><option value="fixed">固定金额</option><option value="energy_meter">能源表计</option><option value="manual">人工录入</option></select></label><label>周期（月）<input type="number" min="1" max="120" value={chargeForm.cycleMonths} onFocus={(event) => event.target.select()} onChange={(event) => setChargeForm({ ...chargeForm, cycleMonths: event.target.value })} /></label>{chargeForm.billingSource === "fixed" ? <label>每月金额<input type="number" min="0" step="0.01" value={chargeForm.amount} onFocus={(event) => event.target.select()} onChange={(event) => setChargeForm({ ...chargeForm, amount: event.target.value })} /></label> : null}{chargeForm.billingSource === "energy_meter" ? <><label>表计 ID<input value={chargeForm.meterId} placeholder="UUID" onChange={(event) => setChargeForm({ ...chargeForm, meterId: event.target.value })} /></label><label>单价<input type="number" min="0" step="0.000001" value={chargeForm.unitPrice} onFocus={(event) => event.target.select()} onChange={(event) => setChargeForm({ ...chargeForm, unitPrice: event.target.value })} /></label></> : null}<PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE} type="submit">保存费用计划</PermissionButton></form>
          <form onSubmit={generateBills}><h3>生成周期账单</h3><label>费用计划<select required value={billForm.chargePlanId} onChange={(event) => setBillForm({ ...billForm, chargePlanId: event.target.value })}><option value="">选择一个费用计划</option>{detail.charge_plans.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.chargeType} · {item.billingSource}</option>)}</select></label><label>账期开始<input type="date" value={billForm.periodStart} onChange={(event) => setBillForm({ ...billForm, periodStart: event.target.value })} /></label><label>账期结束<input type="date" value={billForm.periodEnd} onChange={(event) => setBillForm({ ...billForm, periodEnd: event.target.value })} /></label><label>起始表底<input type="number" min="0" step="0.000001" value={billForm.openingReading} onFocus={(event) => event.target.select()} onChange={(event) => setBillForm({ ...billForm, openingReading: event.target.value })} /></label><label>截止表底<input type="number" min="0" step="0.000001" value={billForm.closingReading} onFocus={(event) => event.target.select()} onChange={(event) => setBillForm({ ...billForm, closingReading: event.target.value })} /></label><label>人工金额<input type="number" min="0" step="0.01" value={billForm.manualAmount} onFocus={(event) => event.target.select()} onChange={(event) => setBillForm({ ...billForm, manualAmount: event.target.value })} /></label><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_BILLING_GENERATE} type="submit">生成账单</PermissionButton></form>
          {detail.finance_summary ? <form onSubmit={registerFinance}><h3>人工收退款与押金</h3><label>应收账单<select value={financeForm.receivableId} onChange={(event) => setFinanceForm({ ...financeForm, receivableId: event.target.value })}><option value="">押金流水无需选择</option>{detail.receivables.map((item) => <option value={item.id} key={item.id}>{item.chargeType} · ¥{item.amount} · {item.status}</option>)}</select></label><label>流水类型<select value={financeForm.entryType} onChange={(event) => setFinanceForm({ ...financeForm, entryType: event.target.value })}><option value="payment">人工收款核销</option><option value="refund">人工退款确认</option><option value="waiver">费用减免</option><option value="deposit_receipt">押金收取</option><option value="deposit_refund">押金退还</option></select></label><label>金额<input type="number" min="0.01" step="0.01" value={financeForm.amount} onFocus={(event) => event.target.select()} onChange={(event) => setFinanceForm({ ...financeForm, amount: event.target.value })} /></label><label>原因<input maxLength={500} value={financeForm.reason} onChange={(event) => setFinanceForm({ ...financeForm, reason: event.target.value })} /></label><PermissionButton className="ds-button ds-button-primary" permission={financeForm.entryType === "waiver" ? SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE : SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER} type="submit" disabled={financeSubmitting}>{financeSubmitting ? "登记中…" : "登记并核销"}</PermissionButton></form> : null}
          {canManageHandovers ? <form onSubmit={completeHandover}><h3>入住 / 退租交割</h3><label>交割类型<select value={handoverForm.handoverType} onChange={(event) => { setHandoverForm({ ...handoverForm, handoverType: event.target.value, damageAmount: "0", unsettledAmount: "0", deductionAmount: "0" }); setHandoverPhotos([]); }}><option value="move_in">入住交割</option><option value="move_out">退租验收</option></select></label><label>物品清单<input value={handoverForm.itemText} onChange={(event) => setHandoverForm({ ...handoverForm, itemText: event.target.value })} /></label><label>表底记录<input value={handoverForm.meterText} onChange={(event) => setHandoverForm({ ...handoverForm, meterText: event.target.value })} /></label><label>钥匙 / 门卡<input value={handoverForm.credentialText} onChange={(event) => setHandoverForm({ ...handoverForm, credentialText: event.target.value })} /></label>{handoverForm.handoverType === "move_out" ? <><label>损坏金额<input type="number" min="0" step="0.01" value={handoverForm.damageAmount} onFocus={(event) => event.target.select()} onChange={(event) => setHandoverForm({ ...handoverForm, damageAmount: event.target.value })} /></label><label>未结费用<input type="number" min="0" step="0.01" value={handoverForm.unsettledAmount} onFocus={(event) => event.target.select()} onChange={(event) => setHandoverForm({ ...handoverForm, unsettledAmount: event.target.value })} /></label><label>押金抵扣<input type="number" min="0" step="0.01" max={String(Number(handoverForm.damageAmount) + Number(handoverForm.unsettledAmount))} value={handoverForm.deductionAmount} onFocus={(event) => event.target.select()} onChange={(event) => setHandoverForm({ ...handoverForm, deductionAmount: event.target.value })} /></label></> : null}{canUploadHandoverPhotos ? <FileUploader bizType="housing_handover" bizId={selectedLeaseId} policyKey="image" compact label="上传现场照片" onUploaded={(file) => { if (selectedLeaseIdRef.current === selectedLeaseId) setHandoverPhotos((current) => [...current, file]); }} /> : null}<PendingAttachmentList files={handoverPhotos} onRemove={(fileId) => setHandoverPhotos((current) => current.filter((file) => file.id !== fileId))} /><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE} type="submit">完成现场交割</PermissionButton></form> : null}
          {canManageRepairs ? <form onSubmit={createRepair}><h3>租客报修代录</h3><label>报修标题<input required maxLength={200} value={repairForm.title} onChange={(event) => setRepairForm({ ...repairForm, title: event.target.value })} /></label><label>问题描述<textarea required maxLength={2000} value={repairForm.description} onChange={(event) => setRepairForm({ ...repairForm, description: event.target.value })} /></label><label>优先级<select value={repairForm.priority} onChange={(event) => setRepairForm({ ...repairForm, priority: event.target.value })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label><label>紧急程度<select value={repairForm.urgency} onChange={(event) => setRepairForm({ ...repairForm, urgency: event.target.value })}><option value="normal">一般</option><option value="urgent">紧急</option><option value="critical">特急</option></select></label>{canUploadRepairPhotos ? <FileUploader bizType="housing_repair" bizId={selectedLeaseId} policyKey="image" compact label="上传报修照片" onUploaded={(file) => { if (selectedLeaseIdRef.current === selectedLeaseId) setRepairPhotos((current) => [...current, file]); }} /> : null}<PendingAttachmentList files={repairPhotos} onRemove={(fileId) => setRepairPhotos((current) => current.filter((file) => file.id !== fileId))} /><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE} type="submit">生成维修工单</PermissionButton></form> : null}
        </div>
        {canManageTenants ? <form className={styles.occupantForm} onSubmit={addOccupant}><h3>实名入住人员登记</h3><label>人员<select required value={occupantForm.partyId} onChange={(event) => setOccupantForm({ ...occupantForm, partyId: event.target.value })}><option value="">选择人员档案</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.displayName} · {tenant.verificationStatus}</option>)}</select></label><label>入住角色<select value={occupantForm.occupantRole} onChange={(event) => setOccupantForm({ ...occupantForm, occupantRole: event.target.value })}><option value="cohabitant">同住人</option><option value="emergency_contact">紧急联系人</option></select></label><label className={styles.checkboxLabel}><input type="checkbox" checked={occupantForm.emergencyContact} onChange={(event) => setOccupantForm({ ...occupantForm, emergencyContact: event.target.checked })} />同时设为紧急联系人</label><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE} type="submit">登记入住人员</PermissionButton><div className={styles.occupantList}>{detail.occupants.map((occupant) => <span key={occupant.id}>{tenantName.get(occupant.partyId) ?? occupant.partyId} · {occupant.occupantRole}{occupant.emergencyContact ? " · 紧急联系人" : ""}</span>)}</div></form> : null}
        {detail.finance_summary ? <section className={styles.ledgerSection}><h3>租约财务流水</h3><div className={`ds-table-shell ${styles.detailTable}`}><table><thead><tr><th>发生时间</th><th>类型</th><th>费用</th><th>金额</th><th>状态</th><th>原因</th></tr></thead><tbody>{detail.ledger.map((entry) => <tr key={entry.id}><td>{new Date(entry.occurredAt).toLocaleString()}</td><td>{entry.entryType}</td><td>{entry.chargeType}</td><td>¥{entry.amount}</td><td>{entry.status}</td><td>{entry.reason}</td></tr>)}</tbody></table></div><div className="ds-mobile-record-list">{detail.ledger.map((entry) => <article className="ds-mobile-record" key={entry.id}><strong>{entry.entryType} · ¥{entry.amount}</strong><span>{entry.chargeType} · {entry.status}</span><span>{new Date(entry.occurredAt).toLocaleString()}</span><span>{entry.reason}</span></article>)}</div>{detail.ledger.length ? null : <p>暂无财务流水。</p>}</section> : null}
        <div className={styles.repairList}><h3>关联维修工单</h3>{detail.repairs.length ? detail.repairs.map((repair) => <article key={repair.id}><div><strong>{repair.woCode}</strong><span className={styles.status}>{repair.status}</span></div><span>{repair.title}</span><small>{repair.priority} / {repair.urgency ?? "normal"} · {new Date(repair.createTime).toLocaleString()}</small></article>) : <p>暂无关联报修工单。</p>}</div>
        <div className={styles.signature}>{canUploadLeaseSignature ? <FileUploader bizType="housing_lease_signature" bizId={selectedLeaseId} policyKey="pdf" compact label="上传线下签署 PDF" onUploaded={(file) => { if (housingLeaseContextStillCurrent(selectedLeaseId, selectedLeaseIdRef.current)) setSignatureFileId(file.id); }} /> : null}<span>{signatureFileId ? "签署件已就绪，可执行签署登记" : "待上传签署件"}</span></div>
      </section> : null}

      <section className={styles.commandGrid}>
        {canManagePurchases ? <form className="ds-panel" onSubmit={createPurchase}><h2>内部采购成本</h2><div className={styles.formGrid}><label>归集房源<select value={purchaseForm.unitId} onChange={(event) => setPurchaseForm({ ...purchaseForm, unitId: event.target.value })}><option value="">项目公共成本</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unitName.get(unit.id)}</option>)}</select></label><label>供应商<input required value={purchaseForm.vendorName} onChange={(event) => setPurchaseForm({ ...purchaseForm, vendorName: event.target.value })} /></label><label>采购日期<input type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm({ ...purchaseForm, purchaseDate: event.target.value })} /></label><label>成本分类<select value={purchaseForm.costCategory} onChange={(event) => setPurchaseForm({ ...purchaseForm, costCategory: event.target.value })}><option value="consumable">耗材</option><option value="repair">维修</option><option value="cleaning">保洁</option><option value="other">其他</option></select></label><label>采购明细<input required value={purchaseForm.itemName} onChange={(event) => setPurchaseForm({ ...purchaseForm, itemName: event.target.value })} /></label><label>数量<input type="number" min="0.001" step="0.001" value={purchaseForm.quantity} onFocus={(event) => event.target.select()} onChange={(event) => setPurchaseForm({ ...purchaseForm, quantity: event.target.value })} /></label><label>单位<input value={purchaseForm.unit} onChange={(event) => setPurchaseForm({ ...purchaseForm, unit: event.target.value })} /></label><label>单价<input type="number" min="0" step="0.01" value={purchaseForm.unitPrice} onFocus={(event) => event.target.select()} onChange={(event) => setPurchaseForm({ ...purchaseForm, unitPrice: event.target.value })} /></label></div>{canUploadPurchaseReceipts ? <FileUploader bizType="housing_purchase" policyKey="receipt" compact label="上传采购票据" onUploaded={(file) => setPurchaseReceipts((current) => [...current, file])} /> : null}<PendingAttachmentList files={purchaseReceipts} onRemove={(fileId) => setPurchaseReceipts((current) => current.filter((file) => file.id !== fileId))} /><PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} className="ds-button ds-button-primary" type="submit" disabled={purchaseSubmitting}>{purchaseSubmitting ? "正在创建…" : "创建采购成本单"}</PermissionButton></form> : null}
        <form className="ds-panel" onSubmit={transferPurchase}><h2>受控转租客收费</h2><p>内部成本与租客应收保持分账；仅审批后的指定明细可转收费。</p><label>采购单<select required value={transferForm.purchaseId} onChange={(event) => void selectPurchaseForTransfer(event.target.value)}><option value="">选择已审批采购单</option>{purchases.filter((item) => item.approvalStatus === "approved" && item.paymentStatus !== "refunded").map((item) => <option key={item.id} value={item.id}>{item.purchaseCode} · ¥{item.totalAmount}</option>)}</select></label><fieldset className={styles.transferItems}><legend>选择待转采购明细</legend>{transferItems.map((item) => <label key={item.id}><input type="checkbox" checked={transferForm.itemIds.includes(item.id)} onChange={(event) => setTransferForm((current) => ({ ...current, itemIds: event.target.checked ? [...current.itemIds, item.id] : current.itemIds.filter((id) => id !== item.id) }))} />{item.itemName} · ¥{item.amount}</label>)}{transferForm.purchaseId && !transferItems.length ? <span>该采购单暂无可转收费明细。</span> : null}</fieldset><label>租客应收日<input type="date" value={transferForm.dueDate} onChange={(event) => setTransferForm({ ...transferForm, dueDate: event.target.value })} /></label><label>转收费依据<input maxLength={500} value={transferForm.reason} onChange={(event) => setTransferForm({ ...transferForm, reason: event.target.value })} /></label><PermissionButton className="ds-button ds-button-primary" permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER} type="submit" disabled={!selectedLeaseId || !canRechargeHousingLease(detail?.lease.status) || transferForm.itemIds.length === 0}>转为当前租约应收</PermissionButton></form>
      </section>

      <section className="ds-panel"><div className={styles.sectionTitle}><div><h2>采购成本台账</h2><p>首期仅做采购单、成本归集、审批和付款登记，不建立库存。</p></div><PaginationControls meta={purchasePage} disabled={loading} onPageChange={(page) => setPurchasePage((current) => ({ ...current, page }))} /></div><div className={styles.purchaseGrid}>{purchases.map((purchase) => <article className={styles.purchaseCard} key={purchase.id}><div><strong>{purchase.purchaseCode}</strong><span>¥{purchase.totalAmount}</span></div><span>{purchase.vendorName} · {purchase.costCategory}</span><span>{purchase.approvalStatus} / {purchase.paymentStatus}</span><div className={styles.actions}>{purchase.approvalStatus === "draft" ? <><PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} onClick={() => void purchaseAction(purchase, "approve")}>审批通过</PermissionButton><PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} onClick={() => void purchaseAction(purchase, "reject")}>驳回</PermissionButton></> : null}{purchase.approvalStatus === "approved" && purchase.paymentStatus === "unpaid" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} onClick={() => void purchaseAction(purchase, "pay")}>登记付款</PermissionButton> : null}{purchase.paymentStatus === "paid" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} onClick={() => void purchaseAction(purchase, "refund")}>登记退款</PermissionButton> : null}{purchase.paymentStatus !== "paid" && purchase.approvalStatus !== "void" ? <PermissionButton permission={SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE} onClick={() => void purchaseAction(purchase, "void")}>作废</PermissionButton> : null}</div></article>)}</div></section>
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
