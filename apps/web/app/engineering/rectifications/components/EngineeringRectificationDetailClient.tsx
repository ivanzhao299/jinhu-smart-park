"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, RefreshCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringRectificationsApi } from "../../../../lib/engineering-rectifications-api";
import { engineeringRectificationActionLabels } from "../../../../lib/engineering-rectifications-display";
import { ENGINEERING_RECTIFICATION_PERMISSIONS, hasEngineeringRectificationPermission } from "../../../../lib/engineering-rectifications-permissions";
import type { EngineeringRectification, EngineeringRectificationAction, EngineeringRectificationActionInput } from "../../../../lib/engineering-rectifications-types";
import { availableRectificationActions, isRectificationDeletable } from "../../../../lib/engineering-rectifications-utils";
import {
  DetailItem,
  ForbiddenEngineeringRectification,
  MessageLine,
  RectificationActionDrawer,
  RectificationSeverityPill,
  RectificationStatusPill,
  formatDate,
  formatDateTime
} from "./EngineeringRectificationShared";
import {
  displayUserName,
  emptyEngineeringProjectReferences,
  formatBuildingLabel,
  formatFloorLabel,
  formatInspectionLabel,
  formatIssueLabel,
  formatOrgLabel,
  formatProjectLabel,
  formatUnitLabel,
  loadEngineeringProjectReferences,
  type EngineeringProjectReferenceData
} from "../../projects/components/EngineeringProjectReferenceData";
import styles from "../../projects/engineering-projects.module.css";

export function EngineeringRectificationDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rectificationId = String(params.id ?? "");
  const authUser = useAuthUser();
  const canView = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.VIEW);
  const canUpdate = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.UPDATE);
  const canSubmit = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.SUBMIT);
  const canRecheck = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.RECHECK);
  const canClose = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.CLOSE);
  const canDelete = hasEngineeringRectificationPermission(authUser, ENGINEERING_RECTIFICATION_PERMISSIONS.DELETE);
  const [rectification, setRectification] = useState<EngineeringRectification | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [references, setReferences] = useState<EngineeringProjectReferenceData>(emptyEngineeringProjectReferences);
  const [action, setAction] = useState<EngineeringRectificationAction | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const projectLabel = formatProjectLabel(references.projects.find((item) => item.id === rectification?.projectId) ?? null);

  const load = useCallback(async () => {
    if (!rectificationId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringRectificationsApi.getRectification(rectificationId, getAccessToken());
      setRectification(detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载整改详情失败");
    } finally {
      setLoading(false);
    }
  }, [canView, rectificationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadEngineeringProjectReferences(getAccessToken())
      .then((data) => setReferences(data))
      .catch(() => undefined);
  }, []);

  async function executeAction(input: EngineeringRectificationActionInput) {
    if (!rectification) return;
    setActionSaving(true);
    setMessage("");
    try {
      await engineeringRectificationsApi.executeRectificationAction(rectification.id, input, getAccessToken());
      setAction(null);
      setMessage("整改动作执行成功");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "整改动作执行失败");
    } finally {
      setActionSaving(false);
    }
  }

  async function remove() {
    if (!rectification) return;
    if (!window.confirm(`确认删除整改任务「${rectification.rectificationCode}」？此操作会执行软删除。`)) return;
    setMessage("");
    try {
      await engineeringRectificationsApi.deleteRectification(rectification.id, getAccessToken());
      router.push(rectification.projectId ? `/engineering/projects/${rectification.projectId}` : "/engineering/rectifications");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程整改失败");
    }
  }

  if (!canView) return <ForbiddenEngineeringRectification />;

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>{rectification ? rectification.rectificationTitle : "整改任务详情"}</strong>
          <span>{rectification ? `${rectification.rectificationCode} · ${formatDate(rectification.deadline)}` : "加载中..."}</span>
        </div>
        <div className="page-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </button>
          {rectification ? actionButtons().map((item) => (
            <button key={item} className="secondary-button" type="button" onClick={() => setAction(item)}>
              <Send size={16} />
              {engineeringRectificationActionLabels[item] ?? item}
            </button>
          )) : null}
          {canDelete && rectification && isRectificationDeletable(rectification.status) ? (
            <button className="secondary-button" type="button" onClick={() => void remove()}>
              <Trash2 size={16} />
              删除
            </button>
          ) : null}
          <Link className="secondary-button" href={rectification?.projectId ? `/engineering/projects/${rectification.projectId}` : "/engineering/rectifications"}>
            <ArrowLeft size={16} />
            返回
          </Link>
        </div>
      </header>

      {rectification ? (
        <>
          <Card>
            <div className={styles.detailHero}>
              <div>
                <span>{rectification.rectificationCode}</span>
                <h1>{rectification.rectificationTitle}</h1>
                <p>{rectification.description}</p>
              </div>
              <div className={styles.heroBadges}>
                <RectificationStatusPill status={rectification.status} />
                <RectificationSeverityPill severity={rectification.severity} />
              </div>
            </div>
            <div className={styles.detailGrid}>
              <DetailItem label="所属项目" value={projectLabel !== "-" ? projectLabel : rectification.projectId} />
              <DetailItem label="来源问题" value={rectification.issueId ? formatIssueLabel(references.issues.find((item) => item.id === rectification.issueId) ?? null) : "-"} />
              <DetailItem label="来源巡检" value={rectification.inspectionId ? formatInspectionLabel(references.inspections.find((item) => item.id === rectification.inspectionId) ?? null) : "-"} />
              <DetailItem label="整改期限" value={formatDate(rectification.deadline)} />
              <DetailItem label="责任人" value={rectification.responsibleUserId ? displayUserName(references.users.find((item) => item.id === rectification.responsibleUserId) ?? null) : "-"} />
              <DetailItem label="责任组织" value={rectification.responsibleOrgId ? formatOrgLabel(references.orgs.find((item) => item.id === rectification.responsibleOrgId) ?? null) : "-"} />
              <DetailItem label="施工单位" value={rectification.contractorOrgId ? formatOrgLabel(references.orgs.find((item) => item.id === rectification.contractorOrgId) ?? null) : "-"} />
              <DetailItem label="监理单位" value={rectification.supervisorOrgId ? formatOrgLabel(references.orgs.find((item) => item.id === rectification.supervisorOrgId) ?? null) : "-"} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>反馈与复查</h2>
              <span>施工方提交整改反馈，工程方复查通过或驳回。</span>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="开始整改" value={formatDateTime(rectification.startedAt)} />
              <DetailItem label="提交整改" value={formatDateTime(rectification.submittedAt)} />
              <DetailItem label="提交人" value={rectification.submittedBy ? displayUserName(references.users.find((item) => item.id === rectification.submittedBy) ?? null) : "-"} />
              <DetailItem label="复查时间" value={formatDateTime(rectification.recheckedAt)} />
              <DetailItem label="复查人" value={rectification.recheckedBy ? displayUserName(references.users.find((item) => item.id === rectification.recheckedBy) ?? null) : "-"} />
              <DetailItem label="关闭时间" value={formatDateTime(rectification.closedAt)} />
              <DetailItem label="关闭人" value={rectification.closedBy ? displayUserName(references.users.find((item) => item.id === rectification.closedBy) ?? null) : "-"} />
              <DetailItem label="附件数量" value={rectification.attachmentIds?.length ?? 0} />
            </div>
            <div className={styles.longTextBlock}>
              <h3>整改反馈</h3>
              <p>{rectification.feedback || "暂无整改反馈"}</p>
              <h3>复查意见</h3>
              <p>{rectification.recheckComment || "暂无复查意见"}</p>
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>位置与备注</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="位置描述" value={rectification.locationText ?? "-"} />
              <DetailItem
                label="建筑 / 楼层 / 空间"
                value={`${rectification.buildingId ? formatBuildingLabel(references.buildings.find((item) => item.id === rectification.buildingId) ?? null) : "-"} / ${rectification.floorId ? formatFloorLabel(references.floors.find((item) => item.id === rectification.floorId) ?? null) : "-"} / ${rectification.spaceId ? formatUnitLabel(references.units.find((item) => item.id === rectification.spaceId) ?? null) : "-"}`}
              />
              <DetailItem label="备注" value={rectification.remark ?? "-"} />
              <DetailItem label="创建时间" value={formatDateTime(rectification.createTime)} />
              <DetailItem label="更新时间" value={formatDateTime(rectification.updateTime)} />
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p>{loading ? "加载中..." : "未找到整改任务"}</p>
        </Card>
      )}

      <MessageLine message={message} />
      {action ? (
        <RectificationActionDrawer
          action={action}
          saving={actionSaving}
          onClose={() => setAction(null)}
          onSubmit={executeAction}
        />
      ) : null}
    </main>
  );

  function actionButtons(): EngineeringRectificationAction[] {
    if (!rectification) return [];
    return availableRectificationActions(rectification.status).filter((item) => {
      if (item === "SUBMIT") return canSubmit;
      if (item === "PASS" || item === "REJECT" || item === "START_RECHECK") return canRecheck;
      if (item === "CLOSE") return canClose;
      return canUpdate;
    });
  }
}
