"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrEmployee, type HrPerformanceCycle, type HrPerformancePlan } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";
import { hrLoadErrorMessage } from "../hr-errors";

type SetupAction = "cycle" | "plan" | null;
const statusLabel: Record<string, string> = { draft: "待启动", self_review: "员工自评", manager_review: "主管评价", calibrating: "HR 校准", confirmed: "已确认" };

export function HrPerformanceClient() {
  const user = useAuthUser();
  const manage = hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_MANAGE);
  const review = hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW);
  const calibrate = hasPermission(user, HR_PERMISSIONS.HR_PERFORMANCE_CALIBRATE);
  const [cycles, setCycles] = useState<HrPerformanceCycle[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [mine, setMine] = useState<HrPerformancePlan[]>([]);
  const [team, setTeam] = useState<HrPerformancePlan[]>([]);
  const [message, setMessage] = useState("");
  const [setup, setSetup] = useState<SetupAction>(null);

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      const tasks: Promise<unknown>[] = [hrApi.myPerformancePlans(token)];
      if (manage) tasks.push(hrApi.performanceCycles(token), hrApi.employees(token));
      if (review) tasks.push(hrApi.teamPerformancePlans(token));
      const rows = await Promise.all(tasks);
      setMine(rows[0] as HrPerformancePlan[]);
      let index = 1;
      if (manage) { setCycles(rows[index++] as HrPerformanceCycle[]); setEmployees((rows[index++] as { items: HrEmployee[] }).items); }
      if (review) setTeam(rows[index] as HrPerformancePlan[]);
      setMessage("");
    } catch (error) { setMessage(hrLoadErrorMessage(error, "加载绩效失败")); }
  }, [manage, review]);

  useEffect(() => { void load(); }, [load]);
  const myPending = useMemo(() => mine.filter((item) => item.status === "self_review").length, [mine]);
  const teamPending = useMemo(() => team.filter((item) => item.status === "manager_review" || (calibrate && item.status === "calibrating")).length, [team, calibrate]);

  const createCycle = async (form: FormData) => {
    try { await hrApi.createPerformanceCycle({ cycleCode: String(form.get("cycleCode")), cycleName: String(form.get("cycleName")), startDate: String(form.get("startDate")), endDate: String(form.get("endDate")) }, getAccessToken()); setSetup(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "创建失败"); }
  };
  const createPlan = async (form: FormData) => {
    try { await hrApi.createPerformancePlan({ cycleId: String(form.get("cycleId")), employeeId: String(form.get("employeeId")) }, getAccessToken()); setSetup(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "建档失败"); }
  };
  const score = async (form: FormData) => {
    try {
      const id = String(form.get("id")); const body = { score: Number(form.get("score")), comment: String(form.get("comment")) }; const kind = String(form.get("kind"));
      if (kind === "self") await hrApi.selfReviewPerformance(id, body, getAccessToken());
      else if (kind === "manager") await hrApi.managerReviewPerformance(id, body, getAccessToken());
      else await hrApi.calibratePerformance(id, body, getAccessToken());
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "评分失败"); }
  };
  const scoreForm = (plan: HrPerformancePlan, kind: string, title: string) => <details className={styles.actionDisclosure}><summary>{title}</summary><form className={styles.formGrid} action={score}><input type="hidden" name="id" value={plan.id} /><input type="hidden" name="kind" value={kind} /><label className="form-field"><span>评分</span><input name="score" type="number" min="0" max="100" step="0.01" required /></label><label className="form-field"><span>评价说明</span><input name="comment" required maxLength={4000} /></label><button className="ds-button ds-button-primary">提交评价</button></form></details>;

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_PERFORMANCE_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">绩效闭环</span><h1>绩效考核</h1><p>员工自评、主管评价、HR 校准和结果确认在同一流程留痕。</p></div>{manage ? <div className={styles.heroActions}><button type="button" className="ds-button" onClick={() => setSetup(setup === "cycle" ? null : "cycle")}>考核周期</button><button type="button" className="ds-button ds-button-primary" onClick={() => setSetup(setup === "plan" ? null : "plan")}>建立计划</button></div> : null}</section>
      <section className="ds-kpi-grid" aria-label="绩效概览"><article className="ds-kpi-card"><span>我的考核</span><strong>{mine.length}</strong><small>当前可见周期</small></article><article className="ds-kpi-card"><span>待我自评</span><strong>{myPending}</strong><small>需要员工提交</small></article>{review ? <article className="ds-kpi-card"><span>团队待办</span><strong>{teamPending}</strong><small>主管评价或校准</small></article> : null}</section>
      {setup === "cycle" ? <form className={`ds-panel ${styles.formGrid}`} action={createCycle}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">周期设置</span><h2>新建考核周期</h2></div></div><label className="form-field"><span>周期编码</span><input name="cycleCode" required /></label><label className="form-field"><span>周期名称</span><input name="cycleName" required /></label><label className="form-field"><span>开始</span><input name="startDate" type="date" required /></label><label className="form-field"><span>结束</span><input name="endDate" type="date" required /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存周期</button><button type="button" className="ds-button" onClick={() => setSetup(null)}>取消</button></div></form> : null}
      {setup === "plan" ? <form className={`ds-panel ${styles.formGrid}`} action={createPlan}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">考核建档</span><h2>建立员工考核计划</h2></div></div><label className="form-field"><span>周期</span><select name="cycleId">{cycles.map((item) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}</select></label><label className="form-field"><span>员工</span><select name="employeeId">{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><div className={styles.formActions}><button className="ds-button ds-button-primary">建立计划</button><button type="button" className="ds-button" onClick={() => setSetup(null)}>取消</button></div></form> : null}
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      {review ? <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">主管事项</span><h2>团队考核</h2></div><strong>{teamPending} 项待处理</strong></div><div className="ds-mobile-record-list">{team.length === 0 ? <p className={styles.emptyState}>当前没有团队考核任务。</p> : team.map((plan) => <article className="ds-mobile-record" key={plan.id}><strong>{statusLabel[plan.status] ?? plan.status}</strong>{plan.status === "manager_review" ? scoreForm(plan, "manager", "填写主管评价") : calibrate && plan.status === "calibrating" ? scoreForm(plan, "calibrate", "执行 HR 校准") : <span>等待下一阶段</span>}</article>)}</div></section> : null}
      <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">个人事项</span><h2>我的考核</h2></div><strong>{myPending} 项待处理</strong></div><div className="ds-mobile-record-list">{mine.length === 0 ? <p className={styles.emptyState}>当前没有个人考核任务。</p> : mine.map((plan) => <article className="ds-mobile-record" key={plan.id}><strong>{statusLabel[plan.status] ?? plan.status}</strong>{plan.status === "self_review" ? scoreForm(plan, "self", "填写员工自评") : <span>最终得分：{plan.finalScore ?? "待确认"}</span>}</article>)}</div></section>
    </main>
  </PermissionGuard>;
}
