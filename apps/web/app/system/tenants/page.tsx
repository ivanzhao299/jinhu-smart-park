"use client";
import { Card, DataTable, Drawer } from "@jinhu/ui";
import { CheckCircle2, Plus, Search, XCircle } from "lucide-react";
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
  userCount: number;
  parkCount: number;
  enabledModuleCount: number;
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

export default function TenantsPage() {
  const [tenants, setTenants] = useState(emptyTenants);
  const [plans, setPlans] = useState(emptyPlans);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load(page = 1) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword) params.set("keyword", keyword);
    if (status) params.set("status", status);
    const [tenantResponse, planResponse] = await Promise.all([
      apiRequest<PaginatedResult<TenantRow>>(`/tenants?${params.toString()}`, { token }),
      apiRequest<PaginatedResult<PlanRow>>("/plans?page=1&page_size=50", { token })
    ]);
    setTenants(tenantResponse.data);
    setPlans(planResponse.data);
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
                  <td>{item.expireTime ? new Date(item.expireTime).toLocaleDateString() : "长期"}</td>
                  <td><StatusBadge status={item.statusName} /></td>
                  <td>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.TENANT_MANAGE} type="button" onClick={() => void toggleTenant(item).catch((error: Error) => setMessage(error.message))}>
                      {item.statusName === "enabled" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                      {item.statusName === "enabled" ? "停用" : "启用"}
                    </PermissionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>

      {showCreate ? (
        <Drawer size="lg" onClose={() => setShowCreate(false)}>
          <form className="form-stack" onSubmit={(event) => void createTenant(event).catch((error: Error) => setMessage(error.message))}>
            <h2 className="panel-title">开通租户</h2>
            <div className="system-grid">
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
            </div>
            <div className="system-actions">
              <button className="primary-button" type="submit"><CheckCircle2 size={16} />保存</button>
              <button type="button" onClick={() => setShowCreate(false)}>取消</button>
            </div>
          </form>
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
