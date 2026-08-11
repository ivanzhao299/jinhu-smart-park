"use client";
import { Card, DataTable, Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { CheckCircle2, Edit3, Plus, Search, Trash2, X, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SYSTEM_PERMISSIONS, type OrgPostOption, type OrgTreeNode, type PaginatedResult, type UserOrgAssignment } from "@jinhu/shared";
import { PermissionButton } from "../../../components/permission-button";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import {
  deduplicateUserParkOptions,
  resolveUserParkLabels,
  resolveUserParkSelection
} from "../user-park-options.logic";

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
  const [drawerError, setDrawerError] = useState("");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loginSettings, setLoginSettings] = useState<TenantLoginSettings | null>(null);
  const [loginSettingsLoading, setLoginSettingsLoading] = useState(false);
  const [formTenantId, setFormTenantId] = useState("");
  const [formParkId, setFormParkId] = useState("");
  const [accessibleParkIds, setAccessibleParkIds] = useState<string[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTreeNode[]>([]);
  const [posts, setPosts] = useState<OrgPostOption[]>([]);
  const [orgAssignments, setOrgAssignments] = useState<UserOrgAssignment[]>([]);
  const [loadedOrgAssignments, setLoadedOrgAssignments] = useState<UserOrgAssignment[]>([]);
  const [orgCatalogLoading, setOrgCatalogLoading] = useState(false);
  const loginSettingsRequest = useRef(0);
  const orgCatalogRequest = useRef(0);

  const selectedTenant = useMemo(
    () => tenants.items.find((item) => item.tenantId === tenantId) ?? tenants.items[0] ?? null,
    [tenantId, tenants.items]
  );
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  const parkOptions = useMemo(
    () => deduplicateUserParkOptions(loginSettings?.parks ?? []),
    [loginSettings]
  );
  const parkLabels = useMemo(
    () => resolveUserParkLabels(parkOptions, loginSettings?.tenant.tenantName),
    [loginSettings, parkOptions]
  );
  const orgOptions = useMemo(() => mergeRetainedOrgOptions(flattenOrgOptions(orgTree), orgAssignments), [orgTree, orgAssignments]);
  const postOptions = useMemo(() => mergeRetainedPostOptions(posts, orgAssignments), [posts, orgAssignments]);

  async function loadOrgCatalog(userId?: string, targetScope?: { tenantId: string; parkId: string }) {
    const requestId = ++orgCatalogRequest.current;
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    setOrgCatalogLoading(true);
    try {
      if (userId) {
        const [candidateResponse, assignmentResponse] = await Promise.all([
          apiRequest<{ orgs: Array<Omit<OrgTreeNode, "children">>; posts: OrgPostOption[] }>(`/users/${userId}/org-candidates`, { token }),
          apiRequest<UserOrgAssignment[]>(`/users/${userId}/orgs`, { token })
        ]);
        if (requestId !== orgCatalogRequest.current) return;
        setOrgTree(buildOrgTree(candidateResponse.data.orgs));
        setPosts(candidateResponse.data.posts);
        setOrgAssignments(assignmentResponse.data);
        setLoadedOrgAssignments(assignmentResponse.data);
        return;
      }
      if (!targetScope) return;
      const params = new URLSearchParams(targetScope);
      const candidateResponse = await apiRequest<{ orgs: Array<Omit<OrgTreeNode, "children">>; posts: OrgPostOption[] }>(
        `/users/org-candidates?${params.toString()}`,
        { token }
      );
      if (requestId !== orgCatalogRequest.current) return;
      setOrgTree(buildOrgTree(candidateResponse.data.orgs));
      setPosts(candidateResponse.data.posts);
      setOrgAssignments([]);
      setLoadedOrgAssignments([]);
    } finally {
      if (requestId === orgCatalogRequest.current) setOrgCatalogLoading(false);
    }
  }

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
      return null;
    }
    try {
      const response = await apiRequest<TenantLoginSettings>(`/tenants/${tenant.id}/login-settings`, { token });
      if (requestId !== loginSettingsRequest.current) return null;
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
      return selection;
    } finally {
      if (requestId === loginSettingsRequest.current) setLoginSettingsLoading(false);
    }
  }

  async function openCreate() {
    const requestId = ++orgCatalogRequest.current;
    clearOrgCatalog();
    setOrgCatalogLoading(true);
    setEditingUser(null);
    setDrawerError("");
    if (selectedTenant) {
      setShowCreate(true);
      setFormTenantId(selectedTenant.tenantId);
      const selection = await loadLoginSettings(selectedTenant.tenantId);
      if (requestId !== orgCatalogRequest.current) return;
      if (!selection) { setOrgCatalogLoading(false); return; }
      await loadOrgCatalog(undefined, { tenantId: selectedTenant.tenantId, parkId: selection.parkId });
    } else {
      setShowCreate(false);
      setMessage("暂无可选租户，请先创建租户");
    }
  }

  async function openEdit(row: UserRow) {
    const requestId = ++orgCatalogRequest.current;
    clearOrgCatalog();
    setOrgCatalogLoading(true);
    setDrawerError("");
    setEditingUser(row);
    setShowCreate(false);
    setFormTenantId(row.tenantId);
    await loadLoginSettings(row.tenantId, row);
    if (requestId !== orgCatalogRequest.current) return;
    await loadOrgCatalog(row.id);
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = localStorage.getItem("jinhu_access_token") ?? "";
    const targetTenantId = String(form.get("tenantId") ?? "").trim();
    const defaultParkId = String(form.get("parkId") ?? "").trim();
    if (loginSettingsLoading || orgCatalogLoading || loginSettings?.tenant.tenantId !== targetTenantId || !defaultParkId) {
      throw new Error("园区或组织选项尚未加载完成，请稍后重试");
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
      status: String(form.get("status") ?? "enabled"),
      assignments: orgAssignments.map(({ orgId, postId, isPrimary }) => ({ orgId, postId, isPrimary }))
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
      if (!sameOrgAssignments(body.assignments, loadedOrgAssignments)) {
        await apiRequest<UserOrgAssignment[]>(`/users/${editingUser.id}/orgs`, {
          method: "POST", token, idempotencyKey: createIdempotencyKey("user-orgs"),
          body: { assignments: body.assignments }
        });
      }
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
    clearOrgCatalog();
    await load(data.page);
  }

  function clearOrgCatalog() {
    setOrgTree([]);
    setPosts([]);
    setOrgAssignments([]);
    setLoadedOrgAssignments([]);
    setOrgCatalogLoading(false);
  }

  function closeUserDrawer() {
    loginSettingsRequest.current += 1;
    orgCatalogRequest.current += 1;
    setShowCreate(false);
    setEditingUser(null);
    setLoginSettings(null);
    setLoginSettingsLoading(false);
    clearOrgCatalog();
    setDrawerError("");
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
        <Drawer size="lg" onClose={closeUserDrawer}>
          <DrawerHeader
            eyebrow="系统管理"
            title={editingUser ? "编辑用户登录上下文" : "新增用户"}
            description="维护用户账号、登录上下文与可访问园区。"
            onClose={closeUserDrawer}
            closeIcon={<X size={18} />}
          />
          <DrawerForm onSubmit={(event) => { setDrawerError(""); void saveUser(event).catch((error: Error) => setDrawerError(error.message)); }}>
            <DrawerFormGrid>
              <div className="field">
                <label>所属租户</label>
                <select
                  name="tenantId"
                  value={formTenantId}
                  onChange={(event) => {
                    const nextTenantId = event.target.value;
                    const requestId = ++orgCatalogRequest.current;
                    setFormTenantId(nextTenantId);
                    clearOrgCatalog();
                    if (editingUser) setDrawerError("切换租户后请先保存用户，再重新编辑以维护目标园区的组织岗位。");
                    void loadLoginSettings(
                      nextTenantId,
                      editingUser?.tenantId === nextTenantId ? editingUser : null
                    ).then((selection) => {
                      if (editingUser || requestId !== orgCatalogRequest.current || !selection) return;
                      return loadOrgCatalog(undefined, { tenantId: nextTenantId, parkId: selection.parkId });
                    }).catch((error: Error) => setMessage(error.message));
                  }}
                >
                  {tenants.items.map((item) => <option key={item.id} value={item.tenantId}>{item.tenantName} / {item.tenantId}</option>)}
                </select>
              </div>
              <div className="field">
                <label>默认园区</label>
                <select name="parkId" value={formParkId} onChange={(event) => { const nextParkId = event.target.value; orgCatalogRequest.current += 1; setFormParkId(nextParkId); clearOrgCatalog(); if (editingUser && nextParkId !== editingUser.parkId) { setDrawerError("切换默认园区后请先保存用户，再重新编辑以维护目标园区的组织岗位。"); } else if (!editingUser && nextParkId) { void loadOrgCatalog(undefined, { tenantId: formTenantId, parkId: nextParkId }).catch((error: Error) => setDrawerError(error.message)); } }} disabled={loginSettingsLoading || !parkOptions.length} required>
                  <option value="">{loginSettingsLoading ? "园区加载中…" : "请选择园区"}</option>
                  {parkOptions.map((park) => (
                    <option key={park.parkId} value={park.parkId}>
                      {parkLabels.get(park.parkId)}
                    </option>
                  ))}
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
                  {parkOptions.map((park) => {
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
                        <span>{parkLabels.get(park.parkId)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </DrawerFormGrid>
            <DrawerFormGrid single>
              <div className="field">
                <label>组织与岗位</label>
                <div className="checkbox-list">
                  {orgAssignments.map((assignment, index) => (
                    <div className="task-item" style={{ flexWrap: "wrap" }} key={`${index}-${assignment.orgId}`}>
                      <select aria-label={`组织 ${index + 1}`} value={assignment.orgId} onChange={(event) => setOrgAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, orgId: event.target.value } : item))} required>
                        <option value="">请选择组织</option>{orgOptions.map((option) => <option key={option.id} value={option.id} disabled={option.unavailable}>{option.label}</option>)}
                      </select>
                      <select aria-label={`岗位 ${index + 1}`} value={assignment.postId ?? ""} onChange={(event) => setOrgAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, postId: event.target.value || null } : item))}>
                        <option value="">不指定岗位</option>{postOptions.map((post) => <option key={post.id} value={post.id} disabled={post.unavailable}>{post.label}</option>)}
                      </select>
                      <label className="checkbox-row"><input type="radio" name="primaryOrg" checked={assignment.isPrimary} onChange={() => setOrgAssignments((current) => current.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })))} /><span>主组织</span></label>
                      <button className="secondary-button" type="button" aria-label={`删除组织关系 ${index + 1}`} onClick={() => setOrgAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <button className="secondary-button" type="button" onClick={() => setOrgAssignments((current) => [...current, { orgId: "", postId: null, isPrimary: current.length === 0 }])}><Plus size={16} />添加组织关系</button>
                </div>
              </div>
            </DrawerFormGrid>
            {drawerError ? <p className="status-pill status-danger" role="alert">{drawerError}</p> : null}
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={closeUserDrawer}><XCircle size={16} />取消</button>
              <button className="primary-button" type="submit" disabled={loginSettingsLoading || orgCatalogLoading || !formParkId}><CheckCircle2 size={16} />{orgCatalogLoading ? "组织加载中…" : "保存"}</button>
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

function flattenOrgOptions(nodes: OrgTreeNode[], depth = 0): Array<{ id: string; label: string; unavailable?: boolean }> {
  return nodes.flatMap((org) => [
    { id: org.id, label: `${"—".repeat(depth)} ${org.orgName}`.trim() },
    ...flattenOrgOptions(org.children, depth + 1)
  ]);
}

function mergeRetainedOrgOptions(
  options: Array<{ id: string; label: string; unavailable?: boolean }>,
  assignments: UserOrgAssignment[]
) {
  const knownIds = new Set(options.map((option) => option.id));
  return [...options, ...assignments
    .filter((assignment) => assignment.orgId && !knownIds.has(assignment.orgId))
    .map((assignment) => ({
      id: assignment.orgId,
      label: `${assignment.orgName ?? assignment.orgId}（已停用或不可选）`,
      unavailable: true
    }))];
}

function mergeRetainedPostOptions(posts: OrgPostOption[], assignments: UserOrgAssignment[]) {
  const knownIds = new Set(posts.map((post) => post.id));
  return [
    ...posts.map((post) => ({ id: post.id, label: post.postName, unavailable: false })),
    ...assignments
      .filter((assignment) => assignment.postId && !knownIds.has(assignment.postId))
      .map((assignment) => ({
        id: assignment.postId as string,
        label: `${assignment.postName ?? assignment.postId}（已停用或不可选）`,
        unavailable: true
      }))
  ];
}

function sameOrgAssignments(
  left: Array<Pick<UserOrgAssignment, "orgId" | "postId" | "isPrimary">>,
  right: Array<Pick<UserOrgAssignment, "orgId" | "postId" | "isPrimary">>
): boolean {
  if (left.length !== right.length) return false;
  return left.every((assignment, index) => assignment.orgId === right[index]?.orgId
    && assignment.postId === right[index]?.postId
    && assignment.isPrimary === right[index]?.isPrimary);
}

function buildOrgTree(items: Array<Omit<OrgTreeNode, "children">>): OrgTreeNode[] {
  const nodes = new Map(items.map((item) => [item.id, { ...item, children: [] as OrgTreeNode[] }]));
  const roots: OrgTreeNode[] = [];
  for (const item of items) {
    const node = nodes.get(item.id);
    if (!node) continue;
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  return roots;
}
