"use client";

import { Card, DataTable, DataTableActions, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { Edit3, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

const WORKORDER_MODULE = "workorder";

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

interface SlaRuleRow {
  id: string;
  woType: string;
  urgency: string;
  priority: string;
  dispatchSlaMin: number;
  finishSlaMin: number;
  escalateRoleCode: string | null;
  status: string;
  updateTime: string;
  remark: string | null;
}

interface Filters {
  woType: string;
  urgency: string;
  priority: string;
  status: string;
}

interface SlaRuleForm {
  woType: string;
  urgency: string;
  priority: string;
  dispatchSlaMin: string;
  finishSlaMin: string;
  escalateRoleCode: string;
  status: string;
  remark: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<SlaRuleRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { woType: "", urgency: "", priority: "", status: "" };
const emptyForm: SlaRuleForm = {
  woType: "",
  urgency: "",
  priority: "",
  dispatchSlaMin: "30",
  finishSlaMin: "240",
  escalateRoleCode: "",
  status: "enabled",
  remark: ""
};
const statusOptions = [
  { value: "enabled", label: "启用" },
  { value: "disabled", label: "停用" }
];

export default function WorkOrderSlaRulesPage() {
  const [pageData, setPageData] = useState<PaginatedResult<SlaRuleRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [form, setForm] = useState<SlaRuleForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const typeItems = dicts.workorder_type ?? [];
  const urgencyItems = dicts.workorder_urgency ?? [];
  const priorityItems = dicts.workorder_priority ?? [];
  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.woType) params.set("wo_type", filters.woType);
    if (filters.urgency) params.set("urgency", filters.urgency);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<SlaRuleRow>>(`/work-orders/sla-rules?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["workorder_type", "workorder_urgency", "workorder_priority"];
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
    setEditingId(null);
    setForm({
      ...emptyForm,
      woType: typeItems[0]?.itemValue ?? "",
      urgency: urgencyItems.find((item) => item.itemValue === "normal")?.itemValue ?? urgencyItems[0]?.itemValue ?? "",
      priority: priorityItems.find((item) => item.itemValue === "medium")?.itemValue ?? priorityItems[0]?.itemValue ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(row: SlaRuleRow) {
    setEditingId(row.id);
    setForm({
      woType: row.woType,
      urgency: row.urgency,
      priority: row.priority,
      dispatchSlaMin: String(row.dispatchSlaMin),
      finishSlaMin: String(row.finishSlaMin),
      escalateRoleCode: row.escalateRoleCode ?? "",
      status: row.status,
      remark: row.remark ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      wo_type: form.woType,
      urgency: form.urgency,
      priority: form.priority,
      dispatch_sla_min: Number(form.dispatchSlaMin),
      finish_sla_min: Number(form.finishSlaMin),
      escalate_role_code: form.escalateRoleCode.trim() || undefined,
      status: form.status,
      remark: form.remark.trim() || undefined
    };
    await apiRequest<SlaRuleRow>(editingId ? `/work-orders/sla-rules/${editingId}` : "/work-orders/sla-rules", {
      method: editingId ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editingId ? "work-order-sla-update" : "work-order-sla-create"),
      body
    });
    setShowForm(false);
    setEditingId(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: SlaRuleRow) {
    if (!window.confirm(`确认删除 SLA 规则「${labelFor(typeItems, row.woType)} / ${labelFor(urgencyItems, row.urgency)} / ${labelFor(priorityItems, row.priority)}」？`)) {
      return;
    }
    await apiRequest<{ id: string }>(`/work-orders/sla-rules/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("work-order-sla-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  return (
    <PermissionGuard permission={SYSTEM_PERMISSIONS.WORKORDER_SLA_READ} module={WORKORDER_MODULE} fallback={<ForbiddenInline />}>
      <main className="content">
        <header className="header">
          <div className="header-title">
            <strong>SLA 规则</strong>
            <span>按工单类型、紧急程度和优先级配置派单与处理时限</span>
          </div>
          <div className="page-actions">
            <button className="primary-button secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.WORKORDER_SLA_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增规则
            </PermissionButton>
          </div>
        </header>

        <Card>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
            <div className="dashboard-grid">
              <SelectField label="工单类型" value={filters.woType} items={typeItems} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, woType: value }))} />
              <SelectField label="紧急程度" value={filters.urgency} items={urgencyItems} allLabel="全部紧急程度" onChange={(value) => setFilters((current) => ({ ...current, urgency: value }))} />
              <SelectField label="优先级" value={filters.priority} items={priorityItems} allLabel="全部优先级" onChange={(value) => setFilters((current) => ({ ...current, priority: value }))} />
              <Field label="状态">
                <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">全部状态</option>
                  {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
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
                <th>规则对象</th>
                <th>优先级 / 紧急程度</th>
                <th>SLA 时限</th>
                <th>升级角色</th>
                <th>状态 / 更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <StackedCell title={labelFor(typeItems, row.woType)} meta={row.remark ?? "工单 SLA 规则"} />
                  </td>
                  <td>
                    <StackedCell title={<DictBadge items={priorityItems} value={row.priority} />} meta={labelFor(urgencyItems, row.urgency)} />
                  </td>
                  <td>
                    <StackedCell title={`派单 ${row.dispatchSlaMin} 分钟`} meta={`处理 ${row.finishSlaMin} 分钟`} />
                  </td>
                  <td>{row.escalateRoleCode ?? "-"}</td>
                  <td>
                    <StackedCell title={<StatusBadge value={row.status} />} meta={formatDateTime(row.updateTime)} />
                  </td>
                  <td>
                    <DataTableActions>
                      <PermissionButton className="row-action-button" permission={SYSTEM_PERMISSIONS.WORKORDER_SLA_UPDATE} type="button" onClick={() => openEdit(row)}>
                        <Edit3 size={16} />
                        编辑
                      </PermissionButton>
                      <PermissionButton className="row-action-button row-action-danger" permission={SYSTEM_PERMISSIONS.WORKORDER_SLA_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                        <Trash2 size={16} />
                        删除
                      </PermissionButton>
                    </DataTableActions>
                  </td>
                </tr>
              ))}
              {pageData.items.length === 0 ? (
                <tr>
                  <td colSpan={6}>暂无 SLA 规则</td>
                </tr>
              ) : null}
            </tbody>
          </DataTable>
          <div className="task-item">
            <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
            <span>
              <button type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
              <button type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
            </span>
          </div>
        </Card>

        {showForm ? (
          <Drawer size="md" onClose={() => setShowForm(false)}>
            <DrawerHeader
              eyebrow={editingId ? "编辑 SLA" : "新增 SLA"}
              title={editingId ? "编辑 SLA 规则" : "新增 SLA 规则"}
              description="同一园区内工单类型、紧急程度和优先级组合不可重复。"
              onClose={() => setShowForm(false)}
              closeIcon={<X size={16} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <SelectField label="工单类型" value={form.woType} required items={typeItems} onChange={(value) => setForm((current) => ({ ...current, woType: value }))} />
                <SelectField label="紧急程度" value={form.urgency} required items={urgencyItems} onChange={(value) => setForm((current) => ({ ...current, urgency: value }))} />
                <SelectField label="优先级" value={form.priority} required items={priorityItems} onChange={(value) => setForm((current) => ({ ...current, priority: value }))} />
                <NumberField label="派单 SLA（分钟）" value={form.dispatchSlaMin} min={0} onChange={(value) => setForm((current) => ({ ...current, dispatchSlaMin: value }))} />
                <NumberField label="处理 SLA（分钟）" value={form.finishSlaMin} min={0} onChange={(value) => setForm((current) => ({ ...current, finishSlaMin: value }))} />
                <Field label="状态">
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                    {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <TextField label="升级角色编码" value={form.escalateRoleCode} placeholder="可选，例如 PROPERTY_MANAGER" onChange={(value) => setForm((current) => ({ ...current, escalateRoleCode: value }))} />
                <TextField label="备注" value={form.remark} onChange={(value) => setForm((current) => ({ ...current, remark: value }))} />
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>取消</button>
                <button className="primary-button" type="submit">保存</button>
              </DrawerFooter>
            </DrawerForm>
          </Drawer>
        ) : null}

        {message ? <p className="status-pill">{message}</p> : null}
      </main>
    </PermissionGuard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange
}: {
  label: string;
  value: string;
  min: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        min={min}
        required
        type="number"
        value={value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function StackedCell({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <span className="ds-table-stacked-cell">
      <strong>{title}</strong>
      {meta ? <small>{meta}</small> : null}
    </span>
  );
}

function SelectField({
  label,
  value,
  required,
  items,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  items: DictItemRow[];
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel ?? "请选择"}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </Field>
  );
}

function DictBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  const item = items.find((candidate) => candidate.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function StatusBadge({ value }: { value: string }) {
  const enabled = value === "enabled";
  return <span className={`status-pill ${enabled ? "status-success" : "status-muted"}`}>{enabled ? "启用" : "停用"}</span>;
}

function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function statusClass(tagType?: string | null): string {
  switch (tagType) {
    case "success":
      return "status-success";
    case "warning":
      return "status-warning";
    case "danger":
      return "status-danger";
    case "primary":
      return "status-primary";
    case "info":
      return "status-info";
    default:
      return "status-muted";
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function ForbiddenInline() {
  return (
    <main className="content">
      <Card>403：无权访问工单 SLA 规则。</Card>
    </main>
  );
}
