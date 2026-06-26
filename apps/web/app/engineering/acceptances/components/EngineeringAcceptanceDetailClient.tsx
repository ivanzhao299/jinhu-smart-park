"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, CheckCircle2, Edit3, Lock, RefreshCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringAcceptancesApi } from "../../../../lib/engineering-acceptances-api";
import { ENGINEERING_ACCEPTANCE_PERMISSIONS, hasEngineeringAcceptancePermission } from "../../../../lib/engineering-acceptances-permissions";
import type { EngineeringAcceptance, ReviewEngineeringAcceptanceInput } from "../../../../lib/engineering-acceptances-types";
import {
  isAcceptanceClosable,
  isAcceptanceDeletable,
  isAcceptanceEditable,
  isAcceptanceReviewable,
  isAcceptanceSubmittable
} from "../../../../lib/engineering-acceptances-utils";
import {
  AcceptanceReviewDrawer,
  AcceptanceStatusPill,
  AcceptanceTypePill,
  DetailItem,
  ForbiddenEngineeringAcceptance,
  MessageLine,
  formatDate,
  formatDateTime
} from "./EngineeringAcceptanceShared";
import styles from "../../projects/engineering-projects.module.css";

export function EngineeringAcceptanceDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const acceptanceId = String(params.id ?? "");
  const authUser = useAuthUser();
  const canView = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.VIEW);
  const canUpdate = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.UPDATE);
  const canDelete = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.DELETE);
  const canSubmit = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.SUBMIT);
  const canReview = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.REVIEW);
  const canClose = hasEngineeringAcceptancePermission(authUser, ENGINEERING_ACCEPTANCE_PERMISSIONS.CLOSE);
  const [acceptance, setAcceptance] = useState<EngineeringAcceptance | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [operationSaving, setOperationSaving] = useState(false);

  const load = useCallback(async () => {
    if (!acceptanceId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringAcceptancesApi.getAcceptance(acceptanceId, getAccessToken());
      setAcceptance(detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程验收详情失败");
    } finally {
      setLoading(false);
    }
  }, [acceptanceId, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAcceptance() {
    if (!acceptance) return;
    if (!window.confirm(`确认提交工程验收「${acceptance.acceptanceCode}」？`)) return;
    setMessage("");
    try {
      await engineeringAcceptancesApi.submitAcceptance(acceptance.id, getAccessToken());
      setMessage("提交成功");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交工程验收失败");
    }
  }

  async function review(input: ReviewEngineeringAcceptanceInput) {
    if (!acceptance) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringAcceptancesApi.reviewAcceptance(acceptance.id, input, getAccessToken());
      setReviewOpen(false);
      setMessage("评审完成");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评审工程验收失败");
    } finally {
      setOperationSaving(false);
    }
  }

  async function closeAcceptance() {
    if (!acceptance) return;
    if (!window.confirm(`确认关闭工程验收「${acceptance.acceptanceCode}」？`)) return;
    setMessage("");
    try {
      await engineeringAcceptancesApi.closeAcceptance(acceptance.id, getAccessToken());
      setMessage("关闭成功");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关闭工程验收失败");
    }
  }

  async function remove() {
    if (!acceptance) return;
    if (!window.confirm(`确认删除工程验收「${acceptance.acceptanceCode}」？此操作会执行软删除。`)) return;
    setMessage("");
    try {
      await engineeringAcceptancesApi.deleteAcceptance(acceptance.id, getAccessToken());
      router.push(acceptance.projectId ? `/engineering/projects/${acceptance.projectId}` : "/engineering/acceptances");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程验收失败");
    }
  }

  if (!canView) return <ForbiddenEngineeringAcceptance />;

  return (
    <main className="content">
      <header className="header">
        <div className="header-title">
          <strong>{acceptance ? acceptance.acceptanceName : "工程验收详情"}</strong>
          <span>{acceptance ? `${acceptance.acceptanceCode} · ${formatDate(acceptance.plannedAcceptanceDate)}` : "加载中..."}</span>
        </div>
        <div className="page-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </button>
          {acceptance && canUpdate && isAcceptanceEditable(acceptance.acceptanceStatus) ? (
            <Link className="secondary-button" href={`/engineering/acceptances/${acceptance.id}/edit`}>
              <Edit3 size={16} />
              编辑
            </Link>
          ) : null}
          {acceptance && canSubmit && isAcceptanceSubmittable(acceptance.acceptanceStatus) ? (
            <button className="secondary-button" type="button" onClick={() => void submitAcceptance()}>
              <Send size={16} />
              提交
            </button>
          ) : null}
          {acceptance && canReview && isAcceptanceReviewable(acceptance.acceptanceStatus) ? (
            <button className="secondary-button" type="button" onClick={() => setReviewOpen(true)}>
              <CheckCircle2 size={16} />
              评审
            </button>
          ) : null}
          {acceptance && canClose && isAcceptanceClosable(acceptance.acceptanceStatus) ? (
            <button className="secondary-button" type="button" onClick={() => void closeAcceptance()}>
              <Lock size={16} />
              关闭
            </button>
          ) : null}
          {acceptance && canDelete && isAcceptanceDeletable(acceptance.acceptanceStatus) ? (
            <button className="secondary-button" type="button" onClick={() => void remove()}>
              <Trash2 size={16} />
              删除
            </button>
          ) : null}
          <Link className="secondary-button" href={acceptance?.projectId ? `/engineering/projects/${acceptance.projectId}` : "/engineering/acceptances"}>
            <ArrowLeft size={16} />
            返回
          </Link>
        </div>
      </header>

      {acceptance ? (
        <>
          <Card>
            <div className={styles.detailHero}>
              <div>
                <span>{acceptance.acceptanceCode}</span>
                <h1>{acceptance.acceptanceName}</h1>
                <p>{acceptance.description || "暂无验收描述"}</p>
              </div>
              <div className={styles.heroBadges}>
                <AcceptanceStatusPill status={acceptance.acceptanceStatus} />
                <AcceptanceTypePill type={acceptance.acceptanceType} />
              </div>
            </div>
            <div className={styles.detailGrid}>
              <DetailItem label="所属项目" value={acceptance.projectId} />
              <DetailItem label="关联计划" value={acceptance.planId ?? "-"} />
              <DetailItem label="计划验收日期" value={formatDate(acceptance.plannedAcceptanceDate)} />
              <DetailItem label="实际验收日期" value={formatDate(acceptance.actualAcceptanceDate)} />
              <DetailItem label="责任人" value={acceptance.responsibleUserId ?? "-"} />
              <DetailItem label="验收组织" value={acceptance.acceptanceOrgId ?? "-"} />
              <DetailItem label="施工单位" value={acceptance.contractorOrgId ?? "-"} />
              <DetailItem label="监理单位" value={acceptance.supervisorOrgId ?? "-"} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>验收范围与结果</h2>
            </section>
            <div className={styles.longTextBlock}>
              <h3>验收范围</h3>
              <p>{acceptance.acceptanceScope || "暂无验收范围"}</p>
              <h3>验收标准</h3>
              <p>{acceptance.acceptanceCriteria || "暂无验收标准"}</p>
              <h3>结果摘要</h3>
              <p>{acceptance.resultSummary || "暂无结果摘要"}</p>
              <h3>评审意见</h3>
              <p>{acceptance.reviewComment || "暂无评审意见"}</p>
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>状态与位置</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="提交时间" value={formatDateTime(acceptance.submittedAt)} />
              <DetailItem label="提交人" value={acceptance.submittedBy ?? "-"} />
              <DetailItem label="评审时间" value={formatDateTime(acceptance.reviewedAt)} />
              <DetailItem label="评审人" value={acceptance.reviewedBy ?? "-"} />
              <DetailItem label="关闭时间" value={formatDateTime(acceptance.closedAt)} />
              <DetailItem label="关闭人" value={acceptance.closedBy ?? "-"} />
              <DetailItem label="位置描述" value={acceptance.locationText ?? "-"} />
              <DetailItem label="建筑 / 楼层 / 空间" value={`${acceptance.buildingId ?? "-"} / ${acceptance.floorId ?? "-"} / ${acceptance.spaceId ?? "-"}`} />
              <DetailItem label="Workflow" value={acceptance.workflowInstanceId ?? "-"} />
              <DetailItem label="附件数量" value={acceptance.attachmentIds?.length ?? 0} />
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p>{loading ? "加载中..." : "未找到工程验收"}</p>
        </Card>
      )}

      {acceptance && reviewOpen ? (
        <AcceptanceReviewDrawer acceptance={acceptance} saving={operationSaving} onClose={() => setReviewOpen(false)} onSubmit={review} />
      ) : null}
      <MessageLine message={message} />
    </main>
  );
}
