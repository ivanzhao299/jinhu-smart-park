"use client";

import { Card, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { ChevronDown, ChevronRight, Database, FolderTree, KeyRound, Plus, Save, Search, ShieldCheck, Trash2, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
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

interface CreateDefaults {
  parentId: string;
  permType: number;
  resource: string;
  action: string;
  title: string;
}

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

type CreatePresetKey = "menu" | "button" | "api" | "data" | "field";

const createPresets: Record<CreatePresetKey, Omit<CreateDefaults, "parentId">> = {
  menu: { permType: 10, resource: "system.menu", action: "view", title: "新增菜单权限" },
  button: { permType: 30, resource: "system.button", action: "click", title: "新增按钮权限" },
  api: { permType: 40, resource: "system.api", action: "request", title: "新增 API 权限" },
  data: { permType: 50, resource: "system.data", action: "read", title: "新增数据权限" },
  field: { permType: 60, resource: "system.field", action: "read", title: "新增字段权限" }
};

export default function PermissionsPage() {
  const [tree, setTree] = useState<PermissionRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [permType, setPermType] = useState("");
  const [includeApi, setIncludeApi] = useState(false);
  const [selected, setSelected] = useState<PermissionRow | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showDetailApi, setShowDetailApi] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<CreateDefaults | null>(null);
  const [message, setMessage] = useState("");

  const flatTree = useMemo(() => flattenTree(tree), [tree]);
  const visibleTree = useMemo(
    () => filterPermissionTree(tree, { keyword, status, permType, includeApi }),
    [tree, keyword, status, permType, includeApi]
  );
  const visibleCount = useMemo(() => flattenTree(visibleTree).length, [visibleTree]);
  const summary = useMemo(() => summarizePermissions(flatTree, visibleCount), [flatTree, visibleCount]);
  const selectedChildren = selected?.children ?? [];
  const selectedMainChildren = selectedChildren.filter((item) => item.permType !== 40);
  const selectedApiChildren = selectedChildren.filter((item) => item.permType === 40);

  async function load() {
    const treeResponse = await apiRequest<PermissionRow[]>("/permissions/tree", { token: getToken() });
    setTree(treeResponse.data);
    setExpandedIds((current) => {
      const next = new Set(current);
      treeResponse.data.forEach((item) => next.add(item.id));
      return next;
    });
    setSelected((current) => {
      if (current && flattenTree(treeResponse.data).some((item) => item.id === current.id)) {
        return current;
      }
      return treeResponse.data[0] ?? null;
    });
  }

  function openCreate(kind: CreatePresetKey) {
    const preset = createPresets[kind];
    setCreateDefaults({
      ...preset,
      parentId: selected?.id ?? ""
    });
  }

  async function createPermission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await apiRequest<PermissionRow>("/permissions", {
      method: "POST",
      token: getToken(),
      idempotencyKey: createIdempotencyKey("permission-create"),
      body: {
        code: String(form.get("code") ?? ""),
        name: String(form.get("name") ?? ""),
        parentId: String(form.get("parentId") ?? "") || undefined,
        permType: Number(form.get("permType") ?? createDefaults?.permType ?? 90),
        resource: String(form.get("resource") ?? createDefaults?.resource ?? "tenant.custom"),
        action: String(form.get("action") ?? createDefaults?.action ?? "custom"),
        sortNo: Number(form.get("sortNo") ?? 0),
        frontendRoute: String(form.get("frontendRoute") ?? "") || undefined,
        componentKey: String(form.get("componentKey") ?? "") || undefined,
        apiPath: String(form.get("apiPath") ?? "") || undefined,
        apiMethod: String(form.get("apiMethod") ?? "") || undefined,
        fieldKey: String(form.get("fieldKey") ?? "") || undefined,
        dataDimension: String(form.get("dataDimension") ?? "") || undefined,
        status: String(form.get("status") ?? "enabled"),
        remark: String(form.get("remark") ?? "") || undefined
      }
    });
    setCreateDefaults(null);
    setMessage("权限已创建");
    await load();
  }

  async function deletePermission(permission: PermissionRow) {
    if (permission.isBuiltin || permission.isSystem) return;
    if (!window.confirm(`确认删除权限「${permission.name}」？`)) return;
    await apiRequest<{ id: string }>(`/permissions/${permission.id}`, {
      method: "DELETE",
      token: getToken(),
      idempotencyKey: createIdempotencyKey("permission-delete")
    });
    setSelected(null);
    setMessage("权限已删除");
    await load();
  }

  useEffect(() => {
    void load().catch(showError);
  }, []);

  useEffect(() => {
    setShowDetailApi(false);
  }, [selected?.id]);

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : "操作失败");
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <main className="page-container permissions-page">
      <header className="page-header">
        <div className="header-title">
          <strong>权限中心</strong>
          <span>维护菜单、页面、按钮、接口、数据和字段权限资产</span>
        </div>
        <div className="system-actions">
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE} type="button" onClick={() => openCreate("menu")}><Plus size={16} />菜单</PermissionButton>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE} type="button" onClick={() => openCreate("button")}><Plus size={16} />按钮</PermissionButton>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE} type="button" onClick={() => openCreate("api")}><Plus size={16} />API</PermissionButton>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE} type="button" onClick={() => openCreate("data")}><Plus size={16} />数据</PermissionButton>
          <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE} type="button" onClick={() => openCreate("field")}><Plus size={16} />字段</PermissionButton>
        </div>
      </header>

      <section className="filter-bar permission-filter-bar">
        <form className="system-grid-three" onSubmit={(event) => { event.preventDefault(); }}>
          <div className="field"><label>关键词</label><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="权限名称 / 编码 / 路由" /></div>
          <div className="field"><label>状态</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
          <div className="field"><label>权限分类</label><select value={permType} onChange={(event) => setPermType(event.target.value)}>{permTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div className="filter-actions">
            <label className="permission-api-toggle"><input type="checkbox" checked={includeApi} onChange={(event) => setIncludeApi(event.target.checked)} />显示 API</label>
            <button className="primary-button" type="button" onClick={() => void load().catch(showError)}><Search size={16} />刷新</button>
          </div>
        </form>
        <div className="permission-summary-strip" aria-label="权限统计">
          <SummaryItem label="权限资产" value={summary.total} icon={<ShieldCheck size={17} />} />
          <SummaryItem label="菜单 / 页面" value={summary.navigation} icon={<FolderTree size={17} />} />
          <SummaryItem label="按钮" value={summary.buttons} icon={<KeyRound size={17} />} />
          <SummaryItem label="API" value={summary.apis} icon={<Database size={17} />} />
          <SummaryItem label="当前显示" value={summary.visible} icon={<Search size={17} />} />
        </div>
      </section>

      <section className="permission-workbench">
        <Card>
          <div className="system-toolbar">
            <h2 className="panel-title">权限树</h2>
            <span className="status-pill">{includeApi || keyword || permType === "40" ? "含 API" : "API 已折叠"}</span>
          </div>
          <div className="permission-tree-scroll">
            {visibleTree.length === 0 ? <p className="status-pill">没有匹配的权限节点</p> : null}
            {visibleTree.map((permission) => (
              <PermissionTree
                key={permission.id}
                permission={permission}
                selectedId={selected?.id ?? ""}
                expandedIds={expandedIds}
                onSelect={setSelected}
                onToggle={toggleExpanded}
              />
            ))}
          </div>
        </Card>

        <Card>
          <div className="system-toolbar">
            <h2 className="panel-title">权限详情</h2>
            {selected ? <StatusBadge status={selected.status} /> : null}
          </div>
          {selected ? (
            <div className="permission-detail">
              <section className="permission-detail-hero">
                <div>
                  <span className="status-pill">{typeLabel(selected.permType)}</span>
                  <h3>{selected.name}</h3>
                  <p>{selected.code}</p>
                </div>
                <div className="system-actions">
                  {selected.isBuiltin || selected.isSystem ? <span className="status-pill">系统内置</span> : null}
                  {selected.isTenantCustom ? <span className="status-pill">租户自定义</span> : null}
                </div>
              </section>

              <section className="permission-meta-grid">
                <Meta label="资源 / 动作" value={`${selected.resource} / ${selected.action}`} />
                <Meta label="权限路径" value={selected.permPath ?? "-"} />
                <Meta label="前端路由" value={selected.frontendRoute ?? "-"} />
                <Meta label="组件键" value={selected.componentKey ?? "-"} />
                <Meta label="API" value={selected.apiPath ? `${selected.apiMethod ?? ""} ${selected.apiPath}` : "-"} />
                <Meta label="字段 / 数据" value={selected.fieldKey ?? selected.dataDimension ?? "-"} />
              </section>

              <section className="permission-child-panel">
                <div className="system-toolbar">
                  <h3 className="panel-title">子权限</h3>
                  <span className="status-pill">页面/按钮 {selectedMainChildren.length} · API {selectedApiChildren.length}</span>
                </div>
                <PermissionChildList items={selectedMainChildren} onSelect={setSelected} emptyText="暂无页面、按钮、数据或字段子权限" />
                {selectedApiChildren.length > 0 ? (
                  <div className="permission-api-section">
                    <button type="button" className="permission-api-toggle-button" onClick={() => setShowDetailApi((value) => !value)}>
                      {showDetailApi ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      API 权限 {selectedApiChildren.length}
                    </button>
                    {showDetailApi ? <PermissionChildList items={selectedApiChildren} onSelect={setSelected} emptyText="暂无 API 权限" /> : null}
                  </div>
                ) : null}
              </section>

              <div className="system-actions">
                <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_CREATE} type="button" onClick={() => openCreate("button")}><Plus size={16} />新增子权限</PermissionButton>
                {selected.isBuiltin || selected.isSystem ? <span className="status-pill">内置权限不可删除</span> : <PermissionButton permission={SYSTEM_PERMISSIONS.PERMISSION_OPEN_DELETE} type="button" onClick={() => void deletePermission(selected).catch(showError)}><Trash2 size={16} />删除</PermissionButton>}
              </div>
            </div>
          ) : <p className="status-pill">请选择权限节点查看详情</p>}
        </Card>
      </section>

      {createDefaults ? (
        <Drawer size="lg" onClose={() => setCreateDefaults(null)}>
          <DrawerHeader
            eyebrow="系统管理"
            title={createDefaults.title}
            description="维护权限资源、动作、路由与 API 等元数据。"
            onClose={() => setCreateDefaults(null)}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => void createPermission(event).catch(showError)}>
            <DrawerFormGrid>
              <div className="field"><label>编码</label><input name="code" placeholder="system:example:read" required /></div>
              <div className="field"><label>名称</label><input name="name" required /></div>
              <div className="field"><label>上级权限</label><select name="parentId" defaultValue={createDefaults.parentId}><option value="">无</option>{flatTree.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div className="field"><label>权限分类</label><select name="permType" defaultValue={createDefaults.permType}>{permTypes.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              <div className="field"><label>资源</label><input name="resource" defaultValue={createDefaults.resource} /></div>
              <div className="field"><label>动作</label><input name="action" defaultValue={createDefaults.action} /></div>
              <div className="field"><label>排序</label><input name="sortNo" type="number" defaultValue={0} onFocus={(event) => event.target.select()} /></div>
              <div className="field"><label>前端路由</label><input name="frontendRoute" /></div>
              <div className="field"><label>组件键</label><input name="componentKey" /></div>
              <div className="field"><label>API 方法</label><select name="apiMethod" defaultValue={createDefaults.permType === 40 ? "GET" : ""}><option value="">无</option><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option><option value="DELETE">DELETE</option></select></div>
              <div className="field"><label>API 路径</label><input name="apiPath" placeholder="/api/v1/example" /></div>
              <div className="field"><label>字段键</label><input name="fieldKey" /></div>
              <div className="field"><label>数据维度</label><input name="dataDimension" /></div>
              <div className="field"><label>状态</label><select name="status"><option value="enabled">启用</option><option value="disabled">停用</option></select></div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field"><label>备注</label><input name="remark" /></div>
            </DrawerFormGrid>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setCreateDefaults(null)}>取消</button>
              <button className="primary-button" type="submit"><Save size={16} />保存</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}
      {message ? <p className="status-pill">{message}</p> : null}
    </main>
  );
}

function PermissionTree({
  permission,
  selectedId,
  expandedIds,
  onSelect,
  onToggle
}: {
  permission: PermissionRow;
  selectedId: string;
  expandedIds: Set<string>;
  onSelect: (permission: PermissionRow) => void;
  onToggle: (id: string) => void;
}) {
  const children = permission.children ?? [];
  const expanded = expandedIds.has(permission.id);
  return (
    <div className="permission-tree-node">
      <div className={`permission-tree-row${selectedId === permission.id ? " active" : ""}`}>
        <button className="permission-tree-toggle" type="button" disabled={children.length === 0} onClick={() => onToggle(permission.id)} aria-label={expanded ? "收起" : "展开"}>
          {children.length > 0 ? expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : null}
        </button>
        <button className="permission-tree-main" type="button" onClick={() => onSelect(permission)}>
          <span>{permission.name}</span>
          <span className="muted-text">{permission.code}</span>
        </button>
        <span className="status-pill">{typeLabel(permission.permType)}</span>
      </div>
      {expanded && children.length > 0 ? (
        <div className="permission-tree-children">
          {children.map((child) => <PermissionTree key={child.id} permission={child} selectedId={selectedId} expandedIds={expandedIds} onSelect={onSelect} onToggle={onToggle} />)}
        </div>
      ) : null}
    </div>
  );
}

function PermissionChildList({ items, emptyText, onSelect }: { items: PermissionRow[]; emptyText: string; onSelect: (permission: PermissionRow) => void }) {
  if (items.length === 0) {
    return <p className="status-pill">{emptyText}</p>;
  }
  return (
    <div className="permission-child-list">
      {items.map((item) => (
        <button key={item.id} type="button" className="permission-child-row" onClick={() => onSelect(item)}>
          <span><strong>{item.name}</strong><em>{item.code}</em></span>
          <span className="status-pill">{typeLabel(item.permType)}</span>
        </button>
      ))}
    </div>
  );
}

function SummaryItem({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="permission-summary-item"><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="permission-meta-item"><span>{label}</span><strong>{value}</strong></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-pill ${status === "enabled" ? "status-success" : "status-muted"}`}>{status === "enabled" ? "启用" : "停用"}</span>;
}

function typeLabel(value?: number): string {
  return permTypes.find((item) => item.value === String(value ?? ""))?.label ?? `type-${value ?? 40}`;
}

function flattenTree(items: PermissionRow[]): PermissionRow[] {
  return items.flatMap((item) => [item, ...flattenTree(item.children ?? [])]);
}

function filterPermissionTree(items: PermissionRow[], filters: { keyword: string; status: string; permType: string; includeApi: boolean }): PermissionRow[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const hideApi = !filters.includeApi && !keyword && filters.permType !== "40";
  return items.flatMap((item) => {
    if (hideApi && item.permType === 40) {
      return [];
    }
    const children = filterPermissionTree(item.children ?? [], filters);
    const keywordMatched = !keyword || [item.name, item.code, item.resource, item.action, item.frontendRoute, item.apiPath, item.componentKey]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
    const statusMatched = !filters.status || item.status === filters.status;
    const typeMatched = !filters.permType || String(item.permType ?? "") === filters.permType;
    if ((keywordMatched && statusMatched && typeMatched) || children.length > 0) {
      return [{ ...item, children }];
    }
    return [];
  });
}

function summarizePermissions(items: PermissionRow[], visible: number) {
  return {
    total: items.length,
    navigation: items.filter((item) => item.permType === 10 || item.permType === 20).length,
    buttons: items.filter((item) => item.permType === 30).length,
    apis: items.filter((item) => item.permType === 40).length,
    visible
  };
}

function getToken(): string {
  return localStorage.getItem("jinhu_access_token") ?? "";
}
