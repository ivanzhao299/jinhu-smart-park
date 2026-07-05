"use client";

import {
  ContentCard,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  EmptyState,
  FeedbackNotice,
  FilterPanel,
  PageHeader,
  PageShell,
  PaginationBar,
  StatusPill
} from "@jinhu/ui";
import { AlertTriangle, CheckCircle2, Edit3, RefreshCw, Search, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { fetchReferenceFormOptions } from "../../../lib/reference-data";

const ENERGY_MODULE = "energy";

interface DictTypeRow { id: string; dictCode: string }
interface DictItemRow { id: string; itemLabel: string; itemValue: string; status: string; tagType?: string | null }
type DictMap = Record<string, DictItemRow[]>;

interface BillingCycleOptionRow {
  id: string;
  cycleCode: string;
  cycleName: string;
}

interface ParkTenantRow {
  id: string;
  parkTenantCode: string;
  companyName: string;
}

interface BillingItemRow {
  id: string;
  cycleId: string;
  relatedParkTenantId: string;
  roomId: string | null;
  meterId: string | null;
  meterType: string;
  billingMethod: string;
  previousReading: string;
  currentReading: string;
  consumptionValue: string;
  unitPrice: string;
  amount: string;
  adjustmentAmount: string;
  finalAmount: string;
  confirmationStatus: string;
  disputeReason: string | null;
  adjustmentReason: string | null;
  receivableId: string | null;
  postedAt: string | null;
}

const emptyPage: PaginatedResult<BillingItemRow> = { items: [], total: 0, page: 1, page_size: 50 };

export default function EnergyBillingItemsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<BillingItemRow>>(emptyPage);
  const [dicts, setDicts] = useState<DictMap>({});
  const [cycles, setCycles] = useState<BillingCycleOptionRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [filters, setFilters] = useState({ cycleId: "", parkTenantId: "", billingMethod: "", status: "" });
  const [adjusting, setAdjusting] = useState<BillingItemRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ adjustmentAmount: "0", adjustmentReason: "" });
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const parkTenantLabelMap = useMemo(
    () => new Map(parkTenants.map((item) => [item.id, formatParkTenantLabel(item)])),
    [parkTenants]
  );

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "50" });
    if (filters.cycleId.trim()) params.set("cycle_id", filters.cycleId.trim());
    if (filters.parkTenantId.trim()) params.set("related_park_tenant_id", filters.parkTenantId.trim());
    if (filters.billingMethod) params.set("billing_method", filters.billingMethod);
    if (filters.status) params.set("confirmation_status", filters.status);
    const response = await apiRequest<PaginatedResult<BillingItemRow>>(`/energy/billing-items?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_meter_type", "energy_billing_method", "energy_billing_item_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadReferences = useCallback(async () => {
    const [cycleResponse, references] = await Promise.all([
      apiRequest<PaginatedResult<BillingCycleOptionRow>>("/energy/billing-cycles?page=1&page_size=200", { token: getAccessToken() }),
      fetchReferenceFormOptions()
    ]);
    setCycles(cycleResponse.data.items);
    setParkTenants(references.parkTenants as ParkTenantRow[]);
  }, []);

  useEffect(() => { void loadDicts().catch((error: Error) => setMessage(error.message)); }, [loadDicts]);
  useEffect(() => { void loadReferences().catch((error: Error) => setMessage(error.message)); }, [loadReferences]);
  useEffect(() => {
    const cycleId = new URLSearchParams(window.location.search).get("cycle_id") ?? "";
    if (cycleId) setFilters((current) => ({ ...current, cycleId }));
  }, []);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);

  function openAdjust(row: BillingItemRow) {
    setAdjusting(row);
    setAdjustForm({ adjustmentAmount: row.adjustmentAmount, adjustmentReason: row.adjustmentReason ?? "" });
  }

  async function saveAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjusting) return;
    await apiRequest<BillingItemRow>(`/energy/billing-items/${adjusting.id}/adjust`, {
      method: "PATCH",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-billing-item-adjust"),
      body: { adjustment_amount: Number(adjustForm.adjustmentAmount), adjustment_reason: adjustForm.adjustmentReason }
    });
    setMessage("账单项已调整");
    setAdjusting(null);
    await load(pageData.page);
  }

  async function itemAction(row: BillingItemRow, name: "confirm" | "dispute") {
    const body = name === "dispute" ? { dispute_reason: window.prompt("请输入争议原因", "租户对本期用量存在异议") } : undefined;
    if (name === "dispute" && !body?.dispute_reason) return;
    await apiRequest<BillingItemRow>(`/energy/billing-items/${row.id}/${name}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`energy-billing-item-${name}`),
      body
    });
    setMessage("操作已完成");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_VIEW} fallback={<Forbidden />}>
      <PageShell>
        <PageHeader
          title="能源账单明细"
          description="查看独立表计、公共分摊与人工调整后的租户能源账单项。"
          actions={<button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}><RefreshCw size={16} />刷新</button>}
        />

        <FilterPanel>
          <ReferenceSelectField label="账期" value={filters.cycleId} allLabel="全部账期" items={cycles.map((item) => ({ id: item.id, label: formatCycleLabel(item) }))} onChange={(value) => setFilters((current) => ({ ...current, cycleId: value }))} />
          <ReferenceSelectField label="租户企业" value={filters.parkTenantId} allLabel="全部租户企业" items={parkTenants.map((item) => ({ id: item.id, label: formatParkTenantLabel(item) }))} onChange={(value) => setFilters((current) => ({ ...current, parkTenantId: value }))} />
          <SelectField label="计费方式" value={filters.billingMethod} items={dicts.energy_billing_method ?? []} allLabel="全部方式" onChange={(value) => setFilters((current) => ({ ...current, billingMethod: value }))} />
          <SelectField label="确认状态" value={filters.status} items={dicts.energy_billing_item_status ?? []} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}><Search size={16} />查询</button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="warning">{message}</FeedbackNotice> : null}

        <ContentCard title="账单项列表" actions={<span>共 {pageData.total} 条</span>}>
          <DataTable className="allow-horizontal-table">
            <thead><tr><th>租户企业</th><th>表计类型</th><th>计费方式</th><th>用量</th><th>单价</th><th>金额</th><th>调整</th><th>最终金额</th><th>状态</th><th>应收</th><th>操作</th></tr></thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{parkTenantLabelMap.get(row.relatedParkTenantId) ?? row.relatedParkTenantId}</td>
                  <td><StatusPill dictCode="energy_meter_type" value={row.meterType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="energy_billing_method" value={row.billingMethod} dicts={dicts} /></td>
                  <td>{row.consumptionValue}</td>
                  <td>{row.unitPrice}</td>
                  <td>{row.amount}</td>
                  <td>{row.adjustmentAmount}</td>
                  <td>{row.finalAmount}</td>
                  <td><StatusPill dictCode="energy_billing_item_status" value={row.confirmationStatus} dicts={dicts} /></td>
                  <td>{row.receivableId ? "已发布" : "-"}</td>
                  <td>
                    <DataTableActions>
                      {canAdjustBillingItem(row) ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_ADJUST} type="button" onClick={() => openAdjust(row)}><Edit3 size={16} />调整</PermissionButton> : null}
                      {canConfirmBillingItem(row) ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_CONFIRM} type="button" onClick={() => void itemAction(row, "confirm").catch((error: Error) => setMessage(error.message))}><CheckCircle2 size={16} />确认</PermissionButton> : null}
                      {canDisputeBillingItem(row) ? <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ITEM_DISPUTE} type="button" onClick={() => void itemAction(row, "dispute").catch((error: Error) => setMessage(error.message))}><AlertTriangle size={16} />争议</PermissionButton> : null}
                      {!hasBillingItemActions(row) ? <span className="muted-text">已发布</span> : null}
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={11}><EmptyState title="暂无账单项" compact /></td></tr> : null}
            </tbody>
          </DataTable>
          <PaginationBar page={pageData.page} totalPages={totalPages} onPage={(page) => void load(page).catch((error: Error) => setMessage(error.message))} />
        </ContentCard>

        {adjusting ? (
          <Drawer size="md" onClose={() => setAdjusting(null)}>
            <DrawerHeader eyebrow="能源管理" title="人工调整" description="调整金额可为正或负，必须填写调整原因。" onClose={() => setAdjusting(null)} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void saveAdjust(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="调整金额"><input required type="number" step="0.01" value={adjustForm.adjustmentAmount} onFocus={(event) => event.target.select()} onChange={(event) => setAdjustForm((current) => ({ ...current, adjustmentAmount: event.target.value }))} /></Field>
                <Field label="调整原因"><textarea required value={adjustForm.adjustmentReason} onChange={(event) => setAdjustForm((current) => ({ ...current, adjustmentReason: event.target.value }))} /></Field>
              </DrawerFormGrid>
              <DrawerFooter><button className="secondary-button" type="button" onClick={() => setAdjusting(null)}>取消</button><button className="primary-button" type="submit">保存</button></DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}

function SelectField({ label, value, items, allLabel, onChange }: { label: string; value: string; items: DictItemRow[]; allLabel: string; onChange: (value: string) => void }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></Field>;
}

function ReferenceSelectField({ label, value, items, allLabel, onChange }: { label: string; value: string; items: Array<{ id: string; label: string }>; allLabel: string; onChange: (value: string) => void }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>;
}

function formatParkTenantLabel(item?: ParkTenantRow | null) {
  if (!item) return "-";
  return `${item.parkTenantCode} ${item.companyName}`.trim();
}

function formatCycleLabel(item?: BillingCycleOptionRow | null) {
  if (!item) return "-";
  return `${item.cycleCode} ${item.cycleName}`.trim();
}

function canAdjustBillingItem(row: BillingItemRow) {
  return !row.postedAt;
}

function canConfirmBillingItem(row: BillingItemRow) {
  return row.confirmationStatus !== "CONFIRMED" && !row.postedAt;
}

function canDisputeBillingItem(row: BillingItemRow) {
  return !row.postedAt;
}

function hasBillingItemActions(row: BillingItemRow) {
  return canAdjustBillingItem(row) || canConfirmBillingItem(row) || canDisputeBillingItem(row);
}

function Forbidden() {
  return <PageShell><ContentCard><EmptyState title="403" description="无权访问能源账单明细，或当前租户未开通能耗能力。" /></ContentCard></PageShell>;
}
