"use client";

import { Card, Drawer, DrawerFooter, DrawerForm, DrawerHeader, StatusPill } from "@jinhu/ui";
import { ArrowLeft, Edit3, FileText, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringProjectActionLabels, engineeringProjectStatusLabels, engineeringProjectTypeLabels } from "../../../../lib/engineering-projects-display";
import { engineeringProjectsApi } from "../../../../lib/engineering-projects-api";
import { ENGINEERING_PROJECT_PERMISSIONS, hasEngineeringProjectPermission } from "../../../../lib/engineering-projects-permissions";
import type { EngineeringProject, EngineeringProjectAction, EngineeringProjectAvailableAction, EngineeringProjectStatusLog } from "../../../../lib/engineering-projects-types";
import {
  DetailItem,
  ForbiddenEngineeringProject,
  LevelPill,
  MessageLine,
  ProjectStatusPill,
  RiskPill,
  formatDate,
  formatMoney,
  formatPercent,
  projectTitle
} from "./EngineeringProjectShared";
import styles from "../engineering-projects.module.css";

const runtimePlaceholders = [
  "工程计划",
  "施工日报",
  "工程巡检",
  "整改任务",
  "工程验收",
  "工程档案",
  "物业移交"
];

interface ActionDialogState {
  action: EngineeringProjectAction;
  reason: string;
  comment: string;
}

export function EngineeringProjectDetailClient() {
  const params = useParams<{ id: string }>();
  const projectId = String(params.id ?? "");
  const authUser = useAuthUser();
  const canView = hasEngineeringProjectPermission(authUser, ENGINEERING_PROJECT_PERMISSIONS.VIEW);
  const canUpdate = hasEngineeringProjectPermission(authUser, ENGINEERING_PROJECT_PERMISSIONS.UPDATE);
  const [project, setProject] = useState<EngineeringProject | null>(null);
  const [actions, setActions] = useState<EngineeringProjectAvailableAction[]>([]);
  const [logs, setLogs] = useState<EngineeringProjectStatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionSaving, setActionSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!projectId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const [detail, availableActions, statusLogs] = await Promise.all([
        engineeringProjectsApi.getProject(projectId, getAccessToken()),
        engineeringProjectsApi.getAvailableActions(projectId, getAccessToken()),
        engineeringProjectsApi.getStatusLogs(projectId, getAccessToken())
      ]);
      setProject(detail);
      setActions(availableActions);
      setLogs(statusLogs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程项目详情失败");
    } finally {
      setLoading(false);
    }
  }, [canView, projectId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionDialog) return;
    if (!actionDialog.reason.trim()) {
      setMessage("请填写状态动作原因");
      return;
    }
    setActionSaving(true);
    setMessage("");
    try {
      await engineeringProjectsApi.executeProjectAction(projectId, actionDialog.action, {
        reason: actionDialog.reason.trim(),
        comment: actionDialog.comment.trim() || undefined
      }, getAccessToken());
      setActionDialog(null);
      setMessage("状态动作执行成功");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态动作执行失败");
    } finally {
      setActionSaving(false);
    }
  }

  if (!canView) {
    return <ForbiddenEngineeringProject />;
  }

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>{project ? project.projectName : "工程项目详情"}</strong>
          <span>{project ? projectTitle(project) : "加载中..."}</span>
        </div>
        <div className="page-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void loadAll()}>
            <RefreshCw size={16} />
            刷新
          </button>
          {canUpdate && project ? (
            <Link className="secondary-button" href={`/engineering/projects/${project.id}/edit`}>
              <Edit3 size={16} />
              编辑
            </Link>
          ) : null}
          <Link className="secondary-button" href="/engineering/projects">
            <ArrowLeft size={16} />
            返回列表
          </Link>
        </div>
      </header>

      {project ? (
        <>
          <Card>
            <div className={styles.detailHero}>
              <div>
                <span>{project.projectCode}</span>
                <h1>{project.projectName}</h1>
                <p>{project.description || "暂无项目描述"}</p>
              </div>
              <div className={styles.heroBadges}>
                <ProjectStatusPill status={project.status} />
                <RiskPill risk={project.riskLevel} />
                <LevelPill level={project.projectLevel} />
              </div>
            </div>
            <div className={styles.detailGrid}>
              <DetailItem label="工程类型" value={engineeringProjectTypeLabels[project.projectType]} />
              <DetailItem label="进度" value={formatPercent(project.progressPercent)} />
              <DetailItem label="预算金额" value={formatMoney(project.budgetAmount)} />
              <DetailItem label="合同金额" value={formatMoney(project.contractAmount)} />
              <DetailItem label="结算金额" value={formatMoney(project.settlementAmount)} />
              <DetailItem label="计划开始" value={formatDate(project.plannedStartDate)} />
              <DetailItem label="计划结束" value={formatDate(project.plannedEndDate)} />
              <DetailItem label="实际开始" value={formatDate(project.actualStartDate)} />
              <DetailItem label="实际结束" value={formatDate(project.actualEndDate)} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>基础信息</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="项目来源" value={project.projectSource ?? "-"} />
              <DetailItem label="位置描述" value={project.locationText ?? "-"} />
              <DetailItem label="园区 ID" value={project.parkId} />
              <DetailItem label="组织 ID" value={project.orgId ?? "-"} />
              <DetailItem label="建筑 ID" value={project.buildingId ?? "-"} />
              <DetailItem label="楼层 ID" value={project.floorId ?? "-"} />
              <DetailItem label="空间 ID" value={project.spaceId ?? "-"} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>责任单位与责任人</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="项目负责人" value={project.projectManagerId ?? "-"} />
              <DetailItem label="工程负责人" value={project.engineeringDirectorId ?? "-"} />
              <DetailItem label="施工单位组织" value={project.contractorOrgId ?? "-"} />
              <DetailItem label="监理单位组织" value={project.supervisorOrgId ?? "-"} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>状态动作</h2>
              <span>动作由后端状态机与权限策略返回，前端不直接修改状态。</span>
            </section>
            <div className={styles.actionBar}>
              {actions.map((item) => (
                <button
                  key={item.action}
                  className={item.action.includes("CANCEL") || item.action.includes("FAILED") ? "secondary-button" : "primary-button"}
                  type="button"
                  onClick={() => setActionDialog({ action: item.action, reason: "", comment: "" })}
                >
                  <Send size={16} />
                  {engineeringProjectActionLabels[item.action] ?? item.action}
                </button>
              ))}
              {actions.length === 0 ? <StatusPill variant="muted">当前状态无可执行动作</StatusPill> : null}
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>状态日志时间线</h2>
            </section>
            <div className={styles.timeline}>
              {logs.map((log) => (
                <article key={log.id} className={styles.timelineItem}>
                  <span>{formatDate(log.createdAt)}</span>
                  <strong>{engineeringProjectActionLabels[log.action] ?? log.action}</strong>
                  <p>
                    {engineeringProjectStatusLabels[log.fromStatus]} → {engineeringProjectStatusLabels[log.toStatus]}
                  </p>
                  <p>原因：{log.reason}</p>
                  {log.comment ? <p>备注：{log.comment}</p> : null}
                  <small>{log.actorName ?? log.actorUserId}</small>
                </article>
              ))}
              {logs.length === 0 ? <p className={styles.emptyText}>暂无状态变更日志</p> : null}
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>后续 Runtime 入口</h2>
              <span>Phase 1 后续任务逐步接入，当前仅作为项目详情占位。</span>
            </section>
            <div className={styles.placeholderGrid}>
              {runtimePlaceholders.map((item) => (
                <div key={item} className={styles.placeholderCard}>
                  <FileText size={18} />
                  <strong>{item}</strong>
                  <span>后续阶段实现</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p>{loading ? "加载中..." : "未找到工程项目"}</p>
        </Card>
      )}

      {actionDialog ? (
        <Drawer size="md" onClose={() => setActionDialog(null)}>
          <DrawerHeader
            eyebrow="工程项目状态动作"
            title={engineeringProjectActionLabels[actionDialog.action] ?? actionDialog.action}
            description="提交后由后端状态机校验合法流转、权限、状态日志、审计和事件。"
            onClose={() => setActionDialog(null)}
          />
          <DrawerForm onSubmit={(event) => void submitAction(event)}>
            <label className={styles.formField}>
              <span>原因<em>*</em></span>
              <input value={actionDialog.reason} required placeholder="例如：资料已确认，进入下一阶段" onChange={(event) => setActionDialog((current) => current ? { ...current, reason: event.target.value } : current)} />
            </label>
            <label className={styles.formField}>
              <span>备注</span>
              <textarea value={actionDialog.comment} rows={4} onChange={(event) => setActionDialog((current) => current ? { ...current, comment: event.target.value } : current)} />
            </label>
            <DrawerFooter>
              <button className="secondary-button" type="button" onClick={() => setActionDialog(null)}>取消</button>
              <button className="primary-button" type="submit" disabled={actionSaving}>{actionSaving ? "提交中..." : "确认执行"}</button>
            </DrawerFooter>
          </DrawerForm>
        </Drawer>
      ) : null}

      <MessageLine message={message} />
    </main>
  );
}
