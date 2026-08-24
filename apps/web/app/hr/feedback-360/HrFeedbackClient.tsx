"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrEmployee, type HrFeedbackAssignment, type HrFeedbackCycle, type HrPerformanceCycle } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";
import { hrLoadErrorMessage } from "../hr-errors";

type FeedbackAction = "cycle" | "assignment" | null;
const relationLabel: Record<string, string> = { self: "本人", manager: "上级", peer: "同级", subordinate: "下属" };

export function HrFeedbackClient() {
  const user = useAuthUser();
  const manage = hasPermission(user, HR_PERMISSIONS.HR_FEEDBACK_MANAGE);
  const [rows, setRows] = useState<HrFeedbackAssignment[]>([]);
  const [cycles, setCycles] = useState<HrFeedbackCycle[]>([]);
  const [performanceCycles, setPerformanceCycles] = useState<HrPerformanceCycle[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<FeedbackAction>(null);

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      setRows(await hrApi.myFeedbackAssignments(token));
      if (manage) {
        const [cycleRows, performanceRows, employeeRows] = await Promise.all([hrApi.feedbackCycles(token), hrApi.performanceCycles(token), hrApi.employees(token)]);
        setCycles(cycleRows); setPerformanceCycles(performanceRows); setEmployees(employeeRows.items);
      }
      setMessage("");
    } catch (error) { setMessage(hrLoadErrorMessage(error, "加载评价任务失败")); }
  }, [manage]);

  useEffect(() => { void load(); }, [load]);
  const pending = useMemo(() => rows.filter((item) => item.status === "pending").length, [rows]);

  const createCycle = async (form: FormData) => {
    try {
      await hrApi.createFeedbackCycle({ performanceCycleId: String(form.get("performanceCycleId")), cycleName: String(form.get("cycleName")), anonymous: String(form.get("anonymous")) === "true", minimumAnonymousResponses: Number(form.get("minimumAnonymousResponses")) }, getAccessToken());
      setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建 360 周期失败"); }
  };
  const assign = async (form: FormData) => {
    try {
      await hrApi.createFeedbackAssignment({ feedbackCycleId: String(form.get("feedbackCycleId")), subjectEmployeeId: String(form.get("subjectEmployeeId")), reviewerEmployeeId: String(form.get("reviewerEmployeeId")), relationType: String(form.get("relationType")), weight: Number(form.get("weight")) }, getAccessToken());
      setMessage("评价任务已分派"); setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "分派评价失败"); }
  };
  const submit = async (form: FormData) => {
    try {
      await hrApi.submitFeedback(String(form.get("id")), { score: Number(form.get("score")), strengths: String(form.get("strengths")) || undefined, improvements: String(form.get("improvements")) || undefined }, getAccessToken());
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "提交评价失败"); }
  };

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_FEEDBACK_360_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">人才反馈</span><h1>360 度评价</h1><p>聚合上级、同级、下属和本人反馈，匿名结果达到阈值后才展示。</p></div>{manage ? <div className={styles.heroActions}><button type="button" className="ds-button" onClick={() => setAction(action === "cycle" ? null : "cycle")}>评价周期</button><button type="button" className="ds-button ds-button-primary" onClick={() => setAction(action === "assignment" ? null : "assignment")}>分派任务</button></div> : null}</section>
      <section className="ds-kpi-grid" aria-label="360 评价概览"><article className="ds-kpi-card"><span>我的任务</span><strong>{rows.length}</strong><small>当前可见评价</small></article><article className="ds-kpi-card"><span>待我评价</span><strong>{pending}</strong><small>提交后不可重复修改</small></article>{manage ? <article className="ds-kpi-card"><span>评价周期</span><strong>{cycles.length}</strong><small>当前配置周期</small></article> : null}</section>
      {action === "cycle" ? <form className={`ds-panel ${styles.formGrid}`} action={createCycle}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">周期设置</span><h2>创建 360 评价周期</h2></div></div><label className="form-field"><span>绩效周期</span><select name="performanceCycleId">{performanceCycles.map((item) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}</select></label><label className="form-field"><span>360 周期名称</span><input name="cycleName" required /></label><label className="form-field"><span>匿名策略</span><select name="anonymous"><option value="true">匿名</option><option value="false">实名</option></select></label><label className="form-field"><span>最小匿名人数</span><input name="minimumAnonymousResponses" type="number" min="2" max="20" defaultValue="3" /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存周期</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {action === "assignment" ? <form className={`ds-panel ${styles.formGrid}`} action={assign}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">任务设置</span><h2>分派评价任务</h2></div></div><label className="form-field"><span>评价周期</span><select name="feedbackCycleId">{cycles.map((item) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}</select></label><label className="form-field"><span>被评价员工</span><select name="subjectEmployeeId">{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><label className="form-field"><span>评价人</span><select name="reviewerEmployeeId">{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><label className="form-field"><span>评价关系</span><select name="relationType"><option value="self">本人</option><option value="manager">上级</option><option value="peer">同级</option><option value="subordinate">下属</option></select></label><label className="form-field"><span>权重</span><input name="weight" type="number" min="0.0001" max="1" step="0.0001" defaultValue="1" /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">分派任务</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {message ? <p className="form-error" role="status">{message}</p> : null}
      <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">个人事项</span><h2>我的评价任务</h2></div><strong>{pending} 项待处理</strong></div><div className="ds-mobile-record-list">{rows.length === 0 ? <p className={styles.emptyState}>当前没有需要处理的 360 评价。</p> : rows.map((item) => <article className="ds-mobile-record" key={item.id}><strong>{relationLabel[item.relationType] ?? item.relationType} · {item.status === "pending" ? "待评价" : "已提交"}</strong>{item.status === "pending" ? <details className={styles.actionDisclosure}><summary>填写评价</summary><form className={styles.formGrid} action={submit}><input type="hidden" name="id" value={item.id} /><label className="form-field"><span>评分</span><input name="score" type="number" min="0" max="100" step="0.01" required /></label><label className="form-field"><span>优势</span><textarea name="strengths" /></label><label className="form-field"><span>改进建议</span><textarea name="improvements" /></label><button className="ds-button ds-button-primary">提交评价</button></form></details> : <span>评价已提交，内容不可重复修改。</span>}</article>)}</div></section>
    </main>
  </PermissionGuard>;
}
