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
import { Edit3, Eye, PauseCircle, PlayCircle, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
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

interface InspectTemplateRow {
  id: string;
  templateCode: string;
  templateName: string;
  status: string;
}

interface InspectPointRow {
  id: string;
  pointCode: string;
  pointName: string;
  status: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
}

interface RoleRow {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface InspectPlanRow {
  id: string;
  planCode: string;
  planName: string;
  templateId: string;
  pointIds: string[];
  frequencyType: string;
  cronExpr: string | null;
  startDate: string;
  endDate: string | null;
  handlerUserIds: string[];
  handlerRoleCodes: string[];
  nextGenerateTime: string | null;
  lastGenerateTime: string | null;
  status: string;
  remark: string | null;
  updateTime: string;
  template?: InspectTemplateRow | null;
}

interface PlanForm {
  planCode: string;
  planName: string;
  templateId: string;
  pointIds: string[];
  frequencyType: string;
  cronExpr: string;
  startDate: string;
  endDate: string;
  handlerUserIds: string[];
  handlerRoleCodes: string[];
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  templateId: string;
  frequencyType: string;
  status: string;
  pointId: string;
  handlerUserId: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<InspectPlanRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = {
  keyword: "",
  templateId: "",
  frequencyType: "",
  status: "",
  pointId: "",
  handlerUserId: ""
};
const emptyForm: PlanForm = {
  planCode: "",
  planName: "",
  templateId: "",
  pointIds: [],
  frequencyType: "",
  cronExpr: "",
  startDate: "",
  endDate: "",
  handlerUserIds: [],
  handlerRoleCodes: [],
  status: "disabled",
  remark: ""
};

export default function SafetyInspectPlansPage() {
  const [pageData, setPageData] = useState<PaginatedResult<InspectPlanRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [templates, setTemplates] = useState<InspectTemplateRow[]>([]);
  const [points, setPoints] = useState<InspectPointRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InspectPlanRow | null>(null);
  const [viewing, setViewing] = useState<InspectPlanRow | null>(null);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const frequencyItems = dicts.safety_inspect_frequency ?? [];
  const statusItems = dicts.safety_inspect_plan_status ?? [];
  const templateMap = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates]);
  const pointMap = useMemo(() => new Map(points.map((item) => [item.id, item])), [points]);
  const userMap = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);
  const roleMap = useMemo(() => new Map(roles.map((item) => [item.code, item])), [roles]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "-update_time" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.templateId) params.set("template_id", filters.templateId);
    if (filters.frequencyType) params.set("frequency_type", filters.frequencyType);
    if (filters.status) params.set("status", filters.status);
    if (filters.pointId) params.set("point_id", filters.pointId);
    if (filters.handlerUserId) params.set("handler_user_id", filters.handlerUserId);
    const response = await apiRequest<PaginatedResult<InspectPlanRow>>(`/safety/inspect-plans?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=300", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["safety_inspect_frequency", "safety_inspect_plan_status"];
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

  const loadRefs = useCallback(async () => {
    const [templateResponse, pointResponse, userResponse, roleResponse] = await Promise.all([
      apiRequest<PaginatedResult<InspectTemplateRow>>("/safety/inspect-templates?page=1&page_size=300&status=enabled&sort=template_code", {
        token: getAccessToken()
      }),
      apiRequest<PaginatedResult<InspectPointRow>>("/safety/inspect-points?page=1&page_size=500&status=enabled&sort=sort_no", {
        token: getAccessToken()
      }),
      apiRequest<PaginatedResult<UserRow>>("/users?page=1&page_size=300&status=enabled", {
        token: getAccessToken()
      }),
      apiRequest<PaginatedResult<RoleRow>>("/roles?page=1&page_size=300&status=enabled", {
        token: getAccessToken()
      })
    ]);
    setTemplates(templateResponse.data.items);
    setPoints(pointResponse.data.items);
    setUsers(userResponse.data.items);
    setRoles(roleResponse.data.items);
  }, []);

  useEffect(() => {
    void Promise.all([loadDicts(), loadRefs()]).catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadRefs]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      templateId: templates[0]?.id ?? "",
      frequencyType: frequencyItems.find((item) => item.itemValue === "daily")?.itemValue ?? frequencyItems[0]?.itemValue ?? "",
      startDate: new Date().toISOString().slice(0, 10),
      status: "disabled"
    });
    setFormOpen(true);
  }

  function openEdit(row: InspectPlanRow) {
    setEditing(row);
    setForm({
      planCode: row.planCode,
      planName: row.planName,
      templateId: row.templateId,
      pointIds: row.pointIds ?? [],
      frequencyType: row.frequencyType,
      cronExpr: row.cronExpr ?? "",
      startDate: formatDateInput(row.startDate),
      endDate: formatDateInput(row.endDate),
      handlerUserIds: row.handlerUserIds ?? [],
      handlerRoleCodes: row.handlerRoleCodes ?? [],
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
    const path = editing ? `/safety/inspect-plans/${editing.id}` : "/safety/inspect-plans";
    await apiRequest<InspectPlanRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "safety-inspect-plan-update" : "safety-inspect-plan-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "巡检计划已更新" : "巡检计划已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: InspectPlanRow) {
    if (!window.confirm(`确认删除巡检计划 ${row.planName}？`)) return;
    await apiRequest<{ id: string }>(`/safety/inspect-plans/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-inspect-plan-delete")
    });
    setMessage("巡检计划已删除");
    await load(pageData.page);
  }

  async function changeStatus(row: InspectPlanRow, action: "enable" | "disable") {
    await apiRequest<InspectPlanRow>(`/safety/inspect-plans/${row.id}/${action}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`safety-inspect-plan-${action}`)
    });
    setMessage(action === "enable" ? "巡检计划已启用" : "巡检计划已停用");
    await load(pageData.page);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_READ} module={SAFETY_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>巡检计划</strong>
            <span>按模板、点位、责任人和频率维护周期性安全巡检计划</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增计划
            </PermissionButton>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <Field label="关键词">
                <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="计划编码 / 名称 / 模板" />
              </Field>
              <SimpleSelect label="巡检模板" value={filters.templateId} allLabel="全部模板" options={templates.map((item) => ({ value: item.id, label: item.templateName }))} onChange={(value) => setFilters((current) => ({ ...current, templateId: value }))} />
              <SelectField label="频率" value={filters.frequencyType} items={frequencyItems} allLabel="全部频率" onChange={(value) => setFilters((current) => ({ ...current, frequencyType: value }))} />
              <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
              <SimpleSelect label="巡检点" value={filters.pointId} allLabel="全部点位" options={points.map((item) => ({ value: item.id, label: `${item.pointCode} ${item.pointName}` }))} onChange={(value) => setFilters((current) => ({ ...current, pointId: value }))} />
              <SimpleSelect label="责任人" value={filters.handlerUserId} allLabel="全部责任人" options={users.map((item) => ({ value: item.id, label: item.displayName }))} onChange={(value) => setFilters((current) => ({ ...current, handlerUserId: value }))} />
            </div>
            <div className="filter-actions">
              <button className="primary-button" type="submit">
                <Search size={16} />
                查询
              </button>
            </div>
          </form>
        </Card>

        <Card className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>计划编码</th>
                <th>计划名称</th>
                <th>巡检模板</th>
                <th>点位</th>
                <th>频率</th>
                <th>责任人</th>
                <th>周期</th>
                <th>下次生成</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.planCode}</td>
                  <td>{row.planName}</td>
                  <td>{row.template?.templateName ?? templateMap.get(row.templateId)?.templateName ?? "-"}</td>
                  <td>{formatPointSummary(row.pointIds, pointMap)}</td>
                  <td><StatusPill dictCode="safety_inspect_frequency" value={row.frequencyType} dicts={dicts} /></td>
                  <td>{formatHandlers(row.handlerUserIds, row.handlerRoleCodes, userMap, roleMap)}</td>
                  <td>{formatDateOnly(row.startDate)} 至 {row.endDate ? formatDateOnly(row.endDate) : "长期"}</td>
                  <td>{formatDateTime(row.nextGenerateTime)}</td>
                  <td><StatusPill dictCode="safety_inspect_plan_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <button className="row-action-button" type="button" onClick={() => setViewing(row)} title="查看">
                        <Eye size={16} />
                        查看
                      </button>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_UPDATE} type="button" onClick={() => openEdit(row)} title="编辑">
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      {row.status === "enabled" ? (
                        <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_DISABLE} type="button" onClick={() => void changeStatus(row, "disable").catch((error: Error) => setMessage(error.message))} title="停用">
                          <PauseCircle size={16} />
                          停用
                        </PermissionButton>
                      ) : (
                        <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_ENABLE} type="button" onClick={() => void changeStatus(row, "enable").catch((error: Error) => setMessage(error.message))} title="启用">
                          <PlayCircle size={16} />
                          启用
                        </PermissionButton>
                      )}
                      <PermissionButton className="row-action-button row-action-button-danger" permission={SYSTEM_PERMISSIONS.SAFETY_INSPECT_PLAN_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))} title="删除">
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={10}><EmptyState /></td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="pagination">
            <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
            <button type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1).catch((error: Error) => setMessage(error.message))}>上一页</button>
            <button type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
          </div>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        {formOpen ? (
          <Drawer size="md" onClose={closeForm}>
            <DrawerHeader title={editing ? "编辑巡检计划" : "新增巡检计划"} description="计划启用后可由后续任务生成器按频率生成巡检任务。" onClose={closeForm} />
            <DrawerForm onSubmit={(event) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="计划编码">
                  <input value={form.planCode} onChange={(event) => setFormValue("planCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="计划名称">
                  <input required value={form.planName} onChange={(event) => setFormValue("planName", event.target.value)} />
                </Field>
                <SimpleSelect label="巡检模板" required value={form.templateId} allLabel="请选择模板" options={templates.map((item) => ({ value: item.id, label: `${item.templateCode} ${item.templateName}` }))} onChange={(value) => setFormValue("templateId", value)} />
                <SelectField label="频率" required value={form.frequencyType} items={frequencyItems} allLabel="请选择频率" onChange={(value) => setFormValue("frequencyType", value)} />
                <Field label="巡检点">
                  <select required multiple value={form.pointIds} onChange={(event) => setFormValue("pointIds", selectedValues(event.currentTarget))}>
                    {points.map((item) => <option key={item.id} value={item.id}>{item.pointCode} {item.pointName}</option>)}
                  </select>
                </Field>
                <Field label="责任人">
                  <select multiple value={form.handlerUserIds} onChange={(event) => setFormValue("handlerUserIds", selectedValues(event.currentTarget))}>
                    {users.map((item) => <option key={item.id} value={item.id}>{item.displayName}（{item.username}）</option>)}
                  </select>
                </Field>
                <Field label="责任角色">
                  <select multiple value={form.handlerRoleCodes} onChange={(event) => setFormValue("handlerRoleCodes", selectedValues(event.currentTarget))}>
                    {roles.map((item) => <option key={item.id} value={item.code}>{item.name}（{item.code}）</option>)}
                  </select>
                </Field>
                <Field label="Cron 表达式">
                  <input value={form.cronExpr} onChange={(event) => setFormValue("cronExpr", event.target.value)} placeholder="自定义频率时填写" />
                </Field>
                <Field label="开始日期">
                  <input required type="date" value={form.startDate} onChange={(event) => setFormValue("startDate", event.target.value)} />
                </Field>
                <Field label="结束日期">
                  <input type="date" value={form.endDate} onChange={(event) => setFormValue("endDate", event.target.value)} />
                </Field>
                <SelectField label="状态" value={form.status} items={statusItems} allLabel="请选择状态" onChange={(value) => setFormValue("status", value)} />
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
            <DrawerHeader eyebrow="巡检计划详情" title={viewing.planName} description={`${viewing.planCode} · ${viewing.template?.templateName ?? templateMap.get(viewing.templateId)?.templateName ?? "未识别模板"}`} onClose={() => setViewing(null)} />
            <DrawerDetailGrid>
              <DrawerDetailItem label="计划编码" value={viewing.planCode} />
              <DrawerDetailItem label="计划名称" value={viewing.planName} />
              <DrawerDetailItem label="巡检模板" value={viewing.template?.templateName ?? templateMap.get(viewing.templateId)?.templateName ?? "-"} />
              <DrawerDetailItem label="巡检点" value={formatPointSummary(viewing.pointIds, pointMap, true)} />
              <DrawerDetailItem label="频率" value={<StatusPill dictCode="safety_inspect_frequency" value={viewing.frequencyType} dicts={dicts} />} />
              <DrawerDetailItem label="责任人" value={formatHandlers(viewing.handlerUserIds, viewing.handlerRoleCodes, userMap, roleMap)} />
              <DrawerDetailItem label="开始日期" value={formatDateOnly(viewing.startDate)} />
              <DrawerDetailItem label="结束日期" value={viewing.endDate ? formatDateOnly(viewing.endDate) : "长期"} />
              <DrawerDetailItem label="Cron 表达式" value={viewing.cronExpr ?? "-"} />
              <DrawerDetailItem label="下次生成" value={formatDateTime(viewing.nextGenerateTime)} />
              <DrawerDetailItem label="上次生成" value={formatDateTime(viewing.lastGenerateTime)} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_inspect_plan_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function setFormValue<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function buildPayload(form: PlanForm) {
  return {
    plan_code: form.planCode.trim() || undefined,
    plan_name: form.planName.trim(),
    template_id: form.templateId,
    point_ids: form.pointIds,
    frequency_type: form.frequencyType,
    cron_expr: form.cronExpr.trim() || undefined,
    start_date: form.startDate,
    end_date: form.endDate || undefined,
    handler_user_ids: form.handlerUserIds,
    handler_role_codes: form.handlerRoleCodes,
    status: form.status || "disabled",
    remark: form.remark.trim() || undefined
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
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
  required,
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
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function SimpleSelect({
  label,
  value,
  options,
  allLabel,
  required,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  allLabel: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

function selectedValues(element: HTMLSelectElement): string[] {
  return Array.from(element.selectedOptions).map((option) => option.value);
}

function formatPointSummary(pointIds: string[] | undefined, pointMap: Map<string, InspectPointRow>, expanded = false) {
  const ids = pointIds ?? [];
  if (ids.length === 0) return "-";
  const names = ids.map((id) => pointMap.get(id)?.pointName ?? id);
  if (expanded || names.length <= 2) return names.join("、");
  return `${names.slice(0, 2).join("、")} 等 ${names.length} 个点位`;
}

function formatHandlers(userIds: string[] | undefined, roleCodes: string[] | undefined, userMap: Map<string, UserRow>, roleMap: Map<string, RoleRow>) {
  const users = (userIds ?? []).map((id) => userMap.get(id)?.displayName ?? id);
  const roles = (roleCodes ?? []).map((code) => roleMap.get(code)?.name ?? code);
  const all = [...users, ...roles];
  return all.length > 0 ? all.join("、") : "-";
}

function formatDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function EmptyState() {
  return <div className="empty-state">暂无巡检计划</div>;
}

function ForbiddenInline() {
  return <main className="content"><Card><div className="empty-state">403，无巡检计划访问权限或 safety 模块未授权</div></Card></main>;
}
