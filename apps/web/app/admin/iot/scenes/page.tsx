"use client";

import { Card, DataTable, DataTableActions, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader, StatusPill } from "@jinhu/ui";
import { Activity, Edit3, FileClock, PauseCircle, PlayCircle, Plus, RefreshCw, Search, Trash2, X, Zap } from "lucide-react";
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

interface TemplateRow {
  id: string;
  sceneCode: string;
  sceneName: string;
  sceneType: string;
  triggerConfigJson: Record<string, unknown>;
  actionConfigJson: Array<Record<string, unknown>>;
  isSystem: boolean;
  status: string;
}

interface SceneRow {
  id: string;
  templateId: string | null;
  sceneName: string;
  sceneType: string;
  triggerMode: string;
  linkedRuleId: string | null;
  status: string;
  priority: number;
  triggerConfigJson: Record<string, unknown>;
  actionConfigJson: Array<Record<string, unknown>>;
  lastTriggeredAt: string | null;
  remark: string | null;
  updateTime: string;
}

interface SceneLogRow {
  id: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  executionStatus: string;
  actionResultJson: Array<Record<string, unknown>>;
  errorMessage: string | null;
  executedAt: string;
}

interface SceneForm {
  templateId: string;
  sceneName: string;
  sceneType: string;
  triggerMode: string;
  linkedRuleId: string;
  priority: string;
  status: string;
  triggerConfigJson: string;
  actionConfigJson: string;
  remark: string;
}

interface Filters {
  keyword: string;
  sceneType: string;
  triggerMode: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<SceneRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyLogPage: PaginatedResult<SceneLogRow> = { items: [], total: 0, page: 1, page_size: 50 };
const emptyFilters: Filters = { keyword: "", sceneType: "", triggerMode: "", status: "" };
const emptyForm: SceneForm = {
  templateId: "",
  sceneName: "",
  sceneType: "custom",
  triggerMode: "MANUAL",
  linkedRuleId: "",
  priority: "100",
  status: "DISABLED",
  triggerConfigJson: formatJson({ mode: "manual" }),
  actionConfigJson: formatJson([{ type: "SEND_NOTIFICATION", message: "场景已触发" }]),
  remark: ""
};

export default function IotScenesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<SceneRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SceneRow | null>(null);
  const [form, setForm] = useState<SceneForm>(emptyForm);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logScene, setLogScene] = useState<SceneRow | null>(null);
  const [logData, setLogData] = useState<PaginatedResult<SceneLogRow>>(emptyLogPage);
  const [message, setMessage] = useState("");

  const sceneTypes = dicts.iot_scene_type ?? [];
  const triggerModes = dicts.iot_scene_trigger_mode ?? [];
  const sceneStatuses = dicts.iot_scene_status ?? [];
  const logStatuses = dicts.iot_scene_execution_status ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "priority" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.sceneType) params.set("scene_type", filters.sceneType);
    if (filters.triggerMode) params.set("trigger_mode", filters.triggerMode);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<SceneRow>>(`/iot/scenes/instances?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", { token: getAccessToken() });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_scene_type", "iot_scene_trigger_mode", "iot_scene_status", "iot_scene_execution_status"];
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

  const loadTemplates = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<TemplateRow>>("/iot/scenes/templates?page=1&page_size=100&sort=scene_type", {
      token: getAccessToken()
    });
    setTemplates(response.data.items);
  }, []);

  useEffect(() => {
    void Promise.all([loadDicts(), loadTemplates()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadTemplates]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate(template?: TemplateRow) {
    setEditing(null);
    setForm(template ? formFromTemplate(template) : emptyForm);
    setFormOpen(true);
  }

  function openEdit(row: SceneRow) {
    setEditing(row);
    setForm({
      templateId: row.templateId ?? "",
      sceneName: row.sceneName,
      sceneType: row.sceneType,
      triggerMode: row.triggerMode,
      linkedRuleId: row.linkedRuleId ?? "",
      priority: String(row.priority),
      status: row.status,
      triggerConfigJson: formatJson(row.triggerConfigJson),
      actionConfigJson: formatJson(row.actionConfigJson),
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
    const path = editing ? `/iot/scenes/instances/${editing.id}` : "/iot/scenes/instances";
    await apiRequest<SceneRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-scene-update" : "iot-scene-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "场景已更新" : "场景已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: SceneRow) {
    if (!window.confirm(`确认删除场景 ${row.sceneName}？`)) return;
    await apiRequest<{ id: string }>(`/iot/scenes/instances/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-scene-delete")
    });
    setMessage("场景已删除");
    await load(pageData.page);
  }

  async function toggle(row: SceneRow, enabled: boolean) {
    await apiRequest<SceneRow>(`/iot/scenes/instances/${row.id}/${enabled ? "enable" : "disable"}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(enabled ? "iot-scene-enable" : "iot-scene-disable")
    });
    setMessage(enabled ? "场景已启用" : "场景已停用");
    await load(pageData.page);
  }

  async function trigger(row: SceneRow) {
    await apiRequest<SceneLogRow>(`/iot/scenes/instances/${row.id}/trigger`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-scene-trigger"),
      body: { trigger_type: "MANUAL", reason: "页面手动触发", trigger_payload: { source: "web" } }
    });
    setMessage("场景已触发，执行日志已生成");
    await load(pageData.page);
  }

  async function openLogs(row: SceneRow, page = 1) {
    setLogScene(row);
    const response = await apiRequest<PaginatedResult<SceneLogRow>>(`/iot/scenes/instances/${row.id}/execution-logs?page=${page}&page_size=50&sort=-executed_at`, {
      token: getAccessToken()
    });
    setLogData(response.data);
    setLogsOpen(true);
  }

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_SCENE_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>场景联动中心</h1>
            <p>把 IoT 规则包装成可启用、可停用、可手动触发的业务场景。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_CREATE} type="button" onClick={() => openCreate()}>
              <Plus size={16} />
              新增场景
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="场景名称 / 备注" />
          </Field>
          <SelectField label="场景类型" value={filters.sceneType} items={sceneTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, sceneType: value }))} />
          <SelectField label="触发模式" value={filters.triggerMode} items={triggerModes} allLabel="全部模式" onChange={(value) => setFilters((current) => ({ ...current, triggerMode: value }))} />
          <SelectField label="状态" value={filters.status} items={sceneStatuses} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">场景列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable className="allow-horizontal-table">
            <thead>
              <tr>
                <th>场景名称</th>
                <th>类型</th>
                <th>触发模式</th>
                <th>关联规则</th>
                <th>动作数</th>
                <th>优先级</th>
                <th>状态</th>
                <th>最近触发</th>
                <th style={{ width: "400px", minWidth: "400px", maxWidth: "400px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.sceneName}</td>
                  <td><StatusPill dictCode="iot_scene_type" value={row.sceneType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="iot_scene_trigger_mode" value={row.triggerMode} dicts={dicts} /></td>
                  <td>{row.linkedRuleId ? "已关联" : "-"}</td>
                  <td>{row.actionConfigJson.length}</td>
                  <td>{row.priority}</td>
                  <td><StatusPill dictCode="iot_scene_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.lastTriggeredAt)}</td>
                  <td style={{ width: "400px", minWidth: "400px", maxWidth: "400px" }}>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_UPDATE} type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      {row.status === "ENABLED" ? (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_DISABLE} type="button" onClick={() => void toggle(row, false).catch((error: Error) => setMessage(error.message))}>
                          <PauseCircle size={16} />
                          停用
                        </PermissionButton>
                      ) : (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_ENABLE} type="button" onClick={() => void toggle(row, true).catch((error: Error) => setMessage(error.message))}>
                          <PlayCircle size={16} />
                          启用
                        </PermissionButton>
                      )}
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_TRIGGER} type="button" onClick={() => void trigger(row).catch((error: Error) => setMessage(error.message))}>
                        <Zap size={16} />
                        触发
                      </PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_LOG_READ} type="button" onClick={() => void openLogs(row).catch((error: Error) => setMessage(error.message))}>
                        <FileClock size={16} />
                        日志
                      </PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_SCENE_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
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
          <div className="task-item">
            <span>第 {pageData.page} / {totalPages} 页</span>
            <span>
              <button className="secondary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
              <button className="secondary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
            </span>
          </div>
        </Card>

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">可用模板</h2>
            <span>复制模板生成场景</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>模板</th>
                <th>类型</th>
                <th>动作数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {templates.slice(0, 6).map((template) => (
                <tr key={template.id}>
                  <td>{template.sceneName}</td>
                  <td><StatusPill dictCode="iot_scene_type" value={template.sceneType} dicts={dicts} /></td>
                  <td>{template.actionConfigJson.length}</td>
                  <td>
                    <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_SCENE_CREATE} type="button" onClick={() => openCreate(template)}>
                      <Plus size={16} />
                      生成场景
                    </PermissionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        {formOpen ? (
          <Drawer size="lg" onClose={closeForm}>
            <DrawerHeader
              eyebrow="物联设备"
              title={editing ? "编辑场景" : "新增场景"}
              description="场景可以直接配置动作，也可以关联 IoT 规则；触发结果会写入执行日志。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <TemplateSelect value={form.templateId} templates={templates} onChange={(templateId) => {
                  const template = templates.find((item) => item.id === templateId);
                  setForm(template ? formFromTemplate(template) : { ...form, templateId: "" });
                }} />
                <Field label="场景名称">
                  <input required value={form.sceneName} onChange={(event) => setForm((current) => ({ ...current, sceneName: event.target.value }))} />
                </Field>
                <SelectField required label="场景类型" value={form.sceneType} items={sceneTypes} allLabel="请选择类型" onChange={(value) => setForm((current) => ({ ...current, sceneType: value }))} />
                <SelectField required label="触发模式" value={form.triggerMode} items={triggerModes} allLabel="请选择模式" onChange={(value) => setForm((current) => ({ ...current, triggerMode: value }))} />
                <Field label="关联规则 ID">
                  <input value={form.linkedRuleId} onChange={(event) => setForm((current) => ({ ...current, linkedRuleId: event.target.value }))} placeholder="可选，关联 S9-C 规则" />
                </Field>
                <Field label="优先级">
                  <input type="number" value={form.priority} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} />
                </Field>
                <SelectField required label="状态" value={form.status} items={sceneStatuses} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, status: value }))} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="触发配置 JSON">
                  <textarea required value={form.triggerConfigJson} onChange={(event) => setForm((current) => ({ ...current, triggerConfigJson: event.target.value }))} />
                </Field>
                <Field label="动作配置 JSON">
                  <textarea required value={form.actionConfigJson} onChange={(event) => setForm((current) => ({ ...current, actionConfigJson: event.target.value }))} />
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

        {logsOpen && logScene ? (
          <Drawer size="lg" onClose={() => setLogsOpen(false)}>
            <DrawerHeader eyebrow="物联设备" title={logScene.sceneName} description="场景每次手动或自动触发都会生成执行日志。" onClose={() => setLogsOpen(false)} closeIcon={<X size={18} />} />
            <Card className="page-content">
              <DataTable>
                <thead>
                  <tr>
                    <th>执行时间</th>
                    <th>触发类型</th>
                    <th>状态</th>
                    <th>动作结果</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {logData.items.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.executedAt)}</td>
                      <td>{row.triggerType}</td>
                      <td><StatusPill dictCode="iot_scene_execution_status" value={row.executionStatus} dicts={{ iot_scene_execution_status: logStatuses }} /></td>
                      <td>{summarizeJson(row.actionResultJson)}</td>
                      <td>{row.errorMessage ?? "-"}</td>
                    </tr>
                  ))}
                  {logData.items.length === 0 ? <tr><td colSpan={5}><div className="empty-state">暂无执行日志</div></td></tr> : null}
                </tbody>
              </DataTable>
            </Card>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: SceneForm) {
  return {
    template_id: form.templateId || undefined,
    scene_name: form.sceneName.trim(),
    scene_type: form.sceneType,
    trigger_mode: form.triggerMode,
    linked_rule_id: form.linkedRuleId.trim() || undefined,
    priority: integerOrUndefined(form.priority) ?? 100,
    status: form.status,
    trigger_config_json: parseJsonObject(form.triggerConfigJson, "触发配置"),
    action_config_json: parseJsonArray(form.actionConfigJson, "动作配置"),
    remark: form.remark.trim() || undefined
  };
}

function formFromTemplate(template: TemplateRow): SceneForm {
  return {
    ...emptyForm,
    templateId: template.id,
    sceneName: template.sceneName,
    sceneType: template.sceneType,
    triggerConfigJson: formatJson(template.triggerConfigJson),
    actionConfigJson: formatJson(template.actionConfigJson)
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

function summarizeJson(value: unknown) {
  const text = JSON.stringify(value);
  if (!text) return "-";
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function integerOrUndefined(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function TemplateSelect({ value, templates, onChange }: { value: string; templates: TemplateRow[]; onChange: (value: string) => void }) {
  return (
    <Field label="模板">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">不使用模板</option>
        {templates.map((item) => <option key={item.id} value={item.id}>{item.sceneName}</option>)}
      </select>
    </Field>
  );
}

function EmptyState() {
  return <div className="empty-state">暂无场景</div>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <div className="empty-state">
          <Activity size={18} />
          无权限访问场景联动中心
        </div>
      </Card>
    </main>
  );
}
