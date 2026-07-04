"use client";
import { Card, DataTable, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { CheckCircle2, Plus, Search, Settings2, X, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface TenantRow {
  id: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  tenantType: string;
  contactName: string | null;
  contactMobile: string | null;
  websites: string[];
  domains: string[];
  status: number;
  statusName: string;
  expireTime: string | null;
  maxUsers: number;
  maxParks: number;
  planCode: string | null;
  defaultParkId: string | null;
  expireWarning: string | null;
  userCount: number;
  parkCount: number;
  enabledModuleCount: number;
}

interface ModuleRow {
  id: string;
  moduleCode: string;
  moduleName: string;
  moduleGroup: string;
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

interface PlanRow {
  id: string;
  planCode: string;
  planName: string;
  moduleCodes: string[];
  permissionCodes?: string[];
  maxUsers?: number;
  maxParks?: number;
}

const emptyTenants: PaginatedResult<TenantRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyPlans: PaginatedResult<PlanRow> = { items: [], page: 1, page_size: 50, total: 0 };
const emptyModules: PaginatedResult<ModuleRow> = { items: [], page: 1, page_size: 200, total: 0 };

export default function TenantsPage() {
  const [tenants, setTenants] = useState(emptyTenants);
  const [plans, setPlans] = useState(emptyPlans);
  const [modules, setModules] = useState(emptyModules);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<TenantRow | null>(null);
  const [settings, setSettings] = useState<TenantLoginSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  async function load(page = 1) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword) params.set("keyword", keyword);
    if (status) params.set("status", status);
    const [tenantResponse, planResponse, moduleResponse] = await Promise.all([
      apiRequest<PaginatedResult<TenantRow>>(`/tenants?${params.toString()}`, { token }),
      apiRequest<PaginatedResult<PlanRow>>("/plans?page=1&page_size=50", { token }),
      apiRequest<PaginatedResult<ModuleRow>>("/modules?page=1&page_size=200", { token })
    ]);
    setTenants(tenantResponse.data);
    setPlans(planResponse.data);
    setModules(moduleResponse.data);
    setMessage("");
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const form = new FormData(event.currentTarget);
    const expireDate = String(form.get("expireTime") ?? "");
    await apiRequest<TenantRow>("/tenants", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("tenant"),
      body: {
        tenantCode: String(form.get("tenantCode") ?? "").trim(),
        tenantName: String(form.get("tenantName") ?? "").trim(),
        tenantType: String(form.get("tenantType") ?? "park_operator").trim(),
        contactName: emptyToNull(form.get("contactName")),
        contactMobile: emptyToNull(form.get("contactMobile")),
        planCode: emptyToNull(form.get("planCode")),
        expireTime: expireDate ? `${expireDate}T23:59:59+08:00` : null,
        maxUsers: Number(form.get("maxUsers") ?? 0),
        maxParks: Number(form.get("maxParks") ?? 0),
        websites: splitCsv(form.get("websites")),
        domains: splitCsv(form.get("domains")),
        parkCode: String(form.get("parkCode") ?? "").trim(),
        parkName: String(form.get("parkName") ?? "").trim(),
        adminUsername: String(form.get("adminUsername") ?? "").trim(),
        adminPassword: String(form.get("adminPassword") ?? ""),
        adminDisplayName: String(form.get("adminDisplayName") ?? "").trim(),
        adminMobile: emptyToNull(form.get("adminMobile")),
        adminEmail: emptyToNull(form.get("adminEmail"))
      }
    });
    setShowCreate(false);
    await load(tenants.page);
  }

  async function toggleTenant(row: TenantRow) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const action = row.statusName === "enabled" ? "disable" : "enable";
    await apiRequest<TenantRow>(`/tenants/${row.id}/${action}`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey(`tenant-${action}`)
    });
    await load(tenants.page);
  }

  async function openLoginSettings(row: TenantRow) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    setSettingsTarget(row);
    setSettingsLoading(true);
    setSettings(null);
    setMessage("");
    try {
      const response = await apiRequest<TenantLoginSettings>(`/tenants/${row.id}/login-settings`, { token });
      setSettings(response.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载登录配置失败");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveLoginSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const form = new FormData(event.currentTarget);
    const expireDate = String(form.get("expireTime") ?? "");
    const moduleCodes = modules.items
      .map((item) => item.moduleCode)
      .filter((code) => form.get(`module.${code}`) === "on");
    const response = await apiRequest<TenantLoginSettings>(`/tenants/${settings.tenant.id}/login-settings`, {
      method: "PATCH",
      token,
      body: {
        defaultParkId: emptyToNull(form.get("defaultParkId")),
        status: String(form.get("status") ?? "enabled"),
        planCode: emptyToNull(form.get("planCode")),
        expireTime: expireDate ? `${expireDate}T23:59:59+08:00` : null,
        moduleCodes
      }
    });
    setSettings(response.data);
    setSettingsTarget(response.data.tenant);
    await load(tenants.page);
  }

  function closeSettings() {
    setSettingsTarget(null);
    setSettings(null);
    setSettingsLoading(false);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title">
          <strong>租户管理</strong>
          <span>开通租户、绑定套餐、控制账号和园区配额</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.TENANT_MANAGE} type="button" onClick={() => setShowCreate(true)}>
          <Plus size={16} />开通租户
        </PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="system-grid" onSubmit={(event) => { event.preventDefault(); void load().catch((error: Error) => setMessage(error.message)); }}>
          <div className="field">
            <label>关键词</label>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="租户编码 / 名称 / 联系人" />
          </div>
          <div className="field">
            <label>状态</label>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
              <option value="expired">过期</option>
            </select>
          </div>
          <div className="filter-actions"><button className="primary-button" type="submit"><Search size={16} />查询</button></div>
        </form>
      </section>

      <Card>
        <div className="system-toolbar">
          <h2 className="panel-title">租户列表</h2>
          <span className="muted-text">共 {tenants.total} 个租户</span>
        </div>
        <div className="table-scroll">
          <DataTable>
            <thead>
              <tr>
                <th>租户</th>
                <th>套餐</th>
                <th>联系人</th>
                <th>配额</th>
                <th>模块</th>
                <th>默认园区</th>
                <th>到期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tenants.items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.tenantName}</strong><br /><span className="muted-text">{item.tenantCode} / {item.tenantId}</span></td>
                  <td>{item.planCode ?? "-"}</td>
                  <td>{item.contactName ?? "-"}<br /><span className="muted-text">{item.contactMobile ?? "-"}</span></td>
                  <td>用户 {item.userCount}/{quota(item.maxUsers)}<br />园区 {item.parkCount}/{quota(item.maxParks)}</td>
                  <td>{item.enabledModuleCount}</td>
                  <td>{item.defaultParkId ?? "未设置"}</td>
                  <td>{item.expireTime ? new Date(item.expireTime).toLocaleDateString() : "长期"}<br />{item.expireWarning ? <span className="status-pill">{item.expireWarning}</span> : null}</td>
                  <td><StatusBadge status={item.statusName} /></td>
                  <td>
                    <span className="data-table-actions">
                      <PermissionButton permission={SYSTEM_PERMISSIONS.TENANT_MANAGE} type="button" onClick={() => void openLoginSettings(item).catch((error: Error) => setMessage(error.message))}>
                        <Settings2 size={16} />登录配置
                      </PermissionButton>
                      <PermissionButton permission={SYSTEM_PERMISSIONS.TENANT_MANAGE} type="button" onClick={() => void toggleTenant(item).catch((error: Error) => setMessage(error.message))}>
                        {item.statusName === "enabled" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                        {item.statusName === "enabled" ? "停用" : "启用"}
                      </PermissionButton>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>

      {showCreate ? (
        <Drawer size="lg" onClose={() => setShowCreate(false)}>
          <DrawerHeader
            eyebrow="系统管理"
            title="开通租户"
            description="创建租户、初始园区与管理员账号，并绑定套餐配额。"
            onClose={() => setShowCreate(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void createTenant(event).catch((error: Error) => setMessage(error.message))}>
            <DrawerFormGrid>
              <div className="field"><label>租户编码</label><input name="tenantCode" required /></div>
              <div className="field"><label>租户名称</label><input name="tenantName" required /></div>
              <div className="field"><label>租户类型</label><input name="tenantType" defaultValue="park_operator" /></div>
              <div className="field"><label>套餐</label><select name="planCode" defaultValue={plans.items[0]?.planCode ?? ""}>{plans.items.map((plan) => <option key={plan.id} value={plan.planCode}>{plan.planName}</option>)}</select></div>
              <div className="field"><label>联系人</label><input name="contactName" /></div>
              <div className="field"><label>联系电话</label><input name="contactMobile" /></div>
              <div className="field"><label>站点</label><input name="websites" placeholder="多个用英文逗号分隔" /></div>
              <div className="field"><label>域名</label><input name="domains" placeholder="多个用英文逗号分隔" /></div>
              <div className="field"><label>到期日期</label><input name="expireTime" type="date" /></div>
              <div className="field"><label>用户上限</label><input name="maxUsers" type="number" defaultValue={plans.items[0]?.maxUsers ?? 0} /></div>
              <div className="field"><label>园区上限</label><input name="maxParks" type="number" defaultValue={plans.items[0]?.maxParks ?? 0} /></div>
              <div className="field"><label>园区编码</label><input name="parkCode" required /></div>
              <div className="field"><label>园区名称</label><input name="parkName" required /></div>
              <div className="field"><label>管理员账号</label><input name="adminUsername" required /></div>
              <div className="field"><label>管理员姓名</label><input name="adminDisplayName" required /></div>
              <div className="field"><label>初始密码</label><input name="adminPassword" type="password" minLength={8} required /></div>
              <div className="field"><label>管理员手机</label><input name="adminMobile" /></div>
              <div className="field"><label>管理员邮箱</label><input name="adminEmail" /></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>取消</button>
              <button className="primary-button" type="submit"><CheckCircle2 size={16} />保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {settingsTarget ? (
        <Drawer size="lg" onClose={closeSettings}>
          <DrawerHeader
            eyebrow="系统管理"
            title="登录与授权配置"
            description={settingsLoading && !settings ? `正在读取 ${settingsTarget.tenantName} 的登录与授权配置…` : "维护租户默认园区、状态、套餐有效期与启用模块。"}
            onClose={closeSettings}
            closeIcon={<X size={18} />}
          />
          {settings ? (
            <DrawerForm onSubmit={(event) => void saveLoginSettings(event).catch((error: Error) => setMessage(error.message))}>
              <DrawerFormGrid>
                <div className="field">
                  <label>租户</label>
                  <input value={`${settings.tenant.tenantName} / ${settings.tenant.tenantId}`} readOnly />
                </div>
                <div className="field">
                  <label>默认园区</label>
                  <select name="defaultParkId" defaultValue={settings.tenant.defaultParkId ?? settings.parks[0]?.parkId ?? ""} required>
                    {settings.parks.map((park) => (
                      <option key={park.parkId} value={park.parkId}>{park.parkName} / {park.parkId}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>状态</label>
                  <select name="status" defaultValue={settings.tenant.statusName}>
                    <option value="enabled">启用</option>
                    <option value="disabled">停用</option>
                    <option value="expired">过期</option>
                  </select>
                </div>
                <div className="field">
                  <label>套餐</label>
                  <select name="planCode" defaultValue={settings.tenant.planCode ?? ""}>
                    <option value="">未绑定套餐</option>
                    {plans.items.map((plan) => <option key={plan.id} value={plan.planCode}>{plan.planName}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>租户有效期</label>
                  <input name="expireTime" type="date" defaultValue={settings.tenant.expireTime ? toDateInput(settings.tenant.expireTime) : ""} />
                </div>
                <div className="field">
                  <label>到期提示</label>
                  <input value={settings.tenant.expireWarning ?? "当前无到期风险"} readOnly />
                </div>
              </DrawerFormGrid>
              <DrawerFormGrid single>
                <div className="field">
                  <label>启用模块</label>
                  <div className="checkbox-list">
                    {modules.items.map((item) => (
                      <label key={item.id} className="checkbox-row">
                        <input name={`module.${item.moduleCode}`} type="checkbox" defaultChecked={settings.enabledModuleCodes.includes(item.moduleCode)} />
                        <span>{item.moduleName} / {item.moduleCode}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </DrawerFormGrid>
              <DrawerFooter>
                <button className="secondary-button" type="button" onClick={closeSettings}>取消</button>
                <button className="primary-button" type="submit"><CheckCircle2 size={16} />保存配置</button>
              </DrawerFooter>
            </DrawerForm>
          ) : (
            <section className="empty-state">
              {settingsLoading ? "正在同步租户配置…" : "当前未读取到登录配置，请稍后重试。"}
            </section>
          )}
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status === "enabled" ? "启用" : status === "disabled" ? "停用" : status === "expired" ? "过期" : status;
  return <span className="status-pill">{label}</span>;
}

function splitCsv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function quota(value: number): string {
  return value > 0 ? String(value) : "不限";
}

function toDateInput(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}
