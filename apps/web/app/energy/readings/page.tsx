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
import { CheckCircle2, Plus, RefreshCw, Search, XCircle } from "lucide-react";
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

interface MeterOption { id: string; meterCode: string; meterName: string; meterType: string; currentReading: string; unit: string; isEnabled: boolean }
interface ReadingRow {
  id: string;
  meterId: string;
  readingValue: string;
  previousReadingValue: string;
  consumptionValue: string;
  readingTime: string;
  readingSource: string;
  confirmationStatus: string;
  confirmedAt: string | null;
  createdAt: string;
}
interface ReadingForm { meterId: string; readingValue: string; readingTime: string; readingSource: string; rawPayload: string }
interface Filters { meterId: string; confirmationStatus: string; readingSource: string; startTime: string; endTime: string }

const emptyPage: PaginatedResult<ReadingRow> = { items: [], total: 0, page: 1, page_size: 20 };

export default function EnergyReadingsPage() {
  const [meters, setMeters] = useState<MeterOption[]>([]);
  const [dicts, setDicts] = useState<DictMap>({});
  const [pageData, setPageData] = useState<PaginatedResult<ReadingRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>({ meterId: "", confirmationStatus: "", readingSource: "", startTime: "", endTime: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ReadingForm>({ meterId: "", readingValue: "", readingTime: localDateTimeValue(), readingSource: "MANUAL", rawPayload: "{}" });
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const activeMeterId = filters.meterId || meters[0]?.id || "";

  const loadMeters = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<MeterOption>>("/energy/meters?page=1&page_size=200&sort=meter_code", { token: getAccessToken() });
    setMeters(response.data.items);
    const firstMeter = response.data.items[0];
    if (!filters.meterId && firstMeter) {
      setFilters((current) => ({ ...current, meterId: firstMeter.id }));
      setForm((current) => ({ ...current, meterId: firstMeter.id }));
    }
  }, [filters.meterId]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_reading_source", "energy_reading_confirmation_status", "energy_meter_type"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, { token: getAccessToken() });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async (page = 1) => {
    if (!activeMeterId) {
      setPageData(emptyPage);
      return;
    }
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.confirmationStatus) params.set("confirmation_status", filters.confirmationStatus);
    if (filters.readingSource) params.set("reading_source", filters.readingSource);
    if (filters.startTime) params.set("start_time", new Date(filters.startTime).toISOString());
    if (filters.endTime) params.set("end_time", new Date(filters.endTime).toISOString());
    const response = await apiRequest<PaginatedResult<ReadingRow>>(`/energy/meters/${activeMeterId}/readings?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [activeMeterId, filters.confirmationStatus, filters.endTime, filters.readingSource, filters.startTime]);

  useEffect(() => { void Promise.all([loadDicts(), loadMeters()]).catch((error: Error) => setMessage(error.message)); }, [loadDicts, loadMeters]);
  useEffect(() => {
    const meterId = new URLSearchParams(window.location.search).get("meter_id") ?? "";
    if (meterId) {
      setFilters((current) => ({ ...current, meterId }));
      setForm((current) => ({ ...current, meterId }));
    }
  }, []);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);

  function openCreate() {
    setForm({ meterId: activeMeterId, readingValue: "", readingTime: localDateTimeValue(), readingSource: "MANUAL", rawPayload: "{}" });
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest<ReadingRow>(`/energy/meters/${form.meterId}/readings`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-reading-create"),
      body: {
        reading_value: form.readingValue,
        reading_time: new Date(form.readingTime).toISOString(),
        reading_source: form.readingSource,
        raw_payload: parseJsonObject(form.rawPayload)
      }
    });
    setMessage("读数已录入，待确认后进入能源业务口径");
    setFormOpen(false);
    setFilters((current) => ({ ...current, meterId: form.meterId }));
    await load(1);
  }

  async function confirmReading(row: ReadingRow) {
    await apiRequest<ReadingRow>(`/energy/readings/${row.id}/confirm`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-reading-confirm")
    });
    setMessage("读数已确认");
    await load(pageData.page);
  }

  async function rejectReading(row: ReadingRow) {
    const reason = window.prompt("请输入驳回原因", "读数异常，暂不进入确认口径");
    if (!reason) return;
    await apiRequest<ReadingRow>(`/energy/readings/${row.id}/reject`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-reading-reject"),
      body: { reason }
    });
    setMessage("读数已驳回");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_READING_READ} fallback={<Forbidden />}>
      <PageShell>
        <PageHeader
          title="能源读数记录"
          description="手工读数、IoT 归集读数与确认口径分离，异常读数不会直接进入收费基础。"
          actions={
            <>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}><RefreshCw size={16} />刷新</button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ENERGY_READING_CREATE} type="button" onClick={openCreate} disabled={!activeMeterId}><Plus size={16} />录入读数</PermissionButton>
            </>
          }
        />

        <FilterPanel>
          <Field label="表计"><select value={filters.meterId} onChange={(event) => { setFilters((current) => ({ ...current, meterId: event.target.value })); setForm((current) => ({ ...current, meterId: event.target.value })); }}><option value="">请选择表计</option>{meters.map((meter) => <option key={meter.id} value={meter.id}>{meter.meterCode} · {meter.meterName}</option>)}</select></Field>
          <SelectField label="确认状态" value={filters.confirmationStatus} items={dicts.energy_reading_confirmation_status ?? []} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, confirmationStatus: value }))} />
          <SelectField label="来源" value={filters.readingSource} items={dicts.energy_reading_source ?? []} allLabel="全部来源" onChange={(value) => setFilters((current) => ({ ...current, readingSource: value }))} />
          <Field label="开始时间"><input type="datetime-local" value={filters.startTime} onChange={(event) => setFilters((current) => ({ ...current, startTime: event.target.value }))} /></Field>
          <Field label="结束时间"><input type="datetime-local" value={filters.endTime} onChange={(event) => setFilters((current) => ({ ...current, endTime: event.target.value }))} /></Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}><Search size={16} />查询</button>
        </FilterPanel>

        {message ? <FeedbackNotice variant="warning">{message}</FeedbackNotice> : null}

        <ContentCard title="读数列表" actions={<span>共 {pageData.total} 条</span>}>
          <DataTable>
            <thead><tr><th>读数时间</th><th>本期读数</th><th>上期读数</th><th>用量</th><th>来源</th><th>确认状态</th><th>确认时间</th><th>操作</th></tr></thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.readingTime)}</td>
                  <td>{row.readingValue}</td>
                  <td>{row.previousReadingValue}</td>
                  <td>{row.consumptionValue}</td>
                  <td><StatusPill dictCode="energy_reading_source" value={row.readingSource} dicts={dicts} /></td>
                  <td><StatusPill dictCode="energy_reading_confirmation_status" value={row.confirmationStatus} dicts={dicts} /></td>
                  <td>{formatDateTime(row.confirmedAt)}</td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_READING_CONFIRM} type="button" disabled={row.confirmationStatus !== "PENDING"} onClick={() => void confirmReading(row).catch((error: Error) => setMessage(error.message))}><CheckCircle2 size={16} />确认</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.ENERGY_READING_CONFIRM} type="button" disabled={row.confirmationStatus === "CONFIRMED"} onClick={() => void rejectReading(row).catch((error: Error) => setMessage(error.message))}><XCircle size={16} />驳回</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={8}><EmptyState title="暂无读数" compact /></td></tr> : null}
            </tbody>
          </DataTable>
          <PaginationBar page={pageData.page} totalPages={totalPages} onPage={(page) => void load(page).catch((error: Error) => setMessage(error.message))} />
        </ContentCard>

        {formOpen ? (
          <Drawer size="md" onClose={() => setFormOpen(false)}>
            <DrawerHeader eyebrow="能源读数" title="录入读数" description="确认前读数不会进入后续结算口径；倒表读数会被标记异常。" onClose={() => setFormOpen(false)} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="表计"><select required value={form.meterId} onChange={(event) => setForm((current) => ({ ...current, meterId: event.target.value }))}><option value="">请选择表计</option>{meters.map((meter) => <option key={meter.id} value={meter.id}>{meter.meterCode} · {meter.meterName}</option>)}</select></Field>
                <Field label="本期读数"><input required type="number" min="0" step="0.0001" value={form.readingValue} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, readingValue: event.target.value }))} /></Field>
                <Field label="读数时间"><input required type="datetime-local" value={form.readingTime} onChange={(event) => setForm((current) => ({ ...current, readingTime: event.target.value }))} /></Field>
                <SelectField required label="来源" value={form.readingSource} items={dicts.energy_reading_source ?? []} allLabel="请选择来源" onChange={(value) => setForm((current) => ({ ...current, readingSource: value }))} />
                <Field label="原始载荷 JSON"><textarea value={form.rawPayload} onChange={(event) => setForm((current) => ({ ...current, rawPayload: event.target.value }))} /></Field>
              </DrawerFormGrid>
              <DrawerFooter><button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="primary-button" type="submit">保存</button></DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function localDateTimeValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function SelectField({ label, value, items, allLabel, onChange, required = false }: { label: string; value: string; items: DictItemRow[]; allLabel: string; onChange: (value: string) => void; required?: boolean }) {
  return <Field label={label}><select required={required} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}</select></Field>;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function Forbidden() {
  return <PageShell><ContentCard><EmptyState title="403" description="无权限访问能源读数记录，或当前租户未启用 energy 模块。" /></ContentCard></PageShell>;
}
