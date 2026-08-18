"use client";
import { Card, DataTable, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";

import { Copy, Edit3, FolderTree, KeyRound, Layers3, Plus, Power, Save, ShieldCheck, Tags, Trash2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { hasAllPermissions, hasPermission } from "../../../lib/permissions";

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
  dataScopeConfig?: Record<string, unknown>;
  isBuiltin: boolean;
  isSystem?: boolean;
  isTemplate: boolean;
  isDeletable: boolean;
  editable?: boolean;
  isEditable?: boolean;
  status: string;
  isAssignable: boolean;
  isProtected: boolean;
  unassignableReasons: string[];
  assignabilityLabel: string;
  remark?: string | null;
  version: number;
  appliedBundleCodes?: string[];
  appliedBundleSignature?: string | null;
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
  scopeConfig?: Record<string, unknown>;
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
  dataScopeConfigText: string;
  roleType: string;
  roleScope: string;
  sortNo: number;
  isTemplate: boolean;
  status: string;
  remark: string;
}

interface PropertyBundleCatalogItem {
  code: string;
  name: string;
  definitionVersion: number;
  definitionHash: string;
  version: number;
  permissionCount: number;
}

interface BundlePreviewPermission {
  id: string;
  code: string;
  name: string;
}

interface PropertyBundlePreview {
  roleId: string | null;
  roleVersion: number | null;
  mode: "merge" | "sync";
  add: BundlePreviewPermission[];
  keepExtra: BundlePreviewPermission[];
  removeExtra: BundlePreviewPermission[];
  final: BundlePreviewPermission[];
  previewSignature: string;
  requiresRemovalConfirmation: boolean;
}

interface TemplateInstanceFormState {
  code: string;
  name: string;
  parentId: string;
}

const templateInstantiationPermissions = [
  SYSTEM_PERMISSIONS.ROLE_COPY,
  SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS,
  SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE,
  SYSTEM_PERMISSIONS.ROLE_ASSIGN_FIELD_POLICY
] as const;

const templateInstantiationPermissionLabels = new Map<string, string>([
  [SYSTEM_PERMISSIONS.ROLE_COPY, "实例化模板角色"],
  [SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS, "角色授权"],
  [SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE, "角色绑定数据权限"],
  [SYSTEM_PERMISSIONS.ROLE_ASSIGN_FIELD_POLICY, "角色绑定字段策略"]
]);

const emptyPage: PaginatedResult<RoleNode> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyForm: RoleFormState = {
  code: "",
  name: "",
  parentId: "",
  dataScope: "tenant",
  dataScopeConfigText: "{}",
  roleType: "custom",
  roleScope: "tenant",
  sortNo: 0,
  isTemplate: false,
  status: "enabled",
  remark: ""
};

export default function RolesPage() {
  const authUser = useAuthUser();
  const [data, setData] = useState(emptyPage);
  const [roleTree, setRoleTree] = useState<RoleNode[]>([]);
  const [permissionTree, setPermissionTree] = useState<PermissionNode[]>([]);
  const [dataScopeRules, setDataScopeRules] = useState<DataScopeRule[]>([]);
  const [fieldPolicies, setFieldPolicies] = useState<FieldPolicy[]>([]);
  const [propertyBundles, setPropertyBundles] = useState<PropertyBundleCatalogItem[]>([]);
  const [selectedBundleCodes, setSelectedBundleCodes] = useState<string[]>([]);
  const [bundleMode, setBundleMode] = useState<"merge" | "sync">("merge");
  const [bundlePreview, setBundlePreview] = useState<PropertyBundlePreview | null>(null);
  const [bundleApplying, setBundleApplying] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [assignability, setAssignability] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleNode | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);
  const [selectedDataScopeIds, setSelectedDataScopeIds] = useState<string[]>([]);
  const [selectedFieldPolicyIds, setSelectedFieldPolicyIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formState, setFormState] = useState<RoleFormState>(emptyForm);
  const [templateInstanceRole, setTemplateInstanceRole] = useState<RoleNode | null>(null);
  const [templateInstanceForm, setTemplateInstanceForm] = useState<TemplateInstanceFormState>({ code: "", name: "", parentId: "" });
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"permissions" | "propertyBundles" | "dataScopes" | "fieldPolicies">("permissions");
  const [workspace, setWorkspace] = useState<"config" | "list">("config");

  const flatRoles = useMemo(() => flattenRoles(roleTree), [roleTree]);
  const flatPermissions = useMemo(() => flattenPermissions(permissionTree), [permissionTree]);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  const canInstantiateTemplates = hasAllPermissions(authUser, [...templateInstantiationPermissions]);
  const canAssignUserRoles = hasPermission(authUser, SYSTEM_PERMISSIONS.USER_ASSIGN_ROLES);
  const missingTemplateInstantiationPermissions = templateInstantiationPermissions
    .filter((permission) => !hasPermission(authUser, permission))
    .map((permission) => templateInstantiationPermissionLabels.get(permission) ?? permission);

  async function load(page = 1, keepSelectedId = selectedRoleId) {
    const token = getToken();
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (status) params.set("status", status);
    if (assignability) params.set("assignability", assignability);
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
    void apiRequest<PropertyBundleCatalogItem[]>("/roles/property-bundles", { token })
      .then((response) => setPropertyBundles(response.data))
      .catch(() => setPropertyBundles([]));
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
    setSelectedBundleCodes(detailResponse.data.appliedBundleCodes ?? []);
    setBundlePreview(null);
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
      dataScopeConfigText: JSON.stringify(role.dataScopeConfig ?? {}, null, 2),
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
    const dataScopeConfig = parseDataScopeConfig(formState.dataScopeConfigText);
    const body = {
      code: formState.code.trim(),
      name: formState.name.trim(),
      parentId: formState.parentId || undefined,
      dataScope: formState.dataScope,
      dataScopeConfig,
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

  function openTemplateInstance(role: RoleNode) {
    setTemplateInstanceRole(role);
    setTemplateInstanceForm({
      code: `${role.code}_INSTANCE`,
      name: `${role.name}普通角色`,
      parentId: role.parentId ?? ""
    });
  }

  async function submitTemplateInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const role = templateInstanceRole;
    if (!role) return;
    const code = templateInstanceForm.code.trim();
    const name = templateInstanceForm.name.trim();
    if (!code || !name) {
      setMessage("请填写新角色编码和名称");
      return;
    }
    const token = getToken();
    const response = await apiRequest<RoleNode>(`/roles/${role.id}/copy`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-copy"),
      body: {
        code,
        name,
        parentId: templateInstanceForm.parentId || undefined,
        roleScope: role.roleScope,
        dataScope: role.dataScope,
        dataScopeConfig: role.dataScopeConfig ?? {}
      }
    });
    setTemplateInstanceRole(null);
    setMessage(
      response.data.isAssignable && canAssignUserRoles
        ? "已实例化为可分配角色，可到用户管理分配给用户"
        : "已实例化为普通角色，可继续配置权限、数据范围和字段策略"
    );
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
    await selectRole(selectedRole.id);
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

  function bundleReferences(codes = selectedBundleCodes) {
    return propertyBundles
      .filter((bundle) => codes.includes(bundle.code))
      .map((bundle) => ({ code: bundle.code, version: bundle.definitionVersion, hash: bundle.definitionHash }));
  }

  async function previewBundles(roleId: string | null = selectedRole?.id ?? null, codes = selectedBundleCodes) {
    const bundles = bundleReferences(codes);
    if (bundles.length === 0) throw new Error("请至少选择一个权限包");
    if (bundles.length !== codes.length) throw new Error("权限包目录已变化，请刷新后重新选择");
    const token = getToken();
    const path = roleId ? `/roles/${roleId}/property-bundles/preview` : "/roles/property-bundles/preview";
    const response = await apiRequest<PropertyBundlePreview>(path, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-property-bundle-preview"),
      body: { bundles, mode: bundleMode }
    });
    if (roleId) setBundlePreview(response.data);
    return response.data;
  }

  async function applyBundles() {
    if (!selectedRole || bundleApplying) return;
    setBundleApplying(true);
    try {
    const preview = bundlePreview ?? await previewBundles(selectedRole.id);
    if (preview.roleVersion !== selectedRole.version) throw new Error("角色版本已变化，请重新预览");
    if (preview.requiresRemovalConfirmation && !window.confirm(`同步将删除 ${preview.removeExtra.length} 项额外权限，是否继续？`)) return;
    const token = getToken();
    const response = await apiRequest<RoleNode>(`/roles/${selectedRole.id}/property-bundles`, {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-property-bundles"),
      body: {
        bundles: bundleReferences(),
        mode: bundleMode,
        roleVersion: selectedRole.version,
        previewSignature: preview.previewSignature,
        confirmRemovals: preview.requiresRemovalConfirmation
      }
    });
    setMessage("权限包已应用，角色权限与 current_park 数据范围已更新");
    await load(data.page, response.data.id);
    } finally {
      setBundleApplying(false);
    }
  }

  async function createFromBundles() {
    const enteredCodes = window.prompt("权限包编码（多个用逗号分隔；请显式选择）", "");
    if (!enteredCodes) return;
    const createBundleCodes = [...new Set(enteredCodes.split(",").map((code) => code.trim()).filter(Boolean))];
    if (createBundleCodes.length === 0) throw new Error("请至少选择一个权限包");
    const preview = await previewBundles(null, createBundleCodes);
    if (!window.confirm(`权限包：${createBundleCodes.join("、")}\n最终权限 ${preview.final.length} 项，新增 ${preview.add.length} 项。确认继续创建角色？`)) return;
    const code = window.prompt("新角色编码（大写字母、数字、下划线）");
    if (!code) return;
    const name = window.prompt("新角色名称");
    if (!name) return;
    const token = getToken();
    const response = await apiRequest<RoleNode>("/roles/property-bundles/roles", {
      method: "POST",
      token,
      idempotencyKey: createIdempotencyKey("role-property-bundle-create"),
      body: {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        bundles: bundleReferences(createBundleCodes),
        mode: bundleMode,
        previewSignature: preview.previewSignature
      }
    });
    setMessage("已按权限包创建 current_park 角色");
    await load(1, response.data.id);
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
          <span>角色树、模板实例化、权限树授权、数据权限和字段策略绑定</span>
        </div>
        <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE} type="button" onClick={() => openCreateForm()}>
          <Plus size={16} />新增自定义角色
        </PermissionButton>
        {hasAllPermissions(authUser, [SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE, SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS, SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE]) ? (
          <button type="button" onClick={() => void createFromBundles().catch(showError)}>
            <Layers3 size={16} />按权限包新建
          </button>
        ) : null}
      </header>

      <section className="filter-bar">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch(showError); }}>
          <div className="dashboard-grid">
            <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="角色编码 / 名称" /></div>
            <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            <div className="field"><label>可分配性</label><select value={assignability} onChange={(event) => setAssignability(event.target.value)}><option value="">全部角色</option><option value="assignable">可分配角色</option><option value="unassignable">不可分配角色</option><option value="template">模板角色</option><option value="protected">系统/内置/平台角色</option><option value="disabled">停用角色</option></select></div>
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
              {roleTree.length === 0 ? <p className="muted-text">暂无角色；如需给用户分配标准岗位，请先选择模板并实例化为普通角色。</p> : null}
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
                    <AssignabilityBadge role={selectedRole} />
                  </div>
                  <div className="system-actions">
                    <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE} type="button" onClick={() => openEditForm(selectedRole)}><Edit3 size={16} />编辑</PermissionButton>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_DISABLE} type="button" onClick={() => void toggleStatus(selectedRole).catch(showError)}><Power size={16} />{selectedRole.status === "enabled" ? "停用" : "启用"}</PermissionButton>
                    {selectedRole.isTemplate && canInstantiateTemplates ? <button type="button" onClick={() => openTemplateInstance(selectedRole)}><Copy size={16} />实例化为普通角色</button> : null}
                    {selectedRole.isBuiltin || selectedRole.isSystem || selectedRole.isDeletable === false ? null : <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_OPEN_DELETE} type="button" onClick={() => void deleteRole(selectedRole).catch(showError)}><Trash2 size={16} />删除</PermissionButton>}
                  </div>
                </div>

                {selectedRole.isTemplate ? (
                  <div className="status-pill" role="note">
                    模板角色不能直接授权或分配给用户；请先实例化为当前园区普通角色，实例化后可继续配置并分配给用户。
                    {canInstantiateTemplates ? (
                      <button className="inline-action-button" type="button" onClick={() => openTemplateInstance(selectedRole)}>实例化为普通角色</button>
                    ) : (
                      <span> 当前账号缺少实例化所需权限：{missingTemplateInstantiationPermissions.join("、")}。</span>
                    )}
                  </div>
                ) : selectedRole.isProtected ? (
                  <p className="status-pill" role="note">该角色受系统保护，不可直接修改绑定或分配给用户。</p>
                ) : null}

                <div className="system-grid-three role-meta-grid">
                  <Meta label="角色范围" value={selectedRole.roleScope} />
                  <Meta label="角色类型" value={selectedRole.roleType} />
                  <Meta label="数据范围" value={selectedRole.dataScope} />
                  <Meta label="范围配置" value={formatDataScopeConfig(selectedRole.dataScopeConfig)} />
                  <Meta label="分配状态" value={selectedRole.assignabilityLabel} />
                </div>

                <div className="system-tabs">
                  <TabButton active={activeTab === "permissions"} onClick={() => setActiveTab("permissions")}><KeyRound size={16} />权限树</TabButton>
                  <TabButton active={activeTab === "propertyBundles"} onClick={() => setActiveTab("propertyBundles")}><Layers3 size={16} />权限包</TabButton>
                  <TabButton active={activeTab === "dataScopes"} onClick={() => setActiveTab("dataScopes")}><Layers3 size={16} />数据权限</TabButton>
                  <TabButton active={activeTab === "fieldPolicies"} onClick={() => setActiveTab("fieldPolicies")}><ShieldCheck size={16} />字段策略</TabButton>
                </div>

                {activeTab === "permissions" ? <PermissionBinding tree={permissionTree} selectedIds={selectedPermissionIds} total={flatPermissions.length} protectedRole={Boolean(selectedRole.isTemplate || selectedRole.isBuiltin || selectedRole.isSystem || selectedRole.editable === false || selectedRole.isEditable === false)} onToggle={togglePermission} onSave={() => void savePermissions().catch(showError)} /> : null}
                {activeTab === "propertyBundles" ? (
                  <PropertyBundleBinding
                    bundles={propertyBundles}
                    selectedCodes={selectedBundleCodes}
                    mode={bundleMode}
                    preview={bundlePreview}
                    protectedRole={Boolean(selectedRole.roleScope !== "park" || selectedRole.isTemplate || selectedRole.isBuiltin || selectedRole.isSystem || selectedRole.editable === false || selectedRole.isEditable === false)}
                    canApply={hasAllPermissions(authUser, [SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE, SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS, SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE])}
                    onToggle={(code, checked) => { setSelectedBundleCodes(toggleList(code, checked)); setBundlePreview(null); }}
                    onModeChange={(mode) => { setBundleMode(mode); setBundlePreview(null); }}
                    onPreview={() => void previewBundles().catch(showError)}
                    onApply={() => void applyBundles().catch(showError)}
                    applying={bundleApplying}
                  />
                ) : null}
                {activeTab === "dataScopes" ? <BindingPanel title="数据权限规则" emptyText="暂无数据权限规则" items={dataScopeRules} selectedIds={selectedDataScopeIds} protectedRole={Boolean(selectedRole.isTemplate || selectedRole.isBuiltin || selectedRole.isSystem || selectedRole.editable === false || selectedRole.isEditable === false)} onToggle={(id, checked) => setSelectedDataScopeIds(toggleList(id, checked))} onSave={() => void saveDataScopes().catch(showError)} savePermission={SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE} renderItem={(item) => <><strong>{item.ruleName}</strong><span>{item.ruleCode} · {item.dimension} · {item.scopeType} · {formatDataScopeConfig(item.scopeConfig)}</span></>} /> : null}
                {activeTab === "fieldPolicies" ? <BindingPanel title="字段权限策略" emptyText="暂无字段权限策略" items={fieldPolicies} selectedIds={selectedFieldPolicyIds} protectedRole={Boolean(selectedRole.isTemplate || selectedRole.isBuiltin || selectedRole.isSystem || selectedRole.editable === false || selectedRole.isEditable === false)} onToggle={(id, checked) => setSelectedFieldPolicyIds(toggleList(id, checked))} onSave={() => void saveFieldPolicies().catch(showError)} savePermission={SYSTEM_PERMISSIONS.ROLE_ASSIGN_FIELD_POLICY} renderItem={(item) => <><strong>{item.fieldName}</strong><span>{item.module}.{item.entity}.{item.fieldKey} · {item.policyType}{item.maskRule ? ` · ${item.maskRule}` : ""}</span></>} /> : null}
              </div>
            ) : <p className="status-pill">请选择一个角色</p>}
          </Card>
        </section>
      ) : (
        <Card >
          <h2 className="panel-title">角色列表</h2>
          <div className="table-scroll">
            <DataTable >
              <thead><tr><th>编码</th><th>名称</th><th>上级</th><th>范围</th><th>数据范围</th><th>标签</th><th>可分配性</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>{item.name}</td>
                    <td>{item.parentId ? flatRoles.find((role) => role.id === item.parentId)?.name ?? "-" : "-"}</td>
                    <td>{item.roleScope}</td>
                    <td><span className="status-pill">{item.dataScope}</span></td>
                    <td><RoleTags role={item} /></td>
                    <td><AssignabilityBadge role={item} /></td>
                    <td><StatusBadge status={item.status} /></td>
                    <td><button className="inline-action-button" type="button" onClick={() => { setWorkspace("config"); void selectRole(item.id).catch(showError); }}>配置</button></td>
                  </tr>
                ))}
                {data.items.length === 0 ? <tr><td colSpan={9}>暂无角色；如需给用户分配标准岗位，请先在角色配置中选择模板并实例化为普通角色。</td></tr> : null}
              </tbody>
            </DataTable>
          </div>
          <div className="task-item"><span>共 {data.total} 条，第 {data.page} / {totalPages} 页</span><span className="pagination-actions"><button className="pagination-button" type="button" disabled={data.page <= 1} onClick={() => void load(Math.max(1, data.page - 1)).catch(showError)}>上一页</button><button className="pagination-button" type="button" disabled={data.page >= totalPages} onClick={() => void load(data.page + 1).catch(showError)}>下一页</button></span></div>
        </Card>
      )}

      {formOpen ? (
        <Drawer size="md" onClose={() => setFormOpen(false)}>
          <DrawerHeader
            eyebrow="系统管理"
            title={formMode === "create" ? "新增自定义角色" : "编辑角色"}
            description="维护角色基础信息、层级、范围与数据范围。"
            onClose={() => setFormOpen(false)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void submitRole(event).catch(showError)}>
            <DrawerFormGrid>
              <div className="field"><label>角色编码</label><input required value={formState.code} onChange={(event) => setFormState({ ...formState, code: event.target.value })} disabled={formMode === "edit" && Boolean(selectedRole?.isBuiltin)} /></div>
              <div className="field"><label>角色名称</label><input required value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} /></div>
              <div className="field"><label>上级角色</label><select value={formState.parentId} onChange={(event) => setFormState({ ...formState, parentId: event.target.value })}><option value="">无</option>{flatRoles.filter((role) => role.id !== formState.id).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
              <div className="field"><label>数据范围</label><select value={formState.dataScope} onChange={(event) => setFormState({ ...formState, dataScope: event.target.value })}><option value="tenant">本租户</option><option value="park">本园区</option><option value="org">本组织</option><option value="org_and_children">本组织及下级</option><option value="self">本人</option><option value="custom">自定义</option><option value="all">全部</option></select></div>
              <div className="field"><label>角色类型</label><select value={formState.roleType} onChange={(event) => setFormState({ ...formState, roleType: event.target.value })}><option value="custom">自定义</option><option value="tenant">租户角色</option><option value="park">园区角色</option><option value="tenant_external">租户外部角色</option><option value="system">系统角色</option></select></div>
              <div className="field"><label>角色范围</label><select value={formState.roleScope} onChange={(event) => setFormState({ ...formState, roleScope: event.target.value })} disabled={formMode === "edit"}><option value="tenant">租户</option><option value="park">园区</option><option value="platform">平台</option></select></div>
              <div className="field"><label>排序</label><input type="number" value={formState.sortNo} onChange={(event) => setFormState({ ...formState, sortNo: Number(event.target.value) })} onFocus={(event) => event.target.select()} /></div>
              <div className="field"><label>状态</label><select value={formState.status} onChange={(event) => setFormState({ ...formState, status: event.target.value })}><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="checkbox-list">
                <label className="checkbox-row"><input type="checkbox" checked={formState.isTemplate} onChange={(event) => setFormState({ ...formState, isTemplate: event.target.checked })} /><span>设为模板角色</span></label>
              </div>
              <div className="field"><label>dataScopeConfig JSON</label><textarea className="json-editor" value={formState.dataScopeConfigText} onChange={(event) => setFormState({ ...formState, dataScopeConfigText: event.target.value })} /></div>
              <div className="field"><label>备注</label><input value={formState.remark} onChange={(event) => setFormState({ ...formState, remark: event.target.value })} /></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>取消</button>
              <button className="primary-button" type="submit"><Save size={16} />保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {templateInstanceRole ? (
        <Drawer size="md" onClose={() => setTemplateInstanceRole(null)}>
          <DrawerHeader
            eyebrow="模板实例化"
            title="实例化为普通角色"
            description="从受保护模板生成当前园区可配置、可分配的普通角色。"
            onClose={() => setTemplateInstanceRole(null)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void submitTemplateInstance(event).catch(showError)}>
            <DrawerFormGrid single>
              <div className="system-grid-three role-meta-grid">
                <Meta label="来源模板" value={`${templateInstanceRole.name} · ${templateInstanceRole.code}`} />
                <Meta label="实例范围" value={templateInstanceRole.roleScope === "park" ? "当前园区" : templateInstanceRole.roleScope} />
                <Meta label="数据范围" value={templateInstanceRole.dataScope} />
              </div>
              <p className="muted-text">实例化后会生成非模板、非系统、非内置的普通角色；权限和当前园区数据范围由标准模板定义生成，字段策略沿用模板当前配置。</p>
              <div className="field"><label>新角色编码</label><input required value={templateInstanceForm.code} onChange={(event) => setTemplateInstanceForm({ ...templateInstanceForm, code: event.target.value })} /></div>
              <div className="field"><label>新角色名称</label><input required value={templateInstanceForm.name} onChange={(event) => setTemplateInstanceForm({ ...templateInstanceForm, name: event.target.value })} /></div>
              <div className="field">
                <label>上级角色</label>
                <select value={templateInstanceForm.parentId} onChange={(event) => setTemplateInstanceForm({ ...templateInstanceForm, parentId: event.target.value })}>
                  <option value="">无</option>
                  {flatRoles.filter((role) => role.id !== templateInstanceRole.id && !role.isTemplate).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setTemplateInstanceRole(null)}>取消</button>
              <button className="primary-button" type="submit"><Copy size={16} />实例化</button>
            </DrawerFooter>
          </DrawerForm>
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
        <AssignabilityBadge role={role} />
        <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE} type="button" title="新增子角色" onClick={() => onCreateChild(role.id)}><Plus size={14} />子角色</PermissionButton>
      </div>
      {role.children && role.children.length > 0 ? <div className="tree-children">{role.children.map((child) => <RoleTreeItem key={child.id} role={child} selectedId={selectedId} onSelect={onSelect} onCreateChild={onCreateChild} />)}</div> : null}
    </div>
  );
}

function PermissionBinding({ tree, selectedIds, total, protectedRole, onToggle, onSave }: { tree: PermissionNode[]; selectedIds: string[]; total: number; protectedRole: boolean; onToggle: (permission: PermissionNode, checked: boolean) => void; onSave: () => void }) {
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <span className="status-pill">已选择 {selectedIds.length} / {total}</span>
        <PermissionButton permission={SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS} className="primary-button" type="button" disabled={protectedRole} onClick={onSave}><Save size={16} />保存权限</PermissionButton>
      </div>
      {protectedRole ? <p className="status-pill status-danger" role="alert">受保护角色的绑定不可直接修改；请先实例化为普通角色。</p> : null}
      <div className="tree-list role-binding-scroll">{tree.map((permission) => <PermissionTreeItem key={permission.id} permission={permission} selectedIds={selectedIds} disabled={protectedRole} onToggle={onToggle} />)}</div>
    </section>
  );
}

function PropertyBundleBinding({ bundles, selectedCodes, mode, preview, protectedRole, canApply, applying, onToggle, onModeChange, onPreview, onApply }: {
  bundles: PropertyBundleCatalogItem[];
  selectedCodes: string[];
  mode: "merge" | "sync";
  preview: PropertyBundlePreview | null;
  protectedRole: boolean;
  canApply: boolean;
  applying: boolean;
  onToggle: (code: string, checked: boolean) => void;
  onModeChange: (mode: "merge" | "sync") => void;
  onPreview: () => void;
  onApply: () => void;
}) {
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <div className="field">
          <label>更新语义</label>
          <select value={mode} onChange={(event) => onModeChange(event.target.value as "merge" | "sync")} disabled={protectedRole}>
            <option value="merge">安全合并（保留额外权限）</option>
            <option value="sync">同步为权限包集合（可能删除）</option>
          </select>
        </div>
        <div className="system-actions">
          <button type="button" onClick={onPreview} disabled={protectedRole || selectedCodes.length === 0}>预览差异</button>
          {canApply ? <button className="primary-button" type="button" onClick={onApply} disabled={protectedRole || !preview || applying}><Save size={16} />{applying ? "应用中…" : "应用权限包"}</button> : null}
        </div>
      </div>
      {protectedRole ? <p className="status-pill status-danger" role="alert">模板、系统或内置角色不可从页面更新；请先实例化为普通角色。</p> : null}
      <div className="binding-list role-binding-scroll">
        {bundles.map((bundle) => (
          <label key={bundle.code} className="binding-row">
            <input type="checkbox" checked={selectedCodes.includes(bundle.code)} disabled={protectedRole} onChange={(event) => onToggle(bundle.code, event.target.checked)} />
            <span className="role-binding-content"><strong>{bundle.name}</strong><small>{bundle.code} · v{bundle.definitionVersion} · {bundle.permissionCount} 项</small></span>
            <span className="status-pill">{bundle.definitionHash.slice(0, 8)}</span>
          </label>
        ))}
      </div>
      {preview ? (
        <div className="detail-stack" aria-live="polite">
          <div className="system-grid-three role-meta-grid">
            <Meta label="新增" value={String(preview.add.length)} />
            <Meta label="保留额外" value={String(preview.keepExtra.length)} />
            <Meta label="删除额外" value={String(preview.removeExtra.length)} />
          </div>
          <p className="muted-text">最终权限 {preview.final.length} 项。{preview.requiresRemovalConfirmation ? "提交前将再次确认删除集合。" : "不会静默删除额外权限。"}</p>
          {preview.removeExtra.length > 0 ? <div className="binding-list">{preview.removeExtra.map((permission) => <span className="status-pill status-danger" key={permission.code}>{permission.name} · {permission.code}</span>)}</div> : null}
          <details>
            <summary>查看最终权限集合（{preview.final.length}）</summary>
            <div className="binding-list">
              {preview.final.map((permission) => <span className="status-pill" key={permission.code}>{permission.name} · {permission.code}</span>)}
            </div>
          </details>
        </div>
      ) : <p className="muted-text">选择权限包并预览后才能提交；预览与写入均由服务端重算。</p>}
    </section>
  );
}

function PermissionTreeItem({ permission, selectedIds, disabled, onToggle }: { permission: PermissionNode; selectedIds: string[]; disabled: boolean; onToggle: (permission: PermissionNode, checked: boolean) => void }) {
  return (
    <div className="tree-list">
      <label className="permission-row">
        <input type="checkbox" checked={selectedIds.includes(permission.id)} disabled={disabled} onChange={(event) => onToggle(permission, event.target.checked)} />
        <span className="role-binding-content"><strong>{permission.name}</strong><small>{permission.code}</small></span>
        <span className="status-pill">{permission.permissionType ?? `type-${permission.permType ?? 40}`}</span>
      </label>
      {permission.children && permission.children.length > 0 ? <div className="tree-children">{permission.children.map((child) => <PermissionTreeItem key={child.id} permission={child} selectedIds={selectedIds} disabled={disabled} onToggle={onToggle} />)}</div> : null}
    </div>
  );
}

function BindingPanel<T extends { id: string; status: string }>({ title, emptyText, items, selectedIds, protectedRole, onToggle, onSave, savePermission, renderItem }: { title: string; emptyText: string; items: T[]; selectedIds: string[]; protectedRole: boolean; onToggle: (id: string, checked: boolean) => void; onSave: () => void; savePermission: string; renderItem: (item: T) => ReactNode }) {
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <span className="status-pill">{title}：已选择 {selectedIds.length} / {items.length}</span>
        <PermissionButton permission={savePermission} className="primary-button" type="button" disabled={protectedRole} onClick={onSave}><Save size={16} />保存绑定</PermissionButton>
      </div>
      <div className="binding-list role-binding-scroll">
        {items.length === 0 ? <p className="status-pill">{emptyText}</p> : null}
        {items.map((item) => (
          <label key={item.id} className="binding-row">
            <input type="checkbox" checked={selectedIds.includes(item.id)} disabled={protectedRole} onChange={(event) => onToggle(item.id, event.target.checked)} />
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

function AssignabilityBadge({ role }: { role: RoleNode }) {
  return (
    <span className={`status-pill${role.isAssignable ? " status-success" : " status-muted"}`} title={role.unassignableReasons?.join(", ") || "assignable"}>
      {role.isAssignable ? "可分配给用户" : role.assignabilityLabel || "不可分配"}
    </span>
  );
}

function parseDataScopeConfig(value: string): Record<string, unknown> {
  if (/\b(select|insert|update|delete|drop|alter|truncate|union|where|from)\b/i.test(value)) {
    throw new Error("dataScopeConfig 只能填写结构化 JSON，不能包含 SQL");
  }
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("dataScopeConfig 必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

function formatDataScopeConfig(config: Record<string, unknown> | undefined): string {
  const entries = Object.entries(config ?? {});
  if (entries.length === 0) return "{}";
  return entries
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.length : 1}`)
    .join(" · ");
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
