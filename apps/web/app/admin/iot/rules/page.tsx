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
import { Activity, Edit3, FileClock, PauseCircle, PlayCircle, Plus, RefreshCw, Search, TestTube2, Trash2 } from "lucide-react";
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
  tagType?: string | null;
}

interface DeviceRow {
  id: string;
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  onlineStatus: string;
}

interface RuleRow {
  id: string;
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  triggerScope: string;
  deviceId: string | null;
  deviceType: string | null;
  areaId: string | null;
  conditionJson: Record<string, unknown>;
  actionJson: Array<Record<string, unknown>>;
  priority: number;
  status: string;
  lastTriggeredAt: string | null;
  remark: string | null;
  updateTime: string;
}

interface RuleLogRow {
  id: string;
  ruleId: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  actionResult: Array<Record<string, unknown>>;
  executionStatus: string;
  errorMessage: string | null;
  executedAt: string;
}

interface RuleForm {
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  triggerScope: string;
  deviceType: string;
  deviceId: string;
  areaId: string;
  conditionJson: string;
  actionJson: string;
  priority: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  ruleType: string;
  triggerScope: string;
  status: string;
  deviceType: string;
  deviceId: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<RuleRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyLogPage: PaginatedResult<RuleLogRow> = { items: [], total: 0, page: 1, page_size: 50 };
const emptyFilters: Filters = { keyword: "", ruleType: "", triggerScope: "", status: "", deviceType: "", deviceId: "" };
const defaultCondition = {
  metric: "temperature",
  operator: "gt",
  value: 35
};
const defaultAction = [
  {
    type: "CREATE_IOT_ALERT",
    alert_level: "warning",
    metric_code: "temperature",
    title: "温度超限",
    content: "设备温度超过阈值，请现场核查"
  }
];
const emptyForm: RuleForm = {
  ruleCode: "",
  ruleName: "",
  ruleType: "METRIC",
  triggerScope: "DEVICE",
  deviceType: "",
  deviceId: "",
  areaId: "",
  conditionJson: formatJson(defaultCondition),
  actionJson: formatJson(defaultAction),
  priority: "100",
  status: "DISABLED",
  remark: ""
};

export default function IotRulesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<RuleRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logRule, setLogRule] = useState<RuleRow | null>(null);
  const [logData, setLogData] = useState<PaginatedResult<RuleLogRow>>(emptyLogPage);
  const [testOpen, setTestOpen] = useState(false);
  const [testRule, setTestRule] = useState<RuleRow | null>(null);
  const [testPayload, setTestPayload] = useState(formatJson({ metric_code: "temperature", value: 40, status: "ONLINE" }));
  const [message, setMessage] = useState("");

  const ruleTypes = dicts.iot_rule_type ?? [];
  const triggerScopes = dicts.iot_rule_trigger_scope ?? [];
  const ruleStatuses = dicts.iot_rule_status ?? [];
  const logStatuses = dicts.iot_rule_execution_status ?? [];
  const deviceTypes = dicts.iot_device_type ?? [];
  const deviceMap = useMemo(() => new Map(devices.map((item) => [item.id, item])), [devices]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.ruleType) params.set("rule_type", filters.ruleType);
    if (filters.triggerScope) params.set("trigger_scope", filters.triggerScope);
    if (filters.status) params.set("status", filters.status);
    if (filters.deviceType) params.set("device_type", filters.deviceType);
    if (filters.deviceId) params.set("device_id", filters.deviceId);
    const response = await apiRequest<PaginatedResult<RuleRow>>(`/iot/rules?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_rule_type", "iot_rule_trigger_scope", "iot_rule_status", "iot_rule_execution_status", "iot_device_type"];
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

  const loadDevices = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<DeviceRow>>("/iot/devices?page=1&page_size=100&sort=device_code", {
      token: getAccessToken()
    });
    setDevices(response.data.items);
  }, []);

  useEffect(() => {
    void Promise.all([loadDicts(), loadDevices()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadDevices]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      ruleType: ruleTypes[0]?.itemValue ?? "METRIC",
      triggerScope: triggerScopes[0]?.itemValue ?? "DEVICE",
      status: ruleStatuses[0]?.itemValue ?? "DISABLED"
    });
    setFormOpen(true);
  }

  function openEdit(row: RuleRow) {
    setEditing(row);
    setForm({
      ruleCode: row.ruleCode,
      ruleName: row.ruleName,
      ruleType: row.ruleType,
      triggerScope: row.triggerScope,
      deviceType: row.deviceType ?? "",
      deviceId: row.deviceId ?? "",
      areaId: row.areaId ?? "",
      conditionJson: formatJson(row.conditionJson),
      actionJson: formatJson(row.actionJson),
      priority: String(row.priority),
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
    const path = editing ? `/iot/rules/${editing.id}` : "/iot/rules";
    await apiRequest<RuleRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-rule-update" : "iot-rule-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "规则已更新" : "规则已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: RuleRow) {
    if (!window.confirm(`确认删除规则 ${row.ruleName}？`)) return;
    await apiRequest<{ id: string }>(`/iot/rules/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-rule-delete")
    });
    setMessage("规则已删除");
    await load(pageData.page);
  }

  async function toggle(row: RuleRow, enabled: boolean) {
    await apiRequest<RuleRow>(`/iot/rules/${row.id}/${enabled ? "enable" : "disable"}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(enabled ? "iot-rule-enable" : "iot-rule-disable")
    });
    setMessage(enabled ? "规则已启用" : "规则已停用");
    await load(pageData.page);
  }

  async function openLogs(row: RuleRow, page = 1) {
    setLogRule(row);
    const response = await apiRequest<PaginatedResult<RuleLogRow>>(`/iot/rules/${row.id}/execution-logs?page=${page}&page_size=50&sort=-executed_at`, {
      token: getAccessToken()
    });
    setLogData(response.data);
    setLogsOpen(true);
  }

  function openTest(row: RuleRow) {
    setTestRule(row);
    setTestPayload(formatJson(defaultTestPayload(row)));
    setTestOpen(true);
  }

  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!testRule) return;
    await apiRequest<RuleLogRow>(`/iot/rules/${testRule.id}/test`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-rule-test"),
      body: { trigger_payload: parseJsonObject(testPayload, "测试载荷") }
    });
    setMessage("规则测试已执行，执行日志已刷新");
    setTestOpen(false);
    await Promise.all([load(pageData.page), openLogs(testRule)]);
  }

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_RULE_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>IoT 规则引擎</h1>
            <p>统一管理指标、状态、告警和定时触发规则，自动执行跨模块联动动作。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_RULE_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增规则
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="规则编码 / 名称" />
          </Field>
          <SelectField label="规则类型" value={filters.ruleType} items={ruleTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, ruleType: value }))} />
          <SelectField label="触发范围" value={filters.triggerScope} items={triggerScopes} allLabel="全部范围" onChange={(value) => setFilters((current) => ({ ...current, triggerScope: value }))} />
          <SelectField label="规则状态" value={filters.status} items={ruleStatuses} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <SelectField label="设备类型" value={filters.deviceType} items={deviceTypes} allLabel="全部设备类型" onChange={(value) => setFilters((current) => ({ ...current, deviceType: value }))} />
          <DeviceSelect label="设备" value={filters.deviceId} devices={devices} allLabel="全部设备" onChange={(value) => setFilters((current) => ({ ...current, deviceId: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">规则列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>规则编码</th>
                <th>规则名称</th>
                <th>类型</th>
                <th>范围</th>
                <th>对象</th>
                <th>动作数</th>
                <th>优先级</th>
                <th>状态</th>
                <th>最近触发</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.ruleCode}</td>
                  <td>{row.ruleName}</td>
                  <td><StatusPill dictCode="iot_rule_type" value={row.ruleType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="iot_rule_trigger_scope" value={row.triggerScope} dicts={dicts} /></td>
                  <td>{formatTarget(row, deviceMap, dicts)}</td>
                  <td>{row.actionJson.length}</td>
                  <td>{row.priority}</td>
                  <td><StatusPill dictCode="iot_rule_status" value={row.status} dicts={dicts} /></td>
                  <td>{formatDateTime(row.lastTriggeredAt)}</td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_RULE_UPDATE} type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      {row.status === "ENABLED" ? (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_RULE_DISABLE} type="button" onClick={() => void toggle(row, false).catch((error: Error) => setMessage(error.message))}>
                          <PauseCircle size={16} />
                          停用
                        </PermissionButton>
                      ) : (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_RULE_ENABLE} type="button" onClick={() => void toggle(row, true).catch((error: Error) => setMessage(error.message))}>
                          <PlayCircle size={16} />
                          启用
                        </PermissionButton>
                      )}
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_RULE_TEST} type="button" onClick={() => openTest(row)}>
                        <TestTube2 size={16} />
                        测试
                      </PermissionButton>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_RULE_LOG_READ} type="button" onClick={() => void openLogs(row).catch((error: Error) => setMessage(error.message))}>
                        <FileClock size={16} />
                        日志
                      </PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_RULE_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
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
          <Drawer size="lg" onClose={closeForm}>
            <DrawerHeader
              eyebrow="IoT 自动化"
              title={editing ? "编辑规则" : "新增规则"}
              description="条件与动作使用 JSON 配置，后端会校验允许的动作类型并拒绝任意代码执行。"
              onClose={closeForm}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="规则编码">
                  <input value={form.ruleCode} onChange={(event) => setForm((current) => ({ ...current, ruleCode: event.target.value }))} placeholder="留空自动生成" />
                </Field>
                <Field label="规则名称">
                  <input required value={form.ruleName} onChange={(event) => setForm((current) => ({ ...current, ruleName: event.target.value }))} />
                </Field>
                <SelectField required label="规则类型" value={form.ruleType} items={ruleTypes} allLabel="请选择类型" onChange={(value) => setForm((current) => ({ ...current, ruleType: value }))} />
                <SelectField required label="触发范围" value={form.triggerScope} items={triggerScopes} allLabel="请选择范围" onChange={(value) => setForm((current) => ({ ...current, triggerScope: value }))} />
                <SelectField label="设备类型" value={form.deviceType} items={deviceTypes} allLabel="不限设备类型" onChange={(value) => setForm((current) => ({ ...current, deviceType: value }))} />
                <DeviceSelect label="指定设备" value={form.deviceId} devices={devices} allLabel="不限设备" onChange={(value) => setForm((current) => ({ ...current, deviceId: value }))} />
                <Field label="区域 ID">
                  <input value={form.areaId} onChange={(event) => setForm((current) => ({ ...current, areaId: event.target.value }))} placeholder="预留区域维度" />
                </Field>
                <Field label="优先级">
                  <input type="number" min="1" value={form.priority} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} />
                </Field>
                <SelectField required label="状态" value={form.status} items={ruleStatuses} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, status: value }))} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="条件配置 condition_json">
                  <textarea required value={form.conditionJson} onChange={(event) => setForm((current) => ({ ...current, conditionJson: event.target.value }))} />
                </Field>
                <Field label="动作配置 action_json">
                  <textarea required value={form.actionJson} onChange={(event) => setForm((current) => ({ ...current, actionJson: event.target.value }))} />
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

        {testOpen && testRule ? (
          <Drawer size="md" onClose={() => setTestOpen(false)}>
            <DrawerHeader
              eyebrow="规则测试"
              title={testRule.ruleName}
              description="手动模拟触发载荷，执行结果会写入规则执行日志。"
              onClose={() => setTestOpen(false)}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void runTest(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid single>
                <Field label="测试载荷 JSON">
                  <textarea required value={testPayload} onChange={(event) => setTestPayload(event.target.value)} />
                </Field>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setTestOpen(false)}>取消</button>
                <button className="primary-button" type="submit">执行测试</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {logsOpen && logRule ? (
          <Drawer size="lg" onClose={() => setLogsOpen(false)}>
            <DrawerHeader
              eyebrow="执行日志"
              title={logRule.ruleName}
              description="每次规则命中、跳过或执行失败都会形成审计化的执行记录。"
              onClose={() => setLogsOpen(false)}
            />
            <Card className="page-content">
              <DataTable>
                <thead>
                  <tr>
                    <th>执行时间</th>
                    <th>触发类型</th>
                    <th>状态</th>
                    <th>结果</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {logData.items.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.executedAt)}</td>
                      <td>{row.triggerType}</td>
                      <td><StatusPill dictCode="iot_rule_execution_status" value={row.executionStatus} dicts={{ iot_rule_execution_status: logStatuses }} /></td>
                      <td>{summarizeJson(row.actionResult)}</td>
                      <td>{row.errorMessage ?? "-"}</td>
                    </tr>
                  ))}
                  {logData.items.length === 0 ? <tr><td colSpan={5}><div className="empty-state">暂无执行日志</div></td></tr> : null}
                </tbody>
              </DataTable>
              <div className="task-item">
                <span>共 {logData.total} 条</span>
                <button className="secondary-button" type="button" onClick={() => void openLogs(logRule, logData.page).catch((error: Error) => setMessage(error.message))}>
                  <RefreshCw size={16} />
                  刷新日志
                </button>
              </div>
            </Card>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: RuleForm) {
  return {
    rule_code: form.ruleCode.trim() || undefined,
    rule_name: form.ruleName.trim(),
    rule_type: form.ruleType,
    trigger_scope: form.triggerScope,
    device_type: form.deviceType || undefined,
    device_id: form.deviceId || undefined,
    area_id: form.areaId.trim() || undefined,
    condition_json: parseJsonObject(form.conditionJson, "条件配置"),
    action_json: parseJsonArray(form.actionJson, "动作配置"),
    priority: integerOrUndefined(form.priority) ?? 100,
    status: form.status,
    remark: form.remark.trim() || undefined
  };
}

function formatTarget(row: RuleRow, deviceMap: Map<string, DeviceRow>, dicts: DictMap) {
  if (row.deviceId) {
    const device = deviceMap.get(row.deviceId);
    return device ? `${device.deviceCode} ${device.deviceName}` : "指定设备";
  }
  if (row.deviceType) return <StatusPill dictCode="iot_device_type" value={row.deviceType} dicts={dicts} />;
  if (row.areaId) return `区域 ${row.areaId}`;
  return "园区范围";
}

function defaultTestPayload(rule: RuleRow) {
  if (rule.ruleType === "ALERT") return { alert_level: "major", device_id: rule.deviceId ?? undefined, metric_code: "temperature" };
  if (rule.ruleType === "STATUS") return { status: "OFFLINE", device_id: rule.deviceId ?? undefined };
  if (rule.ruleType === "SCHEDULE") return { schedule_time: new Date().toISOString() };
  return { metric_code: "temperature", value: 40, device_id: rule.deviceId ?? undefined };
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = parseJson(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
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

function DeviceSelect({
  label,
  value,
  devices,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  devices: DeviceRow[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {devices.map((item) => (
          <option key={item.id} value={item.id}>{item.deviceCode} {item.deviceName}</option>
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
  return <div className="empty-state">暂无 IoT 规则</div>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <div className="empty-state">
          <Activity size={18} />
          无权限访问 IoT 规则引擎
        </div>
      </Card>
    </main>
  );
}
