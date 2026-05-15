"use client";

import { Eye, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface PermissionRow {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
  permissionType?: string;
  permType?: number;
  level?: number;
  permPath?: string | null;
  apiMethod?: string | null;
  apiPath?: string | null;
  frontendRoute?: string | null;
  componentKey?: string | null;
  fieldKey?: string | null;
  dataDimension?: string | null;
  parentId?: string | null;
  isBuiltin?: boolean;
  isSystem?: boolean;
  isTenantCustom?: boolean;
  children?: PermissionRow[];
  status: string;
  remark?: string | null;
}

const emptyPage: PaginatedResult<PermissionRow> = { items: [], page: 1, page_size: 100, total: 0 };
const permTypes = [
  { value: "", label: "全部类型" },
  { value: "10", label: "菜单" },
  { value: "20", label: "页面" },
  { value: "30", label: "按钮" },
  { value: "40", label: "API" },
  { value: "50", label: "数据" },
  { value: "60", label: "字段" },
  { value: "70", label: "报表" },
  { value: "80", label: "审批" },
  { value: "90", label: "自定义" }
];

export default function PermissionsPage() {
  const [data, setData] = useState(emptyPage);
  const [tree, setTree] = useState<PermissionRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [permType, setPermType] = useState("");
  const [selected, setSelected] = useState<PermissionRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");

  const flatTree = useMemo(() => flattenTree(tree), [tree]);
  const filteredItems = useMemo(() => data.items.filter((item) => !permType || String(item.permType ?? "") === permType), [data.items, permType]);

  async function load(page = 1) {
    const token = getToken();
    const params = new URLSearchParams({ page: String(page), page_size: "100" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status) params.set("status", status);
    const [listResponse, treeResponse] = await Promise.all([
      apiRequest<PaginatedResult<PermissionRow>>(`/permissions?${params.toString()}`, { token }),
      apiRequest<PermissionRow[]>("/permissions/tree", { token })
    ]);
    setData(listResponse.data);
    setTree(treeResponse.data);
  }

  async function createPermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    const form = new FormData(event.currentTarget);
    await apiRequest<PermissionRow>("/permissions", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("permission-create"),
      body: {
        code: String(form.get("code") ?? ""),
        name: String(form.get("name") ?? ""),
        parentId: String(form.get("parentId") ?? "") || undefined,
        permType: Number(form.get("permType") ?? 90),
        resource: String(form.get("resource") ?? "tenant.custom"),
        action: String(form.get("action") ?? "custom"),
        sortNo: Number(form.get("sortNo") ?? 0),
        frontendRoute: String(form.get("frontendRoute") ?? "") || undefined,
        componentKey: String(form.get("componentKey") ?? "") || undefined,
        fieldKey: String(form.get("fieldKey") ?? "") || undefined,
        dataDimension: String(form.get("dataDimension") ?? "") || undefined,
        status: String(form.get("status") ?? "enabled"),
        remark: String(form.get("remark") ?? "") || undefined
      }
    });
    setShowCreate(false);
    setMessage("自定义权限已创建");
    await load(data.page);
  }

  async function deletePermission(permission: PermissionRow) {
    if (permission.isBuiltin || permission.isSystem) return;
    if (!window.confirm(`确认删除权限「${permission.name}」？`)) return;
    const token = getToken();
    await apiRequest<{ id: string }>(`/permissions/${permission.id}`, { method: "DELETE", token, idempotencyKey: createIdempotencyKey("permission-delete") });
    setSelected(null);
    setMessage("权限已删除");
    await load(data.page);
  }

  useEffect(() => {
    void load().catch(showError);
  }, []);

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : "操作失败");
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title">
          <strong>权限点管理</strong>
          <span>支持菜单、页面、按钮、API、数据、字段等权限树分类管理</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE} type="button" onClick={() => setShowCreate(true)}><Plus size={16} />新增 custom 权限</PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch(showError); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="权限名称 / 编码" /></div>
            <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            <div className="field"><label>权限分类</label><select value={permType} onChange={(event) => setPermType(event.target.value)}>{permTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          </div>
          <div className="filter-actions"><button className="primary-button" type="submit"><Search size={16} />查询</button></div>
        </form>
      </section>

      <section className="system-split">
        <div className="page-content">
          <h2 className="panel-title">权限树</h2>
          <div className="tree-list">{tree.map((permission) => <PermissionTree key={permission.id} permission={permission} selectedId={selected?.id ?? ""} onSelect={setSelected} />)}</div>
        </div>
        <div className="page-content">
          <h2 className="panel-title">权限详情</h2>
          {selected ? (
            <div className="detail-stack">
              <div className="system-toolbar"><strong>{selected.name}</strong><span className="status-pill">{typeLabel(selected.permType)}</span></div>
              <Meta label="编码" value={selected.code} />
              <Meta label="资源 / 动作" value={`${selected.resource} / ${selected.action}`} />
              <Meta label="前端路由" value={selected.frontendRoute ?? "-"} />
              <Meta label="API" value={selected.apiPath ? `${selected.apiMethod ?? ""} ${selected.apiPath}` : "-"} />
              <Meta label="组件 / 字段" value={selected.componentKey ?? selected.fieldKey ?? "-"} />
              <Meta label="数据维度" value={selected.dataDimension ?? "-"} />
              <div className="system-actions">
                {selected.isBuiltin || selected.isSystem ? <span className="status-pill">内置权限不可随意删除</span> : <PermissionButton permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_DELETE} type="button" onClick={() => void deletePermission(selected).catch(showError)}><Trash2 size={16} />删除</PermissionButton>}
              </div>
            </div>
          ) : <p className="status-pill">请选择权限节点查看详情</p>}
        </div>
      </section>

      <section className="page-content">
        <h2 className="panel-title">权限列表</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>编码</th><th>名称</th><th>资源</th><th>动作</th><th>类型</th><th>路由/组件</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td>{item.resource}</td>
                  <td>{item.action}</td>
                  <td>{typeLabel(item.permType)}</td>
                  <td>{item.frontendRoute ?? item.componentKey ?? "-"}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td><button type="button" onClick={() => setSelected(item)} title="详情"><Eye size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="task-item"><span>共 {data.total} 条，当前显示 {filteredItems.length} 条</span><span><button type="button" onClick={() => void load(Math.max(1, data.page - 1)).catch(showError)}>上一页</button><button type="button" onClick={() => void load(data.page + 1).catch(showError)}>下一页</button></span></div>
      </section>

      {showCreate ? (
        <section className="drawer">
          <form className="form-stack" onSubmit={(event) => void createPermission(event).catch(showError)}>
            <div className="system-toolbar"><h2 className="panel-title">新增租户自定义权限</h2><button aria-label="关闭" title="关闭" type="button" onClick={() => setShowCreate(false)}><X size={16} /></button></div>
            <div className="field"><label>编码</label><input name="code" placeholder="tenant:custom:example" required /></div>
            <div className="field"><label>名称</label><input name="name" required /></div>
            <div className="field"><label>上级权限</label><select name="parentId"><option value="">无</option>{flatTree.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="field"><label>权限分类</label><select name="permType" defaultValue="90">{permTypes.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div className="field"><label>资源</label><input name="resource" defaultValue="tenant.custom" /></div>
            <div className="field"><label>动作</label><input name="action" defaultValue="custom" /></div>
            <div className="field"><label>排序</label><input name="sortNo" type="number" defaultValue={0} onFocus={(event) => event.target.select()} /></div>
            <div className="field"><label>前端路由</label><input name="frontendRoute" /></div>
            <div className="field"><label>组件键</label><input name="componentKey" /></div>
            <div className="field"><label>字段键</label><input name="fieldKey" /></div>
            <div className="field"><label>数据维度</label><input name="dataDimension" /></div>
            <div className="field"><label>状态</label><select name="status"><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            <div className="field"><label>备注</label><input name="remark" /></div>
            <button className="primary-button" type="submit"><Save size={16} />保存</button>
          </form>
        </section>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function PermissionTree({ permission, selectedId, onSelect }: { permission: PermissionRow; selectedId: string; onSelect: (permission: PermissionRow) => void }) {
  return (
    <div className="tree-list">
      <button className={`tree-row${selectedId === permission.id ? " active" : ""}`} type="button" onClick={() => onSelect(permission)}>
        <span>{permission.name}</span><span className="status-pill">{typeLabel(permission.permType)}</span>
      </button>
      {permission.children && permission.children.length > 0 ? <div className="tree-children">{permission.children.map((child) => <PermissionTree key={child.id} permission={child} selectedId={selectedId} onSelect={onSelect} />)}</div> : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="task-item"><span className="muted-text">{label}</span><strong>{value}</strong></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className="status-pill">{status === "enabled" ? "启用" : "停用"}</span>;
}

function typeLabel(value?: number): string {
  return permTypes.find((item) => item.value === String(value ?? ""))?.label ?? `type-${value ?? 40}`;
}

function flattenTree(items: PermissionRow[]): PermissionRow[] {
  return items.flatMap((item) => [item, ...flattenTree(item.children ?? [])]);
}

function getToken(): string {
  return localStorage.getItem("jinhu_access_token") ?? "";
}
