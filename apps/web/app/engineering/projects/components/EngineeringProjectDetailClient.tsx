"use client";

import { Card, DataTable, Drawer, DrawerFooter, DrawerForm, DrawerHeader, StatusPill } from "@jinhu/ui";
import { ArrowLeft, Edit3, Eye, FileText, Plus, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringProjectActionLabels, engineeringProjectStatusLabels, engineeringProjectTypeLabels } from "../../../../lib/engineering-projects-display";
import { engineeringProjectsApi } from "../../../../lib/engineering-projects-api";
import { ENGINEERING_PROJECT_PERMISSIONS, hasEngineeringProjectPermission } from "../../../../lib/engineering-projects-permissions";
import type { EngineeringProject, EngineeringProjectAction, EngineeringProjectAvailableAction, EngineeringProjectStatusLog } from "../../../../lib/engineering-projects-types";
import { engineeringPlansApi } from "../../../../lib/engineering-plans-api";
import type { EngineeringPlan } from "../../../../lib/engineering-plans-types";
import { buildEngineeringPlanTree, flattenEngineeringPlanTree } from "../../../../lib/engineering-plans-utils";
import { engineeringDailyReportsApi } from "../../../../lib/engineering-daily-reports-api";
import type { EngineeringDailyReport } from "../../../../lib/engineering-daily-reports-types";
import { engineeringInspectionsApi } from "../../../../lib/engineering-inspections-api";
import type { EngineeringInspection } from "../../../../lib/engineering-inspections-types";
import { engineeringRectificationsApi } from "../../../../lib/engineering-rectifications-api";
import type { EngineeringRectification } from "../../../../lib/engineering-rectifications-types";
import { engineeringAcceptancesApi } from "../../../../lib/engineering-acceptances-api";
import type { EngineeringAcceptance } from "../../../../lib/engineering-acceptances-types";
import {
  DailyReportProgressBar,
  DailyReportStatusPill,
  WeatherPill,
  formatDateTime as formatDailyReportDateTime
} from "../../daily-reports/components/EngineeringDailyReportShared";
import { InspectionStatusPill, InspectionTypePill, formatDateTime as formatInspectionDateTime } from "../../inspections/components/EngineeringInspectionShared";
import { PlanProgressBar, PlanTreeTable } from "../../plans/components/EngineeringPlanShared";
import { RectificationSeverityPill, RectificationStatusPill } from "../../rectifications/components/EngineeringRectificationShared";
import { AcceptanceStatusPill, AcceptanceTypePill, formatDateTime as formatAcceptanceDateTime } from "../../acceptances/components/EngineeringAcceptanceShared";
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
  const [plans, setPlans] = useState<EngineeringPlan[]>([]);
  const [dailyReports, setDailyReports] = useState<EngineeringDailyReport[]>([]);
  const [inspections, setInspections] = useState<EngineeringInspection[]>([]);
  const [rectifications, setRectifications] = useState<EngineeringRectification[]>([]);
  const [acceptances, setAcceptances] = useState<EngineeringAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const planRows = useMemo(() => flattenEngineeringPlanTree(buildEngineeringPlanTree(plans)), [plans]);
  const planSummary = useMemo(() => {
    const total = plans.length;
    const completed = plans.filter((item) => item.status === "COMPLETED").length;
    const delayed = plans.filter((item) => item.delayDays > 0 || item.status === "DELAYED").length;
    const averageProgress = total === 0 ? 0 : Math.round(plans.reduce((sum, item) => sum + Number(item.actualProgressPercent ?? 0), 0) / total);
    return { total, completed, delayed, averageProgress };
  }, [plans]);
  const dailyReportSummary = useMemo(() => {
    const total = dailyReports.length;
    const submitted = dailyReports.filter((item) => item.reportStatus === "SUBMITTED").length;
    const reviewed = dailyReports.filter((item) => item.reportStatus === "REVIEWED").length;
    const rejected = dailyReports.filter((item) => item.reportStatus === "REJECTED").length;
    const recent = [...dailyReports]
      .sort((left, right) => right.reportDate.localeCompare(left.reportDate) || right.createTime.localeCompare(left.createTime))
      .slice(0, 5);
    return {
      total,
      submitted,
      reviewed,
      rejected,
      latestDate: recent[0]?.reportDate ?? null,
      recent
    };
  }, [dailyReports]);
  const inspectionSummary = useMemo(() => {
    const total = inspections.length;
    const submitted = inspections.filter((item) => item.inspectionStatus === "SUBMITTED").length;
    const draft = inspections.filter((item) => item.inspectionStatus === "DRAFT").length;
    const issueCount = inspections.reduce((sum, item) => sum + Number(item.issueCount ?? 0), 0);
    const criticalIssueCount = inspections.reduce((sum, item) => sum + Number(item.criticalIssueCount ?? 0), 0);
    const recent = [...inspections]
      .sort((left, right) => right.inspectionDate.localeCompare(left.inspectionDate) || right.createTime.localeCompare(left.createTime))
      .slice(0, 5);
    return { total, submitted, draft, issueCount, criticalIssueCount, recent };
  }, [inspections]);
  const rectificationSummary = useMemo(() => {
    const total = rectifications.length;
    const pending = rectifications.filter((item) => item.status === "PENDING").length;
    const inProgress = rectifications.filter((item) => item.status === "IN_PROGRESS").length;
    const overdue = rectifications.filter((item) => item.status === "OVERDUE").length;
    const closed = rectifications.filter((item) => item.status === "CLOSED" || item.status === "PASSED").length;
    const recent = [...rectifications]
      .sort((left, right) => right.updateTime.localeCompare(left.updateTime) || right.createTime.localeCompare(left.createTime))
      .slice(0, 5);
    return { total, pending, inProgress, overdue, closed, recent };
  }, [rectifications]);
  const acceptanceSummary = useMemo(() => {
    const total = acceptances.length;
    const passed = acceptances.filter((item) => item.acceptanceStatus === "PASSED" || item.acceptanceStatus === "CLOSED").length;
    const failed = acceptances.filter((item) => item.acceptanceStatus === "FAILED").length;
    const rectificationRequired = acceptances.filter((item) => item.acceptanceStatus === "RECTIFICATION_REQUIRED").length;
    const pending = acceptances.filter((item) => item.acceptanceStatus === "DRAFT" || item.acceptanceStatus === "SUBMITTED" || item.acceptanceStatus === "REVIEWING").length;
    const recent = [...acceptances]
      .sort((left, right) => right.updateTime.localeCompare(left.updateTime) || right.createTime.localeCompare(left.createTime))
      .slice(0, 5);
    return { total, passed, failed, rectificationRequired, pending, recent };
  }, [acceptances]);

  const loadAll = useCallback(async () => {
    if (!projectId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const [
        detail,
        availableActions,
        statusLogs,
        projectPlans,
        projectDailyReports,
        projectInspections,
        projectRectifications,
        projectAcceptances
      ] = await Promise.all([
        engineeringProjectsApi.getProject(projectId, getAccessToken()),
        engineeringProjectsApi.getAvailableActions(projectId, getAccessToken()),
        engineeringProjectsApi.getStatusLogs(projectId, getAccessToken()),
        engineeringPlansApi.getProjectPlans(projectId, getAccessToken()),
        engineeringDailyReportsApi.getProjectDailyReports(projectId, {}, getAccessToken()),
        engineeringInspectionsApi.getProjectInspections(projectId, getAccessToken()),
        engineeringRectificationsApi.getProjectRectifications(projectId, getAccessToken()),
        engineeringAcceptancesApi.getProjectAcceptances(projectId, getAccessToken())
      ]);
      setProject(detail);
      setActions(availableActions);
      setLogs(statusLogs);
      setPlans(projectPlans);
      setDailyReports(projectDailyReports);
      setInspections(projectInspections);
      setRectifications(projectRectifications);
      setAcceptances(projectAcceptances);
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
              <h2>工程计划</h2>
              <span>项目计划已接入真实 API，按父子层级展示。</span>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="计划数量" value={planSummary.total} />
              <DetailItem label="已完成" value={planSummary.completed} />
              <DetailItem label="已延期" value={planSummary.delayed} />
              <DetailItem label="平均实际进度" value={<PlanProgressBar value={planSummary.averageProgress} />} />
            </div>
            <div className={styles.actionBar}>
              <Link className="primary-button" href={`/engineering/plans/new?projectId=${project.id}`}>
                <Plus size={16} />
                新增计划
              </Link>
              <Link className="secondary-button" href={`/engineering/plans?projectId=${project.id}`}>
                <Eye size={16} />
                查看全部计划
              </Link>
            </div>
            <div className="table-scroll">
              <PlanTreeTable rows={planRows} />
            </div>
            <p className={styles.scopeHint}>甘特图视图预留：后续可基于当前父子计划和日期字段扩展。</p>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>施工日报</h2>
              <span>施工日报已接入真实 API，记录每日现场施工资料。</span>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="日报总数" value={dailyReportSummary.total} />
              <DetailItem label="最近日报日期" value={dailyReportSummary.latestDate ? formatDate(dailyReportSummary.latestDate) : "-"} />
              <DetailItem label="已提交" value={dailyReportSummary.submitted} />
              <DetailItem label="已审核" value={dailyReportSummary.reviewed} />
              <DetailItem label="被驳回" value={dailyReportSummary.rejected} />
            </div>
            <div className={styles.actionBar}>
              <Link className="primary-button" href={`/engineering/daily-reports/new?projectId=${project.id}`}>
                <Plus size={16} />
                新增日报
              </Link>
              <Link className="secondary-button" href={`/engineering/daily-reports?projectId=${project.id}`}>
                <Eye size={16} />
                查看全部日报
              </Link>
            </div>
            <div className="table-scroll">
              <DataTable>
                <thead>
                  <tr>
                    <th>日报编号</th>
                    <th>日期</th>
                    <th>状态</th>
                    <th>天气</th>
                    <th>进度</th>
                    <th>提交时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReportSummary.recent.map((report) => (
                    <tr key={report.id}>
                      <td><strong>{report.reportCode}</strong></td>
                      <td>{formatDate(report.reportDate)}</td>
                      <td><DailyReportStatusPill status={report.reportStatus} /></td>
                      <td><WeatherPill weather={report.weather} /></td>
                      <td><DailyReportProgressBar value={report.progressPercent} /></td>
                      <td>{formatDailyReportDateTime(report.submittedAt)}</td>
                      <td><Link className="secondary-button" href={`/engineering/daily-reports/${report.id}`}>查看</Link></td>
                    </tr>
                  ))}
                  {dailyReportSummary.recent.length === 0 ? (
                    <tr>
                      <td colSpan={7}>暂无施工日报</td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>工程巡检</h2>
              <span>工程巡检已接入真实 API，支持现场记录和问题证据沉淀。</span>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="巡检总数" value={inspectionSummary.total} />
              <DetailItem label="草稿" value={inspectionSummary.draft} />
              <DetailItem label="已提交" value={inspectionSummary.submitted} />
              <DetailItem label="问题总数" value={inspectionSummary.issueCount} />
              <DetailItem label="重大问题" value={inspectionSummary.criticalIssueCount} />
            </div>
            <div className={styles.actionBar}>
              <Link className="primary-button" href={`/engineering/inspections/new?projectId=${project.id}`}>
                <Plus size={16} />
                新增巡检
              </Link>
              <Link className="secondary-button" href={`/engineering/inspections?projectId=${project.id}`}>
                <Eye size={16} />
                查看全部巡检
              </Link>
            </div>
            <div className="table-scroll">
              <DataTable>
                <thead>
                  <tr>
                    <th>巡检编号</th>
                    <th>标题</th>
                    <th>日期</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>问题</th>
                    <th>提交时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectionSummary.recent.map((inspection) => (
                    <tr key={inspection.id}>
                      <td><strong>{inspection.inspectionCode}</strong></td>
                      <td>{inspection.inspectionTitle}</td>
                      <td>{formatDate(inspection.inspectionDate)}</td>
                      <td><InspectionTypePill type={inspection.inspectionType} /></td>
                      <td><InspectionStatusPill status={inspection.inspectionStatus} /></td>
                      <td>{inspection.issueCount} / 重大 {inspection.criticalIssueCount}</td>
                      <td>{formatInspectionDateTime(inspection.submittedAt)}</td>
                      <td><Link className="secondary-button" href={`/engineering/inspections/${inspection.id}`}>查看</Link></td>
                    </tr>
                  ))}
                  {inspectionSummary.recent.length === 0 ? (
                    <tr>
                      <td colSpan={8}>暂无工程巡检</td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>整改任务</h2>
              <span>整改闭环已接入真实 API，支持施工反馈、工程复查和关闭。</span>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="整改总数" value={rectificationSummary.total} />
              <DetailItem label="待整改" value={rectificationSummary.pending} />
              <DetailItem label="整改中" value={rectificationSummary.inProgress} />
              <DetailItem label="已逾期" value={rectificationSummary.overdue} />
              <DetailItem label="已关闭/通过" value={rectificationSummary.closed} />
            </div>
            <div className={styles.actionBar}>
              <Link className="secondary-button" href={`/engineering/rectifications?projectId=${project.id}`}>
                <Eye size={16} />
                查看全部整改
              </Link>
            </div>
            <div className="table-scroll">
              <DataTable>
                <thead>
                  <tr>
                    <th>整改编号</th>
                    <th>标题</th>
                    <th>状态</th>
                    <th>等级</th>
                    <th>期限</th>
                    <th>责任人</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rectificationSummary.recent.map((rectification) => (
                    <tr key={rectification.id}>
                      <td><strong>{rectification.rectificationCode}</strong></td>
                      <td>{rectification.rectificationTitle}</td>
                      <td><RectificationStatusPill status={rectification.status} /></td>
                      <td><RectificationSeverityPill severity={rectification.severity} /></td>
                      <td>{formatDate(rectification.deadline)}</td>
                      <td>{rectification.responsibleUserId ?? rectification.responsibleOrgId ?? "-"}</td>
                      <td><Link className="secondary-button" href={`/engineering/rectifications/${rectification.id}`}>查看</Link></td>
                    </tr>
                  ))}
                  {rectificationSummary.recent.length === 0 ? (
                    <tr>
                      <td colSpan={7}>暂无整改任务</td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>工程验收</h2>
              <span>工程验收已接入真实 API，支持提交、评审、关闭和验收证据沉淀。</span>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="验收总数" value={acceptanceSummary.total} />
              <DetailItem label="待处理" value={acceptanceSummary.pending} />
              <DetailItem label="已通过/关闭" value={acceptanceSummary.passed} />
              <DetailItem label="未通过" value={acceptanceSummary.failed} />
              <DetailItem label="需整改" value={acceptanceSummary.rectificationRequired} />
            </div>
            <div className={styles.actionBar}>
              <Link className="primary-button" href={`/engineering/acceptances/new?projectId=${project.id}`}>
                <Plus size={16} />
                新增验收
              </Link>
              <Link className="secondary-button" href={`/engineering/acceptances?projectId=${project.id}`}>
                <Eye size={16} />
                查看全部验收
              </Link>
            </div>
            <div className="table-scroll">
              <DataTable>
                <thead>
                  <tr>
                    <th>验收编号</th>
                    <th>名称</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>计划日期</th>
                    <th>评审时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptanceSummary.recent.map((acceptance) => (
                    <tr key={acceptance.id}>
                      <td><strong>{acceptance.acceptanceCode}</strong></td>
                      <td>{acceptance.acceptanceName}</td>
                      <td><AcceptanceTypePill type={acceptance.acceptanceType} /></td>
                      <td><AcceptanceStatusPill status={acceptance.acceptanceStatus} /></td>
                      <td>{formatDate(acceptance.plannedAcceptanceDate)}</td>
                      <td>{formatAcceptanceDateTime(acceptance.reviewedAt)}</td>
                      <td><Link className="secondary-button" href={`/engineering/acceptances/${acceptance.id}`}>查看</Link></td>
                    </tr>
                  ))}
                  {acceptanceSummary.recent.length === 0 ? (
                    <tr>
                      <td colSpan={7}>暂无工程验收</td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>后续 Runtime 入口</h2>
              <span>档案和物业移交将在后续任务逐步接入。</span>
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
