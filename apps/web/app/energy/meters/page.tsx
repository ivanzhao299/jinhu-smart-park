"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  StatusPill
} from "@jinhu/ui";
import { Edit3, Gauge, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
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

interface EnergyMeterRow {
  id: string;
  meterCode: string;
  meterName: string;
  meterType: string;
  meterPurpose: string;
  relatedParkTenantId: string | null;
  buildingId: string | null;
  floorId: string | null;
  roomId: string | null;
  iotDeviceId: string | null;
  multiplier: string;
  unit: string;
  initialReading: string;
  currentReading: string;
  lastReadingAt: string | null;
  status: string;
  isEnabled: boolean;
  remark: string | null;
  updateTime: string;
}

interface MeterForm {
  meterName: string;
  meterType: string;
  meterPurpose: string;
  relatedParkTenantId: string;
  buildingId: string;
  floorId: string;
  roomId: string;
  areaId: string;
  iotDeviceId: string;
  multiplier: string;
  unit: string;
  initialReading: string;
  status: string;
  isEnabled: boolean;
  remark: string;
}

interface Filters {
  keyword: string;
  meterType: string;
  meterPurpose: string;
  status: string;
  relatedParkTenantId: string;
  buildingId: string;
}

const emptyPage: PaginatedResult<EnergyMeterRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", meterType: "", meterPurpose: "", status: "", relatedParkTenantId: "", buildingId: "" };
const emptyForm: MeterForm = {
  meterName: "",
  meterType: "ELECTRIC",
  meterPurpose: "PUBLIC",
  relatedParkTenantId: "",
  buildingId: "",
  floorId: "",
  roomId: "",
  areaId: "",
  iotDeviceId: "",
  multiplier: "1",
  unit: "kWh",
  initialReading: "0",
  status: "UNKNOWN",
  isEnabled: true,
  remark: ""
};

export default function EnergyMetersPage() {
  const [pageData, setPageData] = useState<PaginatedResult<EnergyMeterRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnergyMeterRow | null>(null);
  const [form, setForm] = useState<MeterForm>(emptyForm);
  const [message, setMessage] = useState("");
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.meterType) params.set("meter_type", filters.meterType);
    if (filters.meterPurpose) params.set("meter_purpose", filters.meterPurpose);
    if (filters.status) params.set("status", filters.status);
    if (filters.relatedParkTenantId.trim()) params.set("related_park_tenant_id", filters.relatedParkTenantId.trim());
    if (filters.buildingId.trim()) params.set("building_id", filters.buildingId.trim());
    const response = await apiRequest<PaginatedResult<EnergyMeterRow>>(`/energy/meters?${params.toString()}`, { token: getAccessToken() });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["energy_meter_type", "energy_meter_purpose", "energy_meter_status"];
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
    setEditing(null);
    setForm({ ...emptyForm, meterType: dicts.energy_meter_type?.[0]?.itemValue ?? "ELECTRIC", meterPurpose: dicts.energy_meter_purpose?.[0]?.itemValue ?? "PUBLIC" });
    setFormOpen(true);
  }

  function openEdit(row: EnergyMeterRow) {
    setEditing(row);
    setForm({
      meterName: row.meterName,
      meterType: row.meterType,
      meterPurpose: row.meterPurpose,
      relatedParkTenantId: row.relatedParkTenantId ?? "",
      buildingId: row.buildingId ?? "",
      floorId: row.floorId ?? "",
      roomId: row.roomId ?? "",
      areaId: "",
      iotDeviceId: row.iotDeviceId ?? "",
      multiplier: row.multiplier,
      unit: row.unit,
      initialReading: row.initialReading,
      status: row.status,
      isEnabled: row.isEnabled,
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/energy/meters/${editing.id}` : "/energy/meters";
    await apiRequest<EnergyMeterRow>(path, {
      method: editing ? "PATCH" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "energy-meter-update" : "energy-meter-create"),
      body: buildPayload(form, Boolean(editing))
    });
    setMessage(editing ? "表计已更新" : "表计已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function updateStatus(row: EnergyMeterRow, isEnabled: boolean) {
    await apiRequest<EnergyMeterRow>(`/energy/meters/${row.id}/status`, {
      method: "PATCH",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-meter-status"),
      body: { is_enabled: isEnabled, status: isEnabled ? "UNKNOWN" : "DISABLED" }
    });
    setMessage(isEnabled ? "表计已启用" : "表计已停用");
    await load(pageData.page);
  }

  async function remove(row: EnergyMeterRow) {
    if (!window.confirm(`确认删除表计 ${row.meterName}？已有读数或告警的表计不能删除。`)) return;
    await apiRequest<{ id: string }>(`/energy/meters/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("energy-meter-delete")
    });
    setMessage("表计已删除");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={ENERGY_MODULE} permission={SYSTEM_PERMISSIONS.ENERGY_METER_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>能源计量表管理</h1>
            <p>统一维护电表、水表、气表，建立能源业务确认口径。</p>
          </div>
          <div className="page-actions">
            <Link className="secondary-button" href="/energy/dashboard"><Gauge size={16} />看板</Link>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}><RefreshCw size={16} />刷新</button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ENERGY_METER_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增表计</PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词"><input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编码 / 名称" /></Field>
          <SelectField label="表计类型" value={filters.meterType} items={dicts.energy_meter_type ?? []} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, meterType: value }))} />
          <SelectField label="用途" value={filters.meterPurpose} items={dicts.energy_meter_purpose ?? []} allLabel="全部用途" onChange={(value) => setFilters((current) => ({ ...current, meterPurpose: value }))} />
          <SelectField label="状态" value={filters.status} items={dicts.energy_meter_status ?? []} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <Field label="租户企业 ID"><input value={filters.relatedParkTenantId} onChange={(event) => setFilters((current) => ({ ...current, relatedParkTenantId: event.target.value }))} /></Field>
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}><Search size={16} />查询</button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item"><h2 className="panel-title">表计列表</h2><span>共 {pageData.total} 条</span></div>
          <DataTable>
            <thead><tr><th>表计编号</th><th>表计名称</th><th>类型</th><th>用途</th><th>租户企业</th><th>当前读数</th><th>倍率</th><th>状态</th><th>最近读数</th><th>操作</th></tr></thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.meterCode}</td>
                  <td>{row.meterName}</td>
                  <td><StatusPill dictCode="energy_meter_type" value={row.meterType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="energy_meter_purpose" value={row.meterPurpose} dicts={dicts} /></td>
                  <td>{row.relatedParkTenantId ?? "-"}</td>
                  <td>{row.currentReading} {row.unit}</td>
                  <td>{row.multiplier}</td>
                  <td><StatusPill dictCode="energy_meter_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.lastReadingAt)}</td>
                  <td>
                    <DataTableActions>
                      <Link className="table-action-button" href={`/energy/readings?meter_id=${row.id}`}>读数</Link>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_METER_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.ENERGY_METER_UPDATE} type="button" onClick={() => void updateStatus(row, !row.isEnabled).catch((error: Error) => setMessage(error.message))}>{row.isEnabled ? "停用" : "启用"}</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.ENERGY_METER_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={10}><EmptyState text="暂无能源表计" /></td></tr> : null}
            </tbody>
          </DataTable>
          <Pager page={pageData.page} totalPages={totalPages} onPage={(page) => void load(page).catch((error: Error) => setMessage(error.message))} />
        </Card>

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader eyebrow="能源表计" title={editing ? "编辑表计" : "新增表计"} description="租户表计必须关联租户企业；公共表计可为空。" onClose={closeForm} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="表计名称"><input required value={form.meterName} onChange={(event) => setForm((current) => ({ ...current, meterName: event.target.value }))} /></Field>
                <SelectField required label="表计类型" value={form.meterType} items={dicts.energy_meter_type ?? []} allLabel="请选择类型" onChange={(value) => setForm((current) => ({ ...current, meterType: value }))} />
                <SelectField required label="用途" value={form.meterPurpose} items={dicts.energy_meter_purpose ?? []} allLabel="请选择用途" onChange={(value) => setForm((current) => ({ ...current, meterPurpose: value }))} />
                <SelectField label="状态" value={form.status} items={dicts.energy_meter_status ?? []} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, status: value || "UNKNOWN" }))} />
                <Field label="租户企业 ID"><input value={form.relatedParkTenantId} onChange={(event) => setForm((current) => ({ ...current, relatedParkTenantId: event.target.value }))} /></Field>
                <Field label="IoT 设备 ID"><input value={form.iotDeviceId} onChange={(event) => setForm((current) => ({ ...current, iotDeviceId: event.target.value }))} /></Field>
                <Field label="楼栋 ID"><input value={form.buildingId} onChange={(event) => setForm((current) => ({ ...current, buildingId: event.target.value }))} /></Field>
                <Field label="楼层 ID"><input value={form.floorId} onChange={(event) => setForm((current) => ({ ...current, floorId: event.target.value }))} /></Field>
                <Field label="房源 ID"><input value={form.roomId} onChange={(event) => setForm((current) => ({ ...current, roomId: event.target.value }))} /></Field>
                <Field label="倍率"><input required type="number" min="0" step="0.0001" value={form.multiplier} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, multiplier: event.target.value }))} /></Field>
                <Field label="单位"><input required value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} /></Field>
                <Field label="初始读数"><input required type="number" min="0" step="0.0001" value={form.initialReading} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, initialReading: event.target.value }))} /></Field>
              </DrawerFormGrid>
              <DrawerFormGrid single><Field label="备注"><textarea value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} /></Field></DrawerFormGrid>
              <DrawerFooter><button className="secondary-button" type="button" onClick={closeForm}>取消</button><button className="primary-button" type="submit">保存</button></DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: MeterForm, editing: boolean) {
  return {
    meter_name: form.meterName.trim(),
    meter_type: form.meterType,
    meter_purpose: form.meterPurpose,
    related_park_tenant_id: textOrUndefined(form.relatedParkTenantId),
    building_id: textOrUndefined(form.buildingId),
    floor_id: textOrUndefined(form.floorId),
    room_id: textOrUndefined(form.roomId),
    area_id: textOrUndefined(form.areaId),
    iot_device_id: textOrUndefined(form.iotDeviceId),
    multiplier: form.multiplier,
    unit: form.unit.trim(),
    initial_reading: editing ? undefined : form.initialReading,
    status: form.status || "UNKNOWN",
    is_enabled: form.isEnabled,
    remark: textOrUndefined(form.remark)
  };
}

function textOrUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function SelectField({ label, value, items, allLabel, onChange, required = false }: { label: string; value: string; items: DictItemRow[]; allLabel: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return <div className="task-item"><span>第 {page} / {totalPages} 页</span><span><button className="secondary-button" type="button" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>上一页</button><button className="secondary-button" type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>下一页</button></span></div>;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function Forbidden() {
  return <main className="page-container"><Card className="page-content"><div className="empty-state">无权限访问能源计量表管理，或当前租户未启用 energy 模块。</div></Card></main>;
}
