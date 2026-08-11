"use client";

import {
  Card, DataTable, DataTableActions, Drawer, DrawerDetailGrid, DrawerDetailItem,
  DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader
} from "@jinhu/ui";
import { Edit3, Eye, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SYSTEM_PERMISSIONS, type OrgTreeNode } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

type OrgStatus = "enabled" | "disabled";
interface OrgRow extends Omit<OrgTreeNode, "children"> {
  children: OrgRow[];
  remark?: string | null;
  tenantId?: string;
  parkId?: string;
  createTime?: string;
  updateTime?: string;
}
interface LeaderOption { id: string; displayName: string; username: string }
interface FlatOrg { org: OrgRow; depth: number }
interface OrgFormState {
  parentId: string;
  orgCode: string;
  orgName: string;
  orgType: string;
  leaderUserId: string;
  status: OrgStatus;
  sortOrder: string;
  remark: string;
}

const emptyForm: OrgFormState = {
  parentId: "", orgCode: "", orgName: "", orgType: "department", leaderUserId: "",
  status: "enabled", sortOrder: "0", remark: ""
};
const orgTypeOptions = [
  { value: "park", label: "园区" }, { value: "group", label: "集团" },
  { value: "company", label: "公司" }, { value: "department", label: "部门" },
  { value: "project", label: "项目组" }, { value: "team", label: "班组" }
];
const orgTypeLabels = new Map(orgTypeOptions.map((item) => [item.value, item.label]));

function flattenTree(nodes: OrgRow[], depth = 0): FlatOrg[] {
  return nodes.flatMap((org) => [{ org, depth }, ...flattenTree(org.children ?? [], depth + 1)]);
}
function collectDescendantIds(org: OrgRow): Set<string> {
  return new Set(flattenTree(org.children ?? []).map((item) => item.org.id));
}
function filterTree(nodes: OrgRow[], keyword: string, status: string): OrgRow[] {
  const query = keyword.trim().toLowerCase();
  return nodes.flatMap((org) => {
    const children = filterTree(org.children ?? [], keyword, status);
    const matches = (!status || org.status === status) && (!query || `${org.orgName} ${org.orgCode}`.toLowerCase().includes(query));
    return matches || children.length > 0 ? [{ ...org, children }] : [];
  });
}
function toForm(org: OrgRow): OrgFormState {
  return {
    parentId: org.parentId ?? "", orgCode: org.orgCode, orgName: org.orgName,
    orgType: org.orgType, leaderUserId: org.leaderUserId ?? "", status: org.status as OrgStatus,
    sortOrder: String(org.sortOrder ?? 0), remark: org.remark ?? ""
  };
}

export default function OrgsPage() {
  const [tree, setTree] = useState<OrgRow[]>([]);
  const [leaders, setLeaders] = useState<LeaderOption[]>([]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrgRow | null>(null);
  const [viewingOrg, setViewingOrg] = useState<OrgRow | null>(null);
  const [form, setForm] = useState<OrgFormState>(emptyForm);

  const load = useCallback(async () => {
    const token = getAccessToken();
    const [treeResponse, leaderResponse] = await Promise.all([
      apiRequest<OrgRow[]>("/orgs/tree", { token }),
      apiRequest<LeaderOption[]>("/orgs/leaders", { token })
    ]);
    setTree(treeResponse.data);
    setLeaders(leaderResponse.data);
  }, []);
  useEffect(() => { void load().catch(showError); }, [load]);

  const allOrgs = useMemo(() => flattenTree(tree), [tree]);
  const visibleOrgs = useMemo(() => flattenTree(filterTree(tree, keyword, status)), [tree, keyword, status]);
  const blockedParents = editingOrg ? new Set([editingOrg.id, ...collectDescendantIds(editingOrg)]) : new Set<string>();
  const parentOptions = allOrgs.filter(({ org }) => org.status === "enabled" && !blockedParents.has(org.id));
  const unavailableCurrentParent = editingOrg?.parentId && !parentOptions.some(({ org }) => org.id === editingOrg.parentId)
    ? editingOrg.parentId
    : null;
  const parentName = (id: string | null) => id
    ? allOrgs.find((item) => item.org.id === id)?.org.orgName ?? "上级组织不可见"
    : "根组织";
  const leaderName = (id: string | null) => leaders.find((item) => item.id === id)?.displayName ?? "-";
  const leaderOptions = editingOrg?.leaderUserId && !leaders.some((leader) => leader.id === editingOrg.leaderUserId)
    ? [...leaders, { id: editingOrg.leaderUserId, displayName: "当前负责人（已停用或不可选）", username: editingOrg.leaderUserId }]
    : leaders;

  function openCreate() { setEditingOrg(null); setForm(emptyForm); setDrawerError(""); setShowForm(true); }
  function openEdit(org: OrgRow) { setEditingOrg(org); setForm(toForm(org)); setDrawerError(""); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingOrg(null); setDrawerError(""); }
  function showError(error: unknown) { setMessage(error instanceof Error ? error.message : "操作失败"); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDrawerError("");
    const body = {
      ...(!editingOrg || form.parentId !== (editingOrg.parentId ?? "") ? { parentId: form.parentId || null } : {}),
      orgCode: form.orgCode.trim(), orgName: form.orgName.trim(),
      orgType: form.orgType,
      ...(editingOrg && form.leaderUserId === (editingOrg.leaderUserId ?? "") ? {} : { leaderUserId: form.leaderUserId || null }),
      status: form.status,
      sortOrder: Number.parseInt(form.sortOrder || "0", 10) || 0, remark: form.remark.trim() || undefined
    };
    try {
      await apiRequest(editingOrg ? `/orgs/${editingOrg.id}` : "/orgs", {
        method: editingOrg ? "PATCH" : "POST", token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editingOrg ? "org-update" : "org-create"), body
      });
      setMessage(editingOrg ? "组织已更新" : "组织已创建"); closeForm(); await load();
    } catch (error) { setDrawerError(error instanceof Error ? error.message : "保存失败"); }
  }

  async function deleteOrg(org: OrgRow) {
    if (!window.confirm(`确认删除组织「${org.orgName}」？`)) return;
    try {
      await apiRequest(`/orgs/${org.id}`, { method: "DELETE", token: getAccessToken(), idempotencyKey: createIdempotencyKey("org-delete") });
      setMessage("组织已删除"); await load();
    } catch (error) { showError(error); }
  }

  const actions = (org: OrgRow) => (
    <DataTableActions>
      <PermissionButton aria-label="查看组织" className="ds-row-action ds-row-action-view" permission={SYSTEM_PERMISSIONS.ORG_DETAIL} title="查看" type="button" onClick={() => setViewingOrg(org)}><Eye size={16} /></PermissionButton>
      <PermissionButton aria-label="编辑组织" className="ds-row-action ds-row-action-edit" permission={SYSTEM_PERMISSIONS.ORG_UPDATE} title="编辑" type="button" onClick={() => openEdit(org)}><Edit3 size={16} /></PermissionButton>
      <PermissionButton aria-label="删除组织" className="ds-row-action ds-row-action-delete" permission={SYSTEM_PERMISSIONS.ORG_DELETE} title="删除" type="button" onClick={() => void deleteOrg(org)}><Trash2 size={16} /></PermissionButton>
    </DataTableActions>
  );

  return <main className="ds-page page-container">
    <header className="page-header"><div className="header-title"><strong>组织管理</strong><span>维护组织树、上下级关系、负责人和启停状态。</span></div>
      <PermissionButton className="primary-button" permission={SYSTEM_PERMISSIONS.ORG_CREATE} type="button" onClick={openCreate}><Plus size={16} />新增组织</PermissionButton>
    </header>
    <section className="filter-bar"><div className="system-grid"><div className="field"><label htmlFor="orgKeyword">关键词</label><input id="orgKeyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="组织名称 / 编码" /></div><div className="field"><label htmlFor="orgStatus">状态</label><select id="orgStatus" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部</option><option value="enabled">启用</option><option value="disabled">停用</option></select></div><div className="filter-actions"><button className="primary-button" type="button" onClick={() => void load().catch(showError)}><Search size={16} />刷新</button></div></div></section>
    <Card><div className="system-toolbar"><h2 className="panel-title">组织层级</h2><span className="muted-text">共 {visibleOrgs.length} 个组织</span></div>
      <div className="ds-table-shell"><DataTable><thead><tr><th>组织</th><th>上级</th><th>类型</th><th>负责人</th><th>状态</th><th>操作</th></tr></thead><tbody>{visibleOrgs.map(({ org, depth }) => <tr key={org.id}><td><span aria-hidden style={{ display: "inline-block", width: `${depth * 20}px` }} />{depth > 0 ? "└ " : ""}<strong>{org.orgName}</strong><br /><span className="muted-text">{org.orgCode}</span></td><td>{parentName(org.parentId)}</td><td>{orgTypeLabels.get(org.orgType) ?? org.orgType}</td><td>{leaderName(org.leaderUserId)}</td><td><StatusBadge status={org.status as OrgStatus} /></td><td>{actions(org)}</td></tr>)}{visibleOrgs.length === 0 ? <tr><td colSpan={6}>暂无组织数据</td></tr> : null}</tbody></DataTable></div>
      <div className="ds-mobile-record-list">{visibleOrgs.map(({ org, depth }) => <article className="ds-mobile-record" key={org.id}><header><strong>{"　".repeat(depth)}{org.orgName}</strong><StatusBadge status={org.status as OrgStatus} /></header><dl><div><dt>编码</dt><dd>{org.orgCode}</dd></div><div><dt>上级</dt><dd>{parentName(org.parentId)}</dd></div><div><dt>负责人</dt><dd>{leaderName(org.leaderUserId)}</dd></div></dl><footer>{actions(org)}</footer></article>)}</div>
    </Card>
    {showForm ? <Drawer size="md" onClose={closeForm}><DrawerHeader eyebrow="系统管理" title={editingOrg ? "编辑组织" : "新增组织"} description="维护组织归属、负责人和基础信息。" onClose={closeForm} closeIcon={<X size={18} />} /><DrawerForm onSubmit={submit}><DrawerFormGrid>
      <div className="field"><label>上级组织</label><select value={form.parentId} onChange={(e) => { setDrawerError(""); setForm((v) => ({ ...v, parentId: e.target.value })); }}><option value="">无（根组织）</option>{unavailableCurrentParent ? <option value={unavailableCurrentParent} disabled>当前上级（不可见或不可选）</option> : null}{parentOptions.map(({ org, depth }) => <option key={org.id} value={org.id}>{"—".repeat(depth)} {org.orgName}</option>)}</select></div>
      <div className="field"><label>负责人</label><select value={form.leaderUserId} onChange={(e) => setForm((v) => ({ ...v, leaderUserId: e.target.value }))}><option value="">未指定</option>{leaderOptions.map((leader) => <option key={leader.id} value={leader.id} disabled={leader.id === editingOrg?.leaderUserId && !leaders.some((candidate) => candidate.id === leader.id)}>{leader.displayName}（{leader.username}）</option>)}</select></div>
      <div className="field"><label>组织编码</label><input required maxLength={64} value={form.orgCode} onChange={(e) => setForm((v) => ({ ...v, orgCode: e.target.value }))} /></div><div className="field"><label>组织名称</label><input required maxLength={100} value={form.orgName} onChange={(e) => setForm((v) => ({ ...v, orgName: e.target.value }))} /></div>
      <div className="field"><label>类型</label><select value={form.orgType} onChange={(e) => setForm((v) => ({ ...v, orgType: e.target.value }))}>{orgTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div><div className="field"><label>状态</label><select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as OrgStatus }))}><option value="enabled">启用</option><option value="disabled">停用</option></select></div><div className="field"><label>排序</label><input type="number" min={0} step={1} value={form.sortOrder} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setForm((v) => ({ ...v, sortOrder: e.target.value }))} /></div><div className="field"><label>备注</label><textarea maxLength={500} value={form.remark} onChange={(e) => setForm((v) => ({ ...v, remark: e.target.value }))} /></div>
    </DrawerFormGrid>{drawerError ? <p className="status-pill status-danger" role="alert">{drawerError}</p> : null}<DrawerFooter><button className="secondary-button" type="button" onClick={closeForm}><X size={16} />取消</button><button className="primary-button" type="submit"><Save size={16} />保存</button></DrawerFooter></DrawerForm></Drawer> : null}
    {viewingOrg ? <Drawer size="md" onClose={() => setViewingOrg(null)}><DrawerHeader eyebrow="系统管理" title="组织详情" description="查看组织层级和负责人。" onClose={() => setViewingOrg(null)} closeIcon={<X size={18} />} /><DrawerDetailGrid><DrawerDetailItem label="组织编码" value={viewingOrg.orgCode} /><DrawerDetailItem label="组织名称" value={viewingOrg.orgName} /><DrawerDetailItem label="上级组织" value={parentName(viewingOrg.parentId)} /><DrawerDetailItem label="负责人" value={leaderName(viewingOrg.leaderUserId)} /><DrawerDetailItem label="组织类型" value={orgTypeLabels.get(viewingOrg.orgType) ?? viewingOrg.orgType} /><DrawerDetailItem label="状态" value={<StatusBadge status={viewingOrg.status as OrgStatus} />} /></DrawerDetailGrid><DrawerFooter><button className="secondary-button" type="button" onClick={() => setViewingOrg(null)}>关闭</button></DrawerFooter></Drawer> : null}
    {message ? <p className="status-pill">{message}</p> : null}
  </main>;
}

function StatusBadge({ status }: { status: OrgStatus }) { return <span className={`status-pill ${status === "enabled" ? "status-success" : "status-muted"}`}>{status === "enabled" ? "启用" : "停用"}</span>; }
