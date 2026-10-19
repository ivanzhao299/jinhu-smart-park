"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FORMAL_PAYROLL_ROLES, HR_PERMISSIONS, type FormalPayrollBookOption, type FormalPayrollDefinition, type FormalPayrollItem, type FormalPayrollRuleSet, type FormalPayrollRuleVersion } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi } from "../../../lib/hr-api";
import { collectScopedExport } from "../../../lib/scoped-csv-export";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./payroll-modern.module.css";
import { payrollBookLabel, payrollBookOptions } from "./payroll-book-label";

import { PayrollRuleSourcePreparation } from "./PayrollRuleSourcePreparation";
import type { PayrollRuleHandoffIntent } from "./payroll-rule-handoff";

const roles = { earning: "收入", deduction: "扣款", tax: "税额", gross: "应发汇总", net: "实发汇总", employer_contribution: "单位承担", informational: "参考数量" };
const statuses: Record<string, string> = { draft: "草稿", submitted: "待复核", approved: "已批准", rejected: "已拒绝" };
const blankDefinition = (): FormalPayrollDefinition => ({ roundingPolicy: "line_items_half_up", items: [] });

export function PayrollRuleMaintenance({intent,onReturn}:{intent?:PayrollRuleHandoffIntent|null;onReturn?:(intent:PayrollRuleHandoffIntent)=>void}) {
  const user = useAuthUser();
  return <RuleWorkspace key={JSON.stringify(user)} intent={intent} onReturn={onReturn}/>;
}
function RuleWorkspace({intent,onReturn}:{intent?:PayrollRuleHandoffIntent|null;onReturn?:(intent:PayrollRuleHandoffIntent)=>void}) {
  const user = useAuthUser(), canRead = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_RULE_READ);
  const canManage = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_MANAGE), canReview = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW);
  const [sets, setSets] = useState<FormalPayrollRuleSet[]>([]), [rulePage, setRulePage] = useState(1), [ruleTotal, setRuleTotal] = useState(0);
  const [current, setCurrent] = useState<FormalPayrollRuleSet | null>(null), [versions, setVersions] = useState<FormalPayrollRuleVersion[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0), [selected, setSelected] = useState<FormalPayrollRuleVersion | null>(null);
  const [definition, setDefinition] = useState<FormalPayrollDefinition>(blankDefinition), [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(""), [reviewReason, setReviewReason] = useState(""), [month, setMonth] = useState("");
  const [code, setCode] = useState(""), [name, setName] = useState("");
  const [books, setBooks] = useState<FormalPayrollBookOption[]>([]), [bookPage, setBookPage] = useState(1), [bookTotal, setBookTotal] = useState(0);
  const [book, setBook] = useState<FormalPayrollBookOption | null>(null), [bookKeyword, setBookKeyword] = useState(""), [bookSearch, setBookSearch] = useState("");
  const [bookLoading, setBookLoading] = useState(false), [bookError, setBookError] = useState(""), [bookRefresh, setBookRefresh] = useState(0);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [handoffState,setHandoffState]=useState<"idle"|"loading"|"ready"|"linked"|"error">("idle"),[handoffError,setHandoffError]=useState("");
  const alive = useRef(true), request = useRef<AbortController | null>(null), lock = useRef(false);
  const handoffRequest=useRef<AbortController|null>(null);
  const handoffToken=useRef<string|null>(null);
  const sourceApplied = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); handoffRequest.current?.abort(); }; }, []);
  const load = useCallback(async () => {
    if (!canRead) return;
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setLoading(true); setError("");
    try {
      const [rules, revisions] = await Promise.all([
        hrApi.payrollRules({ page: rulePage, pageSize: 20 }, getAccessToken(), controller.signal),
        current ? hrApi.payrollRuleVersions(current.id, { page, pageSize: 20 }, getAccessToken(), controller.signal) : Promise.resolve(null),
      ]);
      if (!alive.current || controller.signal.aborted) return;
      setSets(rules.items); setRuleTotal(rules.total);
      if (current) setCurrent(rules.items.find(rule => rule.id === current.id) ?? current);
      setVersions(revisions?.items ?? []); setTotal(revisions?.total ?? 0);
    } catch (cause) {
      if (alive.current && !controller.signal.aborted) { setError(hrLoadErrorMessage(cause, "加载工资规则失败")); throw cause; }
    } finally { if (alive.current && request.current === controller) setLoading(false); }
  }, [canRead, current?.id, page, rulePage]);
  useEffect(() => { void load().catch(() => undefined); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    if (!canRead || !canManage) return;
    const controller = new AbortController(); setBookLoading(true); setBookError("");
    void hrApi.payrollBookOptions({ page: bookPage, pageSize: 20, keyword: bookSearch }, getAccessToken(), controller.signal).then(result => {
      if (!alive.current || controller.signal.aborted) return;
      setBooks(result.items); setBookTotal(result.total);
    }).catch(cause => {
      if (alive.current && !controller.signal.aborted) setBookError(hrLoadErrorMessage(cause, "加载工资账套失败"));
    }).finally(() => { if (alive.current && !controller.signal.aborted) setBookLoading(false); });
    return () => controller.abort();
  }, [canRead, canManage, bookPage, bookSearch, bookRefresh]);
  useEffect(()=>{
    handoffRequest.current?.abort();
    if(!intent){handoffToken.current=null;setHandoffState("idle");setHandoffError("");return;}
    if(!canRead||!canManage){setHandoffState("error");setHandoffError("当前权限不足，不能为该账套准备工资规则。");return;}
    const controller=new AbortController(),token=getAccessToken();handoffRequest.current=controller;handoffToken.current=token;setHandoffState("loading");setHandoffError("");setError("");
    const current=()=>alive.current&&!controller.signal.aborted&&handoffRequest.current===controller&&getAccessToken()===token;
    void (async()=>{
      const [allRules,allBooks]=await Promise.all([
        collectScopedExport(page=>hrApi.payrollRules({page,pageSize:100},token,controller.signal),current,{pageSize:100,limit:2000,label:"工资规则"}),
        collectScopedExport(page=>hrApi.payrollBookOptions({page,pageSize:100},token,controller.signal),current,{pageSize:100,limit:2000,label:"工资账套"}),
      ]);
      if(!current()||!allRules||!allBooks)return;
      const linked=allRules.filter(rule=>rule.sourceBookId===intent.bookId);
      if(linked.length>1)throw new Error("该工资账套关联了多个规则，请先处理关联关系后重试。");
      if(linked.length===1){
        const linkedBook=linked[0]!.sourceBook;
        if(!linkedBook||linkedBook.id!==intent.bookId||linkedBook.scheme!==intent.scheme)throw new Error("所选工资账套已变化或不可读取，请返回整月试算刷新后重试。");
        setCurrent(linked[0]!);setSelected(null);setEditing(false);setHandoffState("linked");return;
      }
      const target=allBooks.find(candidate=>candidate.id===intent.bookId&&candidate.scheme===intent.scheme);
      if(!target)throw new Error("所选工资账套已变化或不可读取，请返回整月试算刷新后重试。");
      setBook(target);setBookKeyword("");setBookSearch("");setBookPage(1);setHandoffState("ready");
    })().catch(cause=>{if(current()){setHandoffState("error");setHandoffError(hrLoadErrorMessage(cause,"无法确认该账套的规则关联，请重试。"));}});
    return()=>controller.abort();
  },[intent?.legacyBatchId,intent?.month,intent?.bookId,intent?.scheme,canRead,canManage]);
  const write = async (action: string, body: unknown, operation: (key: string) => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    const signature = JSON.stringify({ action, id: selected?.id, version: selected?.version, setId: current?.id, head: current?.headRevision, body });
    if (retry.current?.signature !== signature) retry.current = { signature, key: createIdempotencyKey(action) };
    try {
      await operation(retry.current.key);
      if (!alive.current) return;
      retry.current = null; setNotice("操作已保存。");
      try { await load(); } catch { if (alive.current) setError("操作已保存，列表刷新失败；请刷新查看最新版本。"); }
    } catch (cause) { if (alive.current) setError(hrLoadErrorMessage(cause, "保存工资规则失败")); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const choose = (version: FormalPayrollRuleVersion) => {
    if (lock.current) return;
    setSelected(version); setDefinition({ ...version.definition, items: version.definition.items.map(item => ({ ...item })) });
    setReason(version.reason); setReviewReason(""); setMonth(version.effectiveFrom ?? ""); setEditing(false); setNotice("");
  };
  const changeItem = (index: number, change: Partial<FormalPayrollItem>) => setDefinition(value => ({ ...value, items: value.items.map((item, i) => i === index ? { ...item, ...change } : item) }));
  const editable = canManage && editing && (!selected || selected.status === "draft");
  const bookOptions = payrollBookOptions(book ? [book, ...books] : books);
  const contextualCreate=Boolean(intent&&handoffState==="ready"&&handoffToken.current===getAccessToken()&&book?.id===intent.bookId&&book.scheme===intent.scheme);
  if (!canRead) return null;
  return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="modern-payroll-rules">
    <div className={styles.actions}><h2 id="modern-payroll-rules">工资业务规则</h2><button className="secondary-button" type="button" disabled={loading || busy} onClick={() => void load().catch(() => undefined)}>刷新规则</button>{intent&&onReturn?<button className="secondary-button" type="button" disabled={busy} onClick={()=>{if(handoffToken.current!==getAccessToken()){setHandoffState("error");setHandoffError("登录状态已变化，请返回整月试算重新选择账套。");return;}onReturn(intent);}}>返回同一来源月份</button>:null}</div>
    <p>按业务项目维护计算顺序、金额来源和生效月份。已批准版本保留，后续调整新增版本。</p>
    {intent?<section className={`ds-panel ${styles.workspace} ${styles.sourcePreparation}`} aria-label="本账套规则准备上下文"><strong>正在准备：{intent.bookName} · 账套 {intent.scheme} · {intent.month}</strong><p>请核对该账套的现有规则，或明确填写新规则编号和名称后建立关联。完成后可返回同一来源月份继续准备。</p>{handoffState==="loading"?<p role="status">正在完整核对规则与工资账套…</p>:null}{handoffError?<p className="form-error" role="alert">{handoffError}</p>:null}{handoffState==="linked"?<p role="status">已打开该账套的现有关联规则。</p>:null}</section>:null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {canManage && (!intent || handoffState === "ready") ? <form className={styles.workspace} onSubmit={event => {
      const handoffTokenCurrent=handoffToken.current===getAccessToken();
      event.preventDefault(); if (!code.trim() || !name.trim() || (intent&&(!contextualCreate||!handoffTokenCurrent))) { if(intent&&!handoffTokenCurrent){setHandoffState("error");setHandoffError("登录状态已变化，请返回整月试算重新选择账套。");} return; }
      const body = { ruleCode: code.trim(), displayName: name.trim(), ...(book ? { sourceBookId: book.id } : {}) };
      void write("hr-rule-create", body, async key => { const created = await hrApi.createPayrollRules(body, getAccessToken(), key); if (alive.current) { setCurrent(created); setCode(""); setName(""); setBook(null); setBookRefresh(value => value + 1); setSelected(null); setEditing(false); setPage(1); if (intent) setHandoffState("linked"); } });
    }}>
      <div className={styles.fields}><label className="form-field"><span>规则编号</span><input required maxLength={64} disabled={busy} value={code} onChange={event => setCode(event.target.value)} /></label>
      <label className="form-field"><span>规则名称</span><input required maxLength={100} disabled={busy} value={name} onChange={event => setName(event.target.value)} /></label>
      </div>
      <div className={styles.workspace}>
        <div className={styles.fields}><label className="form-field"><span>关联工资账套（可选）</span><select disabled={busy || bookLoading || !!bookError || Boolean(intent)} value={book?.id ?? ""} onChange={event => setBook(bookOptions.find(value => value.id === event.target.value) ?? null)}>
          {!intent?<option value="">独立规则，不关联账套</option>:null}
          {(intent&&book?payrollBookOptions([book]):bookOptions).map(value => <option value={value.id} key={value.id}>{value.label}</option>)}
        </select></label>
        {!intent?<div className={styles.actions}><label className="form-field"><span>搜索工资账套名称或编号</span><input maxLength={100} disabled={busy} value={bookKeyword} onChange={event => setBookKeyword(event.target.value)} /></label><button type="button" className="secondary-button" disabled={busy || bookLoading} onClick={() => { setBookSearch(bookKeyword.trim()); setBookPage(1); setBookRefresh(value => value + 1); }}>搜索账套</button></div>:null}
        </div>
        {bookError ? <p className="form-error" role="alert">{bookError}</p> : bookLoading ? <p>正在加载工资账套…</p> : <p>{bookTotal ? `有 ${bookTotal} 个可关联账套。` : "当前搜索没有可关联账套，可创建独立规则。"}</p>}
        {!intent?<div className={styles.actions}><button type="button" className="secondary-button" disabled={busy || bookLoading || bookPage <= 1} onClick={() => setBookPage(value => value - 1)}>账套上一页</button><span>第 {bookPage} / {Math.max(1, Math.ceil(bookTotal / 20))} 页</span><button type="button" className="secondary-button" disabled={busy || bookLoading || bookPage * 20 >= bookTotal} onClick={() => setBookPage(value => value + 1)}>账套下一页</button><button type="button" className="secondary-button" disabled={busy || bookLoading} onClick={() => setBookRefresh(value => value + 1)}>刷新账套</button></div>:null}
        <p>已关联的账套在对应工资规则中维护；关联保留业务关系，计算使用独立批准的生效规则。</p>
        {book ? <p>本次关联：{payrollBookLabel(book)}{!intent?<button type="button" className="secondary-button" disabled={busy} onClick={() => setBook(null)}>取消关联选择</button>:null}</p> : null}
      </div>
      <div className={styles.actions}><button className="secondary-button" disabled={busy || Boolean(intent&&!contextualCreate)} type="submit">新建规则</button></div>
    </form> : null}
    <label className="form-field"><span>选择工资规则</span><select value={current?.id ?? ""} disabled={busy || loading || Boolean(intent)} onChange={event => {
      if (lock.current) return; setCurrent(sets.find(rule => rule.id === event.target.value) ?? null); setSelected(null); setEditing(false); setVersions([]); setPage(1); setNotice("");
    }}><option value="">请选择规则</option>{current && !sets.some(rule => rule.id === current.id) ? <option value={current.id}>{current.displayName}</option> : null}{sets.map(rule => <option key={rule.id} value={rule.id}>{rule.displayName} · {rule.ruleCode}</option>)}</select></label>
    <div className={styles.actions}><button className="secondary-button" disabled={busy || loading || Boolean(intent) || rulePage <= 1} onClick={() => setRulePage(value => value - 1)} type="button">规则上一页</button><span>第 {rulePage} / {Math.max(1, Math.ceil(ruleTotal / 20))} 页</span><button className="secondary-button" disabled={busy || loading || Boolean(intent) || rulePage * 20 >= ruleTotal} onClick={() => setRulePage(value => value + 1)} type="button">规则下一页</button></div>
    {current ? <>
      <p>关联账套：{current.sourceBook ? payrollBookLabel(current.sourceBook) : current.sourceBookId ? "关联账套暂不可用" : "独立工资规则"}</p>
      <div className={styles.actions}><h3>{current.displayName}的版本</h3>{canManage ? <button className="secondary-button" type="button" disabled={busy || loading} onClick={() => { setSelected(null); setDefinition(blankDefinition()); setReason(""); setEditing(true); sourceApplied.current = false; }}>新增版本</button> : null}</div>
      {loading ? <p>正在加载版本…</p> : <div className={`ds-mobile-record-list ${styles.records}`}>{versions.map(version => <article className="ds-mobile-record" key={version.id}><strong>第 {version.revisionNo} 版 · {statuses[version.status] ?? version.status}</strong><span>{version.effectiveFrom ? `${version.effectiveFrom} 起生效` : "尚未生效"} · {version.definition.items.length} 个项目</span><button className="secondary-button" type="button" disabled={busy} onClick={() => choose(version)}>查看版本</button></article>)}{!versions.length ? <p>当前页暂无版本。</p> : null}</div>}
      <div className={styles.actions}><button className="secondary-button" disabled={busy || loading || page <= 1} onClick={() => { setSelected(null); setEditing(false); setPage(value => value - 1); }} type="button">版本上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><button className="secondary-button" disabled={busy || loading || page * 20 >= total} onClick={() => { setSelected(null); setEditing(false); setPage(value => value + 1); }} type="button">版本下一页</button></div>
    </> : null}
    {current && (selected || editing) ? <section className={styles.workspace} aria-label="规则版本编辑">
      <div className={styles.actions}><h3>{selected ? `第 ${selected.revisionNo} 版` : "新增规则版本"}</h3>{selected && canManage && !editing ? <button className="secondary-button" disabled={busy} type="button" onClick={() => { if (selected.status === "draft") setEditing(true); else { setSelected(null); setReason(""); setEditing(true); } }}>{selected.status === "draft" ? "编辑草稿" : "复制为新版本"}</button> : null}</div>
      {editable && !selected && current.sourceBookId && definition.items.length === 0 ? <PayrollRuleSourcePreparation key={`${current.id}:${current.sourceBookId}`} ruleSetId={current.id} sourceBookId={current.sourceBookId} disabled={busy || loading} onApply={prepared => {
        if (lock.current || sourceApplied.current || !alive.current || !editable || selected || definition.items.length !== 0) return;
        sourceApplied.current = true;
        setDefinition(value => value.items.length === 0 ? { ...prepared, compensationPolicy: value.compensationPolicy } : value);
        setNotice("已带入当前编辑草稿；请核对项目顺序、引用和计薪口径后保存，再提交独立复核。");
      }} /> : null}
      <label className="form-field"><span>薪酬计算口径</span><select disabled={!editable || busy} value={definition.compensationPolicy ?? ""} onChange={event => setDefinition(value => ({ ...value, compensationPolicy: event.target.value ? event.target.value as FormalPayrollDefinition["compensationPolicy"] : undefined }))}><option value="">此规则不引用薪酬</option><option value="full_period_single">整期单一薪酬</option><option value="calendar_day_prorated">按自然日分摊调薪及部分月份</option></select></label>
      <p>金额项目按分舍入后参与后续汇总；参考数量保留四位小数。项目顺序即计算顺序。</p>
      <div className={`ds-mobile-record-list ${styles.records}`}>{definition.items.map((item, index) => <article className={`ds-mobile-record ${styles.project}`} key={index}>
        <strong>项目 {index + 1}</strong><div className={styles.fields}><label className="form-field"><span>项目编号</span><input value={item.code} maxLength={96} disabled={!editable || busy} onChange={event => changeItem(index, { code: event.target.value })} /></label><label className="form-field"><span>业务用途</span><select value={item.role} disabled={!editable || busy} onChange={event => changeItem(index, { role: event.target.value as FormalPayrollItem["role"] })}>{FORMAL_PAYROLL_ROLES.map(role => <option key={role} value={role}>{roles[role]}</option>)}</select></label><label className="form-field"><span>数值来源</span><select disabled={!editable || busy} value={item.expression === null ? "direct" : "formula"} onChange={event => changeItem(index, { expression: event.target.value === "direct" ? null : "" })}><option value="direct">当期录入</option><option value="formula">按公式计算</option></select></label></div>
        {item.expression !== null ? <label className="form-field"><span>计算公式</span><textarea aria-label="计算公式" aria-describedby={`payroll-formula-leave-help-${index}`} value={item.expression} maxLength={4000} disabled={!editable || busy} onChange={event => changeItem(index, { expression: event.target.value })} placeholder="例如：[人事系统.基本工资] 或 [应发]-[扣款]-[税额]" /><small id={`payroll-formula-leave-help-${index}`}>可引用 [人事系统.批准请假分钟]：采用当月封账后保留的实际分钟；未提供时需先更正考勤。可查阅 [人事系统.批准加班区间分钟] 与 [人事系统.批准出差区间分钟]（准确区间时长），以及 [人事系统.批准出差申报天数]（明确登记天数）。使用前须业务复核；是否扣薪、计薪及换算方式由已确认规则决定。</small></label> : <span>由当期输入批次录入明确数值。</span>}
        {editable ? <div className={styles.actions}><button className="secondary-button" type="button" disabled={busy || index === 0} onClick={() => setDefinition(value => { const items = [...value.items]; [items[index - 1], items[index]] = [items[index]!, items[index - 1]!]; return { ...value, items }; })}>上移项目</button><button className="secondary-button" type="button" disabled={busy || index === definition.items.length - 1} onClick={() => setDefinition(value => { const items = [...value.items]; [items[index], items[index + 1]] = [items[index + 1]!, items[index]!]; return { ...value, items }; })}>下移项目</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setDefinition(value => ({ ...value, items: value.items.filter((_, i) => i !== index) }))}>移除项目</button></div> : null}
      </article>)}</div>
      {editable ? <><button className="secondary-button" type="button" disabled={busy || definition.items.length >= 256} onClick={() => setDefinition(value => ({ ...value, items: [...value.items, { code: "", role: "earning", expression: null }] }))}>添加工资项目</button><label className="form-field"><span>制定或修改理由</span><textarea required maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="primary-button" type="button" disabled={busy || !reason.trim() || !definition.items.length || definition.items.some(item => !item.code.trim() || item.expression === "")} onClick={() => {
        const body = { definition, reason: reason.trim() };
        void write("hr-rule-save", body, async key => { const saved = selected ? await hrApi.updatePayrollRuleVersion(selected.id, { ...body, expectedVersion: selected.version }, getAccessToken(), key) : await hrApi.createPayrollRuleVersion(current.id, { ...body, expectedHeadRevision: current.headRevision }, getAccessToken(), key); if (alive.current) { setSelected(saved); setEditing(false); setCurrent(value => value ? { ...value, headRevision: Math.max(value.headRevision, saved.revisionNo) } : value); } });
      }}>保存规则草稿</button></> : null}
      {selected && !editing ? <><p>制定理由：{selected.reason}</p>{selected.reviewReason ? <p>复核理由：{selected.reviewReason}</p> : null}{selected.status === "draft" && canManage ? <button className="primary-button" type="button" disabled={busy} onClick={() => void write("hr-rule-submit", { expectedVersion: selected.version }, async key => { const saved = await hrApi.submitPayrollRuleVersion(selected.id, { expectedVersion: selected.version }, getAccessToken(), key); if (alive.current) setSelected(saved); })}>提交独立复核</button> : null}{selected.status === "submitted" && canReview ? <><div className={styles.fields}><label className="form-field"><span>批准后的生效月份</span><input type="month" min="1900-01" max="2100-12" value={month} disabled={busy} onChange={event => setMonth(event.target.value)} /></label><label className="form-field"><span>复核理由</span><textarea required maxLength={1000} value={reviewReason} disabled={busy} onChange={event => setReviewReason(event.target.value)} /></label></div><div className={styles.actions}>{(["reject", "approve"] as const).map(decision => <button key={decision} className={`ds-button ${decision === "approve" ? "ds-button-primary" : ""}`} type="button" disabled={busy || !reviewReason.trim() || decision === "approve" && !month} onClick={() => { const body = { expectedVersion: selected.version, decision, ...(decision === "approve" ? { effectiveFrom: month } : {}), reason: reviewReason.trim() }; void write(`hr-rule-${decision}`, body, async key => { const saved = await hrApi.reviewPayrollRuleVersion(selected.id, body, getAccessToken(), key); if (alive.current) setSelected(saved); }); }}>{decision === "approve" ? "批准规则并生效" : "拒绝本版本"}</button>)}</div></> : null}</> : null}
    </section> : null}
  </section>;
}
