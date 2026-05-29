"use client";

import {
  Card,
  DataTable,
  DataTableActions,
  Drawer,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  StatusPill
} from "@jinhu/ui";
import { Edit3, Eye, PlugZap, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";

const IOT_MODULE = "iot";
const GATEWAY_ENTITY = "iot_gateway";

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

interface IotGatewayRow {
  id: string;
  code: string | null;
  gatewayCode: string;
  gatewayName: string;
  gatewayType: string;
  protocolType: string;
  vendorName: string | null;
  endpointUrl: string | null;
  mqttClientId: string | null;
  accessKey: string | null;
  secretEncrypted: string | null;
  status: string;
  lastOnlineTime: string | null;
  lastOfflineTime: string | null;
  remark: string | null;
  updateTime: string;
}

interface GatewayForm {
  gatewayCode: string;
  gatewayName: string;
  gatewayType: string;
  protocolType: string;
  vendorName: string;
  endpointUrl: string;
  mqttClientId: string;
  accessKey: string;
  secret: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  gatewayType: string;
  protocolType: string;
  status: string;
}

interface TestConnectionResult {
  id: string;
  success: boolean;
  status: string;
  message: string;
  checked_at: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<IotGatewayRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", gatewayType: "", protocolType: "", status: "" };
const emptyForm: GatewayForm = {
  gatewayCode: "",
  gatewayName: "",
  gatewayType: "",
  protocolType: "",
  vendorName: "",
  endpointUrl: "",
  mqttClientId: "",
  accessKey: "",
  secret: "",
  status: "enabled",
  remark: ""
};

export default function IotGatewaysPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<IotGatewayRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [form, setForm] = useState<GatewayForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IotGatewayRow | null>(null);
  const [viewing, setViewing] = useState<IotGatewayRow | null>(null);
  const [message, setMessage] = useState("");

  const gatewayTypes = dicts.iot_gateway_type ?? [];
  const protocolTypes = dicts.iot_protocol_type ?? [];
  const statusItems = dicts.iot_device_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.gatewayType) params.set("gateway_type", filters.gatewayType);
    if (filters.protocolType) params.set("protocol_type", filters.protocolType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<IotGatewayRow>>(`/iot/gateways?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_gateway_type", "iot_protocol_type", "iot_device_status"];
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
      gatewayType: gatewayTypes[0]?.itemValue ?? "",
      protocolType: protocolTypes[0]?.itemValue ?? "",
      status: "enabled"
    });
    setFormOpen(true);
  }

  function openEdit(row: IotGatewayRow) {
    setEditing(row);
    setForm({
      gatewayCode: row.gatewayCode,
      gatewayName: row.gatewayName,
      gatewayType: row.gatewayType,
      protocolType: row.protocolType,
      vendorName: row.vendorName ?? "",
      endpointUrl: row.endpointUrl ?? "",
      mqttClientId: row.mqttClientId ?? "",
      accessKey: row.accessKey ?? "",
      secret: "",
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

  function setFormValue<K extends keyof GatewayForm>(key: K, value: GatewayForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/iot/gateways/${editing.id}` : "/iot/gateways";
    await apiRequest<IotGatewayRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-gateway-update" : "iot-gateway-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "IoT 网关已更新" : "IoT 网关已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: IotGatewayRow) {
    if (!window.confirm(`确认删除 IoT 网关 ${row.gatewayName}？有关联设备时后端会拒绝删除。`)) return;
    await apiRequest<{ id: string }>(`/iot/gateways/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-gateway-delete")
    });
    setMessage("IoT 网关已删除");
    await load(pageData.page);
  }

  async function testConnection(row: IotGatewayRow) {
    const response = await apiRequest<TestConnectionResult>(`/iot/gateways/${row.id}/test-connection`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-gateway-test")
    });
    setMessage(response.data.message);
  }

  const canViewEndpoint = canViewField(authUser, IOT_MODULE, GATEWAY_ENTITY, "endpointUrl");
  const canViewAccessKey = canViewField(authUser, IOT_MODULE, GATEWAY_ENTITY, "accessKey");
  const canViewSecret = canViewField(authUser, IOT_MODULE, GATEWAY_ENTITY, "secretEncrypted");
  const canEditEndpoint = canEditField(authUser, IOT_MODULE, GATEWAY_ENTITY, "endpointUrl");
  const canEditAccessKey = canEditField(authUser, IOT_MODULE, GATEWAY_ENTITY, "accessKey");
  const canEditSecret = canEditField(authUser, IOT_MODULE, GATEWAY_ENTITY, "secretEncrypted");

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_GATEWAY_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>IoT 网关管理</h1>
            <p>管理 MQTT、HTTP 厂家网关、Modbus、视频平台和消防主机等接入来源。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_GATEWAY_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增网关
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="编码 / 名称 / 厂商 / 地址" />
          </Field>
          <SelectField label="网关类型" value={filters.gatewayType} items={gatewayTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, gatewayType: value }))} />
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
            <h2 className="panel-title">网关列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>网关编码</th>
                <th>网关名称</th>
                <th>类型</th>
                <th>协议</th>
                <th>厂商</th>
                <th>端点地址</th>
                <th>MQTT Client ID</th>
                <th>状态</th>
                <th>最后在线</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.gatewayCode}</td>
                  <td>{row.gatewayName}</td>
                  <td><StatusPill dictCode="iot_gateway_type" value={row.gatewayType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="iot_protocol_type" value={row.protocolType} dicts={dicts} /></td>
                  <td>{row.vendorName ?? "-"}</td>
                  <td>{canViewEndpoint ? displaySecuredField("endpointUrl", row.endpointUrl) : "-"}</td>
                  <td>{row.mqttClientId ?? "-"}</td>
                  <td><StatusPill dictCode="iot_device_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.lastOnlineTime)}</td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => setViewing(row)}><Eye size={16} />查看</button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_GATEWAY_TEST} type="button" onClick={() => void testConnection(row).catch((error: Error) => setMessage(error.message))}><PlugZap size={16} />测试</PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_GATEWAY_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_GATEWAY_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={10}><EmptyState /></td></tr> : null}
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
              eyebrow="IoT 网关"
              title={editing ? "编辑网关" : "新增网关"}
              description="密钥只写入不回显，端点地址和访问 Key 会按字段权限脱敏。"
              onClose={closeForm}
            />
            <DrawerForm onSubmit={(event) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="网关编码">
                  <input value={form.gatewayCode} onChange={(event) => setFormValue("gatewayCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="网关名称">
                  <input required value={form.gatewayName} onChange={(event) => setFormValue("gatewayName", event.target.value)} />
                </Field>
                <SelectField required label="网关类型" value={form.gatewayType} items={gatewayTypes} allLabel="请选择类型" onChange={(value) => setFormValue("gatewayType", value)} />
                <SelectField required label="协议类型" value={form.protocolType} items={protocolTypes} allLabel="请选择协议" onChange={(value) => setFormValue("protocolType", value)} />
                <Field label="厂家名称">
                  <input value={form.vendorName} onChange={(event) => setFormValue("vendorName", event.target.value)} placeholder="可选" />
                </Field>
                <Field label="端点地址">
                  <input value={form.endpointUrl} disabled={!canEditEndpoint} onChange={(event) => setFormValue("endpointUrl", event.target.value)} placeholder="https://example.com 或 mqtt://broker" />
                </Field>
                <Field label="MQTT Client ID">
                  <input value={form.mqttClientId} onChange={(event) => setFormValue("mqttClientId", event.target.value)} placeholder="可选" />
                </Field>
                <Field label="Access Key">
                  <input value={form.accessKey} disabled={!canEditAccessKey} onChange={(event) => setFormValue("accessKey", event.target.value)} placeholder="可选" />
                </Field>
                <Field label="Secret">
                  <input type="password" value={form.secret} disabled={!canEditSecret} onChange={(event) => setFormValue("secret", event.target.value)} placeholder={editing ? "留空不变" : "可选密钥"} />
                </Field>
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setFormValue("status", value || "enabled")} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="备注">
                  <textarea value={form.remark} onChange={(event) => setFormValue("remark", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeForm}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {viewing ? (
          <Drawer size="md" onClose={() => setViewing(null)}>
            <DrawerHeader
              eyebrow="网关详情"
              title={viewing.gatewayName}
              description={`${viewing.gatewayCode} · ${labelFor(gatewayTypes, viewing.gatewayType)} · ${labelFor(protocolTypes, viewing.protocolType)}`}
              onClose={() => setViewing(null)}
            />
            <DrawerDetailGrid>
              <DrawerDetailItem label="网关编码" value={viewing.gatewayCode} />
              <DrawerDetailItem label="统一编码" value={viewing.code ?? "-"} />
              <DrawerDetailItem label="网关类型" value={<StatusPill dictCode="iot_gateway_type" value={viewing.gatewayType} dicts={dicts} />} />
              <DrawerDetailItem label="协议类型" value={<StatusPill dictCode="iot_protocol_type" value={viewing.protocolType} dicts={dicts} />} />
              <DrawerDetailItem label="厂家名称" value={viewing.vendorName ?? "-"} />
              <DrawerDetailItem label="端点地址" value={canViewEndpoint ? displaySecuredField("endpointUrl", viewing.endpointUrl) : "-"} />
              <DrawerDetailItem label="MQTT Client ID" value={viewing.mqttClientId ?? "-"} />
              <DrawerDetailItem label="Access Key" value={canViewAccessKey ? displaySecuredField("accessKey", viewing.accessKey) : "-"} />
              <DrawerDetailItem label="Secret" value={canViewSecret ? displaySecret(viewing.secretEncrypted) : "-"} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="iot_device_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="最后在线" value={formatDateTime(viewing.lastOnlineTime)} />
              <DrawerDetailItem label="最后离线" value={formatDateTime(viewing.lastOfflineTime)} />
              <DrawerDetailItem label="更新时间" value={formatDateTime(viewing.updateTime)} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function displaySecuredField(field: string, value: unknown): string {
    if (!canViewField(authUser, IOT_MODULE, GATEWAY_ENTITY, field)) return "-";
    const masked = maskField(authUser, IOT_MODULE, GATEWAY_ENTITY, field, value);
    return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
  }
}

function buildPayload(form: GatewayForm) {
  const secret = form.secret.trim();
  return {
    gateway_code: form.gatewayCode.trim() || undefined,
    gateway_name: form.gatewayName.trim(),
    gateway_type: form.gatewayType,
    protocol_type: form.protocolType,
    vendor_name: form.vendorName.trim() || undefined,
    endpoint_url: form.endpointUrl.trim() || undefined,
    mqtt_client_id: form.mqttClientId.trim() || undefined,
    access_key: form.accessKey.trim() || undefined,
    secret: secret || undefined,
    status: form.status || "enabled",
    remark: form.remark.trim() || undefined
  };
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
  required = false,
  onChange
}: {
  label: string;
  value: string;
  items: DictItemRow[];
  allLabel: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </label>
  );
}

function labelFor(items: DictItemRow[], value?: string | null) {
  if (!value) return "-";
  return items.find((item) => String(item.itemValue) === String(value))?.itemLabel ?? value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function displaySecret(value: string | null) {
  return value ? "已配置" : "-";
}

function EmptyState() {
  return <p className="muted-text">暂无 IoT 网关</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问 IoT 网关，或当前租户未启用 iot 模块。</p>
      </Card>
    </main>
  );
}
