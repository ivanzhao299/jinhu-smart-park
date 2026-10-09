"use client";

import { HR_PERMISSIONS, SYSTEM_PERMISSIONS, type OrgTreeNode } from "@jinhu/shared";
import { useCallback, useEffect, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import {PositionWorkbench} from "./PositionWorkbench";
import { getAccessToken } from "../../../lib/authz";
import { hrApi } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";

export function HrOrganizationClient() {
  const user=useAuthUser();
  return <HrOrganizationSession key={JSON.stringify(user)}/>;
}
function HrOrganizationSession() {
  const user = useAuthUser();
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_POSITION_MANAGE);
  const canReadOrgTree = hasPermission(user, SYSTEM_PERMISSIONS.ORG_LIST);
  const [orgTree, setOrgTree] = useState<OrgTreeNode[]>([]);
  const [orgTreeStatus, setOrgTreeStatus] = useState<"loading" | "ready" | "empty" | "forbidden" | "error">("loading");
  const [orgTreeMessage, setOrgTreeMessage] = useState("");
  const [expandedOrgIds, setExpandedOrgIds] = useState<Set<string>>(new Set());

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

  useEffect(() => { void loadOrgTree(); }, [loadOrgTree]);

  const toggleOrganization = (id: string) => {
    setExpandedOrgIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        <PositionWorkbench canManage={canManage} canRead={hasPermission(user,HR_PERMISSIONS.HR_POSITION_READ)}/>

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
