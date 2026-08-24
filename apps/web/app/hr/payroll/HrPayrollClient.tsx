"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { hasPermission } from "../../../lib/permissions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrPayrollPeriod, type HrPayrollRun, type HrPayslip } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";

type PayrollSetup = "period" | "run" | null;
const statusLabel: Record<string, string> = { draft: "草稿", calculating: "核算中", calculated: "待复核", reviewing: "复核中", confirmed: "已确认冻结", paid: "已发放" };
const money = (value: string | number | null | undefined) => `¥${Number(value ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HrPayrollClient() {
  const user = useAuthUser();
  const manage = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_MANAGE);
  const review = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_REVIEW);
  const confirm = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_CONFIRM);
  const [periods, setPeriods] = useState<HrPayrollPeriod[]>([]);
  const [runs, setRuns] = useState<HrPayrollRun[]>([]);
  const [slips, setSlips] = useState<HrPayslip[]>([]);
  const [runSlips, setRunSlips] = useState<HrPayslip[]>([]);
  const [selectedRun, setSelectedRun] = useState<HrPayrollRun | null>(null);
  const [message, setMessage] = useState("");
  const [setup, setSetup] = useState<PayrollSetup>(null);

  const load = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (manage) { const [periodRows, runRows] = await Promise.all([hrApi.payrollPeriods(token), hrApi.payrollRuns(token)]); setPeriods(periodRows); setRuns(runRows); }
      else setSlips(await hrApi.myPayslips(token));
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "加载工资数据失败"); }
  }, [manage]);

  useEffect(() => { void load(); }, [load]);
  const pendingReview = useMemo(() => runs.filter((item) => item.status === "calculated").length, [runs]);
  const pendingConfirm = useMemo(() => runs.filter((item) => item.status === "reviewing").length, [runs]);

  const createPeriod = async (form: FormData) => {
    try { await hrApi.createPayrollPeriod({ periodMonth: `${String(form.get("periodMonth"))}-01`, startDate: String(form.get("startDate")), endDate: String(form.get("endDate")) }, getAccessToken()); setSetup(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "创建期间失败"); }
  };
  const createRun = async (form: FormData) => {
    try { await hrApi.createPayrollRun({ periodId: String(form.get("periodId")), correctionOfRunId: String(form.get("correctionOfRunId")) || undefined }, getAccessToken()); setSetup(null); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "生成工资失败"); }
  };
  const runAction = async (id: string, kind: string) => {
    try { if (kind === "review") await hrApi.reviewPayrollRun(id, getAccessToken()); else await hrApi.confirmPayrollRun(id, getAccessToken()); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
  };
  const inspect = async (item: HrPayrollRun) => {
    try { setSelectedRun(item); setRunSlips(await hrApi.payrollRunPayslips(item.id, getAccessToken())); }
    catch (error) { setMessage(error instanceof Error ? error.message : "加载工资条失败"); }
  };
  const adjust = async (form: FormData) => {
    if (!selectedRun) return;
    try { await hrApi.adjustPayslip(selectedRun.id, String(form.get("payslipId")), { deductionAmount: String(form.get("deductionAmount")), personalTax: String(form.get("personalTax")), reason: String(form.get("reason")) }, getAccessToken()); await Promise.all([inspect(selectedRun), load()]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "校正工资条失败"); }
  };

  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_PAYROLL_PAGE}>
    <main className={`content ds-page ${styles.page}`}>
      <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">工资核算</span><h1>{manage ? "月度工资批次" : "我的工资条"}</h1><p>工资确认后冻结，所有修订通过更正批次保留完整审计链。</p></div>{manage ? <div className={styles.heroActions}><button type="button" className="ds-button" onClick={() => setSetup(setup === "period" ? null : "period")}>工资期间</button><button type="button" className="ds-button ds-button-primary" onClick={() => setSetup(setup === "run" ? null : "run")}>生成批次</button></div> : null}</section>
      {manage ? <section className="ds-kpi-grid" aria-label="工资核算概览"><article className="ds-kpi-card"><span>工资批次</span><strong>{runs.length}</strong><small>当前可见批次</small></article><article className="ds-kpi-card"><span>待复核</span><strong>{pendingReview}</strong><small>等待复核提交</small></article><article className="ds-kpi-card"><span>待确认</span><strong>{pendingConfirm}</strong><small>确认后即冻结</small></article></section> : <section className="ds-kpi-grid" aria-label="工资条概览"><article className="ds-kpi-card"><span>可查看工资条</span><strong>{slips.length}</strong><small>仅限本人数据</small></article></section>}
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      {setup === "period" ? <form className={`ds-panel ${styles.formGrid}`} action={createPeriod}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">核算设置</span><h2>创建工资期间</h2></div></div><label className="form-field"><span>工资月份</span><input name="periodMonth" type="month" required /></label><label className="form-field"><span>周期开始</span><input name="startDate" type="date" required /></label><label className="form-field"><span>周期结束</span><input name="endDate" type="date" required /></label><div className={styles.formActions}><button className="ds-button ds-button-primary">保存期间</button><button type="button" className="ds-button" onClick={() => setSetup(null)}>取消</button></div></form> : null}
      {setup === "run" ? <form className={`ds-panel ${styles.formGrid}`} action={createRun}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">批次生成</span><h2>生成工资批次</h2></div></div><label className="form-field"><span>工资期间</span><select name="periodId">{periods.map((item) => <option key={item.id} value={item.id}>{item.periodMonth}</option>)}</select></label><label className="form-field"><span>更正原批次</span><select name="correctionOfRunId"><option value="">基础批次</option>{runs.filter((item) => item.status === "confirmed").map((item) => <option key={item.id} value={item.id}>批次 {item.runNo}</option>)}</select></label><div className={styles.formActions}><button className="ds-button ds-button-primary">生成批次</button><button type="button" className="ds-button" onClick={() => setSetup(null)}>取消</button></div></form> : null}
      {manage ? <><section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">核算台账</span><h2>工资批次</h2></div></div><div className="ds-mobile-record-list">{runs.length === 0 ? <p className={styles.emptyState}>暂无工资批次。</p> : runs.map((item) => <article className="ds-mobile-record" key={item.id}><strong>批次 {item.runNo} · {statusLabel[item.status] ?? item.status}</strong><span>{item.employeeCount} 人 · 应发 {money(item.grossTotal)} · 实发 {money(item.netTotal)}</span><div className={styles.recordActions}><button type="button" className="ds-button" onClick={() => void inspect(item)}>查看工资条</button>{review && item.status === "calculated" ? <button type="button" className="ds-button" onClick={() => void runAction(item.id, "review")}>提交复核</button> : null}{confirm && item.status === "reviewing" ? <button type="button" className="ds-button ds-button-primary" onClick={() => void runAction(item.id, "confirm")}>确认并冻结</button> : null}</div></article>)}</div></section>{selectedRun ? <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">批次明细</span><h2>批次 {selectedRun.runNo} · 工资条</h2></div><button type="button" className="ds-button" onClick={() => { setSelectedRun(null); setRunSlips([]); }}>关闭明细</button></div><div className="ds-mobile-record-list">{runSlips.length === 0 ? <p className={styles.emptyState}>该批次暂无工资条。</p> : runSlips.map((slip) => <article className="ds-mobile-record" key={slip.id}><strong>实发 {money(slip.netAmount)}</strong><span>应发 {money(slip.grossAmount)} · 扣款 {money(slip.deductionAmount)} · 个税 {money(slip.personalTax)}</span>{selectedRun.status !== "confirmed" ? <details className={styles.actionDisclosure}><summary>校正工资条</summary><form className={styles.formGrid} action={adjust}><input type="hidden" name="payslipId" value={slip.id} /><label className="form-field"><span>扣款</span><input name="deductionAmount" type="number" min="0" step="0.01" defaultValue={slip.deductionAmount} /></label><label className="form-field"><span>个税</span><input name="personalTax" type="number" min="0" step="0.01" defaultValue={slip.personalTax} /></label><label className="form-field"><span>校正原因</span><input name="reason" maxLength={500} required /></label><button className="ds-button ds-button-primary">保存校正</button></form></details> : <span>已确认冻结；如需修改，请创建更正批次。</span>}</article>)}</div></section> : null}</> : <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">个人薪酬</span><h2>我的工资条</h2></div></div><div className="ds-mobile-record-list">{slips.length === 0 ? <p className={styles.emptyState}>当前没有可查看的工资条。</p> : slips.map((slip) => <article className="ds-mobile-record" key={slip.id}><strong>实发 {money(slip.netAmount)}</strong><span>应发 {money(slip.grossAmount)} · 扣款 {money(slip.deductionAmount)} · 个税 {money(slip.personalTax)}</span></article>)}</div></section>}
    </main>
  </PermissionGuard>;
}
