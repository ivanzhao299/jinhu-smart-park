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
import { Edit3, Eye, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import { fetchReferenceFormOptions } from "../../../lib/reference-data";

const SAFETY_MODULE = "safety";
const CONTACT_ENTITY = "emergency_contact";

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

interface OrgRow {
  id: string;
  orgCode: string;
  orgName: string;
  status?: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName?: string | null;
  realName?: string | null;
  status?: string;
}

interface EmergencyContactRow {
  id: string;
  code: string | null;
  contactCode: string;
  contactName: string;
  contactRole: string | null;
  mobile: string;
  email: string | null;
  orgId: string | null;
  userId: string | null;
  dutyType: string | null;
  priorityLevel: number;
  notifyChannels: string[];
  status: string;
  updateTime: string;
  remark: string | null;
}

interface ContactForm {
  contactCode: string;
  contactName: string;
  contactRole: string;
  mobile: string;
  email: string;
  orgId: string;
  userId: string;
  dutyType: string;
  priorityLevel: string;
  notifyChannels: string;
  status: string;
  remark: string;
}

interface Filters {
  keyword: string;
  contactRole: string;
  dutyType: string;
  status: string;
}

type DictMap = Record<string, DictItemRow[]>;

const emptyPage: PaginatedResult<EmergencyContactRow> = { items: [], total: 0, page: 1, page_size: 20 };
const emptyFilters: Filters = { keyword: "", contactRole: "", dutyType: "", status: "" };
const emptyForm: ContactForm = {
  contactCode: "",
  contactName: "",
  contactRole: "",
  mobile: "",
  email: "",
  orgId: "",
  userId: "",
  dutyType: "",
  priorityLevel: "0",
  notifyChannels: "site_message",
  status: "enabled",
  remark: ""
};

export default function SafetyEmergencyContactsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<EmergencyContactRow>>(emptyPage);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dicts, setDicts] = useState<DictMap>({});
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmergencyContactRow | null>(null);
  const [viewing, setViewing] = useState<EmergencyContactRow | null>(null);
  const [message, setMessage] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const contactRoles = dicts.safety_emergency_contact_role ?? [];
  const dutyTypes = dicts.safety_emergency_duty_type ?? [];
  const statusItems = dicts.safety_emergency_contact_status ?? [];

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20", sort: "priority_level" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.contactRole) params.set("contact_role", filters.contactRole);
    if (filters.dutyType) params.set("duty_type", filters.dutyType);
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<PaginatedResult<EmergencyContactRow>>(`/safety/emergency-contacts?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const typeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const typeMap = new Map(typeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["safety_emergency_contact_role", "safety_emergency_duty_type", "safety_emergency_contact_status"];
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

  const loadReferenceData = useCallback(async () => {
    const references = await fetchReferenceFormOptions();
    setOrgs(references.orgs as OrgRow[]);
    setUsers((references.users as UserRow[]).filter((item) => item.status !== "disabled"));
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadReferenceData().catch((error: Error) => setMessage(error.message));
  }, [loadDicts, loadReferenceData]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      contactRole: contactRoles[0]?.itemValue ?? "",
      dutyType: dutyTypes[0]?.itemValue ?? "",
      status: "enabled"
    });
    setFormOpen(true);
  }

  function openEdit(row: EmergencyContactRow) {
    setEditing(row);
    setForm({
      contactCode: row.contactCode,
      contactName: row.contactName,
      contactRole: row.contactRole ?? "",
      mobile: row.mobile,
      email: row.email ?? "",
      orgId: row.orgId ?? "",
      userId: row.userId ?? "",
      dutyType: row.dutyType ?? "",
      priorityLevel: String(row.priorityLevel ?? 0),
      notifyChannels: row.notifyChannels?.join(",") ?? "",
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
    const path = editing ? `/safety/emergency-contacts/${editing.id}` : "/safety/emergency-contacts";
    await apiRequest<EmergencyContactRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "safety-emergency-contact-update" : "safety-emergency-contact-create"),
      body: buildPayload(form)
    });
    setMessage(editing ? "应急联系人已更新" : "应急联系人已新增");
    closeForm();
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: EmergencyContactRow) {
    if (!window.confirm(`确认删除应急联系人 ${row.contactName}？`)) return;
    await apiRequest<{ id: string }>(`/safety/emergency-contacts/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("safety-emergency-contact-delete")
    });
    setMessage("应急联系人已删除");
    await load(pageData.page);
  }

  function setFormValue<K extends keyof ContactForm>(key: K, value: ContactForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const canViewMobile = canViewField(authUser, SAFETY_MODULE, CONTACT_ENTITY, "mobile");
  const canViewEmail = canViewField(authUser, SAFETY_MODULE, CONTACT_ENTITY, "email");
  const canEditMobile = canEditField(authUser, SAFETY_MODULE, CONTACT_ENTITY, "mobile");
  const canEditEmail = canEditField(authUser, SAFETY_MODULE, CONTACT_ENTITY, "email");

  return (
    <PermissionGuard module={SAFETY_MODULE} permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_READ} fallback={<Forbidden />}>
      <main className="page-container">
        <Card className="page-header">
          <div>
            <h1>应急联系人</h1>
            <p>维护应急响应联系人、值守角色和通知渠道，保障应急链路清晰可追踪。</p>
          </div>
          <div className="page-actions">
            <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
              <RefreshCw size={16} />
              刷新
            </button>
            <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_CREATE} type="button" onClick={openCreate}>
              <Plus size={16} />
              新增联系人
            </PermissionButton>
          </div>
        </Card>

        <Card className="filter-bar">
          <Field label="关键词">
            <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="姓名 / 手机 / 邮箱" />
          </Field>
          <SelectField label="联系人角色" value={filters.contactRole} items={contactRoles} allLabel="全部角色" onChange={(value) => setFilters((current) => ({ ...current, contactRole: value }))} />
          <SelectField label="值守类型" value={filters.dutyType} items={dutyTypes} allLabel="全部类型" onChange={(value) => setFilters((current) => ({ ...current, dutyType: value }))} />
          <SelectField label="状态" value={filters.status} items={statusItems} allLabel="全部状态" onChange={(value) => setFilters((current) => ({ ...current, status: value }))} />
          <button className="primary-button" type="button" onClick={() => void load(1).catch((error: Error) => setMessage(error.message))}>
            <Search size={16} />
            查询
          </button>
        </Card>

        {message ? <p className="form-error">{message}</p> : null}

        <Card className="page-content">
          <div className="task-item">
            <h2 className="panel-title">联系人列表</h2>
            <span>共 {pageData.total} 条</span>
          </div>
          <DataTable className="safety-emergency-contacts-table allow-horizontal-table">
            <thead>
              <tr>
                <th>联系人编码</th>
                <th>姓名</th>
                <th>角色</th>
                <th>手机号</th>
                <th>邮箱</th>
                <th>值守类型</th>
                <th>优先级</th>
                <th>通知渠道</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.contactCode}</td>
                  <td>{row.contactName}</td>
                  <td><StatusPill dictCode="safety_emergency_contact_role" value={row.contactRole} dicts={dicts} /></td>
                  <td>{canViewMobile ? displaySecuredField(authUser, "mobile", row.mobile) : "-"}</td>
                  <td>{canViewEmail ? displaySecuredField(authUser, "email", row.email) : "-"}</td>
                  <td><StatusPill dictCode="safety_emergency_duty_type" value={row.dutyType} dicts={dicts} /></td>
                  <td>{row.priorityLevel}</td>
                  <td>{row.notifyChannels?.join(" / ") || "-"}</td>
                  <td><StatusPill dictCode="safety_emergency_contact_status" value={row.status} dicts={dicts} /></td>
                  <td>
                    <DataTableActions>
                      <button className="table-action-button" type="button" onClick={() => setViewing(row)}><Eye size={16} />查看</button>
                      <PermissionButton className="table-action-button" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_UPDATE} type="button" onClick={() => openEdit(row)}><Edit3 size={16} />编辑</PermissionButton>
                      <PermissionButton className="table-action-button danger" permission={SYSTEM_PERMISSIONS.SAFETY_EMERGENCY_CONTACT_DELETE} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} />删除</PermissionButton>
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
              title={editing ? "编辑联系人" : "新增联系人"}
              description="手机号为敏感字段，返回和展示会按字段权限处理。"
              onClose={closeForm}
              closeIcon={<X size={18} />}
            />
            <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void save(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <Field label="联系人编码">
                  <input value={form.contactCode} onChange={(event) => setFormValue("contactCode", event.target.value)} placeholder="留空自动生成" />
                </Field>
                <Field label="联系人姓名">
                  <input required value={form.contactName} onChange={(event) => setFormValue("contactName", event.target.value)} />
                </Field>
                <SelectField label="联系人角色" value={form.contactRole} items={contactRoles} allLabel="请选择角色" onChange={(value) => setFormValue("contactRole", value)} />
                <Field label="手机号">
                  <input required value={form.mobile} disabled={!canEditMobile} onChange={(event) => setFormValue("mobile", event.target.value)} />
                </Field>
                <Field label="邮箱">
                  <input type="email" value={form.email} disabled={!canEditEmail} onChange={(event) => setFormValue("email", event.target.value)} />
                </Field>
                <SelectField label="值守类型" value={form.dutyType} items={dutyTypes} allLabel="请选择类型" onChange={(value) => setFormValue("dutyType", value)} />
                <Field label="优先级">
                  <input type="number" min={0} value={form.priorityLevel} onFocus={(event) => event.target.select()} onChange={(event) => setFormValue("priorityLevel", event.target.value)} />
                </Field>
                <Field label="通知渠道">
                  <input value={form.notifyChannels} onChange={(event) => setFormValue("notifyChannels", event.target.value)} placeholder="site_message,sms,wechat,email" />
                </Field>
                <ReferenceSelectField
                  label="所属组织"
                  value={form.orgId}
                  allLabel="暂不关联组织"
                  items={orgs.map((item) => ({ id: item.id, label: formatOrgLabel(item) }))}
                  onChange={(value) => setFormValue("orgId", value)}
                />
                <ReferenceSelectField
                  label="关联用户"
                  value={form.userId}
                  allLabel="暂不关联用户"
                  items={users.map((item) => ({ id: item.id, label: displayUserName(item) }))}
                  onChange={(value) => setFormValue("userId", value)}
                />
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
              eyebrow="联系人详情"
              title={viewing.contactName}
              description={`${viewing.contactCode} · ${labelFor(contactRoles, viewing.contactRole)}`}
              onClose={() => setViewing(null)}
            />
            <DrawerDetailGrid>
              <DrawerDetailItem label="联系人编码" value={viewing.contactCode} />
              <DrawerDetailItem label="角色" value={<StatusPill dictCode="safety_emergency_contact_role" value={viewing.contactRole} dicts={dicts} />} />
              <DrawerDetailItem label="手机号" value={canViewMobile ? displaySecuredField(authUser, "mobile", viewing.mobile) : "-"} />
              <DrawerDetailItem label="邮箱" value={canViewEmail ? displaySecuredField(authUser, "email", viewing.email) : "-"} />
              <DrawerDetailItem label="值守类型" value={<StatusPill dictCode="safety_emergency_duty_type" value={viewing.dutyType} dicts={dicts} />} />
              <DrawerDetailItem label="优先级" value={viewing.priorityLevel} />
              <DrawerDetailItem label="通知渠道" value={viewing.notifyChannels?.join(" / ") || "-"} />
              <DrawerDetailItem label="状态" value={<StatusPill dictCode="safety_emergency_contact_status" value={viewing.status} dicts={dicts} />} />
              <DrawerDetailItem label="所属组织" value={viewing.orgId ? formatOrgLabel(orgs.find((item) => item.id === viewing.orgId) ?? null) : "-"} />
              <DrawerDetailItem label="关联用户" value={viewing.userId ? displayUserName(users.find((item) => item.id === viewing.userId) ?? null) : "-"} />
              <DrawerDetailItem label="备注" value={viewing.remark ?? "-"} />
            </DrawerDetailGrid>
          </Drawer>
        ) : null}
      </main>
    </PermissionGuard>
  );

  function displaySecuredField(user: ReturnType<typeof useAuthUser>, field: string, value: unknown): string {
    if (!canViewField(user, SAFETY_MODULE, CONTACT_ENTITY, field)) return "-";
    const masked = maskField(user, SAFETY_MODULE, CONTACT_ENTITY, field, value);
    return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
  }
}

function buildPayload(form: ContactForm) {
  return {
    contact_code: form.contactCode.trim() || undefined,
    contact_name: form.contactName.trim(),
    contact_role: form.contactRole || undefined,
    mobile: form.mobile.trim(),
    email: form.email.trim() || undefined,
    org_id: form.orgId.trim() || undefined,
    user_id: form.userId.trim() || undefined,
    duty_type: form.dutyType || undefined,
    priority_level: Number(form.priorityLevel || 0),
    notify_channels: form.notifyChannels.split(",").map((item) => item.trim()).filter(Boolean),
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

function ReferenceSelectField({
  label,
  value,
  items,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  items: Array<{ id: string; label: string }>;
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  );
}

function labelFor(items: DictItemRow[], value?: string | null) {
  if (!value) return "-";
  return items.find((item) => String(item.itemValue) === String(value))?.itemLabel ?? value;
}

function formatOrgLabel(org?: OrgRow | null) {
  if (!org) return "-";
  return `${org.orgCode} ${org.orgName}`.trim();
}

function displayUserName(user?: UserRow | null) {
  if (!user) return "-";
  return user.displayName ?? user.realName ?? user.username;
}

function EmptyState() {
  return <p className="muted-text">暂无应急联系人</p>;
}

function Forbidden() {
  return (
    <main className="page-container">
      <Card className="page-content">
        <h1>403</h1>
        <p>无权访问应急联系人，或当前租户未开通安全应急能力。</p>
      </Card>
    </main>
  );
}
