"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrGoal, type HrWorkReport } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";

const label: Record<string, string> = { daily: "日报", weekly: "周报", monthly: "月报", submitted: "待审核", confirmed: "已确认", returned: "已退回" };

export function HrWorkReportsClient() {
  const user = useAuthUser();
  const canReview = hasPermission(user, HR_PERMISSIONS.HR_WORK_REPORT_TEAM_REVIEW);
  const [mine, setMine] = useState<HrWorkReport[]>([]);
  const [team, setTeam] = useState<HrWorkReport[]>([]);
  const [goals, setGoals] = useState<HrGoal[]>([]);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      const [myRows, myGoals, teamRows] = await Promise.all([
        hrApi.myWorkReports(token), hrApi.goals(true, token),
        canReview ? hrApi.teamWorkReports(token) : Promise.resolve([])
      ]);
      setMine(myRows); setGoals(myGoals); setTeam(teamRows); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "加载汇报失败"); }
  }, [canReview]);

  useEffect(() => { void load(); }, [load]);
  const pending = useMemo(() => team.filter((item) => item.status === "submitted").length, [team]);

  const create = async (form: FormData) => {
    try {
      await hrApi.createWorkReport({
        reportType: String(form.get("reportType")), periodStart: String(form.get("periodStart")), periodEnd: String(form.get("periodEnd")),
        completedWork: String(form.get("completedWork")), nextPlan: String(form.get("nextPlan")) || undefined,
        risks: String(form.get("risks")) || undefined, collaborationNeeds: String(form.get("collaborationNeeds")) || undefined,
        hours: String(form.get("hours")) ? Number(form.get("hours")) : undefined, goalIds: form.getAll("goalIds").map(String)
      }, getAccessToken());
      setShowCreate(false); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交失败"); }
  };

  const review = async (form: FormData) => {
    try {
      await hrApi.reviewWorkReport(String(form.get("reportId")), { action: String(form.get("action")), comment: String(form.get("comment")) }, getAccessToken());
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "审核失败"); }
  };

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_WORK_REPORTS_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">工作协同</span><h1>工作汇报</h1><p>日报、周报和月报统一记录，主管在同一处完成反馈。</p></div><div className={styles.heroActions}><button type="button" className="ds-button ds-button-primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "收起填写" : "填写汇报"}</button></div></section>
      <section className="ds-kpi-grid" aria-label="汇报概览">
        <article className="ds-kpi-card"><span>我的汇报</span><strong>{mine.length}</strong><small>当前可见记录</small></article>
        <article className="ds-kpi-card"><span>退回修改</span><strong>{mine.filter((item) => item.status === "returned").length}</strong><small>需要补充后重提</small></article>
        {canReview ? <article className="ds-kpi-card"><span>团队待审</span><strong>{pending}</strong><small>等待主管反馈</small></article> : null}
      </section>
      {showCreate ? <form className={`ds-panel ${styles.formGrid}`} action={create}>
        <div className={styles.sectionHeading}><div><span className="ds-eyebrow">新建</span><h2>填写工作汇报</h2></div></div>
        <label className="form-field"><span>类型</span><select name="reportType"><option value="daily">日报</option><option value="weekly">周报</option><option value="monthly">月报</option></select></label>
        <label className="form-field"><span>开始</span><input name="periodStart" type="date" required /></label><label className="form-field"><span>结束</span><input name="periodEnd" type="date" required /></label>
        <label className="form-field"><span>工时</span><input name="hours" type="number" min="0" max="744" step="0.25" /></label><label className="form-field"><span>完成工作</span><textarea name="completedWork" required /></label>
        <label className="form-field"><span>下一步</span><textarea name="nextPlan" /></label><label className="form-field"><span>风险</span><textarea name="risks" /></label><label className="form-field"><span>协同需求</span><textarea name="collaborationNeeds" /></label>
        <label className="form-field"><span>关联目标</span><select name="goalIds" multiple>{goals.map((item) => <option key={item.id} value={item.id}>{item.goalName}</option>)}</select></label>
        <div className={styles.formActions}><button className="ds-button ds-button-primary">提交汇报</button><button type="button" className="ds-button" onClick={() => setShowCreate(false)}>取消</button></div>
      </form> : null}
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      {canReview ? <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">主管事项</span><h2>直属团队审核</h2></div><strong>{pending} 项待处理</strong></div><div className="ds-mobile-record-list">{team.length === 0 ? <p className={styles.emptyState}>当前没有团队汇报。</p> : team.map((item) => <article className="ds-mobile-record" key={item.id}><strong>{label[item.reportType]} · {item.periodStart}</strong><span>{item.completedWork}</span>{item.status === "submitted" ? <details className={styles.actionDisclosure}><summary>审核这份汇报</summary><form className={styles.formGrid} action={review}><input type="hidden" name="reportId" value={item.id} /><label className="form-field"><span>结果</span><select name="action"><option value="confirmed">确认</option><option value="returned">退回</option></select></label><label className="form-field"><span>意见</span><input name="comment" required /></label><button className="ds-button ds-button-primary">提交审核</button></form></details> : <span>{label[item.status]}</span>}</article>)}</div></section> : null}
      <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">个人记录</span><h2>我的汇报</h2></div></div><div className="ds-mobile-record-list">{mine.length === 0 ? <p className={styles.emptyState}>暂无汇报，使用右上角“填写汇报”开始记录。</p> : mine.map((item) => <article className="ds-mobile-record" key={item.id}><strong>{label[item.reportType]} · {item.periodStart}</strong><span>{label[item.status]}</span><span>{item.completedWork}</span>{item.reviewComment ? <span>主管意见：{item.reviewComment}</span> : null}</article>)}</div></section>
    </main>
  </PermissionGuard>;
}
