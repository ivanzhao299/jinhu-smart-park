"use client";
import { Card, DataTable, Drawer } from "@jinhu/ui";

import { Copy, Edit3, FolderTree, KeyRound, Layers3, Plus, Power, Save, ShieldCheck, Tags, Trash2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";

interface RoleNode {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  level: number;
  roleLevel?: number;
  sortNo?: number;
  roleType: string;
  roleScope: string;
  dataScope: string;
  isBuiltin: boolean;
  isSystem?: boolean;
  isTemplate: boolean;
  isDeletable: boolean;
  status: string;
  remark?: string | null;
  permissionLinks?: RolePermissionLink[];
  children?: RoleNode[];
}

interface RolePermissionLink {
  permissionId: string;
}

interface PermissionNode {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
  permissionType?: string;
  permType?: number;
  children?: PermissionNode[];
}

interface DataScopeRule {
  id: string;
  ruleCode: string;
  ruleName: string;
  dimension: string;
  scopeType: string;
  status: string;
}

interface FieldPolicy {
  id: string;
  module: string;
  entity: string;
  fieldKey: string;
  fieldName: string;
  policyType: string;
  maskRule?: string | null;
  status: string;
}

interface RoleFormState {
  id?: string;
  code: string;
  name: string;
  parentId: string;
  dataScope: string;
  roleType: string;
  roleScope: string;
  sortNo: number;
  isTemplate: boolean;
  status: string;
  remark: string;
}

const emptyPage: PaginatedResult<RoleNode> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyForm: RoleFormState = {
  code: "",
  name: "",
  parentId: "",
  dataScope: "tenant",
  roleType: "custom",
  roleScope: "tenant",
  sortNo: 0,
  isTemplate: false,
  status: "enabled",
  remark: ""
};

export default function RolesPage() {
  const [data, setData] = useState(emptyPage);
  const [roleTree, setRoleTree] = useState<RoleNode[]>([]);
  const [permissionTree, setPermissionTree] = useState<PermissionNode[]>([]);
  const [dataScopeRules, setDataScopeRules] = useState<DataScopeRule[]>([]);
  const [fieldPolicies, setFieldPolicies] = useState<FieldPolicy[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleNode | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [selectedDataScopeIds, setSelectedDataScopeIds] = useState<string[]>([]);
  const [selectedFieldPolicyIds, setSelectedFieldPolicyIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formState, setFormState] = useState<RoleFormState>(emptyForm);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"permissions" | "dataScopes" | "fieldPolicies">("permissions");
  const [workspace, setWorkspace] = useState<"config" | "list">("config");

  const flatRoles = useMemo(() => flattenRoles(roleTree), [roleTree]);
  const flatPermissions = useMemo(() => flattenPermissions(permissionTree), [permissionTree]);

  async function load(page = 1, keepSelectedId = selectedRoleId) {
    const token = getToken();
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status) params.set("status", status);
    const [rolesResponse, treeResponse, permissionTreeResponse, dataScopeResponse, fieldPolicyResponse] = await Promise.all([
      apiRequest<PaginatedResult<RoleNode>>(`/roles?${params.toString()}`, { token }),
      apiRequest<RoleNode[]>("/roles/tree", { token }),
      apiRequest<PermissionNode[]>("/permissions/tree", { token }),
      apiRequest<PaginatedResult<DataScopeRule>>("/data-scope-rules?page=1&page_size=100", { token }),
      apiRequest<PaginatedResult<FieldPolicy>>("/field-policies?page=1&page_size=100", { token })
    ]);
    setData(rolesResponse.data);
    setRoleTree(treeResponse.data);
    setPermissionTree(permissionTreeResponse.data);
    setDataScopeRules(dataScopeResponse.data.items);
    setFieldPolicies(fieldPolicyResponse.data.items);
    const nextSelectedId = keepSelectedId || flattenRoles(treeResponse.data)[0]?.id || "";
    if (nextSelectedId) {
      await selectRole(nextSelectedId);
    }
  }

  useEffect(() => {
    void load().catch(showError);
  }, []);

  async function selectRole(roleId: string) {
    const token = getToken();
    setSelectedRoleId(roleId);
    const [detailResponse, dataScopeBindings, fieldPolicyBindings] = await Promise.all([
      apiRequest<RoleNode>(`/roles/${roleId}`, { token }),
      apiRequest<DataScopeRule[]>(`/data-scope-rules/role-bindings/${roleId}`, { token }),
      apiRequest<FieldPolicy[]>(`/field-policies/role-bindings/${roleId}`, { token })
    ]);
    setSelectedRole(detailResponse.data);
    setSelectedPermissionIds(detailResponse.data.permissionLinks?.map((link) => link.permissionId) ?? []);
    setSelectedDataScopeIds(dataScopeBindings.data.map((rule) => rule.id));
    setSelectedFieldPolicyIds(fieldPolicyBindings.data.map((policy) => policy.id));
  }

  function openCreateForm(parentId = "") {
    setFormMode("create");
    setFormState({ ...emptyForm, parentId });
    setFormOpen(true);
  }

  function openEditForm(role: RoleNode) {
    setFormMode("edit");
    setFormState({
      id: role.id,
      code: role.code,
      name: role.name,
      parentId: role.parentId ?? "",
      dataScope: role.dataScope,
      roleType: role.roleType,
      roleScope: role.roleScope,
      sortNo: role.sortNo ?? 0,
      isTemplate: role.isTemplate,
      status: role.status,
      remark: role.remark ?? ""
    });
    setFormOpen(true);
  }

  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    const body = {
      code: formState.code.trim(),
      name: formState.name.trim(),
      parentId: formState.parentId || undefined,
      dataScope: formState.dataScope,
      roleType: formState.roleType,
      roleScope: formState.roleScope,
      sortNo: formState.sortNo,
      isTemplate: formState.isTemplate,
      status: formState.status,
      remark: formState.remark.trim() || undefined
    };
    const response =
      formMode === "create"
        ? await apiRequest<RoleNode>("/roles", { method: "POST", token, idempotencyKey: createIdempotencyKey("role-create"), body })
        : await apiRequest<RoleNode>(`/roles/${formState.id}`, { method: "PATCH", token, idempotencyKey: createIdempotencyKey("role-update"), body });
    setFormOpen(false);
    setMessage(formMode === "create" ? "角色已创建" : "角色已更新");
    await load(formMode === "create" ? 1 : data.page, response.data.id);
  }

  async function copyRole(role: RoleNode) {
    const code = window.prompt("新角色编码", `${role.code}_COPY`);
    if (!code) return;
    const name = window.prompt("新角色名称", `${role.name}副本`);
    if (!name) return;
    const token = getToken();
    const response = await apiRequest<RoleNode>(`/roles/${role.id}/copy`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-copy"),
      body: { code, name, parentId: role.parentId ?? undefined, roleScope: role.roleScope, dataScope: role.dataScope }
    });
    setMessage("模板角色已复制为自定义角色");
    await load(data.page, response.data.id);
  }

  async function toggleStatus(role: RoleNode) {
    const token = getToken();
    const action = role.status === "enabled" ? "disable" : "enable";
    await apiRequest<RoleNode>(`/roles/${role.id}/${action}`, { method: "POST", token, idempotencyKey: createIdempotencyKey(`role-${action}`) });
    setMessage(action === "disable" ? "角色已停用" : "角色已启用");
    await load(data.page, role.id);
  }

  async function deleteRole(role: RoleNode) {
    if (role.isBuiltin || role.isSystem || role.isDeletable === false) return;
    if (!window.confirm(`确认删除角色「${role.name}」？`)) return;
    const token = getToken();
    await apiRequest<{ id: string }>(`/roles/${role.id}`, { method: "DELETE", token, idempotencyKey: createIdempotencyKey("role-delete") });
    setMessage("角色已删除");
    await load(1, "");
  }

  async function savePermissions() {
    if (!selectedRole) return;
    const token = getToken();
    await apiRequest<{ id: string }>(`/roles/${selectedRole.id}/permissions`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-permissions"),
      body: { permissionIds: selectedPermissionIds }
    });
    setMessage("角色权限树已保存");
    await selectRole(selectedRole.id);
  }

  async function saveDataScopes() {
    if (!selectedRole) return;
    const token = getToken();
    await apiRequest<{ roleId: string; ruleIds: string[] }>(`/data-scope-rules/role-bindings/${selectedRole.id}`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-data-scopes"),
      body: { ruleIds: selectedDataScopeIds }
    });
    setMessage("数据权限规则已绑定");
  }

  async function saveFieldPolicies() {
    if (!selectedRole) return;
    const token = getToken();
    await apiRequest<{ roleId: string; fieldPolicyIds: string[] }>(`/field-policies/role-bindings/${selectedRole.id}`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-field-policies"),
      body: { fieldPolicyIds: selectedFieldPolicyIds }
    });
    setMessage("字段权限策略已绑定");
  }

  function togglePermission(permission: PermissionNode, checked: boolean) {
    const ids = collectPermissionIds(permission);
    setSelectedPermissionIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return [...next];
    });
  }

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : "操作失败");
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div className="header-title">
          <strong>角色管理</strong>
          <span>角色树、模板复制、权限树授权、数据权限和字段策略绑定</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE} type="button" onClick={() => openCreateForm()}>
          <Plus size={16} />新增自定义角色
        </PermissionButton>
      </header>

      <section className="filter-bar">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch(showError); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="角色编码 / 名称" /></div>
            <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
          </div>
          <div className="filter-actions"><button className="primary-button" type="submit">查询</button></div>
        </form>
      </section>

      <div className="system-tabs">
        <TabButton active={workspace === "config"} onClick={() => setWorkspace("config")}><ShieldCheck size={16} />角色配置</TabButton>
        <TabButton active={workspace === "list"} onClick={() => setWorkspace("list")}><FolderTree size={16} />角色列表</TabButton>
      </div>

      {workspace === "config" ? (
        <section className="system-split role-config-layout ds-config-workbench">
          <Card className="role-panel role-tree-card">
            <div className="ds-panel-heading">
              <h2 className="panel-title"><FolderTree size={18} />角色树</h2>
              <span className="ds-subtle-count">共 {flatRoles.length} 个</span>
            </div>
            <div className="tree-list role-tree-panel">
              {roleTree.map((role) => <RoleTreeItem key={role.id} role={role} selectedId={selectedRoleId} onSelect={(id) => void selectRole(id).catch(showError)} onCreateChild={openCreateForm} />)}
            </div>
          </Card>

          <Card className="role-panel role-detail-card">
            {selectedRole ? (
              <div className="detail-stack">
                <div className="system-toolbar role-detail-header">
                  <div className="role-detail-title">
                    <h2 className="panel-title">{selectedRole.name}</h2>
                    <p className="muted-text">{selectedRole.code}</p>
                    <RoleTags role={selectedRole} />
                  </div>
                  <div className="system-actions">
                    <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE} type="button" onClick={() => openEditForm(selectedRole)}><Edit3 size={16} />编辑</PermissionButton>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_DISABLE} type="button" onClick={() => void toggleStatus(selectedRole).catch(showError)}><Power size={16} />{selectedRole.status === "enabled" ? "停用" : "启用"}</PermissionButton>
                    {selectedRole.isTemplate ? <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_COPY} type="button" onClick={() => void copyRole(selectedRole).catch(showError)}><Copy size={16} />复制模板</PermissionButton> : null}
                    {selectedRole.isBuiltin || selectedRole.isSystem || selectedRole.isDeletable === false ? null : <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_OPEN_DELETE} type="button" onClick={() => void deleteRole(selectedRole).catch(showError)}><Trash2 size={16} />删除</PermissionButton>}
                  </div>
                </div>

                <div className="system-grid-three role-meta-grid">
                  <Meta label="角色范围" value={selectedRole.roleScope} />
                  <Meta label="角色类型" value={selectedRole.roleType} />
                  <Meta label="数据范围" value={selectedRole.dataScope} />
                </div>

                <div className="system-tabs">
                  <TabButton active={activeTab === "permissions"} onClick={() => setActiveTab("permissions")}><KeyRound size={16} />权限树</TabButton>
                  <TabButton active={activeTab === "dataScopes"} onClick={() => setActiveTab("dataScopes")}><Layers3 size={16} />数据权限</TabButton>
                  <TabButton active={activeTab === "fieldPolicies"} onClick={() => setActiveTab("fieldPolicies")}><ShieldCheck size={16} />字段策略</TabButton>
                </div>

                {activeTab === "permissions" ? <PermissionBinding tree={permissionTree} selectedIds={selectedPermissionIds} total={flatPermissions.length} onToggle={togglePermission} onSave={() => void savePermissions().catch(showError)} /> : null}
                {activeTab === "dataScopes" ? <BindingPanel title="数据权限规则" emptyText="暂无数据权限规则" items={dataScopeRules} selectedIds={selectedDataScopeIds} onToggle={(id, checked) => setSelectedDataScopeIds(toggleList(id, checked))} onSave={() => void saveDataScopes().catch(showError)} savePermission={SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE} renderItem={(item) => <><strong>{item.ruleName}</strong><span>{item.ruleCode} · {item.dimension} · {item.scopeType}</span></>} /> : null}
                {activeTab === "fieldPolicies" ? <BindingPanel title="字段权限策略" emptyText="暂无字段权限策略" items={fieldPolicies} selectedIds={selectedFieldPolicyIds} onToggle={(id, checked) => setSelectedFieldPolicyIds(toggleList(id, checked))} onSave={() => void saveFieldPolicies().catch(showError)} savePermission={SYSTEM_PERMISSIONS.ROLE_ASSIGN_FIELD_POLICY} renderItem={(item) => <><strong>{item.fieldName}</strong><span>{item.module}.{item.entity}.{item.fieldKey} · {item.policyType}{item.maskRule ? ` · ${item.maskRule}` : ""}</span></>} /> : null}
              </div>
            ) : <p className="status-pill">请选择一个角色</p>}
          </Card>
        </section>
      ) : (
        <Card >
          <h2 className="panel-title">角色列表</h2>
          <div className="table-scroll">
            <DataTable >
              <thead><tr><th>编码</th><th>名称</th><th>上级</th><th>范围</th><th>数据范围</th><th>标签</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>{item.name}</td>
                    <td>{item.parentId ? flatRoles.find((role) => role.id === item.parentId)?.name ?? "-" : "-"}</td>
                    <td>{item.roleScope}</td>
                    <td><span className="status-pill">{item.dataScope}</span></td>
                    <td><RoleTags role={item} /></td>
                    <td><StatusBadge status={item.status} /></td>
                    <td><button className="inline-action-button" type="button" onClick={() => { setWorkspace("config"); void selectRole(item.id).catch(showError); }}>配置</button></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
          <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span className="pagination-actions"><button className="pagination-button" type="button" onClick={() => void load(Math.max(1, data.page - 1)).catch(showError)}>上一页</button><button className="pagination-button" type="button" onClick={() => void load(data.page + 1).catch(showError)}>下一页</button></span></div>
        </Card>
      )}

      {formOpen ? (
        <Drawer size="md" onClose={() => setFormOpen(false)}>
          <form className="form-stack" onSubmit={(event) => void submitRole(event).catch(showError)}>
            <div className="system-toolbar"><h2 className="panel-title">{formMode === "create" ? "新增自定义角色" : "编辑角色"}</h2><button className="drawer-close-button" aria-label="关闭" title="关闭" type="button" onClick={() => setFormOpen(false)}><X size={16} /></button></div>
            <div className="field"><label>角色编码</label><input required value={formState.code} onChange={(event) => setFormState({ ...formState, code: event.target.value })} disabled={formMode === "edit" && Boolean(selectedRole?.isBuiltin)} /></div>
            <div className="field"><label>角色名称</label><input required value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} /></div>
            <div className="field"><label>上级角色</label><select value={formState.parentId} onChange={(event) => setFormState({ ...formState, parentId: event.target.value })}><option value="">无</option>{flatRoles.filter((role) => role.id !== formState.id).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
            <div className="field"><label>数据范围</label><select value={formState.dataScope} onChange={(event) => setFormState({ ...formState, dataScope: event.target.value })}><option value="tenant">本租户</option><option value="park">本园区</option><option value="org">本组织</option><option value="self">本人</option><option value="custom">自定义</option><option value="all">全部</option></select></div>
            <div className="field"><label>角色类型</label><select value={formState.roleType} onChange={(event) => setFormState({ ...formState, roleType: event.target.value })}><option value="custom">自定义</option><option value="tenant">租户角色</option><option value="park">园区角色</option><option value="tenant_external">租户外部角色</option><option value="system">系统角色</option></select></div>
            <div className="field"><label>角色范围</label><select value={formState.roleScope} onChange={(event) => setFormState({ ...formState, roleScope: event.target.value })}><option value="tenant">租户</option><option value="park">园区</option><option value="platform">平台</option></select></div>
            <div className="field"><label>排序</label><input type="number" value={formState.sortNo} onChange={(event) => setFormState({ ...formState, sortNo: Number(event.target.value) })} onFocus={(event) => event.target.select()} /></div>
            <label className="binding-row"><input type="checkbox" checked={formState.isTemplate} onChange={(event) => setFormState({ ...formState, isTemplate: event.target.checked })} /><span>设为模板角色</span><span /></label>
            <div className="field"><label>状态</label><select value={formState.status} onChange={(event) => setFormState({ ...formState, status: event.target.value })}><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            <div className="field"><label>备注</label><input value={formState.remark} onChange={(event) => setFormState({ ...formState, remark: event.target.value })} /></div>
            <button className="primary-button" type="submit"><Save size={16} />保存</button>
          </form>
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function RoleTreeItem({ role, selectedId, onSelect, onCreateChild }: { role: RoleNode; selectedId: string; onSelect: (id: string) => void; onCreateChild: (id: string) => void }) {
  return (
    <div className="role-tree-node">
      <div className={`tree-row${selectedId === role.id ? " active" : ""}`}>
        <button className="inline-action-button" type="button" onClick={() => onSelect(role.id)}><FolderTree size={15} />{role.name}</button>
        <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE} type="button" title="新增子角色" onClick={() => onCreateChild(role.id)}><Plus size={14} />子角色</PermissionButton>
      </div>
      {role.children && role.children.length > 0 ? <div className="tree-children">{role.children.map((child) => <RoleTreeItem key={child.id} role={child} selectedId={selectedId} onSelect={onSelect} onCreateChild={onCreateChild} />)}</div> : null}
    </div>
  );
}

function PermissionBinding({ tree, selectedIds, total, onToggle, onSave }: { tree: PermissionNode[]; selectedIds: string[]; total: number; onToggle: (permission: PermissionNode, checked: boolean) => void; onSave: () => void }) {
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <span className="status-pill">已选择 {selectedIds.length} / {total}</span>
        <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS} className="primary-button" type="button" onClick={onSave}><Save size={16} />保存权限</PermissionButton>
      </div>
      <div className="tree-list role-binding-scroll">{tree.map((permission) => <PermissionTreeItem key={permission.id} permission={permission} selectedIds={selectedIds} onToggle={onToggle} />)}</div>
    </section>
  );
}

function PermissionTreeItem({ permission, selectedIds, onToggle }: { permission: PermissionNode; selectedIds: string[]; onToggle: (permission: PermissionNode, checked: boolean) => void }) {
  return (
    <div className="tree-list">
      <label className="permission-row">
        <input type="checkbox" checked={selectedIds.includes(permission.id)} onChange={(event) => onToggle(permission, event.target.checked)} />
        <span className="role-binding-content"><strong>{permission.name}</strong><small>{permission.code}</small></span>
        <span className="status-pill">{permission.permissionType ?? `type-${permission.permType ?? 40}`}</span>
      </label>
      {permission.children && permission.children.length > 0 ? <div className="tree-children">{permission.children.map((child) => <PermissionTreeItem key={child.id} permission={child} selectedIds={selectedIds} onToggle={onToggle} />)}</div> : null}
    </div>
  );
}

function BindingPanel<T extends { id: string; status: string }>({ title, emptyText, items, selectedIds, onToggle, onSave, savePermission, renderItem }: { title: string; emptyText: string; items: T[]; selectedIds: string[]; onToggle: (id: string, checked: boolean) => void; onSave: () => void; savePermission: string; renderItem: (item: T) => ReactNode }) {
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <span className="status-pill">{title}：已选择 {selectedIds.length} / {items.length}</span>
        <PermissionButton permission={savePermission} className="primary-button" type="button" onClick={onSave}><Save size={16} />保存绑定</PermissionButton>
      </div>
      <div className="binding-list role-binding-scroll">
        {items.length === 0 ? <p className="status-pill">{emptyText}</p> : null}
        {items.map((item) => (
          <label key={item.id} className="binding-row">
            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => onToggle(item.id, event.target.checked)} />
            <span className="role-binding-content">{renderItem(item)}</span>
            <StatusBadge status={item.status} />
          </label>
        ))}
      </div>
    </section>
  );
}

function RoleTags({ role }: { role: RoleNode }) {
  return <span className="system-actions">{role.isBuiltin || role.isSystem ? <span className="status-pill"><Tags size={13} />系统内置</span> : null}{role.isTemplate ? <span className="status-pill"><Copy size={13} />模板</span> : null}{!role.isBuiltin && !role.isSystem && !role.isTemplate ? <span className="status-pill">{role.roleType}</span> : null}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className="status-pill">{status === "enabled" ? "启用" : "停用"}</span>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={active ? "primary-button" : ""} type="button" onClick={onClick}>{children}</button>;
}

function toggleList(id: string, checked: boolean): (current: string[]) => string[] {
  return (current) => {
    const next = new Set(current);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    return [...next];
  };
}

function flattenRoles(items: RoleNode[]): RoleNode[] {
  return items.flatMap((item) => [item, ...flattenRoles(item.children ?? [])]);
}

function flattenPermissions(items: PermissionNode[]): PermissionNode[] {
  return items.flatMap((item) => [item, ...flattenPermissions(item.children ?? [])]);
}

function collectPermissionIds(permission: PermissionNode): string[] {
  return [permission.id, ...(permission.children ?? []).flatMap((child) => collectPermissionIds(child))];
}

function getToken(): string {
  return localStorage.getItem("jinhu_access_token") ?? "";
}
