"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, CheckCircle2, Edit3, RefreshCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringDailyReportsApi } from "../../../../lib/engineering-daily-reports-api";
import { engineeringWeatherTypeLabels } from "../../../../lib/engineering-daily-reports-display";
import { ENGINEERING_DAILY_REPORT_PERMISSIONS, hasEngineeringDailyReportPermission } from "../../../../lib/engineering-daily-reports-permissions";
import type { EngineeringDailyReport, ReviewEngineeringDailyReportInput } from "../../../../lib/engineering-daily-reports-types";
import { isDailyReportEditable, isDailyReportReviewable, isDailyReportSubmittable } from "../../../../lib/engineering-daily-reports-utils";
import {
  emptyEngineeringProjectReferences,
  formatOrgLabel,
  formatProjectLabel,
  loadEngineeringProjectReferences,
  type EngineeringProjectReferenceData
} from "../../projects/components/EngineeringProjectReferenceData";
import {
  DailyReportProgressBar,
  DailyReportReviewDrawer,
  DailyReportStatusPill,
  DetailItem,
  ForbiddenEngineeringDailyReport,
  MessageLine,
  WeatherPill,
  formatDate,
  formatDateTime,
  formatNumber
} from "./EngineeringDailyReportShared";
import styles from "../../projects/engineering-projects.module.css";

export function EngineeringDailyReportDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const reportId = String(params.id ?? "");
  const authUser = useAuthUser();
  const canView = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.VIEW);
  const canUpdate = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.UPDATE);
  const canDelete = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.DELETE);
  const canSubmit = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.SUBMIT);
  const canReview = hasEngineeringDailyReportPermission(authUser, ENGINEERING_DAILY_REPORT_PERMISSIONS.REVIEW);
  const [report, setReport] = useState<EngineeringDailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [references, setReferences] = useState<EngineeringProjectReferenceData>(emptyEngineeringProjectReferences);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [operationSaving, setOperationSaving] = useState(false);
  const projectLabel = formatProjectLabel(references.projects.find((item) => item.id === report?.projectId) ?? null);
  const contractorLabel = formatOrgLabel(references.orgs.find((item) => item.id === report?.contractorOrgId) ?? null);
  const supervisorLabel = formatOrgLabel(references.orgs.find((item) => item.id === report?.supervisorOrgId) ?? null);

  const load = useCallback(async () => {
    if (!reportId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringDailyReportsApi.getDailyReport(reportId, getAccessToken());
      setReport(detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载施工日报详情失败");
    } finally {
      setLoading(false);
    }
  }, [canView, reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadEngineeringProjectReferences(getAccessToken())
      .then((data) => setReferences(data))
      .catch(() => undefined);
  }, []);

  async function submitReport() {
    if (!report) return;
    if (!window.confirm(`确认提交施工日报「${report.reportCode}」？提交后进入审核。`)) {
      return;
    }
    setMessage("");
    try {
      await engineeringDailyReportsApi.submitDailyReport(report.id, getAccessToken());
      setMessage("提交成功");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交施工日报失败");
    }
  }

  async function reviewReport(input: ReviewEngineeringDailyReportInput) {
    if (!report) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringDailyReportsApi.reviewDailyReport(report.id, input, getAccessToken());
      setReviewOpen(false);
      setMessage(input.approved ? "审核通过" : "已驳回");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审核施工日报失败");
    } finally {
      setOperationSaving(false);
    }
  }

  async function remove() {
    if (!report) return;
    if (!window.confirm(`确认删除施工日报「${report.reportCode}」？此操作会执行软删除。`)) {
      return;
    }
    setMessage("");
    try {
      await engineeringDailyReportsApi.deleteDailyReport(report.id, getAccessToken());
      router.push(report.projectId ? `/engineering/projects/${report.projectId}` : "/engineering/daily-reports");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除施工日报失败");
    }
  }

  if (!canView) {
    return <ForbiddenEngineeringDailyReport />;
  }

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>{report ? report.reportCode : "施工日报详情"}</strong>
          <span>{report ? `${formatDate(report.reportDate)} · ${engineeringWeatherTypeLabels[report.weather]}` : "加载中..."}</span>
        </div>
        <div className="page-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </button>
          {canSubmit && report && isDailyReportSubmittable(report.reportStatus) ? (
            <button className="secondary-button" type="button" onClick={() => void submitReport()}>
              <Send size={16} />
              提交
            </button>
          ) : null}
          {canReview && report && isDailyReportReviewable(report.reportStatus) ? (
            <button className="secondary-button" type="button" onClick={() => setReviewOpen(true)}>
              <CheckCircle2 size={16} />
              审核
            </button>
          ) : null}
          {canUpdate && report && isDailyReportEditable(report.reportStatus) ? (
            <Link className="secondary-button" href={`/engineering/daily-reports/${report.id}/edit`}>
              <Edit3 size={16} />
              编辑
            </Link>
          ) : null}
          {canDelete && report && isDailyReportEditable(report.reportStatus) ? (
            <button className="secondary-button" type="button" onClick={() => void remove()}>
              <Trash2 size={16} />
              删除
            </button>
          ) : null}
          <Link className="secondary-button" href={report?.projectId ? `/engineering/projects/${report.projectId}` : "/engineering/daily-reports"}>
            <ArrowLeft size={16} />
            返回
          </Link>
        </div>
      </header>

      {report ? (
        <>
          <Card>
            <div className={styles.detailHero}>
              <div>
                <span>{report.reportCode}</span>
                <h1>{formatDate(report.reportDate)} 施工日报</h1>
                <p>{report.workContent || "暂无今日施工内容"}</p>
              </div>
              <div className={styles.heroBadges}>
                <DailyReportStatusPill status={report.reportStatus} />
                <WeatherPill weather={report.weather} />
              </div>
            </div>
            <div className={styles.detailGrid}>
              <DetailItem label="所属项目" value={projectLabel !== "-" ? projectLabel : report.projectId} />
              <DetailItem label="关联计划" value={report.planId ?? "-"} />
              <DetailItem label="天气 / 温度" value={`${engineeringWeatherTypeLabels[report.weather]} / ${report.temperature ?? "-"}`} />
              <DetailItem label="人员" value={`${report.workerCount} 工人 / ${report.managerCount} 管理`} />
              <DetailItem label="进度" value={<DailyReportProgressBar value={report.progressPercent} />} />
              <DetailItem label="施工单位" value={contractorLabel !== "-" ? contractorLabel : report.contractorOrgId ?? "-"} />
              <DetailItem label="监理单位" value={supervisorLabel !== "-" ? supervisorLabel : report.supervisorOrgId ?? "-"} />
              <DetailItem label="提交人" value={report.submittedBy ?? "-"} />
              <DetailItem label="提交时间" value={formatDateTime(report.submittedAt)} />
              <DetailItem label="审核人" value={report.reviewedBy ?? "-"} />
              <DetailItem label="审核时间" value={formatDateTime(report.reviewedAt)} />
              <DetailItem label="审核意见" value={report.reviewComment ?? "-"} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>施工内容</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="今日施工内容" value={report.workContent} />
              <DetailItem label="已完成工作" value={report.completedWork ?? "-"} />
              <DetailItem label="未完成工作" value={report.unfinishedWork ?? "-"} />
              <DetailItem label="明日计划" value={report.tomorrowPlan ?? "-"} />
              <DetailItem label="机械设备情况" value={report.machineSummary ?? "-"} />
              <DetailItem label="材料进场情况" value={report.materialSummary ?? "-"} />
              <DetailItem label="质量情况" value={report.qualitySummary ?? "-"} />
              <DetailItem label="安全文明施工" value={report.safetySummary ?? "-"} />
              <DetailItem label="存在问题" value={report.issueSummary ?? "-"} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>系统信息</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="创建时间" value={formatDateTime(report.createTime)} />
              <DetailItem label="更新时间" value={formatDateTime(report.updateTime)} />
              <DetailItem label="附件数量" value={formatNumber(report.attachmentIds?.length ?? 0)} />
              <DetailItem label="备注" value={report.remark ?? "-"} />
            </div>
            <p className={styles.scopeHint}>本页先展示关联附件数量，相关资料可统一在附件中心继续管理。</p>
          </Card>
        </>
      ) : (
        <Card>
          <p>{loading ? "加载中..." : "未找到施工日报"}</p>
        </Card>
      )}

      {report && reviewOpen ? <DailyReportReviewDrawer report={report} saving={operationSaving} onClose={() => setReviewOpen(false)} onSubmit={reviewReport} /> : null}
      <MessageLine message={message} />
    </main>
  );
}
