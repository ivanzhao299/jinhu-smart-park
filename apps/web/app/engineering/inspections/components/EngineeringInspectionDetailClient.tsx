"use client";

import { Card, DataTable } from "@jinhu/ui";
import { ArrowLeft, Edit3, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringInspectionsApi } from "../../../../lib/engineering-inspections-api";
import { engineeringInspectionTypeLabels } from "../../../../lib/engineering-inspections-display";
import { ENGINEERING_INSPECTION_PERMISSIONS, hasEngineeringInspectionPermission } from "../../../../lib/engineering-inspections-permissions";
import type { CreateEngineeringIssueInput, EngineeringInspection, EngineeringIssue } from "../../../../lib/engineering-inspections-types";
import { isInspectionEditable, isInspectionSubmittable } from "../../../../lib/engineering-inspections-utils";
import {
  DetailItem,
  EngineeringIssueDrawer,
  ForbiddenEngineeringInspection,
  InspectionStatusPill,
  InspectionTypePill,
  IssueSeverityPill,
  IssueStatusPill,
  IssueTypePill,
  MessageLine,
  formatDate,
  formatDateTime,
  openIssueCount
} from "./EngineeringInspectionShared";
import styles from "../../projects/engineering-projects.module.css";

export function EngineeringInspectionDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const inspectionId = String(params.id ?? "");
  const authUser = useAuthUser();
  const canView = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.VIEW);
  const canUpdate = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.UPDATE);
  const canDelete = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.DELETE);
  const canSubmit = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.SUBMIT);
  const canCreateIssue = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.ISSUE_CREATE);
  const canGenerateRectification = hasEngineeringInspectionPermission(authUser, ENGINEERING_INSPECTION_PERMISSIONS.ISSUE_GENERATE_RECTIFICATION);
  const [inspection, setInspection] = useState<EngineeringInspection | null>(null);
  const [issues, setIssues] = useState<EngineeringIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [issueDrawerOpen, setIssueDrawerOpen] = useState(false);
  const [issueSaving, setIssueSaving] = useState(false);
  const issueSummary = useMemo(() => {
    const total = issues.length;
    const open = openIssueCount(issues);
    const critical = issues.filter((issue) => issue.severity === "CRITICAL" && issue.issueStatus !== "CLOSED").length;
    return { total, open, critical };
  }, [issues]);

  const load = useCallback(async () => {
    if (!inspectionId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const [detail, issueItems] = await Promise.all([
        engineeringInspectionsApi.getInspection(inspectionId, getAccessToken()),
        engineeringInspectionsApi.getInspectionIssues(inspectionId, getAccessToken())
      ]);
      setInspection(detail);
      setIssues(issueItems);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程巡检详情失败");
    } finally {
      setLoading(false);
    }
  }, [canView, inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitInspection() {
    if (!inspection) return;
    if (!window.confirm(`确认提交巡检「${inspection.inspectionCode}」？提交后进入问题整改准备阶段。`)) return;
    setMessage("");
    try {
      await engineeringInspectionsApi.submitInspection(inspection.id, getAccessToken());
      setMessage("提交成功");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交工程巡检失败");
    }
  }

  async function removeInspection() {
    if (!inspection) return;
    if (!window.confirm(`确认删除巡检「${inspection.inspectionCode}」？此操作会执行软删除。`)) return;
    setMessage("");
    try {
      await engineeringInspectionsApi.deleteInspection(inspection.id, getAccessToken());
      router.push(inspection.projectId ? `/engineering/projects/${inspection.projectId}` : "/engineering/inspections");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程巡检失败");
    }
  }

  async function createIssue(input: CreateEngineeringIssueInput) {
    if (!inspection) return;
    setIssueSaving(true);
    setMessage("");
    try {
      await engineeringInspectionsApi.createInspectionIssue(inspection.id, input, getAccessToken());
      setIssueDrawerOpen(false);
      setMessage("问题已记录，后续可生成整改任务");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增巡检问题失败");
    } finally {
      setIssueSaving(false);
    }
  }

  async function generateRectification(issue: EngineeringIssue) {
    if (!window.confirm(`确认从问题「${issue.issueCode}」生成整改任务？`)) return;
    setMessage("");
    try {
      await engineeringInspectionsApi.generateRectificationFromIssue(issue.id, {}, getAccessToken());
      setMessage("整改任务已生成");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成整改任务失败");
    }
  }

  if (!canView) return <ForbiddenEngineeringInspection />;

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>{inspection ? inspection.inspectionTitle : "工程巡检详情"}</strong>
          <span>{inspection ? `${inspection.inspectionCode} · ${engineeringInspectionTypeLabels[inspection.inspectionType]}` : "加载中..."}</span>
        </div>
        <div className="page-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </button>
          {canCreateIssue && inspection ? (
            <button className="secondary-button" type="button" onClick={() => setIssueDrawerOpen(true)}>
              <Plus size={16} />
              记录问题
            </button>
          ) : null}
          {canSubmit && inspection && isInspectionSubmittable(inspection.inspectionStatus) ? (
            <button className="secondary-button" type="button" onClick={() => void submitInspection()}>
              <Send size={16} />
              提交
            </button>
          ) : null}
          {canUpdate && inspection && isInspectionEditable(inspection.inspectionStatus) ? (
            <Link className="secondary-button" href={`/engineering/inspections/${inspection.id}/edit`}>
              <Edit3 size={16} />
              编辑
            </Link>
          ) : null}
          {canDelete && inspection && isInspectionEditable(inspection.inspectionStatus) ? (
            <button className="secondary-button" type="button" onClick={() => void removeInspection()}>
              <Trash2 size={16} />
              删除
            </button>
          ) : null}
          <Link className="secondary-button" href={inspection?.projectId ? `/engineering/projects/${inspection.projectId}` : "/engineering/inspections"}>
            <ArrowLeft size={16} />
            返回
          </Link>
        </div>
      </header>

      {inspection ? (
        <>
          <Card>
            <div className={styles.detailHero}>
              <div>
                <span>{inspection.inspectionCode}</span>
                <h1>{inspection.inspectionTitle}</h1>
                <p>{inspection.summary || "暂无巡检摘要"}</p>
              </div>
              <div className={styles.heroBadges}>
                <InspectionStatusPill status={inspection.inspectionStatus} />
                <InspectionTypePill type={inspection.inspectionType} />
              </div>
            </div>
            <div className={styles.detailGrid}>
              <DetailItem label="所属项目" value={inspection.projectId} />
              <DetailItem label="关联计划" value={inspection.planId ?? "-"} />
              <DetailItem label="关联日报" value={inspection.dailyReportId ?? "-"} />
              <DetailItem label="巡检日期" value={formatDate(inspection.inspectionDate)} />
              <DetailItem label="位置" value={inspection.locationText ?? "-"} />
              <DetailItem label="巡检人" value={inspection.inspectorUserId ?? "-"} />
              <DetailItem label="巡检组织" value={inspection.inspectorOrgId ?? "-"} />
              <DetailItem label="施工单位" value={inspection.contractorOrgId ?? "-"} />
              <DetailItem label="监理单位" value={inspection.supervisorOrgId ?? "-"} />
              <DetailItem label="提交时间" value={formatDateTime(inspection.submittedAt)} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>问题概况</h2>
              <span>问题在本阶段只形成证据，整改任务由 Task 013 自动生成。</span>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="问题总数" value={issueSummary.total} />
              <DetailItem label="未关闭问题" value={issueSummary.open} />
              <DetailItem label="重大未关闭" value={issueSummary.critical} />
              <DetailItem label="登记问题数" value={`${inspection.issueCount} / 重大 ${inspection.criticalIssueCount}`} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>巡检结论</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="综合结论" value={inspection.overallResult ?? "-"} />
              <DetailItem label="巡检摘要" value={inspection.summary ?? "-"} />
              <DetailItem label="建筑 / 楼层 / 空间" value={`${inspection.buildingId ?? "-"} / ${inspection.floorId ?? "-"} / ${inspection.spaceId ?? "-"}`} />
              <DetailItem label="附件数量" value={inspection.attachmentIds?.length ?? 0} />
              <DetailItem label="备注" value={inspection.remark ?? "-"} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>巡检问题</h2>
              {canCreateIssue ? <button className="primary-button" type="button" onClick={() => setIssueDrawerOpen(true)}><Plus size={16} />新增问题</button> : null}
            </section>
            <div className="table-scroll">
              <DataTable>
                <thead>
                  <tr>
                    <th>问题编号</th>
                    <th>标题</th>
                    <th>类型</th>
                    <th>严重等级</th>
                    <th>状态</th>
                    <th>责任人</th>
                    <th>期限</th>
                    <th>整改</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id}>
                      <td><strong>{issue.issueCode}</strong></td>
                      <td>{issue.issueTitle}</td>
                      <td><IssueTypePill type={issue.issueType} /></td>
                      <td><IssueSeverityPill severity={issue.severity} /></td>
                      <td><IssueStatusPill status={issue.issueStatus} /></td>
                      <td>{issue.responsibleUserId ?? issue.responsibleOrgId ?? "-"}</td>
                      <td>{formatDate(issue.deadline)}</td>
                      <td>
                        {canGenerateRectification && canGenerateRectificationFromIssue(issue) ? (
                          <button className="secondary-button" type="button" onClick={() => void generateRectification(issue)}>生成整改</button>
                        ) : issue.rectificationId ? (
                          <Link className="secondary-button" href={`/engineering/rectifications/${issue.rectificationId}`}>查看整改</Link>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                  {issues.length === 0 ? (
                    <tr>
                      <td colSpan={8}>暂无巡检问题</td>
                    </tr>
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p>{loading ? "加载中..." : "未找到工程巡检"}</p>
        </Card>
      )}

      {issueDrawerOpen ? <EngineeringIssueDrawer saving={issueSaving} onClose={() => setIssueDrawerOpen(false)} onSubmit={createIssue} /> : null}
      <MessageLine message={message} />
    </main>
  );
}

function canGenerateRectificationFromIssue(issue: EngineeringIssue): boolean {
  return !issue.rectificationId && issue.issueStatus !== "CLOSED" && issue.issueStatus !== "CANCELLED";
}
