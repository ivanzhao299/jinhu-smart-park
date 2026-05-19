"use client";
import { Card, DataTable, Drawer } from "@jinhu/ui";

import { Boxes, CheckCircle2, PackageCheck, Search, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface ModuleRow {
  id: string;
  moduleCode: string;
  moduleName: string;
  moduleGroup: string;
  description?: string | null;
  routePrefix?: string | null;
  routePath?: string | null;
  icon?: string | null;
  status: number | string;
  sortNo?: number;
}

interface PlanRow {
  id: string;
  planCode: string;
  planName: string;
  planType?: string;
  moduleCodes: string[];
  permissionCodes?: string[];
  maxUsers?: number;
  maxParks?: number;
  status: string;
}

interface TenantModuleRow {
  id: string;
  moduleId: string;
  module?: ModuleRow | null;
  plan?: PlanRow | null;
  enabled: boolean;
  status: string;
  expireTime: string | null;
}

const emptyModules: PaginatedResult<ModuleRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyPlans: PaginatedResult<PlanRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyTenantModules: PaginatedResult<TenantModuleRow> = { items: [], page: 1, page_size: 20, total: 0 };

export default function ModulesPage() {
  const [modules, setModules] = useState(emptyModules);
  const [plans, setPlans] = useState(emptyPlans);
  const [tenantModules, setTenantModules] = useState(emptyTenantModules);
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [showPlan, setShowPlan] = useState(false);

  const grantedModuleMap = useMemo(() => {
    return new Map(tenantModules.items.map((item) => [item.module?.id ?? item.moduleId, item]));
  }, [tenantModules.items]);

  async function load(page = 1) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword) params.set("keyword", keyword);
    const [moduleResponse, planResponse, tenantModuleResponse] = await Promise.all([
      apiRequest<PaginatedResult<ModuleRow>>(`/modules?${params.toString()}`, { token }),
      apiRequest<PaginatedResult<PlanRow>>("/plans?page=1&page_size=50", { token }),
      apiRequest<PaginatedResult<TenantModuleRow>>("/tenant-modules?page=1&page_size=100", { token })
    ]);
    setModules(moduleResponse.data);
    setPlans(planResponse.data);
    setTenantModules(tenantModuleResponse.data);
    setMessage("");
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const form = new FormData(event.currentTarget);
    await apiRequest<PlanRow>("/plans", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("plan"),
      body: {
        planCode: String(form.get("planCode") ?? "").trim(),
        planName: String(form.get("planName") ?? "").trim(),
        planType: String(form.get("planType") ?? "standard").trim(),
        moduleCodes: String(form.get("moduleCodes") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        permissionCodes: String(form.get("permissionCodes") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        maxUsers: Number(form.get("maxUsers") ?? 0),
        maxParks: Number(form.get("maxParks") ?? 0),
        status: String(form.get("status") ?? "enabled")
      }
    });
    setShowPlan(false);
    await load(modules.page);
  }

  async function enableModule(moduleId: string) {
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    await apiRequest<TenantModuleRow>(`/tenant-modules/${moduleId}/enable`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("tenant-module-enable")
    });
    await load(modules.page);
  }

  async function disableModule(moduleId: string) {
    if (!window.confirm("确认停用该租户模块授权？停用后对应模块菜单将不再展示。")) {
      return;
    }
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    await apiRequest<TenantModuleRow>(`/tenant-modules/${moduleId}/disable`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("tenant-module-disable")
    });
    await load(modules.page);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title">
          <strong>模块授权</strong>
          <span>维护 SaaS 模块清单、套餐版本和当前租户模块授权</span>
        </div>
        <div className="system-actions">
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PLAN_MANAGE} type="button" onClick={() => setShowPlan(true)}>
            <Boxes size={16} />新增套餐
          </PermissionButton>
        </div>
      </header>

      <section className="filter-bar">
        <form className="system-grid" onSubmit={(event) => { event.preventDefault(); void load().catch((error: Error) => setMessage(error.message)); }}>
          <div className="field">
            <label>关键词</label>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="模块编码 / 模块名称" />
          </div>
          <div className="filter-actions">
            <button className="primary-button" type="submit"><Search size={16} />查询</button>
          </div>
        </form>
      </section>

      <Card >
        <div className="system-toolbar">
          <h2 className="panel-title">模块列表</h2>
          <span className="muted-text">共 {modules.total} 个模块</span>
        </div>
        <div className="table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>模块编码</th>
                <th>模块名称</th>
                <th>分组</th>
                <th>入口</th>
                <th>排序</th>
                <th>状态</th>
                <th>租户授权</th>
              </tr>
            </thead>
            <tbody>
              {modules.items.map((item) => {
                const tenantModule = grantedModuleMap.get(item.id);
                const isEnabled = tenantModule?.enabled && tenantModule.status !== "disabled";
                return (
                  <tr key={item.id}>
                    <td>{item.moduleCode}</td>
                    <td>{item.moduleName}</td>
                    <td>{item.moduleGroup}</td>
                    <td>{item.routePrefix ?? item.routePath ?? "-"}</td>
                    <td>{item.sortNo ?? 0}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>
                      <div className="system-actions">
                        <span className="status-pill">{isEnabled ? "已授权" : "未授权"}</span>
                        {isEnabled ? (
                          <PermissionButton permission={SYSTEM_PERMISSIONS.TENANT_MODULE_MANAGE} type="button" onClick={() => void disableModule(item.id).catch((error: Error) => setMessage(error.message))}>
                            <XCircle size={16} />停用
                          </PermissionButton>
                        ) : (
                          <PermissionButton permission={SYSTEM_PERMISSIONS.TENANT_MODULE_MANAGE} type="button" onClick={() => void enableModule(item.id).catch((error: Error) => setMessage(error.message))}>
                            <CheckCircle2 size={16} />授权
                          </PermissionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      </Card>

      <Card >
        <div className="system-toolbar">
          <h2 className="panel-title">套餐列表</h2>
          <span className="muted-text">共 {plans.total} 个套餐</span>
        </div>
        <div className="table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>套餐编码</th>
                <th>套餐名称</th>
                <th>类型</th>
                <th>模块</th>
                <th>默认权限</th>
                <th>用户上限</th>
                <th>园区上限</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {plans.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.planCode}</td>
                  <td>{item.planName}</td>
                  <td>{item.planType ?? "-"}</td>
                  <td>{item.moduleCodes.join(", ") || "-"}</td>
                  <td>{item.permissionCodes?.join(", ") || "-"}</td>
                  <td>{item.maxUsers ?? 0}</td>
                  <td>{item.maxParks ?? 0}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>

      <Card >
        <div className="system-toolbar">
          <h2 className="panel-title">当前租户模块授权</h2>
          <span className="muted-text">共 {tenantModules.total} 条授权</span>
        </div>
        <div className="table-scroll">
          <DataTable >
            <thead>
              <tr>
                <th>模块编码</th>
                <th>模块名称</th>
                <th>套餐</th>
                <th>过期时间</th>
                <th>启用</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {tenantModules.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.module?.moduleCode ?? item.moduleId}</td>
                  <td>{item.module?.moduleName ?? "-"}</td>
                  <td>{item.plan?.planName ?? "-"}</td>
                  <td>{item.expireTime ? new Date(item.expireTime).toLocaleString() : "长期"}</td>
                  <td>{item.enabled ? "是" : "否"}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </Card>

      {showPlan ? (
        <Drawer size="md" onClose={() => setShowPlan(false)}>
          <form className="form-stack" onSubmit={(event) => void createPlan(event).catch((error: Error) => setMessage(error.message))}>
            <h2 className="panel-title">新增套餐</h2>
            <div className="field"><label>套餐编码</label><input name="planCode" required /></div>
            <div className="field"><label>套餐名称</label><input name="planName" required /></div>
            <div className="field"><label>套餐类型</label><input name="planType" defaultValue="standard" /></div>
            <div className="field"><label>模块编码</label><input name="moduleCodes" placeholder="多个编码用英文逗号分隔" /></div>
            <div className="field"><label>默认权限</label><input name="permissionCodes" placeholder="如 module:system,module:asset" /></div>
            <div className="field"><label>用户上限</label><input name="maxUsers" type="number" defaultValue={0} onFocus={(event) => event.target.select()} /></div>
            <div className="field"><label>园区上限</label><input name="maxParks" type="number" defaultValue={0} onFocus={(event) => event.target.select()} /></div>
            <div className="field"><label>状态</label><select name="status"><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            <div className="system-actions">
              <button className="primary-button" type="submit"><PackageCheck size={16} />保存</button>
              <button type="button" onClick={() => setShowPlan(false)}>取消</button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function StatusBadge({ status }: { status: number | string }) {
  const normalized = String(status);
  const label = normalized === "1" || normalized === "enabled" ? "启用" : normalized === "0" || normalized === "disabled" ? "停用" : normalized;
  return <span className="status-pill">{label}</span>;
}
