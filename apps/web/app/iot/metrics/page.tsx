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
  EmptyState as UiEmptyState,
  FeedbackNotice,
  FilterPanel,
  PageHeader,
  PageShell,
  PaginationBar,
  StatusPill
} from "@jinhu/ui";
import { Edit3, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const IOT_MODULE = "iot";

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

interface MetricRow {
  id: string;
  code: string | null;
  metricCode: string;
  metricName: string;
  deviceType: string | null;
  valueType: string;
  unit: string | null;
  precisionDigits: number | null;
  enumMap: Record<string, unknown>;
  status: string;
  remark: string | null;
  updateTime: string;
}

interface MetricForm {
  metricCode: string;
  metricName: string;
  deviceType: string;
  valueType: string;
  unit: string;
  precisionDigits: string;
  enumMap: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  deviceType: string;
  valueType: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<MetricRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", deviceType: "", valueType: "", status: "" };
const emptyForm: MetricForm = {
  metricCode: "",
  metricName: "",
  deviceType: "",
  valueType: "number",
  unit: "",
  precisionDigits: "",
  enumMap: "{}",
  status: "enabled",
  remark: ""
};

export default function IotMetricsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<MetricRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MetricRow | null>(null);
  const [form, setForm] = useState<MetricForm>(emptyForm);
  const [message, setMessage] = useState("");

  const deviceTypes = dicts.iot_device_type ?? [];
  const valueTypes = dicts.iot_metric_value_type ?? [];
  const statusItems = dicts.iot_device_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.deviceType) params.set("device_type", filters.deviceType);
    if (filters.valueType) params.set("value_type", filters.valueType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<MetricRow>>(`/iot/metrics?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_device_type", "iot_metric_value_type", "iot_device_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
  }, [loadDicts]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      deviceType: deviceTypes[0]?.itemValue ?? "",
      valueType: valueTypes[0]?.itemValue ?? "number",
      status: "enabled"
    });
    setFormOpen(true);
  }

  function openEdit(row: MetricRow) {
    setEditing(row);
    setForm({
      metricCode: row.metricCode,
      metricName: row.metricName,
      deviceType: row.deviceType ?? "",
      valueType: row.valueType,
      unit: row.unit ?? "",
      precisionDigits: row.precisionDigits === null ? "" : String(row.precisionDigits),
      enumMap: JSON.stringify(row.enumMap ?? {}, null, 2),
      status: row.status,
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
    const path = editing ? `/iot/metrics/${editing.id}` : "/iot/metrics";
    await apiRequest<MetricRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-metric-update" : "iot-metric-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "指标已更新" : "指标已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: MetricRow) {
    if (!window.confirm(`确认删除指标 ${row.metricName}？已绑定点位的指标不能删除。`)) return;
    await apiRequest<{ id: string }>(`/iot/metrics/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-metric-delete")
    });
    setMessage("指标已删除");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_METRIC_READ} fallback={<Forbidden />}>
      <PageShell>
        <PageHeader
          title="IoT 指标管理"
          description="统一维护电表、水表、摄像头等设备的采集指标和数据类型。"
          actions={
            <>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_METRIC_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增指标
            </PermissionButton>
            </>
          }
        />

        <FilterPanel>
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编码 / 名称 / 单位" />
          </Field>
          <SelectField label="设备类型" value={filters.deviceType} items={deviceTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, deviceType: value }))} />
          <SelectField label="值类型" value={filters.valueType} items={valueTypes} allLabel="全部值类型" onChange={(value) => setFilters((current) => ({ ...current, valueType: value }))} />
          <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </FilterPanel>

        {message ? <FeedbackNotice>{message}</FeedbackNotice> : null}

        <ContentCard title="指标列表" description={`共 ${pageData.total} 条`}>
          <DataTable className="allow-horizontal-table">
            <thead>
              <tr>
                <th>指标编码</th>
                <th>指标名称</th>
                <th>适用设备</th>
                <th>值类型</th>
                <th>单位</th>
                <th>精度</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.metricCode}</td>
                  <td>{row.metricName}</td>
                  <td>{row.deviceType ? <StatusPill dictCode="iot_device_type" value={row.deviceType} dicts={dicts} /> : "通用"}</td>
                  <td><StatusPill dictCode="iot_metric_value_type" value={row.valueType} dicts={dicts} /></td>
                  <td>{row.unit ?? "-"}</td>
                  <td>{row.precisionDigits ?? "-"}</td>
                  <td><StatusPill dictCode="iot_device_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_METRIC_UPDATE} type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_METRIC_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={9}><EmptyState /></td></tr> : null}
            </tbody>
          </DataTable>
          <PaginationBar page={pageData.page} totalPages={totalPages} total={pageData.total} onPage={(nextPage) => void load(nextPage).catch((error: Error) => setMessage(error.message))} />
        </ContentCard>

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader
              eyebrow="物联设备"
              title={editing ? "编辑指标" : "新增指标"}
              description="指标可复用于同类型设备，枚举映射使用 JSON 对象保存。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="指标编码">
                  <input value={form.metricCode} onChange={(event) => setForm((current) => ({ ...current, metricCode: event.target.value }))} placeholder="留空自动生成" />
                </Field>
                <Field label="指标名称">
                  <input required value={form.metricName} onChange={(event) => setForm((current) => ({ ...current, metricName: event.target.value }))} />
                </Field>
                <SelectField label="适用设备" value={form.deviceType} items={deviceTypes} allLabel="通用指标" onChange={(value) => setForm((current) => ({ ...current, deviceType: value }))} />
                <SelectField required label="值类型" value={form.valueType} items={valueTypes} allLabel="请选择值类型" onChange={(value) => setForm((current) => ({ ...current, valueType: value }))} />
                <Field label="单位">
                  <input value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} />
                </Field>
                <Field label="精度位数">
                  <input type="number" min="0" value={form.precisionDigits} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, precisionDigits: event.target.value }))} />
                </Field>
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, status: value || "enabled" }))} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="枚举映射 JSON">
                  <textarea value={form.enumMap} onChange={(event) => setForm((current) => ({ ...current, enumMap: event.target.value }))} />
                </Field>
                <Field label="备注">
                  <textarea value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeForm}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </PageShell>
    </PermissionGuard>
  );
}

function buildPayload(form: MetricForm) {
  return {
    metric_code: form.metricCode.trim() || undefined,
    metric_name: form.metricName.trim(),
    device_type: form.deviceType || undefined,
    value_type: form.valueType,
    unit: form.unit.trim() || undefined,
    precision_digits: integerOrUndefined(form.precisionDigits),
    enum_map: parseJsonObject(form.enumMap),
    status: form.status || "enabled",
    remark: form.remark.trim() || undefined
  };
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function integerOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  items,
  allLabel,
  onChange,
  required = false
}: {
  label: string;
  value: string;
  items: DictItemRow[];
  allLabel: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => (
          <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
        ))}
      </select>
    </Field>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function EmptyState() {
  return <UiEmptyState title="暂无指标" compact />;
}

function Forbidden() {
  return (
    <PageShell>
      <ContentCard>
        <UiEmptyState title="403" description="无权限访问 IoT 指标管理" />
      </ContentCard>
    </PageShell>
  );
}
