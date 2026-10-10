"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HR_INSURANCE_OWNED_PERMISSIONS as capabilities, HR_PERMISSIONS, type HrInsuranceOwnedCalculation, type HrInsuranceOwnedEmployeeOption, type HrInsuranceOwnedPeriodListItem, type HrInsuranceOwnedPreview, type HrInsuranceOwnedPreviewRequest, type HrInsuranceOwnedConfirmRequest, type HrInsuranceOwnedCorrectRequest, type HrInsuranceOwnedCloseRequest, type HrInsuranceOwnedRevision } from "@jinhu/shared";
import { PermissionGuard } from "../../../../components/auth/PermissionGuard";
import { ForbiddenState } from "../../../../components/auth/ForbiddenState";
import { useAuthUser } from "../../../../lib/auth-context";
import { getAccessToken } from "../../../../lib/authz";
import { ApiError, createIdempotencyKey } from "../../../../lib/api-client";
import { hasPermission } from "../../../../lib/permissions";
import { hrApi, type HrInsurancePolicyVersion, type HrInsurancePolicyVersionDetail } from "../../../../lib/hr-api";
import { insurancePercentFromRate } from "../policy-rate";
import styles from "../../hr-workbench.module.css";
import local from "./periods.module.css";
import { correctionInputs, insuranceKindLabels, insuranceKinds, isInsuranceContributionBase } from "./correction-input";

const labels = insuranceKindLabels;
const kinds = insuranceKinds;
const calculatedAmountPattern = /^(?:0|[1-9]\d{0,15})\.\d{2}$/u;
const employees = (page: number, keyword: string, signal: AbortSignal) => hrApi.insuranceOwnedEmployees(getAccessToken(), page, keyword, signal);
const policies = (page: number, keyword: string, signal: AbortSignal) => hrApi.insurancePolicyVersions(getAccessToken(), page, keyword, signal);
function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "当前权限不足，请由已授权的 HR 岗位操作。";
    if (error.status === 409) return "人员、期间或请求状态已变化，请刷新并重新预览。";
    if (error.status === 404) return "所选人员或期间已不可用，请重新选择。";
    if (error.status === 400) return "请核对月份、六项基数及操作依据。";
  }
  return "请求未能完成。输入保持不变时，可重试原请求。";
}
function Amounts({ value }: { value: HrInsuranceOwnedCalculation }) {
  const source = value as unknown as { includeFund?: unknown; totals?: unknown; items?: unknown };
  const total = source.totals && typeof source.totals === "object" ? source.totals as Record<string, unknown> : null;
  const items = Array.isArray(source.items) ? source.items : [];
  const seen = new Set<string>();
  const complete = typeof source.includeFund === "boolean" && !!total && ["base", "employer", "employee", "supplement"].every(component => calculatedAmountPattern.test(total[component] as string)) && items.length === kinds.length && items.every(item => {
    const record = item && typeof item === "object" ? item as { insuranceKind?: unknown; contributionBase?: unknown; amounts?: unknown } : null;
    const amounts = record?.amounts && typeof record.amounts === "object" ? record.amounts as Record<string, unknown> : null;
    if (!record || typeof record.insuranceKind !== "string" || !kinds.includes(record.insuranceKind as typeof kinds[number]) || seen.has(record.insuranceKind) || !isInsuranceContributionBase(record.contributionBase) || !amounts || !["base", "employer", "employee", "supplement"].every(component => calculatedAmountPattern.test(amounts[component] as string))) return false;
    seen.add(record.insuranceKind); return true;
  });
  if (!complete) return <p className="form-error" role="alert">核算结果不完整，无法显示金额对照。</p>;
  const calculation = value as HrInsuranceOwnedCalculation;
  return <div className={`ds-mobile-record-list ${local.records}`}><article className="ds-mobile-record"><strong>期间汇总</strong><span>公积金汇总：{calculation.includeFund ? "计入汇总" : "只计算分项"}</span><span>政策合计 ¥ {calculation.totals.base}</span><span>单位 ¥ {calculation.totals.employer} · 个人 ¥ {calculation.totals.employee}</span><span>补充 ¥ {calculation.totals.supplement}</span></article>{calculation.items.map((item, index) => <article className="ds-mobile-record" key={`${item.insuranceKind}-${index}`}><strong>{labels[item.insuranceKind]}</strong><span>基数 {item.contributionBase}</span><span>政策合计 ¥ {item.amounts.base}</span><span>单位 ¥ {item.amounts.employer} · 个人 ¥ {item.amounts.employee}</span><span>补充 ¥ {item.amounts.supplement}</span></article>)}</div>;
}
function OriginalCalculation({ target }: { target: HrInsuranceOwnedPeriodListItem }) {
  const inputs = correctionInputs(target.calculation);
  return <section className="ds-panel" aria-label="原版本输入与结果"><h2>原版本输入与结果</h2><p>原版本 {target.revisionNo} 只读保留；金额由服务端原计算返回，前端不重算。</p><div className={`ds-mobile-record-list ${local.records}`}><article className="ds-mobile-record"><strong>原输入</strong><span>公积金汇总：{inputs.fund === "include" ? "计入汇总" : inputs.fund === "exclude" ? "只计算分项" : "缺失，需明确选择"}</span>{kinds.map(kind => <span key={kind}>{labels[kind]}基数：{inputs.bases[kind] ?? "缺失或无效，需人工填写"}</span>)}</article></div>{inputs.issues.length ? <><p className="form-error" role="alert">原记录输入不完整：{inputs.issues.join("；")}</p><p>原金额对照不完整，需补齐原输入后再以新预览核对。</p></> : <><p role="status">已沿用原六项精确基数及公积金汇总口径；仍须明确选择员工和政策版本。</p><Amounts value={target.calculation} /></>}</section>;
}
function Picker<T extends { id: string }>({ label, load, display, choose, disabled, initialKeyword = "", eligible = () => true }: {
  label: string; load: (page: number, keyword: string, signal: AbortSignal) => Promise<{ items: T[]; total: number }>;
  display: (item: T) => string; choose: (item: T | null) => void; disabled: boolean; initialKeyword?: string; eligible?: (item: T) => boolean;
}) {
  const [page, setPage] = useState(1), [search, setSearch] = useState(initialKeyword), [keyword, setKeyword] = useState(initialKeyword), [reload, setReload] = useState(0);
  const [rows, setRows] = useState<T[]>([]), [total, setTotal] = useState(0), [selected, setSelected] = useState(""), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => { const abort = new AbortController(); let alive = true; setRows([]); setTotal(0); setLoading(true); setError("");
    void load(page, keyword, abort.signal).then(result => { if (alive) { setRows(result.items); setTotal(result.total); } }).catch(e => { if (alive) setError(errorMessage(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; abort.abort(); };
  }, [load, page, keyword, reload]);
  const clear = () => { setSelected(""); choose(null); };
  return <section className="ds-panel"><h2>{label}</h2><form onSubmit={e => { e.preventDefault(); clear(); setPage(1); setKeyword(search); setReload(n => n + 1); }}><div className={local.fields}><label className="form-field"><span>{label}关键词</span><input type="search" maxLength={100} value={search} disabled={disabled} onChange={e => setSearch(e.target.value)} /></label><button type="submit" className="ds-button" disabled={disabled || loading}>搜索{label}</button></div></form>
    <label className="form-field"><span>{label}</span><select disabled={disabled || loading} value={selected} onChange={e => { setSelected(e.target.value); choose(rows.find(row => row.id === e.target.value) ?? null); }}><option value="">请明确选择</option>{rows.map(row => <option key={row.id} value={row.id} disabled={!eligible(row)}>{display(row)}</option>)}</select></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}<nav className={local.actions} aria-label={`${label}分页`}><button className="ds-button" disabled={disabled || loading || page <= 1} onClick={() => { clear(); setPage(page - 1); }}>上一页</button><span>第 {page} 页 · 共 {total} 项</span><button className="ds-button" disabled={disabled || loading || page * 20 >= total} onClick={() => { clear(); setPage(page + 1); }}>下一页</button><button className="ds-button" disabled={disabled || loading} onClick={() => { clear(); setReload(n => n + 1); }}>刷新{label}</button></nav></section>;
}
function Editor({ target, saved, busyChange }: { target?: HrInsuranceOwnedPeriodListItem; saved: (result: HrInsuranceOwnedRevision) => void; busyChange: (value: boolean) => void }) {
  const user = useAuthUser();
  const original = target ? correctionInputs(target.calculation) : null;
  const [employee, setEmployee] = useState<HrInsuranceOwnedEmployeeOption | null>(null), [policy, setPolicy] = useState<HrInsurancePolicyVersion | null>(null), [definition, setDefinition] = useState<HrInsurancePolicyVersionDetail | null>(null);
  const [month, setMonth] = useState(target?.periodMonth ?? ""), [fund, setFund] = useState(original?.fund ?? ""), [bases, setBases] = useState<Record<string, string>>(original?.bases ?? {}), [reason, setReason] = useState("");
  const [preview, setPreview] = useState<HrInsuranceOwnedPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const writing = useRef(false), mounted = useRef(true), request = useRef<AbortController | null>(null);
  const previewAttempt = useRef<{ body: HrInsuranceOwnedPreviewRequest; key: string } | null>(null), confirmAttempt = useRef<{ body: HrInsuranceOwnedConfirmRequest | HrInsuranceOwnedCorrectRequest; key: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { const abort = new AbortController(); let alive = true; setDefinition(null);
    if (policy) void hrApi.insurancePolicyVersion(policy.id, getAccessToken(), abort.signal).then(result => { if (alive) setDefinition(result); }).catch(e => { if (alive) setError(errorMessage(e)); });
    return () => { alive = false; abort.abort(); };
  }, [policy]);
  const edit = () => { previewAttempt.current = null; confirmAttempt.current = null; setPreview(null); setError(""); };
  const ready = employee?.previewEligible && (!target || employee.id === target.employeeId) && definition?.id === policy?.id && !!definition && /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/u.test(month) && month >= definition.effectiveFrom && month <= definition.effectiveThrough && ["include", "exclude"].includes(fund) && kinds.every(kind => /^\d{1,16}(?:\.\d{1,2})?$/u.test(bases[kind] ?? ""));
  async function calculate(e: React.FormEvent) {
    e.preventDefault(); if (!ready || !employee || !definition || writing.current) return;
    if (!previewAttempt.current) previewAttempt.current = { key: createIdempotencyKey("hr-insurance-owned-preview"), body: { requestId: crypto.randomUUID(), employeeId: employee.id, expectedEmployeeVersion: employee.version,
      policyVersionId: definition.id, expectedDefinitionHash: definition.definitionHash, periodMonth: month, includeFund: fund === "include", bases: kinds.map(insuranceKind => ({ insuranceKind, contributionBase: bases[insuranceKind]! })) } };
    writing.current = true; setBusy(true); busyChange(true); setError(""); const abort = new AbortController(); request.current = abort;
    try { const result = await hrApi.createInsuranceOwnedPreview(previewAttempt.current.body, getAccessToken(), previewAttempt.current.key, abort.signal); if (mounted.current) setPreview(result); }
    catch (e) { if (mounted.current) { setError(errorMessage(e)); if (e instanceof ApiError && e.status === 409) { previewAttempt.current = null; confirmAttempt.current = null; setPreview(null); } } }
    finally { writing.current = false; busyChange(false); if (mounted.current) setBusy(false); }
  }
  async function confirm() {
    const capability = target ? capabilities.CORRECT : capabilities.CONFIRM;
    if (!preview || !reason.trim() || !hasPermission(user, capability) || writing.current) return;
    if (!confirmAttempt.current) { const body = { requestId: crypto.randomUUID(), previewId: preview.id, expectedPreviewHash: preview.previewHash, reason: reason.trim() };
      confirmAttempt.current = { key: createIdempotencyKey(target ? "hr-insurance-owned-correct" : "hr-insurance-owned-confirm"), body: target ? { ...body, previousRevisionId: target.id, expectedPeriodVersion: target.revisionNo } : body }; }
    writing.current = true; setBusy(true); busyChange(true); setError(""); const abort = new AbortController(); request.current = abort;
    try { const attempt = confirmAttempt.current; const result = target ? await hrApi.correctInsuranceOwnedPeriod(attempt.body as HrInsuranceOwnedCorrectRequest, getAccessToken(), attempt.key, abort.signal) : await hrApi.confirmInsuranceOwnedPeriod(attempt.body, getAccessToken(), attempt.key, abort.signal); if (mounted.current) saved(result); }
    catch (e) { if (mounted.current) { setError(errorMessage(e)); if (e instanceof ApiError && e.status === 409) { setPreview(null); previewAttempt.current = null; confirmAttempt.current = null; } } }
    finally { writing.current = false; busyChange(false); if (mounted.current) setBusy(false); }
  }
  return <div className={local.stack} aria-label={target ? "更正社保期间" : "新建社保期间"}>
    {target ? <><section className="ds-panel"><h2>更正 {target.fullName} · {target.periodMonth}</h2><p>基于已关账版本 {target.revisionNo} 创建新版本，原记录继续保留。</p></section><OriginalCalculation target={target} /></> : null}
    <Picker label="员工" load={employees} disabled={busy} initialKeyword={target?.employeeCode} eligible={e => e.previewEligible && (!target || e.id === target.employeeId)} display={e => `${e.fullName} · ${e.employeeCode}${e.previewEligible ? "" : " · 当前状态不支持预览"}`} choose={e => { edit(); setEmployee(e); }} />
    <Picker label="政策版本" load={policies} disabled={busy} display={p => `${p.policyName} · 版本 ${p.versionNo} · ${p.effectiveFrom} 至 ${p.effectiveThrough}`} choose={p => { edit(); setPolicy(p); }} />
    {definition ? <section className="ds-panel" aria-label="所选政策定义"><h2>{definition.policyName} · 版本 {definition.versionNo}</h2><p>{definition.reason}</p><div className={`ds-mobile-record-list ${local.records}`}>{definition.items.map(item => <article key={item.insuranceKind} className="ds-mobile-record"><strong>{labels[item.insuranceKind]}</strong>{Object.entries(item.factors).map(([component, factor]) => { const percentage = insurancePercentFromRate(factor.rate); return <span key={component}>{({ base: "政策合计", employer: "单位", employee: "个人", supplement: "补充" } as Record<string, string>)[component]}：{percentage === null ? "费率值异常" : `${percentage}%`}{factor.fixedAmount === null ? " · 无固定附加额" : ` · 固定附加额 ${factor.fixedAmount}`}</span>; })}</article>)}</div></section> : null}
    <section className="ds-panel"><h2>期间输入</h2><form onSubmit={e => void calculate(e)}><fieldset disabled={busy} className={local.fields} style={{ border: 0, padding: 0, margin: 0 }}><label className="form-field"><span>核算月份</span><input type="month" min="1900-01" max="2100-12" value={month} disabled={!!target} required onChange={e => { edit(); setMonth(e.target.value); }} /></label><label className="form-field"><span>公积金汇总</span><select required value={fund} onChange={e => { edit(); setFund(e.target.value); }}><option value="">请明确选择</option><option value="include">计入汇总</option><option value="exclude">只计算分项</option></select></label>{kinds.map(kind => <label key={kind} className="form-field"><span>{labels[kind]}基数</span><input type="number" inputMode="decimal" min="0" max="9999999999999999.99" step="0.01" required value={bases[kind] ?? ""} onFocus={e => e.currentTarget.select()} onChange={e => { edit(); setBases(old => ({ ...old, [kind]: e.target.value })); }} /></label>)}</fieldset><div className={local.actions}><button className="ds-button ds-button-primary" disabled={!ready || busy}>生成期间预览</button></div></form></section>
    {preview ? <section className="ds-panel" aria-label="待确认预览"><h2>{preview.periodMonth} · 待确认预览</h2><p>有效期至 {new Date(preview.expiresAt).toLocaleString()}。政策合计、单位、个人及补充分别计算，不假定相互加总。</p><Amounts value={preview.calculation} /><label className="form-field"><span>操作依据</span><textarea maxLength={500} value={reason} disabled={busy} onChange={e => { confirmAttempt.current = null; setReason(e.target.value); }} /></label>{hasPermission(user, target ? capabilities.CORRECT : capabilities.CONFIRM) ? <button className="ds-button ds-button-primary" disabled={busy || !reason.trim()} onClick={() => void confirm()}>{target ? "确认更正" : "确认期间"}</button> : null}</section> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}

function Workbench() {
  const user = useAuthUser(), canPreview = hasPermission(user, capabilities.PREVIEW_CREATE);
  const [rows, setRows] = useState<HrInsuranceOwnedPeriodListItem[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [search, setSearch] = useState(""), [keyword, setKeyword] = useState(""), [reload, setReload] = useState(0), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HrInsuranceOwnedPeriodListItem | null>(null), [editor, setEditor] = useState<{ target?: HrInsuranceOwnedPeriodListItem } | null>(null), [success, setSuccess] = useState(""), [error, setError] = useState(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const detailRequest = useRef<AbortController | null>(null), writeRequest = useRef<AbortController | null>(null), sequence = useRef(0), writing = useRef(false), mounted = useRef(true), closeAttempt = useRef<{ body: HrInsuranceOwnedCloseRequest; key: string } | null>(null);
  useEffect(() => { const abort = new AbortController(); let alive = true; setRows([]); setTotal(0); setLoading(true); setError("");
    void hrApi.insuranceOwnedPeriods(getAccessToken(), page, keyword, abort.signal).then(result => { if (alive) { setRows(result.items); setTotal(result.total); } }).catch(e => { if (alive) setError(errorMessage(e)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; abort.abort(); };
  }, [page, keyword, reload]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; detailRequest.current?.abort(); writeRequest.current?.abort(); }; }, []);
  function clear() { sequence.current++; detailRequest.current?.abort(); setSelected(null); setEditor(null); setReason(""); closeAttempt.current = null; }
  async function detail(row: HrInsuranceOwnedPeriodListItem) { clear(); setError(""); const seq = sequence.current, abort = new AbortController(); detailRequest.current = abort;
    try { const result = await hrApi.insuranceOwnedPeriod(row.id, getAccessToken(), abort.signal); if (seq === sequence.current) setSelected({ ...row, ...result }); } catch (e) { if (seq === sequence.current) setError(errorMessage(e)); }
  }
  async function close() { if (!selected || !selected.current || selected.status !== "confirmed" || !reason.trim() || writing.current) return;
    if (!closeAttempt.current) closeAttempt.current = { key: createIdempotencyKey("hr-insurance-owned-close"), body: { requestId: crypto.randomUUID(), revisionId: selected.id, expectedPeriodVersion: selected.revisionNo, reason: reason.trim() } };
    writing.current = true; setBusy(true); setError(""); const abort = new AbortController(); writeRequest.current = abort;
    try { const attempt = closeAttempt.current; await hrApi.closeInsuranceOwnedPeriod(attempt.body, getAccessToken(), attempt.key, abort.signal); if (mounted.current) { setSuccess(`${selected.periodMonth} · 版本 ${selected.revisionNo} 已关账`); clear(); setReload(n => n + 1); } }
    catch (e) { if (mounted.current) setError(errorMessage(e)); } finally { writing.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className={local.stack}>{success ? <section className="ds-panel" role="status">{success}</section> : null}<section className="ds-panel"><h2>现代期间台账</h2><form onSubmit={e => { e.preventDefault(); clear(); setPage(1); setKeyword(search); }}><div className={local.fields}><label className="form-field"><span>员工关键词</span><input type="search" maxLength={100} value={search} disabled={busy} onChange={e => setSearch(e.target.value)} /></label><button className="ds-button" disabled={busy}>搜索期间</button></div></form>
    <div className={`ds-mobile-record-list ${local.records}`}>{rows.map(row => <article className="ds-mobile-record" key={row.id}><strong>{row.fullName} · {row.employeeCode}</strong><span>{row.periodMonth} · 版本 {row.revisionNo} · {row.status === "closed" ? "已关账" : "已确认"}{row.current ? " · 当前版本" : " · 历史版本"}</span><button className="ds-button" disabled={busy} onClick={() => void detail(row)}>查看期间</button></article>)}</div>{!loading && !rows.length ? <p>当前筛选没有已确认的现代期间。</p> : null}<nav className={local.actions} aria-label="期间分页"><button className="ds-button" disabled={busy || loading || page <= 1} onClick={() => { clear(); setPage(page - 1); }}>上一页</button><span>第 {page} 页 · 共 {total} 项</span><button className="ds-button" disabled={busy || loading || page * 20 >= total} onClick={() => { clear(); setPage(page + 1); }}>下一页</button><button className="ds-button" disabled={busy || loading} onClick={() => { clear(); setReload(n => n + 1); }}>刷新期间</button>{canPreview ? <button className="ds-button" disabled={busy} onClick={() => { clear(); setEditor({}); }}>新建期间</button> : null}</nav></section>
    {selected && editor?.target?.id !== selected.id ? <section className="ds-panel" aria-label="现代期间详情"><h2>{selected.fullName} · {selected.periodMonth} · 版本 {selected.revisionNo}</h2><Amounts value={selected.calculation} />{selected.current && selected.status === "confirmed" && hasPermission(user, capabilities.CLOSE) ? <><label className="form-field"><span>关账依据</span><textarea maxLength={500} value={reason} disabled={busy} onChange={e => { closeAttempt.current = null; setReason(e.target.value); }} /></label><button className="ds-button" disabled={busy || !reason.trim()} onClick={() => void close()}>关账</button></> : null}{selected.current && selected.status === "closed" && canPreview && hasPermission(user, capabilities.CORRECT) ? <button className="ds-button" disabled={busy} onClick={() => setEditor({ target: selected })}>更正期间</button> : null}</section> : null}
    {editor ? <Editor key={editor.target?.id ?? "new"} target={editor.target} busyChange={setBusy} saved={result => { setSuccess(`${result.periodMonth} · 版本 ${result.revisionNo} 已确认`); clear(); setReload(n => n + 1); }} /> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</div>;
}
export function HrInsuranceOwnedPeriodsClient() {
  const user = useAuthUser(), allowed = [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ].every(p => hasPermission(user, p));
  const context = JSON.stringify([user?.id, user?.tenant_id, user?.park_id, user?.permissions, user?.roles, user?.is_super, user?.data_scope, user?.data_scopes, user?.field_policies]);
  const fallback = <main className={`content ds-page ${styles.page}`}><section className="ds-panel"><ForbiddenState message="无权访问现代社保期间" /></section></main>;
  return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_INSURANCE_PAGE} fallback={fallback}>{allowed ? <main className={`content ds-page ${styles.page}`}><section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">员工保障</span><h1>现代社保期间</h1><p>按明确政策与基数确认期间，关账后保留原版本并追加更正。</p><Link className="ds-button" href="/hr/insurance">返回五险一金台账</Link></div></section><Workbench key={context} /></main> : fallback}</PermissionGuard>;
}
