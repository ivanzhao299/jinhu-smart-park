"use client";

import { useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS, type FormalPayrollCorrectionPreparation, type FormalPayrollEmployeeInput, type FormalPayrollPreparation, type FormalPayrollRuleSet } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrPayrollPeriod } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./payroll-modern.module.css";

type Candidate = FormalPayrollPreparation["items"][number];
type Selection = { employee: Candidate; input: FormalPayrollEmployeeInput; explicit: boolean };
type Props = { correction?: FormalPayrollCorrectionPreparation | null; onExitCorrection?: () => void };
export function PayrollInputPreparation(props: Props) {
  const user = useAuthUser(); return <PreparationWorkspace key={`${JSON.stringify(user)}:${props.correction?.windowId ?? "ordinary"}`} {...props}/>;
}
function PreparationWorkspace({ correction, onExitCorrection }: Props) {
  const user = useAuthUser();
  const canPrepare = [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ].every(permission => hasPermission(user, permission));
  const [periods, setPeriods] = useState<HrPayrollPeriod[]>([]), [periodId, setPeriodId] = useState(correction?.periodId ?? "");
  const [rules, setRules] = useState<FormalPayrollRuleSet[]>([]), [ruleId, setRuleId] = useState(correction?.ruleSetId ?? ""), [rulePage, setRulePage] = useState(1), [ruleTotal, setRuleTotal] = useState(0);
  const [query, setQuery] = useState(""), [keyword, setKeyword] = useState(""), [page, setPage] = useState(1);
  const [data, setData] = useState<FormalPayrollPreparation | null>(null), [chosen, setChosen] = useState<Record<string, Selection>>({}), [selectionPage, setSelectionPage] = useState(1);
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [refresh, setRefresh] = useState(0);
  const alive = useRef(true), lock = useRef(false), ruleIdentity = useRef<string | null>(null), retry = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!canPrepare || correction) return;
    const abort = new AbortController();
    void hrApi.payrollPeriods(getAccessToken(), abort.signal).then(rows => { if (!abort.signal.aborted) setPeriods(rows.filter(row => row.status === "open")); }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载工资期间失败")); });
    return () => abort.abort();
  }, [canPrepare, correction]);
  useEffect(() => {
    if (!canPrepare || correction) return;
    const abort = new AbortController(); setRules([]);
    void hrApi.payrollRules({ page: rulePage, pageSize: 20 }, getAccessToken(), abort.signal).then(result => { if (!abort.signal.aborted) { setRules(result.items); setRuleTotal(result.total); } }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载工资规则失败")); });
    return () => abort.abort();
  }, [canPrepare, rulePage, correction]);
  useEffect(() => {
    if (!canPrepare || !periodId || !ruleId) return;
    const abort = new AbortController(); setLoading(true); setData(null); setError("");
    void hrApi.payrollPreparation({ periodId, ruleSetId: ruleId, keyword, page, pageSize: 20, ...(correction ? { correctionWindowId: correction.windowId } : {}) }, getAccessToken(), abort.signal).then(result => {
      if (abort.signal.aborted) return;
      if (correction && (result.correctionWindowId !== correction.windowId || result.rule.ruleSetId !== correction.ruleSetId || result.correctionOfRunId !== correction.originalRunId || !Number.isSafeInteger(result.correctionEmployeeCount) || result.correctionEmployeeCount! < 1)) { setData(null); setError("更正窗口已变化，请刷新期间状态后继续。"); return; }
      if (ruleIdentity.current && ruleIdentity.current !== result.rule.id) { setChosen({}); setReason(""); setError("生效规则已变化，请按新规则重新选择员工和填写项目。"); }
      ruleIdentity.current = result.rule.id; setData(result);
    }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载当期员工准备失败")); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [canPrepare, periodId, ruleId, keyword, page, refresh, correction]);
  const reset = () => { ruleIdentity.current = null; setChosen({}); setSelectionPage(1); setReason(""); setData(null); setPage(1); setQuery(""); setKeyword(""); setSaved(false); setNotice(""); setError(""); retry.current = null; };
  const change = (id: string, update: (value: Selection) => Selection) => { if (!lock.current && !saved) setChosen(values => ({ ...values, [id]: update(values[id]!) })); };
  const save = async () => {
    if (lock.current || saved || !data || loading) return;
    const employees = Object.values(chosen).map(value => ({ ...value.input, ...(value.explicit ? {} : { settlementStart: undefined, settlementEnd: undefined, eligibilityReason: undefined }) }));
    if (!employees.length || employees.length > 2000 || !reason.trim()) { setError("请选择 1 至 2000 位员工并填写准备说明。"); return; }
    if (correction && employees.length !== data.correctionEmployeeCount) { setError(`更正须保留原完整名单，请选择全部 ${data.correctionEmployeeCount} 位员工。`); return; }
    if (employees.some(employee => Object.values(employee.directItems).some(value => !/^-?\d{1,16}(?:\.\d{1,4})?$/u.test(value)))) { setError("请完整填写每位员工的直接输入项目，最多四位小数；零值也需明确填写。"); return; }
    if (Object.values(chosen).some(value => value.explicit && (!value.input.settlementStart || !value.input.settlementEnd || !value.input.eligibilityReason?.trim() || value.input.settlementStart < data.period.startDate || value.input.settlementEnd > data.period.endDate || value.input.settlementStart > value.input.settlementEnd))) { setError("补结算必须填写期间内的开始、结束日期和理由。"); return; }
    const body = { periodId, ...(correction ? { correctionWindowId: correction.windowId } : {}), ruleSetId: ruleId, ruleVersionId: data.rule.id, expectedHeadRevision: data.expectedHeadRevision, employees, reason: reason.trim() }, signature = JSON.stringify(body);
    if (retry.current?.signature !== signature) retry.current = { signature, key: createIdempotencyKey("hr-payroll-input") };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await hrApi.createPayrollInput(body, getAccessToken(), retry.current.key);
      if (alive.current) { setSaved(true); setNotice(`第 ${result.revisionNo} 版输入草稿已保存，共 ${result.employees.length} 位员工。请在输入批次中核对，并由其他有权限的人员确认。`); retry.current = null; }
    } catch (cause) { if (alive.current) setError(hrLoadErrorMessage(cause, "保存工资输入失败")); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (!canPrepare) return null;
  const selections = Object.values(chosen), direct = data?.rule.definition.items.filter(item => item.expression === null) ?? [];
  return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="payroll-preparation-heading">
    <h2 id="payroll-preparation-heading">{correction ? "准备更正工资输入" : "准备工资输入"}</h2>{correction ? <div className={styles.actions}><p>{correction.month} · 更正原第 {correction.originalRunNo} 批 · {correction.ruleName}</p><button className="secondary-button" disabled={busy} onClick={onExitCorrection}>返回普通工资准备</button></div> : null}<p>选择当期员工并填写规则要求的项目。没有默认零值；需要补结算的员工填写明确日期和理由。</p>
    <div className={styles.fields}><label className="form-field"><span>工资期间</span><select value={periodId} disabled={busy || Boolean(correction)} onChange={event => { if (!lock.current) { reset(); setPeriodId(event.target.value); } }}><option value="">请选择期间</option>{correction ? <option value={correction.periodId}>{correction.month} · 更正期间</option> : null}{periods.map(row => <option key={row.id} value={row.id}>{row.periodMonth.slice(0, 7)}</option>)}</select></label><label className="form-field"><span>工资规则</span><select value={ruleId} disabled={busy || Boolean(correction)} onChange={event => { if (!lock.current) { reset(); setRuleId(event.target.value); } }}><option value="">请选择规则</option>{correction ? <option value={correction.ruleSetId}>{correction.ruleName}</option> : null}{rules.map(row => <option key={row.id} value={row.id}>{row.displayName}</option>)}</select></label></div>
    {!correction ? <div className={styles.actions}><button className="secondary-button" disabled={busy || rulePage <= 1} onClick={() => { reset(); setRuleId(""); setRulePage(value => value - 1); }}>规则上一页</button><span>规则第 {rulePage} / {Math.max(1, Math.ceil(ruleTotal / 20))} 页</span><button className="secondary-button" disabled={busy || rulePage * 20 >= ruleTotal} onClick={() => { reset(); setRuleId(""); setRulePage(value => value + 1); }}>规则下一页</button></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {periodId && ruleId ? <><form className={styles.actions} onSubmit={event => { event.preventDefault(); if (!lock.current) { setKeyword(query.trim()); setPage(1); setRefresh(value => value + 1); } }}><label className="form-field"><span>搜索员工</span><input value={query} maxLength={100} disabled={busy || saved} onChange={event => setQuery(event.target.value)}/></label><button className="secondary-button" disabled={busy || saved}>查询员工</button></form>{loading ? <p>正在读取员工和生效规则…</p> : null}</> : null}
    {data ? <><p>{data.rule.displayName} · {data.period.month} · 结算期间 {data.period.startDate} 至 {data.period.endDate}</p><div className={`ds-mobile-record-list ${styles.records}`}>{data.items.map(employee => <article className="ds-mobile-record" key={employee.employeeId}><strong>{employee.fullName} · {employee.employeeCode}</strong><span>{employee.requiresSettlementWindow ? "需明确补结算日期和理由" : `结算范围 ${employee.eligibility!.eligibleStart} 至 ${employee.eligibility!.eligibleEnd}`}</span><label><input type="checkbox" checked={Boolean(chosen[employee.employeeId])} disabled={busy || saved || (!chosen[employee.employeeId] && selections.length >= 2000)} onChange={event => { if (lock.current || saved) return; const checked = event.target.checked; setChosen(values => { const next = { ...values }; if (checked) next[employee.employeeId] = { employee, explicit: employee.requiresSettlementWindow, input: { employeeId: employee.employeeId, expectedEmployeeVersion: employee.expectedEmployeeVersion, directItems: Object.fromEntries(direct.map(item => [item.code, ""])) } }; else delete next[employee.employeeId]; return next; }); }}/>{`选择 ${employee.fullName}（${employee.employeeCode}）`}</label></article>)}</div><div className={styles.actions}><button className="secondary-button" disabled={busy || loading || saved || page <= 1} onClick={() => setPage(value => value - 1)}>候选上一页</button><span>第 {page} / {Math.max(1, Math.ceil(data.total / 20))} 页 · 共 {data.total} 位员工</span><button className="secondary-button" disabled={busy || loading || saved || page * 20 >= data.total} onClick={() => setPage(value => value + 1)}>候选下一页</button></div></> : null}
    <h3>已选员工 · {selections.length} 人</h3>
    <div className={`ds-mobile-record-list ${styles.records}`}>{selections.slice((selectionPage - 1) * 20, selectionPage * 20).map(value => <article className="ds-mobile-record" key={value.input.employeeId}><strong>{value.employee.fullName} · {value.employee.employeeCode}</strong><div className={styles.fields}>{Object.keys(value.input.directItems).map(code => <label className="form-field" key={code}><span>{value.employee.fullName} · {code}</span><input type="number" step="0.0001" min="-9999999999999999.9999" max="9999999999999999.9999" required value={value.input.directItems[code]} disabled={busy || saved} onFocus={event => event.target.select()} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, directItems: { ...old.input.directItems, [code]: event.target.value } } }))}/></label>)}</div><label><input type="checkbox" checked={value.explicit} disabled={busy || saved || value.employee.requiresSettlementWindow} onChange={event => change(value.input.employeeId, old => ({ ...old, explicit: event.target.checked }))}/>明确补结算范围</label>{value.explicit ? <div className={styles.fields}><label className="form-field"><span>{value.employee.fullName} · 结算开始</span><input type="date" required min={data?.period.startDate} max={data?.period.endDate} value={value.input.settlementStart ?? ""} disabled={busy || saved} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, settlementStart: event.target.value } }))}/></label><label className="form-field"><span>{value.employee.fullName} · 结算结束</span><input type="date" required min={value.input.settlementStart || data?.period.startDate} max={data?.period.endDate} value={value.input.settlementEnd ?? ""} disabled={busy || saved} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, settlementEnd: event.target.value } }))}/></label><label className="form-field"><span>{value.employee.fullName} · 补结算理由</span><textarea required maxLength={500} value={value.input.eligibilityReason ?? ""} disabled={busy || saved} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, eligibilityReason: event.target.value } }))}/></label></div> : null}<button className="secondary-button" disabled={busy || saved} onClick={() => { if (!lock.current) setChosen(values => { const next = { ...values }; delete next[value.input.employeeId]; return next; }); }}>移除 {value.employee.fullName}</button></article>)}</div>
    <div className={styles.actions}><button className="secondary-button" disabled={busy || selectionPage <= 1} onClick={() => setSelectionPage(value => value - 1)}>已选上一页</button><span>已选第 {selectionPage} / {Math.max(1, Math.ceil(selections.length / 20))} 页</span><button className="secondary-button" disabled={busy || selectionPage * 20 >= selections.length} onClick={() => setSelectionPage(value => value + 1)}>已选下一页</button></div>
    <label className="form-field"><span>工资准备说明</span><textarea required maxLength={1000} value={reason} disabled={busy || saved} onChange={event => setReason(event.target.value)}/></label><div className={styles.actions}><button className="primary-button" disabled={busy || saved || loading || !data || !selections.length || !reason.trim()} onClick={() => void save()}>保存工资输入草稿</button>{saved ? <button className="secondary-button" onClick={() => { reset(); setRefresh(value => value + 1); }}>准备下一版输入</button> : null}</div>
  </section>;
}
