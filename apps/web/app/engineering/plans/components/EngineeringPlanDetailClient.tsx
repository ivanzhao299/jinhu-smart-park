"use client";

import { Card } from "@jinhu/ui";
import { ArrowLeft, Edit3, Gauge, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { engineeringPlansApi } from "../../../../lib/engineering-plans-api";
import { engineeringPlanLevelLabels, engineeringPlanTypeLabels } from "../../../../lib/engineering-plans-display";
import { ENGINEERING_PLAN_PERMISSIONS, hasEngineeringPlanPermission } from "../../../../lib/engineering-plans-permissions";
import type { EngineeringPlan, UpdateEngineeringPlanProgressInput, UpdateEngineeringPlanStatusInput } from "../../../../lib/engineering-plans-types";
import {
  DetailItem,
  ForbiddenEngineeringPlan,
  MessageLine,
  PlanLevelPill,
  PlanProgressBar,
  PlanProgressDrawer,
  PlanRiskPill,
  PlanStatusDrawer,
  PlanStatusPill,
  PlanTypePill,
  formatDate,
  formatNumber
} from "./EngineeringPlanShared";
import styles from "../../projects/engineering-projects.module.css";

export function EngineeringPlanDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const planId = String(params.id ?? "");
  const authUser = useAuthUser();
  const canView = hasEngineeringPlanPermission(authUser, ENGINEERING_PLAN_PERMISSIONS.VIEW);
  const canUpdate = hasEngineeringPlanPermission(authUser, ENGINEERING_PLAN_PERMISSIONS.UPDATE);
  const [plan, setPlan] = useState<EngineeringPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [progressOpen, setProgressOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [operationSaving, setOperationSaving] = useState(false);

  const load = useCallback(async () => {
    if (!planId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const detail = await engineeringPlansApi.getPlan(planId, getAccessToken());
      setPlan(detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载工程计划详情失败");
    } finally {
      setLoading(false);
    }
  }, [canView, planId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!plan) return;
    if (!window.confirm(`确认删除工程计划「${plan.planName}」？此操作会执行软删除。`)) {
      return;
    }
    setMessage("");
    try {
      await engineeringPlansApi.deletePlan(plan.id, getAccessToken());
      router.push(plan.projectId ? `/engineering/projects/${plan.projectId}` : "/engineering/plans");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除工程计划失败");
    }
  }

  async function updateProgress(input: UpdateEngineeringPlanProgressInput) {
    if (!plan) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringPlansApi.updatePlanProgress(plan.id, input, getAccessToken());
      setProgressOpen(false);
      setMessage("进度更新成功");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新进度失败");
    } finally {
      setOperationSaving(false);
    }
  }

  async function updateStatus(input: UpdateEngineeringPlanStatusInput) {
    if (!plan) return;
    setOperationSaving(true);
    setMessage("");
    try {
      await engineeringPlansApi.updatePlanStatus(plan.id, input, getAccessToken());
      setStatusOpen(false);
      setMessage("状态更新成功");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新状态失败");
    } finally {
      setOperationSaving(false);
    }
  }

  if (!canView) {
    return <ForbiddenEngineeringPlan />;
  }

  return (
    <main className={`content ds-page ${styles.pageShell}`}>
      <header className="header">
        <div className="header-title">
          <strong>{plan ? plan.planName : "工程计划详情"}</strong>
          <span>{plan ? `${plan.planCode} · ${engineeringPlanTypeLabels[plan.planType]}` : "加载中..."}</span>
        </div>
        <div className="page-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </button>
          {canUpdate && plan ? (
            <>
              <button className="secondary-button" type="button" onClick={() => setProgressOpen(true)}>
                <Gauge size={16} />
                更新进度
              </button>
              <button className="secondary-button" type="button" onClick={() => setStatusOpen(true)}>
                <RefreshCw size={16} />
                更新状态
              </button>
              <Link className="secondary-button" href={`/engineering/plans/${plan.id}/edit`}>
                <Edit3 size={16} />
                编辑
              </Link>
              <button className="secondary-button" type="button" onClick={() => void remove()}>
                <Trash2 size={16} />
                删除
              </button>
            </>
          ) : null}
          <Link className="secondary-button" href={plan?.projectId ? `/engineering/projects/${plan.projectId}` : "/engineering/plans"}>
            <ArrowLeft size={16} />
            返回
          </Link>
        </div>
      </header>

      {plan ? (
        <>
          <Card>
            <div className={styles.detailHero}>
              <div>
                <span>{plan.planCode}</span>
                <h1>{plan.planName}</h1>
                <p>{plan.description || "暂无计划描述"}</p>
              </div>
              <div className={styles.heroBadges}>
                <PlanStatusPill status={plan.status} />
                <PlanTypePill type={plan.planType} />
                <PlanLevelPill level={plan.planLevel} />
                <PlanRiskPill risk={plan.riskLevel} />
              </div>
            </div>
            <div className={styles.detailGrid}>
              <DetailItem label="所属项目" value={plan.projectId} />
              <DetailItem label="父计划" value={plan.parentPlanId ?? "-"} />
              <DetailItem label="计划层级" value={engineeringPlanLevelLabels[plan.planLevel]} />
              <DetailItem label="计划周期" value={`${formatDate(plan.plannedStartDate)} - ${formatDate(plan.plannedEndDate)}`} />
              <DetailItem label="实际周期" value={`${formatDate(plan.actualStartDate)} - ${formatDate(plan.actualEndDate)}`} />
              <DetailItem label="计划进度" value={<PlanProgressBar value={plan.plannedProgressPercent} />} />
              <DetailItem label="实际进度" value={<PlanProgressBar value={plan.actualProgressPercent} />} />
              <DetailItem label="延期天数" value={plan.delayDays > 0 ? `${plan.delayDays} 天` : "-"} />
              <DetailItem label="权重" value={formatNumber(plan.weight)} />
              <DetailItem label="排序" value={formatNumber(plan.sortOrder)} />
              <DetailItem label="创建时间" value={formatDate(plan.createTime)} />
              <DetailItem label="更新时间" value={formatDate(plan.updateTime)} />
            </div>
          </Card>

          <Card>
            <section className={styles.sectionHeader}>
              <h2>责任信息</h2>
            </section>
            <div className={styles.detailGrid}>
              <DetailItem label="责任人" value={plan.ownerUserId ?? "-"} />
              <DetailItem label="责任单位" value={plan.ownerOrgId ?? "-"} />
              <DetailItem label="施工单位组织" value={plan.contractorOrgId ?? "-"} />
              <DetailItem label="组织 ID" value={plan.orgId ?? "-"} />
              <DetailItem label="园区 ID" value={plan.parkId} />
              <DetailItem label="备注" value={plan.remark ?? "-"} />
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p>{loading ? "加载中..." : "未找到工程计划"}</p>
        </Card>
      )}

      {plan && progressOpen ? <PlanProgressDrawer plan={plan} saving={operationSaving} onClose={() => setProgressOpen(false)} onSubmit={updateProgress} /> : null}
      {plan && statusOpen ? <PlanStatusDrawer plan={plan} saving={operationSaving} onClose={() => setStatusOpen(false)} onSubmit={updateStatus} /> : null}
      <MessageLine message={message} />
    </main>
  );
}
