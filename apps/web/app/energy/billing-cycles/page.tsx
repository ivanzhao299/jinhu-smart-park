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
import { Calculator, CheckCircle2, FileUp, Plus, RefreshCw, Search, X, XCircle } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const ENERGY_MODULE = "energy";

interface DictTypeRow { id: string; dictCode: string }
interface DictItemRow { id: string; itemLabel: string; itemValue: string; status: string; tagType?: string | null }
type DictMap = Record<string, DictItemRow[]>;

interface BillingCycleRow {
  id: string;
  cycleCode: string;
  cycleName: string;
  meterType: string;
  startDate: string;
  endDate: string;
  status: string;
  calculatedAt: string | null;
  confirmedAt: string | null;
  postedAt: string | null;
  remark: string | null;
}

interface CycleForm {
  cycleName: string;
  meterType: string;
  startDate: string;
  endDate: string;
  unitPrice: string;
  remark: string;
}

const emptyPage: PaginatedResult<BillingCycleRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyForm: CycleForm = { cycleName: "", meterType: "ELECTRIC", startDate: "", endDate: "", unitPrice: "1", remark: "" };

export default function EnergyBillingCyclesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<BillingCycleRow>>(emptyPage);
  const [dicts, setDicts] = useState<DictMap>({});
  const [filters, setFilters] = useState({ keyword: "", meterType: "", status: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CycleForm>(emptyForm);
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.meterType) params.set("meter_type", filters.meterType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<BillingCycleRow>>(`/energy/billing-cycles?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_meter_type", "energy_billing_cycle_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  useEffect(() => { void loadDicts().catch((error: Error) => setMessage(error.message)); }, [loadDicts]);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, meterType: dicts.energy_meter_type?.[0]?.itemValue ?? "ELECTRIC" });
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest<BillingCycleRow>("/energy/billing-cycles", {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-billing-cycle-create"),
      body: {
        cycle_name: form.cycleName,
        meter_type: form.meterType,
        start_date: form.startDate,
        end_date: form.endDate,
        unit_prices: { [form.meterType]: Number(form.unitPrice || 1) },
        remark: form.remark || undefined
      }
    });
    setMessage("账期已创建");
    setFormOpen(false);
    await load(1);
  }

  async function action(row: BillingCycleRow, name: "calculate" | "confirm" | "post" | "cancel") {
    const body = name === "calculate" ? { unit_prices: { [row.meterType]: Number(form.unitPrice || 1) } } : undefined;
    await apiRequest(`/energy/billing-cycles/${row.id}/${name}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`energy-billing-cycle-${name}`),
      body
    });
    setMessage("操作已完成");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_VIEW} fallback={<Forbidden />}>
      <PageShell>
        <PageHeader
          title="能源账期管理"
          description="按水、电、气账期计算独立表计与公共能耗分摊，并发布到应收。"
          actions={
            <>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}><RefreshCw size={16} />刷新</button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增账期</PermissionButton>
            </>
          }
        />

        <FilterPanel>
          <Field label="关键词"><input value={filters.keyword} placeholder="账期名称/编码" onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} /></Field>
          <SelectField label="表计类型" value={filters.meterType} items={dicts.energy_meter_type ?? []} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, meterType: value }))} />
          <SelectField label="状态" value={filters.status} items={dicts.energy_billing_cycle_status ?? []} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}><Search size={16} />查询</button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="warning">{message}</FeedbackNotice> : null}

        <ContentCard title="账期列表" actions={<span>共 {pageData.total} 条</span>}>
          <DataTable className="allow-horizontal-table">
            <thead><tr><th>账期编码</th><th>账期名称</th><th>表计类型</th><th>周期</th><th>状态</th><th>计算时间</th><th>发布时间</th><th style={{ width: "400px", minWidth: "400px", maxWidth: "400px" }}>操作</th></tr></thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.cycleCode}</td>
                  <td>{row.cycleName}</td>
                  <td><StatusPill dictCode="energy_meter_type" value={row.meterType} dicts={dicts} /></td>
                  <td>{row.startDate} 至 {row.endDate}</td>
                  <td><StatusPill dictCode="energy_billing_cycle_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.calculatedAt)}</td>
                  <td>{formatDateTime(row.postedAt)}</td>
                  <td style={{ width: "400px", minWidth: "400px", maxWidth: "400px" }}>
                    <DataTableActions>
                      <Link className="table-action-button" href={`/energy/billing-items?cycle_id=${row.id}`}>明细</Link>
                      {canCalculateCycle(row) ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CALCULATE} type="button" onClick={() => void action(row, "calculate").catch((error: Error) => setMessage(error.message))}><Calculator size={16} />计算</PermissionButton> : null}
                      {canConfirmCycle(row) ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CONFIRM} type="button" onClick={() => void action(row, "confirm").catch((error: Error) => setMessage(error.message))}><CheckCircle2 size={16} />确认</PermissionButton> : null}
                      {canPostCycle(row) ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_POST} type="button" onClick={() => void action(row, "post").catch((error: Error) => setMessage(error.message))}><FileUp size={16} />发布</PermissionButton> : null}
                      {canCancelCycle(row) ? <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.ENERGY_BILLING_CYCLE_CANCEL} type="button" onClick={() => void action(row, "cancel").catch((error: Error) => setMessage(error.message))}><XCircle size={16} />取消</PermissionButton> : null}
                      {!hasCycleActions(row) ? <span className="muted-text">{cycleActionHint(row)}</span> : null}
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={8}><EmptyState title="暂无账期" compact /></td></tr> : null}
            </tbody>
          </DataTable>
          <PaginationBar page={pageData.page} totalPages={totalPages} onPage={(page) => void load(page).catch((error: Error) => setMessage(error.message))} />
        </ContentCard>

        {formOpen ? (
          <Drawer size="md" onClose={() => setFormOpen(false)}>
            <DrawerHeader eyebrow="能源管理" title="新增账期" description="账期计算只读取已确认能源读数。" onClose={() => setFormOpen(false)} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="账期名称"><input required value={form.cycleName} onChange={(event) => setForm((current) => ({ ...current, cycleName: event.target.value }))} /></Field>
                <SelectField required label="表计类型" value={form.meterType} items={dicts.energy_meter_type ?? []} allLabel="请选择类型" onChange={(value) => setForm((current) => ({ ...current, meterType: value }))} />
                <Field label="开始日期"><input required type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                <Field label="结束日期"><input required type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></Field>
                <Field label="默认单价"><input required type="number" step="0.0001" min="0" value={form.unitPrice} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, unitPrice: event.target.value }))} /></Field>
                <Field label="备注"><input value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} /></Field>
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

function SelectField({ label, value, items, allLabel, onChange, required }: { label: string; value: string; items: DictItemRow[]; allLabel: string; onChange: (value: string) => void; required?: boolean }) {
  return <Field label={label}><select required={required} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></Field>;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function canCalculateCycle(row: BillingCycleRow) {
  return row.status !== "POSTED" && row.status !== "CONFIRMED";
}

function canConfirmCycle(row: BillingCycleRow) {
  return row.status === "CALCULATED";
}

function canPostCycle(row: BillingCycleRow) {
  return row.status === "CONFIRMED";
}

function canCancelCycle(row: BillingCycleRow) {
  return row.status !== "POSTED" && row.status !== "CANCELLED";
}

function hasCycleActions(row: BillingCycleRow) {
  return canCalculateCycle(row) || canConfirmCycle(row) || canPostCycle(row) || canCancelCycle(row);
}

function cycleActionHint(row: BillingCycleRow) {
  switch (row.status) {
    case "POSTED":
      return "已发布";
    case "CANCELLED":
      return "已取消";
    default:
      return "当前无动作";
  }
}

function Forbidden() {
  return <PageShell><ContentCard><EmptyState title="403" description="无权访问能源账期，或当前租户未开通能耗能力。" /></ContentCard></PageShell>;
}
