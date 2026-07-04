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
import { Edit3, KeyRound, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";

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
}

interface ProtocolConfigRow {
  id: string;
  protocolType: string;
  configName: string;
  hasConfig: boolean;
  status: string;
  remark: string | null;
  updateTime: string;
}

interface ProtocolConfigForm {
  protocolType: string;
  configName: string;
  configJson: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  protocolType: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<ProtocolConfigRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", protocolType: "", status: "" };
const emptyForm: ProtocolConfigForm = { protocolType: "", configName: "", configJson: "{}", status: "enabled", remark: "" };

export default function IotProtocolConfigsPage() {
  const [pageData, setPageData] = useState<PaginatedResult<ProtocolConfigRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolConfigRow | null>(null);
  const [form, setForm] = useState<ProtocolConfigForm>(emptyForm);
  const [message, setMessage] = useState("");

  const protocolTypes = dicts.iot_protocol_type ?? [];
  const statusItems = dicts.iot_device_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.protocolType) params.set("protocol_type", filters.protocolType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<ProtocolConfigRow>>(`/iot/protocol-configs?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_protocol_type", "iot_device_status"];
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
      protocolType: protocolTypes[0]?.itemValue ?? ""
    });
    setFormOpen(true);
  }

  function openEdit(row: ProtocolConfigRow) {
    setEditing(row);
    setForm({
      protocolType: row.protocolType,
      configName: row.configName,
      configJson: "{}",
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
    const path = editing ? `/iot/protocol-configs/${editing.id}` : "/iot/protocol-configs";
    await apiRequest<ProtocolConfigRow>(path, {
      method: editing ? "PATCH" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-protocol-config-update" : "iot-protocol-config-create"),
      body: buildPayload(form, Boolean(editing))
    });
    setMessage(editing ? "协议配置已更新，敏感配置不回显" : "协议配置已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: ProtocolConfigRow) {
    if (!window.confirm(`确认删除协议配置 ${row.configName}？`)) return;
    await apiRequest<{ id: string }>(`/iot/protocol-configs/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-protocol-config-delete")
    });
    setMessage("协议配置已删除");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>协议配置管理</h1>
            <p>统一维护 MQTT、HTTP、Modbus、DALI、厂家 API 等协议接入参数，密钥类配置不回显。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增配置
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="配置名称 / 协议" />
          </Field>
          <SelectField label="协议类型" value={filters.protocolType} items={protocolTypes} allLabel="全部协议" onChange={(value) => setFilters((current) => ({ ...current, protocolType: value }))} />
          <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">配置列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable className="allow-horizontal-table">
            <thead>
              <tr>
                <th>配置名称</th>
                <th>协议类型</th>
                <th>敏感参数</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.configName}</td>
                  <td><StatusPill dictCode="iot_protocol_type" value={row.protocolType} dicts={dicts} /></td>
                  <td>{row.hasConfig ? <span className="status-badge">已配置</span> : "未配置"}</td>
                  <td><StatusPill dictCode="iot_device_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>{row.remark ?? "-"}</td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_UPDATE} type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_PROTOCOL_CONFIG_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={7}><EmptyState /></td></tr> : null}
            </tbody>
          </DataTable>
          <div className="task-item">
            <span>第 {pageData.page} / {totalPages} 页</span>
            <span>
              <button className="secondary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
              <button className="secondary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
            </span>
          </div>
        </Card>

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader
              eyebrow="物联设备"
              title={editing ? "编辑协议配置" : "新增协议配置"}
              description="配置 JSON 用于保存连接参数。提交后前端不会再回显密钥、账号或 token 原文。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <SelectField required label="协议类型" value={form.protocolType} items={protocolTypes} allLabel="请选择协议" onChange={(value) => setForm((current) => ({ ...current, protocolType: value }))} />
                <Field label="配置名称">
                  <input required value={form.configName} onChange={(event) => setForm((current) => ({ ...current, configName: event.target.value }))} />
                </Field>
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, status: value || "enabled" }))} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label={editing ? "配置 JSON（留 {} 表示本次不改密钥）" : "配置 JSON"}>
                  <textarea value={form.configJson} onChange={(event) => setForm((current) => ({ ...current, configJson: event.target.value }))} />
                </Field>
                <Field label="备注">
                  <textarea value={form.remark} onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeForm}>取消</button>
                <button className="primary-button" type="submit">
                  <KeyRound size={16} />
                  保存
                </button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: ProtocolConfigForm, editing: boolean) {
  const parsedConfig = parseJsonObject(form.configJson);
  return {
    protocol_type: form.protocolType,
    config_name: form.configName.trim(),
    config_json: editing && Object.keys(parsedConfig).length === 0 ? undefined : parsedConfig,
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
  return <div className="empty-state">暂无协议配置</div>;
}

function Forbidden() {
  return <main className="page-container"><Card className="page-content"><div className="empty-state">无权限访问 IoT 协议配置</div></Card></main>;
}
