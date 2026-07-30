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
import { CheckCircle2, FileUp, Plus, RefreshCw, Search, X, XCircle } from "lucide-react";
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

interface AdjustmentRow {
  id: string;
  adjustmentCode: string;
  billingItemId: string;
  cycleId: string;
  relatedParkTenantId: string;
  originalReceivableId: string;
  adjustmentType: "REVERSAL" | "ADJUSTMENT";
  adjustmentAmount: string;
  finalAdjustmentAmount: string;
  adjustmentReason: string;
  status: string;
  relatedReceivableId: string | null;
  approvedAt: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
}

interface AdjustmentForm {
  billingItemId: string;
  adjustmentType: "REVERSAL" | "ADJUSTMENT";
  adjustmentAmount: string;
  adjustmentReason: string;
}

interface BillingItemOptionRow {
  id: string;
  cycleId: string;
  relatedParkTenantId: string;
  billingMethod: string;
  finalAmount: string;
  confirmationStatus: string;
  receivableId: string | null;
}

interface BillingCycleOptionRow {
  id: string;
  cycleCode: string;
  cycleName: string;
}

interface ParkTenantOptionRow {
  id: string;
  parkTenantCode: string;
  companyName: string;
}

const emptyPage: PaginatedResult<AdjustmentRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyForm: AdjustmentForm = { billingItemId: "", adjustmentType: "ADJUSTMENT", adjustmentAmount: "0", adjustmentReason: "" };

export default function EnergyBillingAdjustmentsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<AdjustmentRow>>(emptyPage);
  const [dicts, setDicts] = useState<DictMap>({});
  const [billingItems, setBillingItems] = useState<BillingItemOptionRow[]>([]);
  const [billingItemPage, setBillingItemPage] = useState(1);
  const [billingItemTotal, setBillingItemTotal] = useState(0);
  const [billingCycles, setBillingCycles] = useState<BillingCycleOptionRow[]>([]);
  const [parkTenants, setParkTenants] = useState<ParkTenantOptionRow[]>([]);
  const [filters, setFilters] = useState({ keyword: "", billingItemId: "", adjustmentType: "", status: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AdjustmentForm>(emptyForm);
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const billingCycleMap = useMemo(() => new Map(billingCycles.map((item) => [item.id, `${item.cycleCode} ${item.cycleName}`.trim()])), [billingCycles]);
  const parkTenantMap = useMemo(() => new Map(parkTenants.map((item) => [item.id, `${item.parkTenantCode} ${item.companyName}`.trim()])), [parkTenants]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.billingItemId.trim()) params.set("billing_item_id", filters.billingItemId.trim());
    if (filters.adjustmentType) params.set("adjustment_type", filters.adjustmentType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<AdjustmentRow>>(`/energy/billing-adjustments?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_billing_adjustment_type", "energy_billing_adjustment_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadBillingItemOptions = useCallback(async (page = 1) => {
    const [itemResponse, cycleResponse, references] = await Promise.all([
      apiRequest<PaginatedResult<BillingItemOptionRow>>(`/energy/billing-items?page=${page}&page_size=50`, { token: getAccessToken() }),
      apiRequest<PaginatedResult<BillingCycleOptionRow>>("/energy/billing-cycles?page=1&page_size=200", { token: getAccessToken() }),
      fetchReferenceFormOptions()
    ]);
    setBillingItems(itemResponse.data.items);
    setBillingItemPage(itemResponse.data.page);
    setBillingItemTotal(itemResponse.data.total);
    setBillingCycles(cycleResponse.data.items);
    setParkTenants(references.parkTenants as ParkTenantOptionRow[]);
  }, []);

  useEffect(() => { void loadDicts().catch((error: Error) => setMessage(error.message)); }, [loadDicts]);
  useEffect(() => { void loadBillingItemOptions(1).catch((error: Error) => setMessage(error.message)); }, [loadBillingItemOptions]);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest<AdjustmentRow>("/energy/billing-adjustments", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-billing-adjustment-create"),
      body: {
        billing_item_id: form.billingItemId,
        adjustment_type: form.adjustmentType,
        adjustment_amount: form.adjustmentType === "REVERSAL" ? undefined : Number(form.adjustmentAmount),
        adjustment_reason: form.adjustmentReason
      }
    });
    setMessage("调整单已创建");
    setFormOpen(false);
    await load(1);
  }

  async function action(row: AdjustmentRow, name: "approve" | "post" | "cancel") {
    await apiRequest(`/energy/billing-adjustments/${row.id}/${name}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`energy-billing-adjustment-${name}`)
    });
    setMessage("操作已完成");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_VIEW} fallback={<Forbidden />}>
      <PageShell>
        <PageHeader
          title="能源账单调整与红冲"
          description="已发布账单只允许通过红冲或补差单据修正，并发布为独立应收。"
          actions={
            <>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}><RefreshCw size={16} />刷新</button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增调整</PermissionButton>
            </>
          }
        />

        <FilterPanel>
          <Field label="关键词"><input value={filters.keyword} placeholder="调整单号/原因" onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} /></Field>
          <Field label="账单项 ID"><input value={filters.billingItemId} onChange={(event) => setFilters((current) => ({ ...current, billingItemId: event.target.value }))} /></Field>
          <SelectField label="类型" value={filters.adjustmentType} items={dicts.energy_billing_adjustment_type ?? []} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, adjustmentType: value }))} />
          <SelectField label="状态" value={filters.status} items={dicts.energy_billing_adjustment_status ?? []} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}><Search size={16} />查询</button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="warning">{message}</FeedbackNotice> : null}

        <ContentCard title="调整单列表" actions={<span>共 {pageData.total} 条</span>}>
          <DataTable className="allow-horizontal-table">
            <thead><tr><th>调整单号</th><th>账单项</th><th>类型</th><th>调整金额</th><th>原因</th><th>状态</th><th>原应收</th><th>调整应收</th><th>操作</th></tr></thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.adjustmentCode}</td>
                  <td>{row.billingItemId}</td>
                  <td><StatusPill dictCode="energy_billing_adjustment_type" value={row.adjustmentType} dicts={dicts} /></td>
                  <td>{row.finalAdjustmentAmount}</td>
                  <td>{row.adjustmentReason}</td>
                  <td><StatusPill dictCode="energy_billing_adjustment_status" value={row.status} dicts={dicts} /></td>
                  <td>{row.originalReceivableId}</td>
                  <td>{row.relatedReceivableId ?? "-"}</td>
                  <td>
                    <DataTableActions>
                      {canApproveAdjustment(row) ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_APPROVE} type="button" onClick={() => void action(row, "approve").catch((error: Error) => setMessage(error.message))}><CheckCircle2 size={16} />审批</PermissionButton> : null}
                      {canPostAdjustment(row) ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_POST} type="button" onClick={() => void action(row, "post").catch((error: Error) => setMessage(error.message))}><FileUp size={16} />发布</PermissionButton> : null}
                      {canCancelAdjustment(row) ? <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_ADJUSTMENT_CANCEL} type="button" onClick={() => void action(row, "cancel").catch((error: Error) => setMessage(error.message))}><XCircle size={16} />取消</PermissionButton> : null}
                      {!hasAdjustmentActions(row) ? <span className="muted-text">{adjustmentActionHint(row)}</span> : null}
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={9}><EmptyState title="暂无调整红冲单" compact /></td></tr> : null}
            </tbody>
          </DataTable>
          <PaginationBar page={pageData.page} totalPages={totalPages} onPage={(page) => void load(page).catch((error: Error) => setMessage(error.message))} />
        </ContentCard>

        {formOpen ? (
          <Drawer size="md" onClose={() => setFormOpen(false)}>
            <DrawerHeader eyebrow="能源管理" title="新增调整或红冲" description="红冲自动按原账单最终金额取负数；补差可正可负。" onClose={() => setFormOpen(false)} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="账单项">
                  <select required value={form.billingItemId} onChange={(event) => setForm((current) => ({ ...current, billingItemId: event.target.value }))}>
                    <option value="">请选择已发布账单项</option>
                    {billingItems.map((item) => (
                      <option key={item.id} value={item.id} disabled={!item.receivableId}>
                        {formatBillingItemOption(item, billingCycleMap, parkTenantMap)}
                      </option>
                    ))}
                  </select>
                  <span className="pagination-actions">
                    <button className="pagination-button" type="button" disabled={billingItemPage <= 1 || Boolean(form.billingItemId)} onClick={() => void loadBillingItemOptions(billingItemPage - 1).catch((error: Error) => setMessage(error.message))}>上一页</button>
                    <span>第 {billingItemPage} / {Math.max(1, Math.ceil(billingItemTotal / 50))} 页</span>
                    <button className="pagination-button" type="button" disabled={billingItemPage >= Math.max(1, Math.ceil(billingItemTotal / 50)) || Boolean(form.billingItemId)} onClick={() => void loadBillingItemOptions(billingItemPage + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
                  </span>
                </Field>
                <Field label="调整类型"><select value={form.adjustmentType} onChange={(event) => setForm((current) => ({ ...current, adjustmentType: event.target.value as AdjustmentForm["adjustmentType"] }))}><option value="ADJUSTMENT">补差</option><option value="REVERSAL">红冲</option></select></Field>
                <Field label="调整金额"><input required={form.adjustmentType === "ADJUSTMENT"} disabled={form.adjustmentType === "REVERSAL"} type="number" step="0.01" value={form.adjustmentAmount} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, adjustmentAmount: event.target.value }))} /></Field>
                <Field label="调整原因"><textarea required value={form.adjustmentReason} onChange={(event) => setForm((current) => ({ ...current, adjustmentReason: event.target.value }))} /></Field>
              </DrawerFormGrid>
              <DrawerFooter><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="primary-button" type="submit">保存</button></DrawerFooter>
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

function canApproveAdjustment(row: AdjustmentRow) {
  return row.status === "DRAFT";
}

function canPostAdjustment(row: AdjustmentRow) {
  return row.status === "APPROVED";
}

function canCancelAdjustment(row: AdjustmentRow) {
  return row.status === "DRAFT";
}

function hasAdjustmentActions(row: AdjustmentRow) {
  return canApproveAdjustment(row) || canPostAdjustment(row) || canCancelAdjustment(row);
}

function adjustmentActionHint(row: AdjustmentRow) {
  switch (row.status) {
    case "POSTED":
      return "已发布";
    case "CANCELLED":
      return "已取消";
    default:
      return "当前无动作";
  }
}

function formatBillingItemOption(
  item: BillingItemOptionRow,
  cycleMap: Map<string, string>,
  parkTenantMap: Map<string, string>
) {
  const cycle = cycleMap.get(item.cycleId) ?? item.cycleId.slice(0, 8);
  const tenant = parkTenantMap.get(item.relatedParkTenantId) ?? item.relatedParkTenantId.slice(0, 8);
  const availability = item.receivableId ? "已发布" : "未发布";
  return `${cycle} · ${tenant} · ${item.billingMethod} · ¥${item.finalAmount} · ${availability}`;
}

function Forbidden() {
  return <PageShell><ContentCard><EmptyState title="403" description="无权访问能源调整红冲，或当前租户未开通能耗能力。" /></ContentCard></PageShell>;
}
