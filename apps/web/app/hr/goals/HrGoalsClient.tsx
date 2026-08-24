"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrEmployee, type HrGoal, type HrGoalCycle } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import { fetchReferenceFormOptions, type ReferenceOrgOption } from "../../../lib/reference-data";
import styles from "../hr-workbench.module.css";

type GoalAction = "cycle" | "goal" | "checkin" | null;
const levelLabel: Record<string, string> = { group: "集团", department: "部门", employee: "员工" };

export function HrGoalsClient() {
  const user = useAuthUser();
  const manage = hasPermission(user, HR_PERMISSIONS.HR_GOAL_MANAGE);
  const [cycles, setCycles] = useState<HrGoalCycle[]>([]);
  const [goals, setGoals] = useState<HrGoal[]>([]);
  const [orgs, setOrgs] = useState<ReferenceOrgOption[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<GoalAction>(null);

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (manage) {
        const [cycleRows, goalRows, reference, employeeRows] = await Promise.all([hrApi.goalCycles(token), hrApi.goals(false, token), fetchReferenceFormOptions(), hrApi.employees(token)]);
        setCycles(cycleRows); setGoals(goalRows); setOrgs(reference.orgs); setEmployees(employeeRows.items);
      } else setGoals(await hrApi.goals(true, token));
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "加载目标失败"); }
  }, [manage]);

  useEffect(() => { void load(); }, [load]);
  const employeeGoals = useMemo(() => goals.filter((item) => item.goalLevel === "employee"), [goals]);
  const openGoals = useMemo(() => goals.filter((item) => !["completed", "cancelled"].includes(item.status)), [goals]);

  const createCycle = async (form: FormData) => {
    try {
      await hrApi.createGoalCycle({ cycleCode: String(form.get("cycleCode")), cycleName: String(form.get("cycleName")), startDate: String(form.get("startDate")), endDate: String(form.get("endDate")) }, getAccessToken());
      setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建周期失败"); }
  };
  const checkin = async (form: FormData) => {
    try {
      await hrApi.createGoalCheckin(String(form.get("goalId")), { progress: Number(form.get("progress")) / 100, currentValue: String(form.get("currentValue")) ? Number(form.get("currentValue")) : undefined, summary: String(form.get("summary")), risks: String(form.get("risks")) || undefined }, getAccessToken());
      setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "更新目标进度失败"); }
  };
  const createGoal = async (form: FormData) => {
    const level = String(form.get("goalLevel"));
    try {
      await hrApi.createGoal({ cycleId: String(form.get("cycleId")), parentGoalId: String(form.get("parentGoalId")) || undefined, goalLevel: level, goalName: String(form.get("goalName")), ownerOrgId: level === "department" ? String(form.get("ownerOrgId")) || undefined : undefined, ownerEmployeeId: level === "employee" ? String(form.get("ownerEmployeeId")) || undefined : undefined, weight: Number(form.get("weight")), startDate: String(form.get("startDate")), dueDate: String(form.get("dueDate")) }, getAccessToken());
      setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建目标失败"); }
  };

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_GOALS_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">战略执行</span><h1>目标管理</h1><p>把集团方向分解到部门和员工，并持续跟踪执行进度。</p></div><div className={styles.heroActions}>{manage ? <><button type="button" className="ds-button" onClick={() => setAction(action === "cycle" ? null : "cycle")}>目标周期</button><button type="button" className="ds-button ds-button-primary" onClick={() => setAction(action === "goal" ? null : "goal")}>分解目标</button></> : null}{employeeGoals.length ? <button type="button" className="ds-button ds-button-primary" onClick={() => setAction(action === "checkin" ? null : "checkin")}>更新进度</button> : null}</div></section>
      <section className="ds-kpi-grid" aria-label="目标概览"><article className="ds-kpi-card"><span>全部目标</span><strong>{goals.length}</strong><small>当前权限范围</small></article><article className="ds-kpi-card"><span>进行中</span><strong>{openGoals.length}</strong><small>等待持续推进</small></article><article className="ds-kpi-card"><span>员工目标</span><strong>{employeeGoals.length}</strong><small>已分解到个人</small></article></section>

      {action === "cycle" ? <form className={`ds-panel ${styles.formGrid}`} action={createCycle}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">周期设置</span><h2>新建目标周期</h2></div></div><label className="form-field"><span>周期编码</span><input name="cycleCode" required /></label><label className="form-field"><span>周期名称</span><input name="cycleName" required /></label><label className="form-field"><span>开始</span><input name="startDate" type="date" required /></label><label className="form-field"><span>结束</span><input name="endDate" type="date" required /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存周期</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {action === "goal" ? <form className={`ds-panel ${styles.formGrid}`} action={createGoal}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">目标分解</span><h2>创建目标</h2></div></div><label className="form-field"><span>周期</span><select name="cycleId" required>{cycles.map((item) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}</select></label><label className="form-field"><span>层级</span><select name="goalLevel"><option value="group">集团</option><option value="department">部门</option><option value="employee">员工</option></select></label><label className="form-field"><span>上级目标</span><select name="parentGoalId"><option value="">无</option>{goals.map((item) => <option key={item.id} value={item.id}>{item.goalName}</option>)}</select></label><label className="form-field"><span>部门归属</span><select name="ownerOrgId"><option value="">请选择</option>{orgs.map((item) => <option key={item.id} value={item.id}>{item.orgName}</option>)}</select></label><label className="form-field"><span>员工归属</span><select name="ownerEmployeeId"><option value="">请选择</option>{employees.filter((item) => item.employmentStatus !== "departed").map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><label className="form-field"><span>目标名称</span><input name="goalName" required /></label><label className="form-field"><span>权重</span><input name="weight" type="number" min="0.0001" max="1" step="0.0001" defaultValue="1" /></label><label className="form-field"><span>开始</span><input name="startDate" type="date" required /></label><label className="form-field"><span>截止</span><input name="dueDate" type="date" required /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">创建目标</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {action === "checkin" ? <form className={`ds-panel ${styles.formGrid}`} action={checkin}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">执行反馈</span><h2>更新目标进度</h2></div></div><label className="form-field"><span>本人目标</span><select name="goalId">{employeeGoals.filter((item) => !["completed", "cancelled"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.goalName}</option>)}</select></label><label className="form-field"><span>完成进度（%）</span><input name="progress" type="number" min="0" max="100" step="0.01" required /></label><label className="form-field"><span>当前指标值</span><input name="currentValue" type="number" step="0.0001" /></label><label className="form-field"><span>进展摘要</span><textarea name="summary" maxLength={2000} required /></label><label className="form-field"><span>问题与风险</span><textarea name="risks" maxLength={2000} /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存进度</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">执行清单</span><h2>目标台账</h2></div></div><div className="ds-mobile-record-list">{goals.length === 0 ? <p className={styles.emptyState}>当前范围暂无目标。</p> : goals.map((item) => <article className="ds-mobile-record" key={item.id}><strong>{item.goalName}</strong><span>{levelLabel[item.goalLevel] ?? item.goalLevel} · 权重 {Number(item.weight) * 100}%</span><span>{item.startDate} 至 {item.dueDate} · 进度 {Number(item.progress) * 100}%</span></article>)}</div></section>
    </main>
  </PermissionGuard>;
}
