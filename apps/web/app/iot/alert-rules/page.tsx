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
import { BellRing, Edit3, PauseCircle, PlayCircle, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
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

interface DeviceRow {
  id: string;
  deviceCode: string;
  deviceName: string;
  deviceType: string;
  onlineStatus: string;
}

interface PointRow {
  id: string;
  pointCode: string;
  pointName: string;
  metricCode: string | null;
  valueType: string;
  unit: string | null;
  status: string;
}

interface AlertRuleRow {
  id: string;
  code: string | null;
  ruleCode: string;
  ruleName: string;
  deviceType: string | null;
  deviceId: string | null;
  pointId: string | null;
  metricCode: string;
  operator: string;
  thresholdValue: string | null;
  thresholdText: string | null;
  alertLevel: string;
  alertTitleTemplate: string | null;
  alertContentTemplate: string | null;
  durationSeconds: number | null;
  cooldownSeconds: number | null;
  enabled: boolean;
  status: string;
  remark: string | null;
  updateTime: string;
}

interface AlertRuleForm {
  ruleCode: string;
  ruleName: string;
  deviceType: string;
  deviceId: string;
  pointId: string;
  metricCode: string;
  operator: string;
  thresholdValue: string;
  thresholdText: string;
  alertLevel: string;
  alertTitleTemplate: string;
  alertContentTemplate: string;
  durationSeconds: string;
  cooldownSeconds: string;
  enabled: boolean;
  remark: string;
}

interface Filters {
  keyword: string;
  deviceType: string;
  deviceId: string;
  metricCode: string;
  operator: string;
  alertLevel: string;
  enabled: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<AlertRuleRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", deviceType: "", deviceId: "", metricCode: "", operator: "", alertLevel: "", enabled: "" };
const emptyForm: AlertRuleForm = {
  ruleCode: "",
  ruleName: "",
  deviceType: "",
  deviceId: "",
  pointId: "",
  metricCode: "",
  operator: "gt",
  thresholdValue: "",
  thresholdText: "",
  alertLevel: "warning",
  alertTitleTemplate: "",
  alertContentTemplate: "",
  durationSeconds: "0",
  cooldownSeconds: "300",
  enabled: true,
  remark: ""
};

export default function IotAlertRulesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<AlertRuleRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRuleRow | null>(null);
  const [form, setForm] = useState<AlertRuleForm>(emptyForm);
  const [message, setMessage] = useState("");

  const deviceTypes = dicts.iot_device_type ?? [];
  const operators = dicts.iot_alert_rule_operator ?? [];
  const alertLevels = dicts.iot_alert_level ?? [];
  const deviceMap = useMemo(() => new Map(devices.map((item) => [item.id, item])), [devices]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.deviceType) params.set("device_type", filters.deviceType);
    if (filters.deviceId) params.set("device_id", filters.deviceId);
    if (filters.metricCode.trim()) params.set("metric_code", filters.metricCode.trim());
    if (filters.operator) params.set("operator", filters.operator);
    if (filters.alertLevel) params.set("alert_level", filters.alertLevel);
    if (filters.enabled) params.set("enabled", filters.enabled);
    const response = await apiRequest<PaginatedResult<AlertRuleRow>>(`/iot/alert-rules?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["iot_device_type", "iot_alert_rule_operator", "iot_alert_level", "iot_device_status"];
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

  const loadPoints = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setPoints([]);
      return;
    }
    const response = await apiRequest<PaginatedResult<PointRow>>(`/iot/devices/${deviceId}/points?page=1&page_size=100&sort=point_code`, {
      token: getAccessToken()
    });
    setPoints(response.data.items);
  }, []);

  useEffect(() => {
    void Promise.all([loadDicts(), loadDevices()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadDevices]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    if (!formOpen) return;
    void loadPoints(form.deviceId).catch((error: Error) => setMessage(error.message));
  }, [formOpen, form.deviceId, loadPoints]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      deviceType: deviceTypes[0]?.itemValue ?? "",
      operator: operators[0]?.itemValue ?? "gt",
      alertLevel: alertLevels[0]?.itemValue ?? "warning"
    });
    setPoints([]);
    setFormOpen(true);
  }

  function openEdit(row: AlertRuleRow) {
    setEditing(row);
    setForm({
      ruleCode: row.ruleCode,
      ruleName: row.ruleName,
      deviceType: row.deviceType ?? "",
      deviceId: row.deviceId ?? "",
      pointId: row.pointId ?? "",
      metricCode: row.metricCode,
      operator: row.operator,
      thresholdValue: row.thresholdValue ?? "",
      thresholdText: row.thresholdText ?? "",
      alertLevel: row.alertLevel,
      alertTitleTemplate: row.alertTitleTemplate ?? "",
      alertContentTemplate: row.alertContentTemplate ?? "",
      durationSeconds: row.durationSeconds === null ? "0" : String(row.durationSeconds),
      cooldownSeconds: row.cooldownSeconds === null ? "0" : String(row.cooldownSeconds),
      enabled: row.enabled,
      remark: row.remark ?? ""
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setPoints([]);
  }

  function updatePoint(pointId: string) {
    const point = points.find((item) => item.id === pointId);
    setForm((current) => ({
      ...current,
      pointId,
      metricCode: point ? point.metricCode ?? point.pointCode : current.metricCode
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = editing ? `/iot/alert-rules/${editing.id}` : "/iot/alert-rules";
    await apiRequest<AlertRuleRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "iot-alert-rule-update" : "iot-alert-rule-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "告警规则已更新" : "告警规则已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: AlertRuleRow) {
    if (!window.confirm(`确认删除告警规则 ${row.ruleName}？`)) return;
    await apiRequest<{ id: string }>(`/iot/alert-rules/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("iot-alert-rule-delete")
    });
    setMessage("告警规则已删除");
    await load(pageData.page);
  }

  async function toggle(row: AlertRuleRow, enabled: boolean) {
    await apiRequest<AlertRuleRow>(`/iot/alert-rules/${row.id}/${enabled ? "enable" : "disable"}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(enabled ? "iot-alert-rule-enable" : "iot-alert-rule-disable")
    });
    setMessage(enabled ? "告警规则已启用" : "告警规则已停用");
    await load(pageData.page);
  }

  return (
    <PermissionGuard module={IOT_MODULE} permission={SYSTEM_PERMISSIONS.IOT_ALERT_RULE_READ} fallback={<Forbidden />}>
      <PageShell>
        <PageHeader
          title="IoT 告警规则"
          description="按设备、点位和指标配置阈值、文本和离线告警，设备上报时自动评估。"
          actions={
            <>
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_RULE_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增规则
            </PermissionButton>
            </>
          }
        />

        <FilterPanel>
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="规则编码 / 名称 / 指标" />
          </Field>
          <SelectField label="设备类型" value={filters.deviceType} items={deviceTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, deviceType: value }))} />
          <DeviceSelect label="设备" value={filters.deviceId} devices={devices} allLabel="全部设备" onChange={(value) => setFilters((current) => ({ ...current, deviceId: value }))} />
          <Field label="指标编码">
            <input value={filters.metricCode} onChange={(event) => setFilters((current) => ({ ...current, metricCode: event.target.value }))} placeholder="metric_code" />
          </Field>
          <SelectField label="比较符" value={filters.operator} items={operators} allLabel="全部比较符" onChange={(value) => setFilters((current) => ({ ...current, operator: value }))} />
          <SelectField label="告警级别" value={filters.alertLevel} items={alertLevels} allLabel="全部级别" onChange={(value) => setFilters((current) => ({ ...current, alertLevel: value }))} />
          <SimpleSelect label="启用状态" value={filters.enabled} options={[{ label: "已启用", value: "true" }, { label: "已停用", value: "false" }]} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, enabled: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </FilterPanel>

        {message ? <FeedbackNotice>{message}</FeedbackNotice> : null}

        <ContentCard title="规则列表" description={`共 ${pageData.total} 条`}>
          <DataTable>
            <thead>
              <tr>
                <th>规则编码</th>
                <th>规则名称</th>
                <th>适用对象</th>
                <th>指标</th>
                <th>条件</th>
                <th>级别</th>
                <th>冷却</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.ruleCode}</td>
                  <td>{row.ruleName}</td>
                  <td>{formatTarget(row, deviceMap, dicts)}</td>
                  <td>{row.metricCode}</td>
                  <td>{formatCondition(row, dicts)}</td>
                  <td><StatusPill dictCode="iot_alert_level" value={row.alertLevel} dicts={dicts} /></td>
                  <td>{row.cooldownSeconds ?? 0}s</td>
                  <td><StatusPill dictCode="iot_device_status" value={row.enabled ? "enabled" : "disabled"} dicts={dicts} /></td>
                  <td>{formatDateTime(row.updateTime)}</td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_RULE_UPDATE} type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      {row.enabled ? (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_RULE_DISABLE} type="button" onClick={() => void toggle(row, false).catch((error: Error) => setMessage(error.message))}>
                          <PauseCircle size={16} />
                          停用
                        </PermissionButton>
                      ) : (
                        <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.IOT_ALERT_RULE_ENABLE} type="button" onClick={() => void toggle(row, true).catch((error: Error) => setMessage(error.message))}>
                          <PlayCircle size={16} />
                          启用
                        </PermissionButton>
                      )}
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.IOT_ALERT_RULE_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
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
          <PaginationBar page={pageData.page} totalPages={totalPages} total={pageData.total} onPage={(nextPage) => void load(nextPage).catch((error: Error) => setMessage(error.message))} />
        </ContentCard>

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader
              eyebrow="物联设备"
              title={editing ? "编辑告警规则" : "新增告警规则"}
              description="规则可绑定设备类型、具体设备或点位；设备上报后由统一 ingest 链路评估。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="规则编码">
                  <input value={form.ruleCode} onChange={(event) => setForm((current) => ({ ...current, ruleCode: event.target.value }))} placeholder="留空自动生成" />
                </Field>
                <Field label="规则名称">
                  <input required value={form.ruleName} onChange={(event) => setForm((current) => ({ ...current, ruleName: event.target.value }))} />
                </Field>
                <SelectField label="设备类型" value={form.deviceType} items={deviceTypes} allLabel="不限设备类型" onChange={(value) => setForm((current) => ({ ...current, deviceType: value }))} />
                <DeviceSelect label="指定设备" value={form.deviceId} devices={devices} allLabel="不限设备" onChange={(value) => setForm((current) => ({ ...current, deviceId: value, pointId: "", metricCode: value ? current.metricCode : current.metricCode }))} />
                <PointSelect label="指定点位" value={form.pointId} points={points} allLabel={form.deviceId ? "不限点位" : "先选择设备"} onChange={updatePoint} />
                <Field label="指标编码">
                  <input required value={form.metricCode} onChange={(event) => setForm((current) => ({ ...current, metricCode: event.target.value }))} placeholder="如 power / energy / online" />
                </Field>
                <SelectField required label="比较符" value={form.operator} items={operators} allLabel="请选择比较符" onChange={(value) => setForm((current) => ({ ...current, operator: value }))} />
                <SelectField required label="告警级别" value={form.alertLevel} items={alertLevels} allLabel="请选择级别" onChange={(value) => setForm((current) => ({ ...current, alertLevel: value }))} />
                <Field label="数值阈值">
                  <input type="number" value={form.thresholdValue} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, thresholdValue: event.target.value }))} placeholder="数值比较填写" />
                </Field>
                <Field label="文本阈值">
                  <input value={form.thresholdText} onChange={(event) => setForm((current) => ({ ...current, thresholdText: event.target.value }))} placeholder="contains / eq / neq 可填写" />
                </Field>
                <Field label="持续秒数">
                  <input type="number" min="0" value={form.durationSeconds} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, durationSeconds: event.target.value }))} />
                </Field>
                <Field label="冷却秒数">
                  <input type="number" min="0" value={form.cooldownSeconds} onFocus={(event) => event.target.select()} onChange={(event) => setForm((current) => ({ ...current, cooldownSeconds: event.target.value }))} />
                </Field>
                <SimpleSelect label="启用状态" value={form.enabled ? "true" : "false"} options={[{ label: "启用", value: "true" }, { label: "停用", value: "false" }]} allLabel="请选择状态" onChange={(value) => setForm((current) => ({ ...current, enabled: value !== "false" }))} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="标题模板">
                  <input value={form.alertTitleTemplate} onChange={(event) => setForm((current) => ({ ...current, alertTitleTemplate: event.target.value }))} placeholder="{{device_name}} {{metric_code}} 告警" />
                </Field>
                <Field label="内容模板">
                  <textarea value={form.alertContentTemplate} onChange={(event) => setForm((current) => ({ ...current, alertContentTemplate: event.target.value }))} placeholder="可使用 {{device_name}}、{{metric_code}}、{{value}}、{{threshold}}" />
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

function buildPayload(form: AlertRuleForm) {
  return {
    rule_code: form.ruleCode.trim() || undefined,
    rule_name: form.ruleName.trim(),
    device_type: form.deviceType || undefined,
    device_id: form.deviceId || undefined,
    point_id: form.pointId || undefined,
    metric_code: form.metricCode.trim(),
    operator: form.operator,
    threshold_value: numberOrUndefined(form.thresholdValue),
    threshold_text: form.thresholdText.trim() || undefined,
    alert_level: form.alertLevel,
    alert_title_template: form.alertTitleTemplate.trim() || undefined,
    alert_content_template: form.alertContentTemplate.trim() || undefined,
    duration_seconds: integerOrUndefined(form.durationSeconds) ?? 0,
    cooldown_seconds: integerOrUndefined(form.cooldownSeconds) ?? 0,
    enabled: form.enabled,
    status: form.enabled ? "enabled" : "disabled",
    remark: form.remark.trim() || undefined
  };
}

function formatTarget(row: AlertRuleRow, deviceMap: Map<string, DeviceRow>, dicts: DictMap) {
  if (row.deviceId) {
    const device = deviceMap.get(row.deviceId);
    return device ? `${device.deviceCode} ${device.deviceName}` : "指定设备";
  }
  if (row.deviceType) return <StatusPill dictCode="iot_device_type" value={row.deviceType} dicts={dicts} />;
  return "全部设备";
}

function formatCondition(row: AlertRuleRow, dicts: DictMap) {
  const value = row.operator === "offline" ? "" : row.thresholdValue ?? row.thresholdText ?? "";
  return (
    <span className="inline-cluster">
      <StatusPill dictCode="iot_alert_rule_operator" value={row.operator} dicts={dicts} />
      {value ? <strong>{value}</strong> : null}
    </span>
  );
}

function integerOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
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

function SimpleSelect({
  label,
  value,
  options,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
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

function PointSelect({
  label,
  value,
  points,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  points: PointRow[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {points.map((item) => (
          <option key={item.id} value={item.id}>{item.pointCode} {item.pointName}</option>
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
  return <UiEmptyState title="暂无告警规则" compact />;
}

function Forbidden() {
  return (
    <PageShell>
      <ContentCard>
        <UiEmptyState title="403" description="无权限访问 IoT 告警规则" icon={<BellRing size={18} />} />
      </ContentCard>
    </PageShell>
  );
}
