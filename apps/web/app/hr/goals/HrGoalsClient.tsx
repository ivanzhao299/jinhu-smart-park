"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrGoal, type HrGoalCycle, type HrGoalOptions } from "../../../lib/hr-api";
import { hasPermission } from "../../../lib/permissions";
import { isForbiddenError } from "../../../lib/api-client";
import styles from "../hr-workbench.module.css";

type GoalAction = "cycle" | "goal" | "checkin" | null;
const levelLabel: Record<string, string> = { group: "集团", department: "部门", employee: "员工" };

export function HrGoalsClient() {
  const user = useAuthUser();
  const manage = hasPermission(user, HR_PERMISSIONS.HR_GOAL_MANAGE);
  const cycleManage = hasPermission(user, HR_PERMISSIONS.HR_GOAL_CYCLE_MANAGE);
  const canCheckin = hasPermission(user, HR_PERMISSIONS.HR_GOAL_CHECKIN);
  const [cycles, setCycles] = useState<HrGoalCycle[]>([]);
  const [goals, setGoals] = useState<HrGoal[]>([]);
  const [options, setOptions] = useState<HrGoalOptions>({canCreateGroup:false,orgs:[],employees:[]});
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<GoalAction>(null);
  const [loading,setLoading]=useState(true),[forbidden,setForbidden]=useState(false);
  const requestRef=useRef(0);
  const controllerRef=useRef<AbortController|null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();const request=++requestRef.current,controller=new AbortController();controllerRef.current=controller;
    setLoading(true);setForbidden(false);setGoals([]);setCycles([]);setOptions({canCreateGroup:false,orgs:[],employees:[]});setMyEmployeeId(null);
    try {
      const token = getAccessToken();
      if (manage) {
        const [cycleRows, goalRows, goalOptions, me] = await Promise.all([hrApi.goalCycles(token,controller.signal), hrApi.goals(false, token,{},controller.signal), hrApi.goalOptions(token,controller.signal), canCheckin ? hrApi.me(token) : Promise.resolve(null)]);
        if(request!==requestRef.current)return;setCycles(cycleRows); setGoals(goalRows); setOptions(goalOptions);
        setMyEmployeeId(me?.id ?? null);
      } else { const [cycleRows,goalRows,me]=await Promise.all([hrApi.goalCycles(token,controller.signal),hrApi.goals(true,token,{},controller.signal),canCheckin?hrApi.me(token):Promise.resolve(null)]);if(request!==requestRef.current)return;setCycles(cycleRows);setGoals(goalRows);setMyEmployeeId(me?.id??null); }
      setMessage("");
    } catch (error) { if(request!==requestRef.current||controller.signal.aborted)return;setForbidden(isForbiddenError(error));setMessage(error instanceof Error ? error.message : "加载目标失败"); }
    finally{if(request===requestRef.current)setLoading(false);}
  }, [canCheckin, manage]);

  useEffect(() => { void load();return()=>{requestRef.current+=1;controllerRef.current?.abort();}; }, [load]);
  const employeeGoals = useMemo(() => goals.filter((item) => item.goalLevel === "employee" && item.ownerEmployeeId === myEmployeeId), [goals,myEmployeeId]);
  const openGoals = useMemo(() => goals.filter((item) => !["completed", "cancelled"].includes(item.status)), [goals]);
  const orgs=options.orgs,employees=options.employees.map(item=>({...item,employmentStatus:"active"}));

  const createCycle = async (form: FormData) => {
    try {
      await hrApi.createGoalCycle({ cycleCode: String(form.get("cycleCode")), cycleName: String(form.get("cycleName")), startDate: String(form.get("startDate")), endDate: String(form.get("endDate")) }, getAccessToken());
      setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建周期失败"); }
  };
  const checkin = async (form: FormData) => {
    try {
      await hrApi.createGoalCheckin(String(form.get("goalId")), { progress: Number(form.get("progress")) / 100, currentValue: String(form.get("currentValue")) ? Number(form.get("currentValue")) : undefined, summary: String(form.get("summary")), risks: String(form.get("risks")) || undefined, confidence:String(form.get("confidence")),nextAction:String(form.get("nextAction"))||undefined }, getAccessToken());
      setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "更新目标进度失败"); }
  };
  const createGoal = async (form: FormData) => {
    const level = String(form.get("goalLevel"));
    if(level==="group"&&!options.canCreateGroup){setMessage("部门负责人只能分解部门或员工目标");return;}
    try {
      await hrApi.createGoal({ cycleId: String(form.get("cycleId")), parentGoalId: String(form.get("parentGoalId")) || undefined, goalLevel: level, goalName: String(form.get("goalName")), ownerOrgId: level === "department" ? String(form.get("ownerOrgId")) || undefined : undefined, ownerEmployeeId: level === "employee" ? String(form.get("ownerEmployeeId")) || undefined : undefined, weight: Number(form.get("weight")), metricType:String(form.get("metricType")),metricName:String(form.get("metricName")),targetValue:Number(form.get("targetValue")),unit:String(form.get("unit")),metricDefinition:String(form.get("metricDefinition"))||undefined,startDate: String(form.get("startDate")), dueDate: String(form.get("dueDate")) }, getAccessToken());
      setAction(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建目标失败"); }
  };

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_GOALS_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">战略执行</span><h1>目标管理</h1><p>集团方向逐级落实到部门和员工。</p></div><div className={styles.heroActions}>{cycleManage ? <button type="button" className="ds-button" onClick={() => setAction(action === "cycle" ? null : "cycle")}>目标周期</button> : null}{manage ? <button type="button" className="ds-button ds-button-primary" onClick={() => setAction(action === "goal" ? null : "goal")}>分解目标</button> : null}{canCheckin&&employeeGoals.length ? <button type="button" className="ds-button ds-button-primary" onClick={() => setAction(action === "checkin" ? null : "checkin")}>更新进度</button> : null}</div></section>
      <section className="ds-kpi-grid" aria-label="目标概览"><article className="ds-kpi-card"><span>全部目标</span><strong>{goals.length}</strong><small>当前权限范围</small></article><article className="ds-kpi-card"><span>进行中</span><strong>{openGoals.length}</strong><small>等待持续推进</small></article><article className="ds-kpi-card"><span>员工目标</span><strong>{employeeGoals.length}</strong><small>已分解到个人</small></article></section>

      {action === "cycle" ? <form className={`ds-panel ${styles.formGrid}`} action={createCycle}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">周期设置</span><h2>新建目标周期</h2></div></div><label className="form-field"><span>周期编码</span><input name="cycleCode" required /></label><label className="form-field"><span>周期名称</span><input name="cycleName" required /></label><label className="form-field"><span>开始</span><input name="startDate" type="date" required /></label><label className="form-field"><span>结束</span><input name="endDate" type="date" required /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存周期</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {action === "goal" ? <form className={`ds-panel ${styles.formGrid}`} action={createGoal}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">目标分解</span><h2>创建目标</h2></div></div><label className="form-field"><span>周期</span><select name="cycleId" required>{cycles.map((item) => <option key={item.id} value={item.id}>{item.cycleName}</option>)}</select></label><label className="form-field"><span>层级</span><select name="goalLevel" defaultValue={options.canCreateGroup ? "group" : "department"}>{options.canCreateGroup ? <option value="group">集团</option> : null}<option value="department">部门</option><option value="employee">员工</option></select></label><label className="form-field"><span>上级目标</span><select name="parentGoalId"><option value="">集团根目标无需上级</option>{goals.filter(item=>item.goalLevel!=="employee").map((item) => <option key={item.id} value={item.id}>{item.goalName}</option>)}</select></label><label className="form-field"><span>部门归属</span><select name="ownerOrgId"><option value="">请选择</option>{orgs.map((item) => <option key={item.id} value={item.id}>{item.orgName}</option>)}</select></label><label className="form-field"><span>员工归属</span><select name="ownerEmployeeId"><option value="">请选择</option>{employees.filter((item) => item.employmentStatus !== "departed").map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><label className="form-field"><span>目标名称</span><input name="goalName" required /></label><label className="form-field"><span>指标类型</span><select name="metricType"><option value="numeric">数值</option><option value="percentage">百分比</option><option value="milestone">里程碑</option><option value="count">数量</option><option value="currency">金额</option></select></label><label className="form-field"><span>指标名称</span><input name="metricName" required /></label><label className="form-field"><span>目标值</span><input name="targetValue" type="number" step="0.0001" required /></label><label className="form-field"><span>单位</span><input name="unit" maxLength={32} required /></label><label className="form-field"><span>统计口径</span><input name="metricDefinition" maxLength={1000} /></label><label className="form-field"><span>权重</span><input name="weight" type="number" min="0.0001" max="1" step="0.0001" defaultValue="1" /></label><label className="form-field"><span>开始</span><input name="startDate" type="date" required /></label><label className="form-field"><span>截止</span><input name="dueDate" type="date" required /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">创建目标</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {action === "checkin" ? <form className={`ds-panel ${styles.formGrid}`} action={checkin}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">执行反馈</span><h2>更新目标进度</h2></div></div><label className="form-field"><span>本人目标</span><select name="goalId">{employeeGoals.filter((item) => !["completed", "cancelled"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.goalName}</option>)}</select></label><label className="form-field"><span>完成进度（%）</span><input name="progress" type="number" min="0" max="100" step="0.01" required /></label><label className="form-field"><span>当前指标值</span><input name="currentValue" type="number" step="0.0001" /></label><label className="form-field"><span>信心</span><select name="confidence"><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label className="form-field"><span>进展摘要</span><textarea name="summary" maxLength={2000} required /></label><label className="form-field"><span>问题与风险</span><textarea name="risks" maxLength={2000} /></label><label className="form-field"><span>下一动作</span><textarea name="nextAction" maxLength={2000} /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存进度</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {loading?<section className="ds-panel"><p>正在加载目标…</p></section>:null}
      {message ? <div className="form-error" role="alert"><p>{forbidden?"当前角色无权读取该目标范围。":message}</p><button type="button" className="ds-button" onClick={()=>void load()}>重试</button></div> : null}
      <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">执行清单</span><h2>目标台账</h2></div></div><div className="ds-mobile-record-list">{goals.length === 0 ? <p className={styles.emptyState}>当前范围暂无目标。</p> : goals.map((item) => <article className="ds-mobile-record" key={item.id}><strong>{item.goalName}</strong><span>{levelLabel[item.goalLevel] ?? item.goalLevel}{item.ownerName?` · ${item.ownerName}`:""} · 权重 {Number(item.weight) * 100}%</span><span>{item.metricName}：{item.targetValue} {item.unit} · 进度 {Math.round(Number(item.progress) * 100)}%</span><span>{item.startDate} 至 {item.dueDate} · 版本 {item.currentVersionNo}</span></article>)}</div></section>
    </main>
  </PermissionGuard>;
}
