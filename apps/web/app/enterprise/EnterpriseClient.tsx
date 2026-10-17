"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, UserPlus, Users, ShieldCheck } from "lucide-react";
import { SYSTEM_PERMISSIONS as P } from "@jinhu/shared";
import { PermissionGuard } from "../../components/auth/PermissionGuard";
import { useAuthUser } from "../../lib/auth-context";
import { apiRequest, isForbiddenError } from "../../lib/api-client";
import { getToken } from "../../lib/auth";
import { hasAllPermissions, hasPermission } from "../../lib/permissions";
import { useScopedOperation } from "../../lib/use-scoped-operation";
import { operationScopeKey } from "../../lib/runtime-context";
import styles from "./enterprise.module.css";

interface Role { id: string; name: string; code: string; dataScope: string; version: number }
interface Member { id: string; username: string; displayName: string; status: "enabled" | "disabled"; version: number; roles: Array<{ id: string; name: string }> }
interface Page { items: Member[]; total: number; page: number; page_size: number }
interface Permission { code: string; name: string }
const emptyMember = { username: "", displayName: "", password: "", roleIds: [] as string[], reason: "" };
const emptyRole = { code: "", name: "", dataScope: "self", permissionCodes: [] as string[], reason: "" };
function receipt(value: unknown, id?: string, version = 1): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as { id?: unknown; version?: unknown };
  return typeof result.id === "string" && /^[0-9a-f-]{36}$/i.test(result.id) && (!id || result.id === id) && result.version === version;
}

export function EnterpriseClient() {
  const user = useAuthUser();
  const scope = operationScopeKey(user);
  const enterprise = user?.runtime_mode === "hr_enterprise";
  const canList = hasPermission(user, P.USER_LIST);
  const canCreate = hasAllPermissions(user, [P.USER_CREATE, P.USER_ASSIGN_ROLES]);
  const canAssign = hasAllPermissions(user, [P.USER_UPDATE, P.USER_ASSIGN_ROLES]);
  const canUpdate = hasPermission(user, P.USER_UPDATE);
  const canCreateRole = hasAllPermissions(user, [P.ROLE_CREATE, P.ROLE_ASSIGN_PERMISSIONS]);
  const canEnter = canList || canCreate || canCreateRole;
  const actorScopeRank = ({ self: 0, org: 1, org_and_children: 2, park: 3, all: 4 } as Record<string, number>)[user?.data_scope ?? "self"] ?? 0;
  const scopeOptions = [{ value: "self", label: "本人", rank: 0 }, { value: "org", label: "所属组织", rank: 1 }, { value: "park", label: "本企业", rank: 3 }].filter((option) => option.rank <= actorScopeRank);
  const canReadRoles = hasPermission(user, P.USER_ASSIGN_ROLES);
  const canReadPermissions = hasPermission(user, P.ROLE_ASSIGN_PERMISSIONS);
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [members, setMembers] = useState<Page | null>(null);
  const [roles, setRoles] = useState<Role[] | null>(null), [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [readError, setReadError] = useState(""), [catalogError, setCatalogError] = useState("");
  const [loading, setLoading] = useState(false), [denied, setDenied] = useState(false);
  const [member, setMember] = useState(emptyMember), [role, setRole] = useState(emptyRole);
  const [selected, setSelected] = useState<Member | null>(null), [roleIds, setRoleIds] = useState<string[]>([]), [reason, setReason] = useState("");
  const request = useRef(0);
  const operation = useScopedOperation(`${scope}:${denied}`);

  useEffect(() => {
    setPage(1); setMembers(null); setSelected(null); setRoles(null); setPermissions(null);
    setMember(emptyMember); setRole(emptyRole); setRoleIds([]); setReason("");
  }, [scope]);
  useEffect(() => {
    const generation = ++request.current;
    if (!enterprise || !hasPermission(user, P.USER_LIST)) return;
    setLoading(true); setReadError(""); setDenied(false);
    void apiRequest<Page>(`/enterprise/members?page=${page}&page_size=20`, { token: getToken() }).then(({ data }) => {
      if (generation !== request.current) return;
      if (!Array.isArray(data.items) || !Number.isInteger(data.total)) throw new Error("成员列表响应不完整，请刷新读取");
      if (page > Math.max(1, Math.ceil(data.total / 20))) { setPage(Math.max(1, Math.ceil(data.total / 20))); return; }
      setMembers(data);
    }).catch((cause: unknown) => {
      if (generation !== request.current) return;
      if (isForbiddenError(cause)) { setMembers(null); setSelected(null); setMember(emptyMember); setRole(emptyRole); setReason(""); setRoleIds([]); setDenied(true); }
      setReadError(cause instanceof Error ? cause.message : "成员读取失败");
    }).finally(() => { if (generation === request.current) setLoading(false); });
    return () => { request.current++; };
  }, [scope, enterprise, user, page, refresh]);
  useEffect(() => {
    let active = true;
    setRoles(null); setPermissions(null); setCatalogError("");
    if (!enterprise) return;
    const loads: Promise<void>[] = [];
    if (canReadRoles) loads.push(apiRequest<Role[]>("/enterprise/roles", { token: getToken() }).then(({ data }) => { if (active) setRoles(data); }));
    if (canReadPermissions) loads.push(apiRequest<Permission[]>("/enterprise/permissions", { token: getToken() }).then(({ data }) => { if (active) setPermissions(data); }));
    void Promise.all(loads).catch((cause: unknown) => { if (active) setCatalogError(cause instanceof Error ? cause.message : "角色选项读取失败"); });
    return () => { active = false; };
  }, [scope, enterprise, canReadRoles, canReadPermissions, refresh]);
  const reload = () => setRefresh((value) => value + 1);
  const committed = () => { setSelected(null); setReason(""); reload(); };
  const blocked = operation.locked || denied;
  const selectedCanChange = selected && selected.id !== user?.id;

  if (!canEnter) return <main className="ds-page"><p role="alert">没有企业成员管理权限。</p></main>;
  return <PermissionGuard module="system" fallback={<main className="ds-page"><p role="alert">没有企业成员管理权限。</p></main>}>
    <main className={`ds-page ${styles.page}`}>
      <header className="ds-hero"><div><h1><Users size={24} /> 企业成员与权限</h1><p>管理企业账号、角色及授权范围。每次变更保留办理原因。</p></div><button className="ds-button ds-button-secondary" type="button" disabled={loading || operation.writing} onClick={reload}><RefreshCw size={16} /> 刷新读取</button></header>
      {!enterprise ? <p role="alert">此入口适用于独立企业人力资源系统。</p> : <>
      {operation.success ? <p role="status">{operation.success}</p> : null}
      {operation.error ? <p role="alert">{operation.error}</p> : null}
      {operation.pending ? <button className="ds-button ds-button-primary" disabled={operation.writing} onClick={operation.retry}>重试原请求</button> : null}
      {readError ? <p role="alert">{readError}；已保存的操作无需再次提交。</p> : null}
      {catalogError ? <p role="alert">{catalogError}；相关表单暂不可提交。</p> : null}
      {canList ? <section className="ds-panel"><h2>企业成员</h2>{loading ? <p role="status">正在读取成员…</p> : null}
        <div className="ds-scene-grid">{members?.items.map((item) => <article className={`ds-scene-card ${styles.record}`} key={item.id}><h3>{item.displayName || item.username}</h3><p>{item.username} · {item.status === "enabled" ? "启用" : "停用"}</p><p>角色：{item.roles.map((entry) => entry.name).join("、") || "未分配"}</p>
          {canUpdate && item.id !== user?.id ? <button className="ds-button ds-button-secondary" disabled={blocked} onClick={() => { setSelected(item); setRoleIds(item.roles.map((entry) => entry.id)); setReason(""); }}>维护成员</button> : null}</article>)}</div>
        {!loading && members?.total === 0 ? <p>暂无企业成员。</p> : null}
        <div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={page <= 1 || loading || blocked} onClick={() => { setSelected(null); setPage(page - 1); }}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil((members?.total ?? 0) / 20))} 页 · 共 {members?.total ?? 0} 人</span><button className="ds-button ds-button-secondary" disabled={!members || page * 20 >= members.total || loading || blocked} onClick={() => { setSelected(null); setPage(page + 1); }}>下一页</button></div>
      </section> : null}
      {selectedCanChange ? <section className="ds-panel"><h2>维护 {selected.displayName || selected.username}</h2><fieldset disabled={blocked} className={styles.fields}>
        <label className="form-field">办理原因<textarea value={reason} minLength={2} maxLength={1000} onChange={(event) => setReason(event.target.value)} /></label>
        <div className={styles.actions}><button className="ds-button ds-button-secondary" disabled={reason.trim().length < 2} onClick={() => operation.write(`/enterprise/members/${selected.id}`, "PATCH", { expectedVersion: selected.version, status: selected.status === "enabled" ? "disabled" : "enabled", reason }, (value) => receipt(value, selected.id, selected.version + 1), committed)}>{selected.status === "enabled" ? "停用成员" : "启用成员"}</button><button className="ds-button ds-button-secondary" onClick={() => setSelected(null)}>取消维护</button></div>
        {canAssign ? <form onSubmit={(event) => { event.preventDefault(); operation.write(`/enterprise/members/${selected.id}/roles`, "POST", { expectedVersion: selected.version, roleIds, reason }, (value) => receipt(value, selected.id, selected.version + 1), committed); }}>
          <RoleChoices roles={roles} selected={roleIds} change={setRoleIds} retained={selected.roles} /><button className="ds-button ds-button-primary" disabled={!roles || reason.trim().length < 2 || roleIds.length > 20 || roleIds.some((id) => !roles.some((role) => role.id === id))}>保存成员角色</button></form> : null}
      </fieldset></section> : null}
      <div className={styles.grid}>
      {canCreate ? <section className="ds-panel"><h2><UserPlus size={20} /> 新增成员</h2><form onSubmit={(event) => { event.preventDefault(); operation.write("/enterprise/members", "POST", member, (value) => receipt(value), () => { setMember(emptyMember); reload(); }); }}><fieldset className={styles.fields} disabled={blocked}>
        <label className="form-field">账号<input required maxLength={64} pattern="[A-Za-z0-9_.@-]{1,64}" autoComplete="off" value={member.username} onChange={(event) => setMember({ ...member, username: event.target.value })} /></label>
        <label className="form-field">姓名<input required maxLength={100} value={member.displayName} onChange={(event) => setMember({ ...member, displayName: event.target.value })} /></label>
        <label className="form-field">初始密码<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={member.password} onChange={(event) => setMember({ ...member, password: event.target.value })} /></label>
        <RoleChoices roles={roles} selected={member.roleIds} change={(roleIds) => setMember({ ...member, roleIds })} />
        <label className="form-field">办理原因<textarea required minLength={2} maxLength={1000} value={member.reason} onChange={(event) => setMember({ ...member, reason: event.target.value })} /></label>
        <button className="ds-button ds-button-primary" disabled={!roles || !member.roleIds.length || member.roleIds.length > 20}>创建成员</button>
      </fieldset></form></section> : null}
      {canCreateRole ? <section className="ds-panel"><h2><ShieldCheck size={20} /> 新增角色</h2><form onSubmit={(event) => { event.preventDefault(); operation.write("/enterprise/roles", "POST", role, (value) => receipt(value), () => { setRole(emptyRole); reload(); }); }}><fieldset className={styles.fields} disabled={blocked}>
        <label className="form-field">角色代码<input required maxLength={64} pattern="[A-Za-z0-9_-]{1,64}" value={role.code} onChange={(event) => setRole({ ...role, code: event.target.value })} /></label>
        <label className="form-field">角色名称<input required maxLength={100} value={role.name} onChange={(event) => setRole({ ...role, name: event.target.value })} /></label>
        <label className="form-field">数据范围<select value={role.dataScope} onChange={(event) => setRole({ ...role, dataScope: event.target.value })}><>{scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</></select></label>
        <fieldset className={styles.choices}><legend>权限（限当前可授权项目）</legend>{permissions?.map((permission) => <label key={permission.code}><input type="checkbox" checked={role.permissionCodes.includes(permission.code)} onChange={(event) => setRole({ ...role, permissionCodes: event.target.checked ? [...role.permissionCodes, permission.code] : role.permissionCodes.filter((code) => code !== permission.code) })} />{permission.name || permission.code}</label>)}{!permissions ? <p>权限选项尚未就绪。</p> : null}</fieldset>
        <label className="form-field">办理原因<textarea required minLength={2} maxLength={1000} value={role.reason} onChange={(event) => setRole({ ...role, reason: event.target.value })} /></label>
        <button className="ds-button ds-button-primary" disabled={!permissions || role.permissionCodes.length > 500}>创建角色</button>
      </fieldset></form></section> : null}
      </div></>}
    </main>
  </PermissionGuard>;
}

function RoleChoices({ roles, selected, change, retained = [] }: { roles: Role[] | null; selected: string[]; change: (ids: string[]) => void; retained?: Array<{ id: string; name: string }> }) {
  const available = new Set(roles?.map((role) => role.id));
  return <fieldset className={styles.choices}><legend>成员角色</legend>{roles?.map((role) => <label key={role.id}><input type="checkbox" checked={selected.includes(role.id)} onChange={(event) => change(event.target.checked ? [...selected, role.id] : selected.filter((id) => id !== role.id))} />{role.name}</label>)}{retained.filter((role) => !available.has(role.id)).map((role) => <label key={role.id}><input type="checkbox" checked={selected.includes(role.id)} onChange={() => change(selected.filter((id) => id !== role.id))} />{role.name}（当前不可新增授权）</label>)}{!roles ? <p>角色选项尚未就绪。</p> : null}</fieldset>;
}
