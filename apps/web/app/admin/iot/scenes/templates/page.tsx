"use client";

import { Card, DataTable, DataTableActions, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader, StatusPill } from "@jinhu/ui";
import { Activity, Edit3, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../../../lib/api-client";
import { getAccessToken } from "../../../../../lib/authz";

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

interface TemplateRow {
  id: string;
  sceneCode: string;
  sceneName: string;
  sceneType: string;
  description: string | null;
  triggerConfigJson: Record<string, unknown>;
  actionConfigJson: Array<Record<string, unknown>>;
  isSystem: boolean;
  status: string;
  updateTime: string;
}

interface TemplateForm {
  sceneCode: string;
  sceneName: string;
  sceneType: string;
  description: string;
  triggerConfigJson: string;
  actionConfigJson: string;
  status: string;
}

interface Filters {
  keyword: string;
  sceneType: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<TemplateRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", sceneType: "", status: "" };
const emptyForm: TemplateForm = {
  sceneCode: "",
  sceneName: "",
  sceneType: "custom",
  description: "",
  triggerConfigJson: formatJson({ mode: "manual" }),
  actionConfigJson: formatJson([{ type: "SEND_NOTIFICATION", message: "场景已触发" }]),
  status: "ENABLED"
};

export default function IotSceneTemplatesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<TemplateRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [message, setMessage] = useState("");

  const sceneTypes = dicts.iot_scene_type ?? [];
  const sceneStatuses = dicts.iot_scene_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "scene_type" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.sceneType) params.set("scene_type", filters.sceneType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<TemplateRow>>(`/iot/scenes/templates?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_scene_type", "iot_scene_status"];
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
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(row: TemplateRow) {
    setEditing(row);
    setForm({
      sceneCode: row.sceneCode,
      sceneName: row.sceneName,
      sceneType: row.sceneType,
      description: row.description ?? "",
      triggerConfigJson: formatJson(row.triggerConfigJson),
      actionConfigJson: formatJson(row.actionConfigJson),
      status: row.status
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
    const path = editing ? `/iot/scenes/templates/${editing.id}` : "/iot/scenes/templates";
    await apiRequest<TemplateRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-scene-template-update" : "iot-scene-template-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "模板已更新" : "模板已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: TemplateRow) {
    if (!window.confirm(`确认删除模板 ${row.sceneName}？`)) return;
    await apiRequest<{ id: string }>(`/iot/scenes/templates/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-scene-template-delete")
    });
    setMessage("模板已删除");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>场景模板库</h1>
            <p>管理系统预置和自定义场景模板，系统模板只能复制使用，不能硬删除。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_MANAGE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增模板
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="模板编码 / 名称" />
          </Field>
          <SelectField label="场景类型" value={filters.sceneType} items={sceneTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, sceneType: value }))} />
          <SelectField label="状态" value={filters.status} items={sceneStatuses} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">模板列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable className="allow-horizontal-table">
            <thead>
              <tr>
                <th>模板编码</th>
                <th>模板名称</th>
                <th>类型</th>
                <th>来源</th>
                <th>动作数</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.sceneCode}</td>
                  <td>{row.sceneName}</td>
                  <td><StatusPill dictCode="iot_scene_type" value={row.sceneType} dicts={dicts} /></td>
                  <td>{row.isSystem ? "系统预置" : "自定义"}</td>
                  <td>{row.actionConfigJson.length}</td>
                  <td><StatusPill dictCode="iot_scene_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>
                    <DataTableActions>
                      {!row.isSystem ? <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_MANAGE} type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton> : null}
                      {!row.isSystem ? <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_SCENE_TEMPLATE_MANAGE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                        <Trash2 size={16} />
                        删除
                      </PermissionButton> : null}
                      {row.isSystem ? <span className="muted-text">系统预置</span> : null}
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? <tr><td colSpan={8}><div className="empty-state">暂无场景模板</div></td></tr> : null}
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
          <Drawer size="lg" onClose={closeForm}>
            <DrawerHeader eyebrow="物联设备" title={editing ? "编辑模板" : "新增模板"} description="模板保存触发配置和动作配置，复制后可以生成具体园区场景。" onClose={closeForm} closeIcon={<X size={18} />} />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="模板编码">
                  <input value={form.sceneCode} onChange={(event) => setForm((current) => ({ ...current, sceneCode: event.target.value }))} placeholder="留空自动生成" />
                </Field>
                <Field label="模板名称">
                  <input required value={form.sceneName} onChange={(event) => setForm((current) => ({ ...current, sceneName: event.target.value }))} />
                </Field>
                <SelectField required label="场景类型" value={form.sceneType} items={sceneTypes} allLabel="请选择类型" onChange={(value) => setForm((current) => ({ ...current, sceneType: value }))} />
                <SelectField required label="状态" value={form.status} items={sceneStatuses} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, status: value }))} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="描述">
                  <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </Field>
                <Field label="触发配置 JSON">
                  <textarea required value={form.triggerConfigJson} onChange={(event) => setForm((current) => ({ ...current, triggerConfigJson: event.target.value }))} />
                </Field>
                <Field label="动作配置 JSON">
                  <textarea required value={form.actionConfigJson} onChange={(event) => setForm((current) => ({ ...current, actionConfigJson: event.target.value }))} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeForm}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: TemplateForm) {
  return {
    scene_code: form.sceneCode.trim() || undefined,
    scene_name: form.sceneName.trim(),
    scene_type: form.sceneType,
    description: form.description.trim() || undefined,
    trigger_config_json: parseJsonObject(form.triggerConfigJson, "触发配置"),
    action_config_json: parseJsonArray(form.actionConfigJson, "动作配置"),
    status: form.status
  };
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = parseJson(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} 必须是 JSON 对象`);
  return parsed as Record<string, unknown>;
}

function parseJsonArray(value: string, label: string): Array<Record<string, unknown>> {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) throw new Error(`${label} 必须是 JSON 数组`);
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${label} 的每一项必须是 JSON 对象`);
  }
  return parsed as Array<Record<string, unknown>>;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({ label, value, items, allLabel, onChange, required = false }: {
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
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <div className="empty-state">
          <Activity size={18} />
          无权限访问场景模板库
        </div>
      </Card>
    </main>
  );
}
