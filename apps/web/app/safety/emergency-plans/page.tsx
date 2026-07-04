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
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { Edit3, Eye, Paperclip, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { FileUploader } from "../../../components/files/FileUploader";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const SAFETY_MODULE = "safety";

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

interface EmergencyPlanRow {
  id: string;
  code: string | null;
  planCode: string;
  planName: string;
  incidentType: string;
  severityLevel: string;
  responseLevel: string | null;
  commanderRole: string | null;
  responseTeamRoleCodes: string[];
  stepsJson: unknown;
  attachmentFileIds: string[];
  status: string;
  updateTime: string;
  remark: string | null;
}

interface PlanForm {
  planCode: string;
  planName: string;
  incidentType: string;
  severityLevel: string;
  responseLevel: string;
  commanderRole: string;
  responseTeamRoleCodes: string;
  stepsText: string;
  attachmentFileIds: string[];
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  incidentType: string;
  severityLevel: string;
  responseLevel: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<EmergencyPlanRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", incidentType: "", severityLevel: "", responseLevel: "", status: "" };
const emptyForm: PlanForm = {
  planCode: "",
  planName: "",
  incidentType: "",
  severityLevel: "",
  responseLevel: "",
  commanderRole: "",
  responseTeamRoleCodes: "",
  stepsText: "",
  attachmentFileIds: [],
  status: "enabled",
  remark: ""
};

export default function SafetyEmergencyPlansPage() {
  const [pageData, setPageData] = useState<PaginatedResult<EmergencyPlanRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmergencyPlanRow | null>(null);
  const [viewing, setViewing] = useState<EmergencyPlanRow | null>(null);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const incidentTypes = dicts.safety_emergency_incident_type ?? [];
  const severityLevels = dicts.safety_emergency_severity ?? [];
  const responseLevels = dicts.safety_emergency_response_level ?? [];
  const statusItems = dicts.safety_emergency_plan_status ?? [];

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.incidentType) params.set("incident_type", filters.incidentType);
    if (filters.severityLevel) params.set("severity_level", filters.severityLevel);
    if (filters.responseLevel) params.set("response_level", filters.responseLevel);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<EmergencyPlanRow>>(`/safety/emergency-plans?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "safety_emergency_incident_type",
      "safety_emergency_severity",
      "safety_emergency_response_level",
      "safety_emergency_plan_status"
    ];
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
      incidentType: incidentTypes[0]?.itemValue ?? "",
      severityLevel: severityLevels[0]?.itemValue ?? "",
      responseLevel: responseLevels[0]?.itemValue ?? "",
      status: "enabled"
    });
    setFormOpen(true);
  }

  function openEdit(row: EmergencyPlanRow) {
    setEditing(row);
    setForm({
      planCode: row.planCode,
      planName: row.planName,
      incidentType: row.incidentType,
      severityLevel: row.severityLevel,
      responseLevel: row.responseLevel ?? "",
      commanderRole: row.commanderRole ?? "",
      responseTeamRoleCodes: row.responseTeamRoleCodes?.join(",") ?? "",
      stepsText: stepsToText(row.stepsJson),
      attachmentFileIds: row.attachmentFileIds ?? [],
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
    const path = editing ? `/safety/emergency-plans/${editing.id}` : "/safety/emergency-plans";
    await apiRequest<EmergencyPlanRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "safety-emergency-plan-update" : "safety-emergency-plan-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "应急预案已更新" : "应急预案已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: EmergencyPlanRow) {
    if (!window.confirm(`确认删除应急预案 ${row.planName}？`)) return;
    await apiRequest<{ id: string }>(`/safety/emergency-plans/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-emergency-plan-delete")
    });
    setMessage("应急预案已删除");
    await load(pageData.page);
  }

  function setFormValue<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleUploaded(file: FileRecord) {
    setForm((current) => ({
      ...current,
      attachmentFileIds: [...new Set([...current.attachmentFileIds, file.id])]
    }));
  }

  return (
    <PermissionGuard module={SAFETY_MODULE} permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>应急预案</h1>
            <p>维护事件类型、响应等级、处置步骤和预案附件，供事件上报时快速调用。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增预案
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="预案编号 / 名称" />
          </Field>
          <SelectField label="事件类型" value={filters.incidentType} items={incidentTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, incidentType: value }))} />
          <SelectField label="严重等级" value={filters.severityLevel} items={severityLevels} allLabel="全部等级" onChange={(value) => setFilters((current) => ({ ...current, severityLevel: value }))} />
          <SelectField label="响应级别" value={filters.responseLevel} items={responseLevels} allLabel="全部级别" onChange={(value) => setFilters((current) => ({ ...current, responseLevel: value }))} />
          <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">预案列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable className="safety-emergency-plans-table allow-horizontal-table">
            <thead>
              <tr>
                <th>预案编码</th>
                <th>预案名称</th>
                <th>事件类型</th>
                <th>严重等级</th>
                <th>响应级别</th>
                <th>指挥岗位</th>
                <th>步骤</th>
                <th>附件</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.planCode}</td>
                  <td>{row.planName}</td>
                  <td><StatusPill dictCode="safety_emergency_incident_type" value={row.incidentType} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_emergency_severity" value={row.severityLevel} dicts={dicts} /></td>
                  <td><StatusPill dictCode="safety_emergency_response_level" value={row.responseLevel} dicts={dicts} /></td>
                  <td>{row.commanderRole ?? "-"}</td>
                  <td>{countSteps(row.stepsJson)} 步</td>
                  <td><Paperclip size={14} /> {row.attachmentFileIds?.length ?? 0}</td>
                  <td><StatusPill dictCode="safety_emergency_plan_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => setViewing(row)}><Eye size={16} />查看</button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_PLAN_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
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
              eyebrow="现场安全"
              title={editing ? "编辑预案" : "新增预案"}
              description="预案步骤可逐行填写，保存时会转换为结构化步骤数组。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="预案编码">
                  <input value={form.planCode} onChange={(event) => setFormValue("planCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="预案名称">
                  <input required value={form.planName} onChange={(event) => setFormValue("planName", event.target.value)} />
                </Field>
                <SelectField label="事件类型" value={form.incidentType} items={incidentTypes} allLabel="请选择类型" required onChange={(value) => setFormValue("incidentType", value)} />
                <SelectField label="严重等级" value={form.severityLevel} items={severityLevels} allLabel="请选择等级" required onChange={(value) => setFormValue("severityLevel", value)} />
                <SelectField label="响应级别" value={form.responseLevel} items={responseLevels} allLabel="请选择级别" onChange={(value) => setFormValue("responseLevel", value)} />
                <Field label="指挥岗位">
                  <input value={form.commanderRole} onChange={(event) => setFormValue("commanderRole", event.target.value)} placeholder="如安全主管 / 运营负责人" />
                </Field>
                <Field label="响应团队角色">
                  <input value={form.responseTeamRoleCodes} onChange={(event) => setFormValue("responseTeamRoleCodes", event.target.value)} placeholder="角色编码，逗号分隔" />
                </Field>
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setFormValue("status", value || "enabled")} />
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <Field label="预案步骤">
                  <textarea required value={form.stepsText} onChange={(event) => setFormValue("stepsText", event.target.value)} placeholder="每行一个处置步骤" />
                </Field>
                <Field label="预案附件">
                  <FileUploader bizType="safety_emergency_plan" onUploaded={handleUploaded} />
                  <span className="status-pill">已选择 {form.attachmentFileIds.length} 个附件</span>
                </Field>
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
              eyebrow="预案详情"
              title={viewing.planName}
              description={`${viewing.planCode} · ${labelFor(incidentTypes, viewing.incidentType)}`}
              onClose={() => setViewing(null)}
            />
            <DrawerDetailGrid>
              <DrawerDetailItem label="预案编码" value={viewing.planCode} />
              <DrawerDetailItem label="事件类型" value={<StatusPill dictCode="safety_emergency_incident_type" value={viewing.incidentType} dicts={dicts} />} />
              <DrawerDetailItem label="严重等级" value={<StatusPill dictCode="safety_emergency_severity" value={viewing.severityLevel} dicts={dicts} />} />
              <DrawerDetailItem label="响应级别" value={<StatusPill dictCode="safety_emergency_response_level" value={viewing.responseLevel} dicts={dicts} />} />
              <DrawerDetailItem label="指挥岗位" value={viewing.commanderRole ?? "-"} />
              <DrawerDetailItem label="响应角色" value={viewing.responseTeamRoleCodes?.join(" / ") || "-"} />
              <DrawerDetailItem label="附件数量" value={`${viewing.attachmentFileIds?.length ?? 0} 个`} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_emergency_plan_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
            <section className="work-panel">
              <h3 className="panel-title">处置步骤</h3>
              <ol className="timeline-list">
                {stepsToLines(viewing.stepsJson).map((step, index) => (
                  <li className="timeline-item" key={`${step}-${index}`}>
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <strong>步骤 {index + 1}</strong>
                      <p>{step}</p>
                    </div>
                  </li>
                ))}
                {countSteps(viewing.stepsJson) === 0 ? <p className="muted-text">暂无预案步骤</p> : null}
              </ol>
            </section>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );
}

function buildPayload(form: PlanForm) {
  const steps = form.stepsText
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((content, index) => ({ step_no: index + 1, content }));
  return {
    plan_code: form.planCode.trim() || undefined,
    plan_name: form.planName.trim(),
    incident_type: form.incidentType,
    severity_level: form.severityLevel,
    response_level: form.responseLevel || undefined,
    commander_role: form.commanderRole.trim() || undefined,
    response_team_role_codes: form.responseTeamRoleCodes.split(",").map((item) => item.trim()).filter(Boolean),
    steps_json: steps,
    attachment_file_ids: form.attachmentFileIds,
    status: form.status || "enabled",
    remark: form.remark.trim() || undefined
  };
}

function stepsToText(value: unknown) {
  return stepsToLines(value).join("\n");
}

function stepsToLines(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "content" in item) return String((item as { content?: unknown }).content ?? "");
        return "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string") return value.split("\n").map((item) => item.trim()).filter(Boolean);
  return [];
}

function countSteps(value: unknown) {
  return stepsToLines(value).length;
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

function EmptyState() {
  return <p className="muted-text">暂无应急预案</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问应急预案，或当前租户未开通安全应急能力。</p>
      </Card>
    </main>
  );
}
