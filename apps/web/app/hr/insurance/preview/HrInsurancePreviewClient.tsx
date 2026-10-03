"use client";
import Link from "next/link";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { useEffect, useRef, useState } from "react";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { ForbiddenState } from "../../../../components/auth/ForbiddenState";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { ApiError } from "../../../../lib/api-client";
import { hrApi, type HrEmployee, type HrInsurancePolicyOption, type HrInsuranceReferenceResult } from "../../../../lib/hr-api";
import { hasPermission } from "../../../../lib/permissions";
import styles from "../../hr-workbench.module.css";
import local from "./preview.module.css";

const labels: Record<string, string> = { oldage: "养老保险", remedy: "医疗保险", losework: "失业保险", wound: "工伤保险", bear: "生育保险", fund: "住房公积金" };
type Catalog<T> = { items: T[]; total: number; insuranceKinds?: string[] };
const policyLoader = (page: number, keyword: string, signal: AbortSignal) => hrApi.insurancePolicies(getAccessToken(), page, keyword, signal);
const employeeLoader = async (page: number, keyword: string) => {
  const result = await hrApi.employees(getAccessToken(), page, 20, { keyword });
  return { items: result.items.map(({ id, employeeCode, fullName }) => ({ id, employeeCode, fullName })), total: result.total };
};
function messageFor(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "当前权限不足，请由获授权的 HR 岗位操作。";
    if (error.status === 404) return "员工或政策已不可用，请重新选择。";
    if (error.status === 409) return "政策版本已变化，请刷新政策并重新试算。";
    if (error.status === 400) return "政策分项或输入不完整，请核对六险种基数和政策费率。";
  }
  return "暂时无法完成请求，请稍后重试。";
}
function useCatalog<T>(load: (page: number, keyword: string, signal: AbortSignal) => Promise<Catalog<T>>) {
  const [page, setPage] = useState(1), [keyword, setKeyword] = useState(""), [reload, setReload] = useState(0);
  const key = JSON.stringify([page, keyword, reload]);
  const [state, setState] = useState<{ key: string; data: Catalog<T>; loading: boolean; error: string }>({ key: "", data: { items: [], total: 0 }, loading: true, error: "" });
  useEffect(() => {
    let alive = true; const abort = new AbortController();
    setState({ key, data: { items: [], total: 0 }, loading: true, error: "" });
    void load(page, keyword, abort.signal).then(data => { if (alive) setState({ key, data, loading: false, error: "" }); })
      .catch(error => { if (alive) setState({ key, data: { items: [], total: 0 }, loading: false, error: messageFor(error) }); });
    return () => { alive = false; abort.abort(); };
  }, [load, key, page, keyword]);
  return { page, setPage, search: (value: string) => { setPage(1); setKeyword(value.trim()); setReload(n => n + 1); }, ...(state.key === key ? state : { data: { items: [], total: 0 } as Catalog<T>, loading: true, error: "" }) };
}

function PreviewForm() {
  const policies = useCatalog(policyLoader), employees = useCatalog<Pick<HrEmployee, "id" | "employeeCode" | "fullName">>(employeeLoader);
  const [policySearch, setPolicySearch] = useState(""), [employeeSearch, setEmployeeSearch] = useState("");
  const [policy, setPolicy] = useState<HrInsurancePolicyOption | null>(null), [employeeId, setEmployeeId] = useState("");
  const [variant, setVariant] = useState(""), [year, setYear] = useState(""), [month, setMonth] = useState(""), [fund, setFund] = useState("");
  const [bases, setBases] = useState<Record<string, string>>({}), [result, setResult] = useState<HrInsuranceReferenceResult | null>(null), [message, setMessage] = useState(""), [loading, setLoading] = useState(false);
  const sequence = useRef(0), request = useRef<AbortController | null>(null);
  const kinds = policies.data.insuranceKinds ?? [];
  const invalidate = () => { sequence.current++; request.current?.abort(); setResult(null); setMessage(""); setLoading(false); };
  useEffect(() => () => { sequence.current++; request.current?.abort(); }, []);
  const ready = !!policy && !!employeeId && !!variant && policy.availableVariants.includes(Number(variant)) && /^\d{4}$/u.test(year) && Number(year) >= 1900 && Number(year) <= 2100 && Number(month) >= 1 && Number(month) <= 12 && ["include", "exclude"].includes(fund) && kinds.length === 6 && kinds.every(kind => /^\d{1,16}(?:\.\d{1,2})?$/u.test(bases[kind] ?? ""));
  const calculate = async (event: React.FormEvent) => {
    event.preventDefault(); if (!ready || !policy) return;
    request.current?.abort(); const abort = new AbortController(); request.current = abort;
    const seq = ++sequence.current; setResult(null); setMessage(""); setLoading(true);
    try {
      const next = await hrApi.insuranceReferencePreview({ policyId: policy.id, expectedPolicyVersion: policy.version, variantNo: Number(variant), employeeId, periodYear: Number(year), periodMonth: Number(month), includeFund: fund === "include", bases: kinds.map(insuranceKind => ({ insuranceKind, contributionBase: bases[insuranceKind]! })) }, getAccessToken(), abort.signal);
      if (seq === sequence.current) setResult(next);
    } catch (error) { if (seq === sequence.current) setMessage(messageFor(error)); }
    finally { if (seq === sequence.current) setLoading(false); }
  };
  return <>
    <div className={local.columns}>
      <section className="ds-panel" aria-label="政策选择"><h2>选择参考政策</h2><p>历史政策用于金额核对，不代表本期已批准生效。</p>
        <form className={local.search} onSubmit={e => { e.preventDefault(); invalidate(); setPolicy(null); setVariant(""); policies.search(policySearch); }}><label className="form-field"><span>政策关键词</span><input type="search" maxLength={100} value={policySearch} onChange={e => setPolicySearch(e.target.value)} /></label><button className="ds-button" type="submit">搜索政策</button></form>
        <label className={`form-field ${local.selector}`}><span>选择政策</span><select value={policy?.id ?? ""} disabled={policies.loading} onChange={e => { invalidate(); setVariant(""); setPolicy(policies.data.items.find(p => p.id === e.target.value) ?? null); }}><option value="">请明确选择政策</option>{policies.data.items.map(p => <option key={p.id} value={p.id}>{p.name ?? p.code} · {p.code} · 版本 {p.version}{p.status === "historical" ? " · 历史参考" : ""}</option>)}</select></label>
        {policies.error ? <p className="form-error" role="alert">{policies.error}</p> : null}
        <nav className={local.actions} aria-label="政策分页"><button type="button" className="ds-button" disabled={policies.loading || policies.page <= 1} onClick={() => { invalidate(); setPolicy(null); setVariant(""); policies.setPage(policies.page - 1); }}>上一页</button><span>第 {policies.page} 页 · 共 {policies.data.total} 项</span><button type="button" className="ds-button" disabled={policies.loading || policies.page * 20 >= policies.data.total} onClick={() => { invalidate(); setPolicy(null); setVariant(""); policies.setPage(policies.page + 1); }}>下一页</button></nav>
      </section>
      <section className="ds-panel" aria-label="员工选择"><h2>选择核对员工</h2>
        <form className={local.search} onSubmit={e => { e.preventDefault(); invalidate(); setEmployeeId(""); setBases({}); employees.search(employeeSearch); }}><label className="form-field"><span>员工关键词</span><input type="search" maxLength={100} value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} /></label><button className="ds-button" type="submit">搜索员工</button></form>
        <label className={`form-field ${local.selector}`}><span>选择员工</span><select value={employeeId} disabled={employees.loading} onChange={e => { invalidate(); setEmployeeId(e.target.value); setBases({}); }}><option value="">请明确选择员工</option>{employees.data.items.map(e => <option key={e.id} value={e.id}>{e.fullName} · {e.employeeCode}</option>)}</select></label>
        {employees.error ? <p className="form-error" role="alert">{employees.error}</p> : null}
        <nav className={local.actions} aria-label="员工分页"><button type="button" className="ds-button" disabled={employees.loading || employees.page <= 1} onClick={() => { invalidate(); setEmployeeId(""); setBases({}); employees.setPage(employees.page - 1); }}>上一页</button><span>第 {employees.page} 页 · 共 {employees.data.total} 人</span><button type="button" className="ds-button" disabled={employees.loading || employees.page * 20 >= employees.data.total} onClick={() => { invalidate(); setEmployeeId(""); setBases({}); employees.setPage(employees.page + 1); }}>下一页</button></nav>
      </section>
    </div>
    <section className="ds-panel"><h2>填写本次核对输入</h2><form onSubmit={e => void calculate(e)} aria-label="社保试算参数"><div className={`${styles.formGrid} ${local.fields}`}>
      <label className="form-field"><span>政策方案</span><select value={variant} onChange={e => { invalidate(); setVariant(e.target.value); }} required><option value="">请选择方案</option>{policy?.availableVariants.map(v => <option key={v} value={v}>方案 {v}</option>)}</select></label>
      <label className="form-field"><span>公积金汇总</span><select value={fund} onChange={e => { invalidate(); setFund(e.target.value); }} required><option value="">请明确选择</option><option value="include">计入本次汇总</option><option value="exclude">仅计算分项，不计入汇总</option></select></label>
      <label className="form-field"><span>核对年份</span><input type="number" min={1900} max={2100} step={1} value={year} required onFocus={e => e.currentTarget.select()} onChange={e => { invalidate(); setYear(e.target.value); setBases({}); }} /></label>
      <label className="form-field"><span>核对月份</span><select value={month} required onChange={e => { invalidate(); setMonth(e.target.value); setBases({}); }}><option value="">请选择月份</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} 月</option>)}</select></label>
      {kinds.map(kind => <label className="form-field" key={kind}><span>{labels[kind] ?? kind}基数</span><input type="number" inputMode="decimal" min="0" max="9999999999999999.99" step="0.01" value={bases[kind] ?? ""} required onFocus={e => e.currentTarget.select()} onChange={e => { invalidate(); setBases(old => ({ ...old, [kind]: e.target.value })); }} /></label>)}
    </div><p>各险种基数需逐项核对；未填写不会按零处理。结果仅用于参考，不生成参保记录或工资条。</p><div className={local.actions}><button className="ds-button ds-button-primary" type="submit" disabled={!ready || loading}>{loading ? "正在试算…" : "参考试算"}</button></div></form>{message ? <p className="form-error" role="alert">{message}</p> : null}</section>
    {result ? <section className="ds-panel" aria-label="社保参考结果"><h2>{result.periodYear} 年 {result.periodMonth} 月参考结果</h2><p>{result.policy.name ?? result.policy.code} · 版本 {result.policy.version} · 方案 {result.policy.variantNo}。此结果尚未确认，不用于发薪。</p><p>政策合计与单位、个人分项分别按原政策计算，三者不一定满足加总关系。{result.calculation.includeFund ? "公积金已计入汇总。" : "公积金已计算分项，未计入汇总。"}</p><div className={`ds-mobile-record-list ${local.records}`}><article className="ds-mobile-record"><strong>本次汇总</strong><span>政策合计 ¥ {result.calculation.totals.base}</span><span>单位 ¥ {result.calculation.totals.employer}</span><span>个人 ¥ {result.calculation.totals.employee}</span><span>补充 ¥ {result.calculation.totals.supplement}</span></article>{result.calculation.items.map(item => <article className="ds-mobile-record" key={item.insuranceKind}><strong>{labels[item.insuranceKind] ?? item.insuranceKind}</strong><span>基数 {item.contributionBase}</span><span>政策合计 ¥ {item.amounts.base}</span><span>单位 ¥ {item.amounts.employer} · 个人 ¥ {item.amounts.employee}</span><span>补充 ¥ {item.amounts.supplement}</span></article>)}</div></section> : null}
  </>;
}
export function HrInsurancePreviewClient() {
  const user = useAuthUser();
  const allowed = [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ].every(p => hasPermission(user, p));
  const context = JSON.stringify([user?.id, user?.tenant_id, user?.park_id, user?.permissions, user?.roles, user?.is_super, user?.data_scope, user?.data_scopes, user?.field_policies]);
  const fallback = <main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="无权访问社保参考试算" /></section></main>;
  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_INSURANCE_PAGE} fallback={fallback}>{allowed ? <main className={`content ds-page ${styles.page}`}><section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">员工保障</span><h1>社保参考试算</h1><p>选择历史政策，核对本期基数及各险种分项。</p><Link className="ds-button" href="/hr/insurance">返回五险一金台账</Link></div></section><PreviewForm key={context} /></main> : fallback}</PermissionGuard>;
}
