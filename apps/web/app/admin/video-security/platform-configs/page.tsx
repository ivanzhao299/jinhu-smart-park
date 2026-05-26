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
import { Edit3, Eye, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../../lib/api-client";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { maskField } from "../../../../lib/field-policy";

const VIDEO_MODULE = "video";
const PLATFORM_ENTITY = "video_platform_config";

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

interface PlatformConfigRow {
  id: string;
  tenantId: string;
  parkId: string;
  platformType: string;
  platformName: string;
  vendorName: string | null;
  appKey: string | null;
  appSecretEncrypted: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  appSecretConfigured: boolean;
  accessTokenConfigured: boolean;
  refreshTokenConfigured: boolean;
  tokenExpireAt: string | null;
  apiBaseUrl: string | null;
  callbackUrl: string | null;
  status: string;
  remark: string | null;
  updateTime: string;
}

interface PlatformForm {
  platformType: string;
  platformName: string;
  vendorName: string;
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string;
  tokenExpireAt: string;
  apiBaseUrl: string;
  callbackUrl: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  platformType: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<PlatformConfigRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", platformType: "", status: "" };
const emptyForm: PlatformForm = {
  platformType: "LOCAL_RTSP",
  platformName: "",
  vendorName: "",
  appKey: "",
  appSecret: "",
  accessToken: "",
  refreshToken: "",
  tokenExpireAt: "",
  apiBaseUrl: "",
  callbackUrl: "",
  status: "ACTIVE",
  remark: ""
};

export default function VideoPlatformConfigsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<PlatformConfigRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [form, setForm] = useState<PlatformForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformConfigRow | null>(null);
  const [viewing, setViewing] = useState<PlatformConfigRow | null>(null);
  const [message, setMessage] = useState("");

  const platformTypes = dicts.video_platform_type ?? [];
  const platformStatuses = dicts.video_platform_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.platformType) params.set("platform_type", filters.platformType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<PlatformConfigRow>>(`/video-security/platform-configs?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=400", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item: DictTypeRow) => [item.dictCode, item.id]));
    const codes = ["video_platform_type", "video_platform_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = typeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item: DictItemRow) => item.status === "enabled")] as const;
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
    setForm({ ...emptyForm, platformType: platformTypes[0]?.itemValue ?? "LOCAL_RTSP" });
    setFormOpen(true);
  }

  function openEdit(row: PlatformConfigRow) {
    setEditing(row);
    setForm({
      platformType: row.platformType,
      platformName: row.platformName,
      vendorName: row.vendorName ?? "",
      appKey: row.appKey ?? "",
      appSecret: "",
      accessToken: "",
      refreshToken: "",
      tokenExpireAt: toDateTimeLocal(row.tokenExpireAt),
      apiBaseUrl: row.apiBaseUrl ?? "",
      callbackUrl: row.callbackUrl ?? "",
      status: row.status,
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  function closeForm() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(false);
  }

  function setFormValue<K extends keyof PlatformForm>(key: K, value: PlatformForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/video-security/platform-configs/${editing.id}` : "/video-security/platform-configs";
    await apiRequest<PlatformConfigRow>(path, {
      method: editing ? "PATCH" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "video-platform-config-update" : "video-platform-config-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "视频平台配置已更新" : "视频平台配置已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: PlatformConfigRow) {
    if (!window.confirm(`确认删除视频平台配置 ${row.platformName}？`)) return;
    await apiRequest<{ id: string }>(`/video-security/platform-configs/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("video-platform-config-delete")
    });
    setMessage("视频平台配置已删除");
    await load(pageData.page);
  }

  function secured(field: keyof PlatformConfigRow, value: string | null | undefined) {
    return maskField(authUser, VIDEO_MODULE, PLATFORM_ENTITY, String(field), value ?? "-") as ReactNode;
  }

  return (
    <PermissionGuard module={VIDEO_MODULE} permission={SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>视频平台配置</h1>
            <p>维护中维世纪、萤石云、海康、大华等第三方平台接入参数，密钥仅加密保存不回显。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增平台配置
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="平台名称 / 厂家" />
          </Field>
          <SelectField label="平台类型" value={filters.platformType} items={platformTypes} allLabel="全部平台" onChange={(value) => setFilters((current) => ({ ...current, platformType: value }))} />
          <SelectField label="状态" value={filters.status} items={platformStatuses} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">平台配置列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>平台名称</th>
                <th>平台类型</th>
                <th>厂家</th>
                <th>AppKey</th>
                <th>密钥</th>
                <th>Token</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.platformName}</td>
                  <td><StatusPill dictCode="video_platform_type" value={row.platformType} dicts={dicts} /></td>
                  <td>{row.vendorName ?? "-"}</td>
                  <td>{secured("appKey", row.appKey)}</td>
                  <td>{row.appSecretConfigured ? "已配置" : "未配置"}</td>
                  <td>{row.accessTokenConfigured || row.refreshTokenConfigured ? "已配置" : "未配置"}</td>
                  <td><StatusPill dictCode="video_platform_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>
                    <DataTableActions className="data-table-actions">
                      <button className="row-action-button" type="button" onClick={() => setViewing(row)}><Eye size={16} />查看</button>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="row-action-button row-action-danger" permission={SYSTEM_PERMISSIONS.VIDEO_PLATFORM_CONFIG_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={9}><EmptyState /></td></tr> : null}
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
          <Drawer onClose={closeForm} size="lg">
            <DrawerHeader
              eyebrow="视频平台"
              title={editing ? "编辑平台配置" : "新增平台配置"}
              description="密钥、Token 保存时会加密处理，编辑时留空表示不修改。"
              onClose={closeForm}
            />
            <DrawerForm onSubmit={(event) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <SelectField label="平台类型" required value={form.platformType} items={platformTypes} allLabel="请选择平台" onChange={(value) => setFormValue("platformType", value)} />
                <Field label="平台名称" required>
                  <input required value={form.platformName} onChange={(event) => setFormValue("platformName", event.target.value)} />
                </Field>
                <Field label="厂家">
                  <input value={form.vendorName} onChange={(event) => setFormValue("vendorName", event.target.value)} />
                </Field>
                <SelectField label="状态" value={form.status} items={platformStatuses} allLabel="请选择状态" onChange={(value) => setFormValue("status", value)} />
                <Field label="AppKey">
                  <input value={form.appKey} onChange={(event) => setFormValue("appKey", event.target.value)} />
                </Field>
                <Field label="AppSecret">
                  <input type="password" value={form.appSecret} placeholder={editing ? "留空不修改" : ""} onChange={(event) => setFormValue("appSecret", event.target.value)} />
                </Field>
                <Field label="Access Token">
                  <input type="password" value={form.accessToken} placeholder={editing ? "留空不修改" : ""} onChange={(event) => setFormValue("accessToken", event.target.value)} />
                </Field>
                <Field label="Refresh Token">
                  <input type="password" value={form.refreshToken} placeholder={editing ? "留空不修改" : ""} onChange={(event) => setFormValue("refreshToken", event.target.value)} />
                </Field>
                <Field label="Token 过期时间">
                  <input type="datetime-local" value={form.tokenExpireAt} onChange={(event) => setFormValue("tokenExpireAt", event.target.value)} />
                </Field>
                <Field label="API 地址">
                  <input value={form.apiBaseUrl} onChange={(event) => setFormValue("apiBaseUrl", event.target.value)} />
                </Field>
                <Field label="回调地址">
                  <input value={form.callbackUrl} onChange={(event) => setFormValue("callbackUrl", event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="备注">
                  <textarea rows={3} value={form.remark} onChange={(event) => setFormValue("remark", event.target.value)} />
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
          <Drawer onClose={() => setViewing(null)} size="md">
            <DrawerHeader
              eyebrow="平台配置详情"
              title={viewing.platformName}
              description={`${labelFor(platformTypes, viewing.platformType)} · ${viewing.vendorName ?? "未填写厂家"}`}
              onClose={() => setViewing(null)}
            />
            <DrawerDetailGrid>
              <DrawerDetailItem label="平台类型" value={<StatusPill dictCode="video_platform_type" value={viewing.platformType} dicts={dicts} />} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="video_platform_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="AppKey" value={secured("appKey", viewing.appKey)} />
              <DrawerDetailItem label="AppSecret" value={viewing.appSecretConfigured ? "已配置" : "未配置"} />
              <DrawerDetailItem label="Access Token" value={viewing.accessTokenConfigured ? "已配置" : "未配置"} />
              <DrawerDetailItem label="Refresh Token" value={viewing.refreshTokenConfigured ? "已配置" : "未配置"} />
              <DrawerDetailItem label="Token 过期时间" value={formatDateTime(viewing.tokenExpireAt)} />
              <DrawerDetailItem label="API 地址" value={secured("apiBaseUrl", viewing.apiBaseUrl)} />
              <DrawerDetailItem label="回调地址" value={secured("callbackUrl", viewing.callbackUrl)} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
            <DrawerFooter>
              <button className="primary-button" type="button" onClick={() => setViewing(null)}>关闭</button>
            </DrawerFooter>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: PlatformForm) {
  return {
    platform_type: form.platformType,
    platform_name: form.platformName.trim(),
    vendor_name: form.vendorName.trim() || undefined,
    app_key: form.appKey.trim() || undefined,
    app_secret: form.appSecret.trim() || undefined,
    access_token: form.accessToken.trim() || undefined,
    refresh_token: form.refreshToken.trim() || undefined,
    token_expire_at: form.tokenExpireAt ? new Date(form.tokenExpireAt).toISOString() : undefined,
    api_base_url: form.apiBaseUrl.trim() || undefined,
    callback_url: form.callbackUrl.trim() || undefined,
    status: form.status,
    remark: form.remark.trim() || undefined
  };
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}{required ? " *" : ""}</span>
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
      <span>{label}{required ? " *" : ""}</span>
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

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EmptyState() {
  return <p className="muted-text">暂无视频平台配置</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问视频平台配置，或当前租户未启用 video 模块。</p>
      </Card>
    </main>
  );
}
