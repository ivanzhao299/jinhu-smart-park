"use client";
import { Card, DataTable, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { CheckCircle2, Edit3, Plus, Search, X, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { resolveUserParkSelection } from "../user-park-options.logic";

interface UserParkContext {
  tenant_id: string;
  park_id: string;
  park_code: string;
  park_name: string;
  is_default: boolean;
  status: string;
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  status: string;
  tenantId: string;
  parkId: string;
  tenantName: string | null;
  parkName: string | null;
  accessibleParks: UserParkContext[];
  loginContextStatus: "ready" | "missing_default_park" | "default_park_not_accessible" | "tenant_disabled" | "tenant_expired";
}

interface TenantRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  defaultParkId: string | null;
  statusName: string;
}

interface ParkOption {
  id: string;
  tenantId: string;
  parkId: string;
  parkCode: string;
  parkName: string;
  status: number;
}

interface TenantLoginSettings {
  tenant: TenantRow;
  parks: ParkOption[];
  enabledModuleCodes: string[];
}

const emptyUsers: PaginatedResult<UserRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyTenants: PaginatedResult<TenantRow> = { items: [], page: 1, page_size: 100, total: 0 };

export default function UsersPage() {
  const [data, setData] = useState(emptyUsers);
  const [tenants, setTenants] = useState(emptyTenants);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [message, setMessage] = useState("");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loginSettings, setLoginSettings] = useState<TenantLoginSettings | null>(null);
  const [loginSettingsLoading, setLoginSettingsLoading] = useState(false);
  const [formTenantId, setFormTenantId] = useState("");
  const [formParkId, setFormParkId] = useState("");
  const [accessibleParkIds, setAccessibleParkIds] = useState<string[]>([]);
  const loginSettingsRequest = useRef(0);

  const selectedTenant = useMemo(
    () => tenants.items.find((item) => item.tenantId === tenantId) ?? tenants.items[0] ?? null,
    [tenantId, tenants.items]
  );
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  async function load(page = 1) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword) params.set("keyword", keyword);
    if (status) params.set("status", status);
    if (tenantId) params.set("tenantId", tenantId);
    const [userResponse, tenantResponse] = await Promise.all([
      apiRequest<PaginatedResult<UserRow>>(`/users?${params.toString()}`, { token }),
      apiRequest<PaginatedResult<TenantRow>>("/tenants?page=1&page_size=100", { token })
    ]);
    setData(userResponse.data);
    setTenants(tenantResponse.data);
  }

  async function loadLoginSettings(targetTenantId: string, existingUser?: UserRow | null) {
    const requestId = ++loginSettingsRequest.current;
    setLoginSettingsLoading(true);
    setLoginSettings(null);
    setFormParkId("");
    setAccessibleParkIds([]);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const tenant = tenants.items.find((item) => item.tenantId === targetTenantId);
    if (!tenant) {
      if (requestId === loginSettingsRequest.current) setLoginSettingsLoading(false);
      setMessage("未找到所选租户，请刷新后重试");
      return;
    }
    try {
      const response = await apiRequest<TenantLoginSettings>(`/tenants/${tenant.id}/login-settings`, { token });
      if (requestId !== loginSettingsRequest.current) return;
      const selection = resolveUserParkSelection(
        {
          tenantId: response.data.tenant.tenantId,
          defaultParkId: response.data.tenant.defaultParkId,
          parkIds: response.data.parks.map((park) => park.parkId)
        },
        existingUser
          ? {
              tenantId: existingUser.tenantId,
              parkId: existingUser.parkId,
              accessibleParkIds: existingUser.accessibleParks.map((park) => park.park_id)
            }
          : null
      );
      setLoginSettings(response.data);
      setFormParkId(selection?.parkId ?? "");
      setAccessibleParkIds(selection?.accessibleParkIds ?? []);
      if (!selection) setMessage("所选租户尚未配置可用园区，暂不能保存用户");
    } finally {
      if (requestId === loginSettingsRequest.current) setLoginSettingsLoading(false);
    }
  }

  async function openCreate() {
    setEditingUser(null);
    if (selectedTenant) {
      setShowCreate(true);
      setFormTenantId(selectedTenant.tenantId);
      await loadLoginSettings(selectedTenant.tenantId);
    } else {
      setShowCreate(false);
      setMessage("暂无可选租户，请先创建租户");
    }
  }

  async function openEdit(row: UserRow) {
    setEditingUser(row);
    setShowCreate(false);
    setFormTenantId(row.tenantId);
    await loadLoginSettings(row.tenantId, row);
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const targetTenantId = String(form.get("tenantId") ?? "").trim();
    const defaultParkId = String(form.get("parkId") ?? "").trim();
    if (loginSettingsLoading || loginSettings?.tenant.tenantId !== targetTenantId || !defaultParkId) {
      throw new Error("园区选项尚未加载完成，请稍后重试");
    }
    const body = {
      tenantId: targetTenantId,
      parkId: defaultParkId,
      accessibleParkIds: [...new Set([defaultParkId, ...accessibleParkIds])],
      username: String(form.get("username") ?? "").trim(),
      displayName: String(form.get("displayName") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      mobile: emptyToNull(form.get("mobile")),
      email: emptyToNull(form.get("email")),
      status: String(form.get("status") ?? "enabled")
    };
    if (editingUser) {
      await apiRequest<UserRow>(`/users/${editingUser.id}`, {
        method: "PATCH",
        token,
        idempotencyKey: createIdempotencyKey("user-update"),
        body: {
          tenantId: body.tenantId,
          parkId: body.parkId,
          accessibleParkIds: body.accessibleParkIds,
          displayName: body.displayName,
          mobile: body.mobile,
          email: body.email,
          status: body.status
        }
      });
    } else {
      await apiRequest<UserRow>("/users", {
        method: "POST",
        token,
        idempotencyKey: createIdempotencyKey("user"),
        body
      });
    }
    setEditingUser(null);
    setShowCreate(false);
    setLoginSettings(null);
    setFormTenantId("");
    setFormParkId("");
    setAccessibleParkIds([]);
    await load(data.page);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title">
          <strong>用户管理</strong>
          <span>维护账号、所属租户、默认园区、可访问园区和登录上下文状态</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.USER_CREATE} type="button" onClick={() => void openCreate().catch((error: Error) => setMessage(error.message))}>
          <Plus size={16} />
          新增用户
        </PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="system-grid" onSubmit={(event) => { event.preventDefault(); void load().catch((error: Error) => setMessage(error.message)); }}>
          <div className="field">
            <label htmlFor="keyword">关键词</label>
            <input id="keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="账号 / 姓名" />
          </div>
          <div className="field">
            <label htmlFor="tenant">所属租户</label>
            <select id="tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">全部租户</option>
              {tenants.items.map((item) => <option key={item.id} value={item.tenantId}>{item.tenantName}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">状态</label>
            <select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </div>
          <div className="filter-actions"><button className="primary-button" type="submit"><Search size={16} />查询</button></div>
        </form>
      </section>

      <Card>
        <div className="system-toolbar">
          <h2 className="panel-title">用户列表</h2>
          <span className="muted-text">共 {data.total} 个用户</span>
        </div>
        <div className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>账号</th>
                <th>所属租户</th>
                <th>默认园区</th>
                <th>可访问园区</th>
                <th>联系方式</th>
                <th>状态</th>
                <th>登录上下文</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.username}</strong><br /><span className="muted-text">{item.displayName}</span></td>
                  <td>{item.tenantName ?? item.tenantId}<br /><span className="muted-text">{item.tenantId}</span></td>
                  <td>{item.parkName ?? item.parkId}<br /><span className="muted-text">{item.parkId}</span></td>
                  <td>{item.accessibleParks.length > 0 ? item.accessibleParks.map((park) => park.park_name).join("、") : "未绑定"}</td>
                  <td>{item.mobile ?? "-"}<br /><span className="muted-text">{item.email ?? "-"}</span></td>
                  <td><StatusBadge status={item.status} /></td>
                  <td><LoginContextBadge status={item.loginContextStatus} /></td>
                  <td>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.USER_UPDATE} type="button" title="编辑登录上下文" onClick={() => void openEdit(item).catch((error: Error) => setMessage(error.message))}>
                      <Edit3 size={16} />编辑
                    </PermissionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        <div className="task-item">
          <span>第 {data.page} / {totalPages} 页</span>
          <span className="pagination-actions"><button className="pagination-button" type="button" disabled={data.page <= 1} onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button><button className="pagination-button" type="button" disabled={data.page >= totalPages} onClick={() => void load(data.page + 1)}>下一页</button></span>
        </div>
      </Card>

      {(showCreate || editingUser) ? (
        <Drawer size="lg" onClose={() => { loginSettingsRequest.current += 1; setShowCreate(false); setEditingUser(null); setLoginSettings(null); setLoginSettingsLoading(false); }}>
          <DrawerHeader
            eyebrow="系统管理"
            title={editingUser ? "编辑用户登录上下文" : "新增用户"}
            description="维护用户账号、登录上下文与可访问园区。"
            onClose={() => { loginSettingsRequest.current += 1; setShowCreate(false); setEditingUser(null); setLoginSettings(null); setLoginSettingsLoading(false); }}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void saveUser(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              <div className="field">
                <label>所属租户</label>
                <select
                  name="tenantId"
                  value={formTenantId}
                  onChange={(event) => {
                    const nextTenantId = event.target.value;
                    setFormTenantId(nextTenantId);
                    void loadLoginSettings(
                      nextTenantId,
                      editingUser?.tenantId === nextTenantId ? editingUser : null
                    ).catch((error: Error) => setMessage(error.message));
                  }}
                >
                  {tenants.items.map((item) => <option key={item.id} value={item.tenantId}>{item.tenantName} / {item.tenantId}</option>)}
                </select>
              </div>
              <div className="field">
                <label>默认园区</label>
                <select name="parkId" value={formParkId} onChange={(event) => setFormParkId(event.target.value)} disabled={loginSettingsLoading || !loginSettings?.parks.length} required>
                  <option value="">{loginSettingsLoading ? "园区加载中…" : "请选择园区"}</option>
                  {(loginSettings?.parks ?? []).map((park) => <option key={park.parkId} value={park.parkId}>{park.parkName} / {park.parkId}</option>)}
                </select>
              </div>
              <div className="field"><label>账号</label><input name="username" defaultValue={editingUser?.username ?? ""} readOnly={Boolean(editingUser)} required /></div>
              <div className="field"><label>姓名</label><input name="displayName" defaultValue={editingUser?.displayName ?? ""} required /></div>
              {!editingUser ? <div className="field"><label>初始密码</label><input name="password" type="password" minLength={8} required /></div> : null}
              <div className="field"><label>手机</label><input name="mobile" defaultValue={editingUser?.mobile ?? ""} /></div>
              <div className="field"><label>邮箱</label><input name="email" defaultValue={editingUser?.email ?? ""} /></div>
              <div className="field"><label>状态</label><select name="status" defaultValue={editingUser?.status ?? "enabled"}><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field">
                <label>可访问园区</label>
                <div className="checkbox-list">
                  {(loginSettings?.parks ?? []).map((park) => {
                    return (
                      <label key={park.parkId} className="checkbox-row">
                        <input
                          name={`park.${park.parkId}`}
                          type="checkbox"
                          checked={accessibleParkIds.includes(park.parkId)}
                          disabled={park.parkId === formParkId}
                          onChange={(event) => setAccessibleParkIds((current) => event.target.checked
                            ? [...new Set([...current, park.parkId])]
                            : current.filter((id) => id !== park.parkId))}
                        />
                        <span>{park.parkName} / {park.parkId}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => { loginSettingsRequest.current += 1; setShowCreate(false); setEditingUser(null); setLoginSettings(null); setLoginSettingsLoading(false); }}><XCircle size={16} />取消</button>
              <button className="primary-button" type="submit" disabled={loginSettingsLoading || !formParkId}><CheckCircle2 size={16} />保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="status-pill">{status === "enabled" ? "启用" : "停用"}</span>;
}

function LoginContextBadge({ status }: { status: UserRow["loginContextStatus"] }) {
  const labels: Record<UserRow["loginContextStatus"], string> = {
    ready: "可登录",
    missing_default_park: "默认园区无效",
    default_park_not_accessible: "默认园区未授权",
    tenant_disabled: "租户停用",
    tenant_expired: "租户过期"
  };
  return <span className="status-pill">{labels[status]}</span>;
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
