"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrCompensationPlan, type HrEmployee } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";

type CompensationAction = "plan" | "assignment" | null;

export function HrCompensationClient() {
  const [plans, setPlans] = useState<HrCompensationPlan[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<CompensationAction>(null);

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      const [planRows, employeeRows] = await Promise.all([hrApi.compensationPlans(token), hrApi.employees(token)]);
      setPlans(planRows); setEmployees(employeeRows.items); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "加载薪酬失败"); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const create = async (form: FormData) => {
    try { await hrApi.createCompensationPlan({ planCode: String(form.get("planCode")), planName: String(form.get("planName")), effectiveFrom: String(form.get("effectiveFrom")), effectiveTo: String(form.get("effectiveTo")) || undefined }, getAccessToken()); setAction(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "创建方案失败"); }
  };
  const assign = async (form: FormData) => {
    try { await hrApi.assignCompensation({ employeeId: String(form.get("employeeId")), planId: String(form.get("planId")), effectiveFrom: String(form.get("effectiveFrom")), baseSalary: String(form.get("baseSalary")), allowanceAmount: String(form.get("allowanceAmount") || "0"), variableTarget: String(form.get("variableTarget") || "0") }, getAccessToken()); setMessage("员工定薪已生效"); setAction(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "员工定薪失败"); }
  };

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_COMPENSATION_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">薪酬管理</span><h1>薪酬方案与员工定薪</h1><p>按生效期管理基本工资、津贴与目标浮动薪资，仅对授权人事人员开放。</p></div><div className={styles.heroActions}><button type="button" className="ds-button" onClick={() => setAction(action === "plan" ? null : "plan")}>薪酬方案</button><button type="button" className="ds-button ds-button-primary" onClick={() => setAction(action === "assignment" ? null : "assignment")}>员工定薪</button></div></section>
      <section className="ds-kpi-grid" aria-label="薪酬概览"><article className="ds-kpi-card"><span>薪酬方案</span><strong>{plans.length}</strong><small>当前可用方案</small></article><article className="ds-kpi-card"><span>可定薪员工</span><strong>{employees.filter((item) => item.employmentStatus !== "departed").length}</strong><small>排除已离职员工</small></article></section>
      {action === "plan" ? <form className={`ds-panel ${styles.formGrid}`} action={create}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">方案设置</span><h2>创建薪酬方案</h2></div></div><label className="form-field"><span>方案编码</span><input name="planCode" required /></label><label className="form-field"><span>方案名称</span><input name="planName" required /></label><label className="form-field"><span>生效日期</span><input name="effectiveFrom" type="date" required /></label><label className="form-field"><span>失效日期</span><input name="effectiveTo" type="date" /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存方案</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {action === "assignment" ? <form className={`ds-panel ${styles.formGrid}`} action={assign}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">员工定薪</span><h2>设置员工薪酬</h2></div></div><label className="form-field"><span>员工</span><select name="employeeId">{employees.filter((item) => item.employmentStatus !== "departed").map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><label className="form-field"><span>薪酬方案</span><select name="planId">{plans.map((item) => <option key={item.id} value={item.id}>{item.planName}</option>)}</select></label><label className="form-field"><span>生效日期</span><input name="effectiveFrom" type="date" required /></label><label className="form-field"><span>基本工资</span><input name="baseSalary" type="number" min="0" step="0.01" required /></label><label className="form-field"><span>津贴</span><input name="allowanceAmount" type="number" min="0" step="0.01" defaultValue="0" /></label><label className="form-field"><span>目标浮动薪资</span><input name="variableTarget" type="number" min="0" step="0.01" defaultValue="0" /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">确认定薪</button><button type="button" className="ds-button" onClick={() => setAction(null)}>取消</button></div></form> : null}
      {message ? <p className="form-error" role="status">{message}</p> : null}
      <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">方案台账</span><h2>薪酬方案</h2></div></div><div className="ds-mobile-record-list">{plans.length === 0 ? <p className={styles.emptyState}>暂无薪酬方案。</p> : plans.map((plan) => <article className="ds-mobile-record" key={plan.id}><strong>{plan.planName}</strong><span>{plan.planCode}</span><span>{plan.effectiveFrom} 起生效{plan.effectiveTo ? ` · ${plan.effectiveTo} 失效` : ""}</span></article>)}</div></section>
    </main>
  </PermissionGuard>;
}
