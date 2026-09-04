"use client";

import { HR_PERMISSIONS, SYSTEM_PERMISSIONS, type OrgTreeNode } from "@jinhu/shared";
import { useCallback, useEffect, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrDirectoryOrgOption, type HrPosition } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";

export function HrOrganizationClient() {
  const user = useAuthUser();
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_POSITION_MANAGE);
  const canReadOrgTree = hasPermission(user, SYSTEM_PERMISSIONS.ORG_LIST);
  const [rows, setRows] = useState<HrPosition[]>([]);
  const [orgs, setOrgs] = useState<HrDirectoryOrgOption[]>([]);
  const [orgTree, setOrgTree] = useState<OrgTreeNode[]>([]);
  const [orgTreeStatus, setOrgTreeStatus] = useState<"loading" | "ready" | "empty" | "forbidden" | "error">("loading");
  const [orgTreeMessage, setOrgTreeMessage] = useState("");
  const [expandedOrgIds, setExpandedOrgIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMessage("");
      const token = getAccessToken();
      const [positions, references] = await Promise.all([
        hrApi.positions(token),
        canManage ? hrApi.directoryOptions(token) : Promise.resolve({ orgs: [], users: [] })
      ]);
      setRows(positions);
      setOrgs(references.orgs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载岗位失败");
    }
  }, [canManage]);

  const loadOrgTree = useCallback(async () => {
    if (!canReadOrgTree) {
      setOrgTree([]);
      setExpandedOrgIds(new Set());
      setOrgTreeStatus("forbidden");
      setOrgTreeMessage("当前账号缺少组织树读取权限。");
      return;
    }
    try {
      setOrgTreeStatus("loading");
      setOrgTreeMessage("");
      const tree = await hrApi.organizationTree(getAccessToken());
      setOrgTree(tree);
      setExpandedOrgIds(new Set(flattenOrganizationTree(tree).map((node) => node.id)));
      setOrgTreeStatus(tree.length > 0 ? "ready" : "empty");
    } catch (error) {
      setOrgTree([]);
      setExpandedOrgIds(new Set());
      setOrgTreeStatus("error");
      setOrgTreeMessage(error instanceof Error ? error.message : "加载组织树失败");
    }
  }, [canReadOrgTree]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadOrgTree(); }, [loadOrgTree]);

  const toggleOrganization = (id: string) => {
    setExpandedOrgIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = async (form: FormData) => {
    try {
      setBusy(true);
      setMessage("");
      await hrApi.createPosition({
        orgId: String(form.get("orgId")),
        positionCode: String(form.get("positionCode")),
        positionName: String(form.get("positionName")),
        jobFamily: String(form.get("jobFamily") ?? "") || undefined,
        jobLevel: String(form.get("jobLevel") ?? "") || undefined,
        headcountLimit: String(form.get("headcountLimit") ?? "") ? Number(form.get("headcountLimit")) : undefined,
        remark: String(form.get("remark") ?? "") || undefined
      }, getAccessToken());
      await load();
      setMessage("岗位已创建");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建岗位失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_ORGANIZATION_PAGE} fallback={<main className={`content ds-page ${styles.page}`}><section className="ds-panel"><h1>无权访问组织与岗位</h1></section></main>}>
      <main className={`content ds-page ${styles.page}`}>
        <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">人力资源管理</span><h1>组织与岗位</h1><p>复用系统组织树，在其上维护岗位、职族、职级与编制。</p></div></section>
        <section className={`ds-panel ${styles.organizationTreePanel}`} aria-labelledby="hr-organization-tree-title">
          <div className={styles.sectionHeader}>
            <div><h2 id="hr-organization-tree-title">组织结构</h2><p>按当前租户和园区的数据权限展示组织层级。</p></div>
            {canReadOrgTree ? <button className="ds-button" type="button" onClick={() => void loadOrgTree()} disabled={orgTreeStatus === "loading"}>刷新组织树</button> : null}
          </div>
          {orgTreeStatus === "loading" ? <p className={styles.organizationTreeState} role="status">正在加载组织树…</p> : null}
          {orgTreeStatus === "forbidden" ? <p className={styles.organizationTreeState} role="alert">{orgTreeMessage}</p> : null}
          {orgTreeStatus === "error" ? <div className={styles.organizationTreeState} role="alert"><p>{orgTreeMessage || "加载组织树失败"}</p><button className="ds-button" type="button" onClick={() => void loadOrgTree()}>重试</button></div> : null}
          {orgTreeStatus === "empty" ? <p className={styles.organizationTreeState}>当前范围暂无组织数据。</p> : null}
          {orgTreeStatus === "ready" ? <nav className={styles.organizationTree} aria-label="组织结构树"><OrganizationTreeNodes nodes={orgTree} expandedOrgIds={expandedOrgIds} onToggle={toggleOrganization} /></nav> : null}
        </section>
        {canManage ? <form className={`ds-panel ${styles.formGrid}`} action={create}>
          <label className="form-field"><span>所属组织</span><select name="orgId" required><option value="">请选择组织</option>{orgs.map((org) => <option key={org.id} value={org.id}>{org.orgName}</option>)}</select></label>
          <label className="form-field"><span>岗位编码</span><input name="positionCode" maxLength={64} required /></label>
          <label className="form-field"><span>岗位名称</span><input name="positionName" maxLength={100} required /></label>
          <label className="form-field"><span>职族</span><input name="jobFamily" maxLength={100} /></label>
          <label className="form-field"><span>职级</span><input name="jobLevel" maxLength={64} /></label>
          <label className="form-field"><span>编制人数</span><input name="headcountLimit" type="number" min="0" max="100000" step="1" /></label>
          <label className="form-field"><span>备注</span><input name="remark" maxLength={500} /></label>
          <button className="ds-button ds-button-primary" disabled={busy}>新增岗位</button>
        </form> : null}
        {message ? <p className="form-error" role="alert">{message}</p> : null}
        <section className="ds-panel"><div className="ds-mobile-record-list">{rows.length ? rows.map((row) => <article className="ds-mobile-record" key={row.id}><strong>{row.positionName}</strong><span>{row.positionCode}</span><span>{row.jobFamily || "未设置职族"} · {row.jobLevel || "未设置职级"}</span><span>编制：{row.headcountLimit ?? "未限制"}</span></article>) : <p>暂无岗位，可由人力资源负责人创建。</p>}</div></section>
      </main>
    </PermissionGuard>
  );
}

function flattenOrganizationTree(nodes: OrgTreeNode[]): OrgTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenOrganizationTree(node.children ?? [])]);
}

function OrganizationTreeNodes({nodes, expandedOrgIds, onToggle, depth = 0}: {nodes: OrgTreeNode[]; expandedOrgIds: Set<string>; onToggle: (id: string) => void; depth?: number}) {
  return <ul className={depth === 0 ? styles.organizationTreeRoot : styles.organizationTreeBranch}>{nodes.map((node) => {
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const expanded = hasChildren && expandedOrgIds.has(node.id);
    return <li className={styles.organizationTreeItem} key={node.id}>
      <article className={`ds-mobile-record ${styles.organizationTreeCard}`}>
        <div className={styles.organizationTreeHeading}>
          {hasChildren ? <button className={styles.organizationTreeToggle} type="button" aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}${node.orgName}`} onClick={() => onToggle(node.id)}>{expanded ? "−" : "+"}</button> : <span className={styles.organizationTreeLeaf} aria-hidden>•</span>}
          <div><strong>{node.orgName}</strong><span>{node.orgCode}</span></div>
          <span className={styles.organizationTreeStatus}>{node.status === "enabled" ? "启用" : "停用"}</span>
        </div>
        <div className={styles.organizationTreeMeta}><span>类型：{node.orgType}</span>{hasChildren ? <span>{children.length} 个直接下级</span> : <span>无直接下级</span>}</div>
      </article>
      {expanded ? <OrganizationTreeNodes nodes={children} expandedOrgIds={expandedOrgIds} onToggle={onToggle} depth={depth + 1} /> : null}
    </li>;
  })}</ul>;
}
