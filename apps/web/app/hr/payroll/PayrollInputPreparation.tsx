"use client";

import { useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS, type FormalPayrollSourcePreparation, type FormalPayrollCorrectionPreparation, type FormalPayrollEmployeeInput, type FormalPayrollPreparation, type FormalPayrollRuleSet } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrPayrollPeriod } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import { PayrollInputBulkCsv } from "./PayrollInputBulkCsv";
import { collectScopedExport } from "../../../lib/scoped-csv-export";
import { payrollInputReviewIntent, type PayrollInputReviewIntent } from "./payroll-input-handoff";
import styles from "./payroll-modern.module.css";

type Candidate = FormalPayrollPreparation["items"][number];
type Selection = { employee: Candidate; input: FormalPayrollEmployeeInput; explicit: boolean };
type SourcePreview = { rows: Candidate[]; identity: string; draftFingerprint: string; replaceExisting: boolean; acknowledged: boolean; page: number };
type Props = { source?:FormalPayrollSourcePreparation|null;onExitSource?:()=>void; correction?: FormalPayrollCorrectionPreparation | null; onExitCorrection?: () => void; onViewDraft?: (intent: PayrollInputReviewIntent) => void };
const candidateMetadata = ({ sourceValues: _sourceValues, ...candidate }: Candidate) => candidate;
export function PayrollInputPreparation(props: Props) {
  const user = useAuthUser(); return <PreparationWorkspace key={`${JSON.stringify(user)}:${props.correction?.windowId ?? JSON.stringify(props.source) ?? "ordinary"}`} {...props}/>;
}
function PreparationWorkspace({ source,onExitSource,correction, onExitCorrection, onViewDraft }: Props) {
  const user = useAuthUser();
  const canPrepare = [HR_PERMISSIONS.HR_PAYROLL_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ].every(permission => hasPermission(user, permission));
  const canReadSourceValues = hasPermission(user, HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ);
  const [periods, setPeriods] = useState<HrPayrollPeriod[]>([]), [periodId, setPeriodId] = useState(correction?.periodId ?? "");
  const [rules, setRules] = useState<FormalPayrollRuleSet[]>([]), [ruleId, setRuleId] = useState(correction?.ruleSetId ?? ""), [rulePage, setRulePage] = useState(1), [ruleTotal, setRuleTotal] = useState(0);
  const [query, setQuery] = useState(""), [keyword, setKeyword] = useState(""), [page, setPage] = useState(1);
  const [data, setData] = useState<FormalPayrollPreparation | null>(null), [chosen, setChosen] = useState<Record<string, Selection>>({}), [selectionPage, setSelectionPage] = useState(1), [sourcePreview, setSourcePreview] = useState<SourcePreview | null>(null);
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [savedIntent, setSavedIntent] = useState<PayrollInputReviewIntent | null>(null), [refresh, setRefresh] = useState(0);
  const bulkAbort=useRef<AbortController|null>(null), previewApplyAbort=useRef<AbortController|null>(null), sourceIdentity=useRef<string|null>(null), sourceRulesAbort=useRef<AbortController|null>(null);
  const alive = useRef(true), lock = useRef(false), ruleIdentity = useRef<string | null>(null), retry = useRef<{ signature: string; key: string } | null>(null), draftFingerprint = useRef("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; bulkAbort.current?.abort(); previewApplyAbort.current?.abort(); sourceRulesAbort.current?.abort(); }; }, []);
  useEffect(() => {
    if (!canPrepare || correction) return;
    const abort = new AbortController();
    void hrApi.payrollPeriods(getAccessToken(), abort.signal).then(rows => { if (!abort.signal.aborted) setPeriods(rows.filter(row => row.status === "open" && (!source || row.periodMonth.slice(0,7)===source.month))); }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载工资期间失败")); });
    return () => abort.abort();
  }, [canPrepare, correction,source]);
  useEffect(() => {
    if (!canPrepare || correction) return;
    const abort = new AbortController(); sourceRulesAbort.current?.abort(); sourceRulesAbort.current = abort; setRules([]);
    const token = getAccessToken();
    if (source) {
      void collectScopedExport(page => hrApi.payrollRules({ page, pageSize: 100 }, token, abort.signal), () => alive.current && !abort.signal.aborted && getAccessToken() === token, { pageSize: 100, limit: 2000, label: "工资规则" }).then(result => {
        if (abort.signal.aborted || !result) return;
        const scoped = result.filter(row => row.sourceBookId === source.bookId);
        setRules(scoped); setRuleTotal(scoped.length);
      }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载工资规则失败")); });
    } else {
      void hrApi.payrollRules({ page: rulePage, pageSize: 20 }, token, abort.signal).then(result => {
        if (!abort.signal.aborted) { setRules(result.items); setRuleTotal(result.total); }
      }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载工资规则失败")); });
    }
    return () => abort.abort();
  }, [canPrepare, rulePage, correction,source]);
  useEffect(() => {
    if (!canPrepare || !periodId || !ruleId) return;
    const abort = new AbortController(); setLoading(true); setData(null); setError("");
    void hrApi.payrollPreparation({ periodId, ruleSetId: ruleId, keyword, page, pageSize: 20, ...(correction ? { correctionWindowId: correction.windowId } : {}),...(source?{reconciliationSourceId:source.reconciliationSourceId}:{}) }, getAccessToken(), abort.signal).then(result => {
      if (abort.signal.aborted) return;
      if (source) {
        validateSourcePage(result, page, 20, false);
        const identity=preparationIdentity(result);
        if(sourceIdentity.current&&sourceIdentity.current!==identity){setChosen({});setReason("");retry.current=null;setError("来源、名单或输入版本已变化，请重新带入完整员工并填写项目。");}
        sourceIdentity.current=identity;
      }
      if (correction && (result.correctionWindowId !== correction.windowId || result.rule.ruleSetId !== correction.ruleSetId || result.correctionOfRunId !== correction.originalRunId || !Number.isSafeInteger(result.correctionEmployeeCount) || result.correctionEmployeeCount! < 1)) { setData(null); setError("更正窗口已变化，请刷新期间状态后继续。"); return; }
      if (ruleIdentity.current && ruleIdentity.current !== result.rule.id) { setChosen({}); setReason(""); setError("生效规则已变化，请按新规则重新选择员工和填写项目。"); }
      ruleIdentity.current = result.rule.id; setData(result);
    }).catch(cause => { if (!abort.signal.aborted) setError(hrLoadErrorMessage(cause, "加载当期员工准备失败")); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [canPrepare, periodId, ruleId, keyword, page, refresh, correction,source]);
  const reset = () => { bulkAbort.current?.abort();previewApplyAbort.current?.abort();sourceIdentity.current=null;ruleIdentity.current = null; setChosen({}); setSelectionPage(1); setSourcePreview(null); setReason(""); setData(null); setPage(1); setQuery(""); setKeyword(""); setSaved(false); setSavedIntent(null); setNotice(""); setError(""); retry.current = null; };
  const change = (id: string, update: (value: Selection) => Selection) => { if (!lock.current && !saved) { setSourcePreview(null); setChosen(values => ({ ...values, [id]: update(values[id]!) })); } };
  const preparationIdentity = (value:FormalPayrollPreparation) => JSON.stringify({period:value.period,rule:value.rule,head:value.expectedHeadRevision,source:value.source});
  const validateSourcePage = (value:FormalPayrollPreparation, current:number,size:number,full:boolean) => {
    const binding=value.source;
    if(!source||!binding||binding.reconciliationSourceId!==source.reconciliationSourceId||binding.legacyBatchId!==source.legacyBatchId||binding.bookId!==source.bookId||binding.month!==source.month||binding.recordCount!==source.recordCount||!Number.isSafeInteger(binding.recordCount)||binding.recordCount<1||binding.recordCount>2000||!/^[a-f0-9]{64}$/.test(binding.sourceHash)||!/^[a-f0-9]{64}$/.test(binding.rosterHash)||value.period.id!==periodId||value.period.month!==source.month||value.rule.ruleSetId!==ruleId||value.correctionWindowId||value.page!==current||value.page_size!==size||!Number.isSafeInteger(value.total)||value.total<0||value.total>binding.recordCount||(full&&value.total!==binding.recordCount)||value.items.length!==Math.max(0,Math.min(size,value.total-(current-1)*size))||value.items.some(row=>!row.employeeId||!Number.isSafeInteger(row.expectedEmployeeVersion)||row.expectedEmployeeVersion<1))throw new Error("冻结来源或完整员工名单已变化，请刷新后重新核对。");
  };
  const sourceDraftFingerprint = () => JSON.stringify(Object.values(chosen).map(value => [value.input.employeeId, value.input.expectedEmployeeVersion, value.input.directItems, value.explicit, value.input.settlementStart, value.input.settlementEnd, value.input.eligibilityReason]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
  draftFingerprint.current=sourceDraftFingerprint();
  const selectCompleteRoster = async () => {
    if(!source||!data||lock.current||loading||saved)return;
    const baseline=preparationIdentity(data),controller=new AbortController();bulkAbort.current?.abort();bulkAbort.current=controller;
    lock.current=true;setBusy(true);setError("");
    try {
      const all:Candidate[]=[];let first:FormalPayrollPreparation|null=null;
      for(let current=1;;current++) {
        const result=await hrApi.payrollPreparation({periodId,ruleSetId:ruleId,reconciliationSourceId:source.reconciliationSourceId,page:current,pageSize:100},getAccessToken(),controller.signal);
        if(controller.signal.aborted)return;
        validateSourcePage(result,current,100,true);
        if(preparationIdentity(result)!==baseline)throw new Error("来源、规则、员工或输入头版本已变化，本次未带入任何名单，请刷新后重试。");
        first??=result;all.push(...result.items);if(all.length===result.total)break;
      }
      if(!first||new Set(all.map(row=>row.employeeId)).size!==source.recordCount)throw new Error("员工名单重复或不完整，本次未带入任何名单。");
      const directCodes=first.rule.definition.items.filter(item=>item.expression===null).map(item=>item.code);
      setSourcePreview(null);setChosen(current=>Object.fromEntries(all.map(employee=>{const old=current[employee.employeeId];return [employee.employeeId,old&&JSON.stringify(candidateMetadata(old.employee))===JSON.stringify(candidateMetadata(employee))?old:{employee,explicit:employee.requiresSettlementWindow,input:{employeeId:employee.employeeId,expectedEmployeeVersion:employee.expectedEmployeeVersion,directItems:Object.fromEntries(directCodes.map(code=>[code,""]))}}];})));
      setSelectionPage(1);setNotice(`已带入本账套全部 ${all.length} 位员工；请逐项填写金额，零值也需明确填写。`);
    } catch(cause) {if(!controller.signal.aborted)setError(hrLoadErrorMessage(cause,"读取完整名单失败，原草稿已保留"));}
    finally {lock.current=false;if(!controller.signal.aborted)setBusy(false);}
  };
  const previewSourceValues = async () => {
    if(!source||!data||lock.current||loading||saved)return;
    const baseline=preparationIdentity(data),controller=new AbortController();bulkAbort.current?.abort();bulkAbort.current=controller;
    lock.current=true;setBusy(true);setError("");
    try {
      const all:Candidate[]=[];let first:FormalPayrollPreparation|null=null;
      for(let current=1;;current++) {
        const result=await hrApi.payrollPreparation({periodId,ruleSetId:ruleId,reconciliationSourceId:source.reconciliationSourceId,includeSourceValues:true,page:current,pageSize:100},getAccessToken(),controller.signal);
        if(controller.signal.aborted)return;
        validateSourcePage(result,current,100,true);
        if(preparationIdentity(result)!==baseline)throw new Error("来源、规则、员工或输入头版本已变化，本次未带入任何名单，请刷新后重试。");
        first??=result;all.push(...result.items);if(all.length===result.total)break;
      }
      if(!first||new Set(all.map(row=>row.employeeId)).size!==source.recordCount)throw new Error("员工名单重复或不完整，本次未带入任何名单。");
      const directCodes=first.rule.definition.items.filter(item=>item.expression===null).map(item=>item.code).sort();
      if(all.some(employee=>!employee.sourceValues||Object.keys(employee.sourceValues.values).some(code=>!directCodes.includes(code))||employee.sourceValues.issues.some(issue=>!directCodes.includes(issue.code))))throw new Error("来源数值预览不完整，未修改草稿。");
      setSourcePreview({rows:all,identity:baseline,draftFingerprint:draftFingerprint.current,replaceExisting:false,acknowledged:false,page:1});
      setNotice(`已读取本账套全部 ${all.length} 位员工的来源数值。请核对缺项后明确带入；尚未修改草稿。`);
    } catch(cause) {if(!controller.signal.aborted)setError(hrLoadErrorMessage(cause,"读取完整名单失败，原草稿已保留"));}
    finally {lock.current=false;if(!controller.signal.aborted)setBusy(false);}
  };
  const applySourcePreview = async () => {
    if(!sourcePreview||!data||!source||lock.current||saved||loading||sourcePreview.identity!==preparationIdentity(data)||sourcePreview.draftFingerprint!==draftFingerprint.current) { setSourcePreview(null);setError("来源数值预览已过期，未修改草稿，请重新读取。");return; }
    const token=getAccessToken(),controller=new AbortController();previewApplyAbort.current?.abort();previewApplyAbort.current=controller;lock.current=true;setBusy(true);setError("");
    try {
      const current=await hrApi.payrollPreparation({periodId,ruleSetId:ruleId,reconciliationSourceId:source.reconciliationSourceId,page:1,pageSize:1},token,controller.signal);
      if(controller.signal.aborted||!alive.current||getAccessToken()!==token)return;
      validateSourcePage(current,1,1,false);
      if(preparationIdentity(current)!==sourcePreview.identity)throw new Error("来源、名单、规则或输入版本已变化，未修改草稿。");
      if(sourcePreview.draftFingerprint!==draftFingerprint.current)throw new Error("来源数值预览已过期，未修改草稿。");
      const directCodes=data.rule.definition.items.filter(item=>item.expression===null).map(item=>item.code);
      setChosen(existing=>Object.fromEntries(sourcePreview.rows.map(employee=>{
        const old=existing[employee.employeeId]; const directItems=Object.fromEntries(directCodes.map(code=>{
          const prior=old?.input.directItems[code] ?? "", sourceValue=employee.sourceValues?.values[code];
          return [code,sourcePreview.replaceExisting ? (sourceValue ?? prior) : (prior || sourceValue || "")];
        }));
        return [employee.employeeId,{employee,explicit:old?.explicit ?? employee.requiresSettlementWindow,input:{employeeId:employee.employeeId,expectedEmployeeVersion:employee.expectedEmployeeVersion,directItems,...(old ? {settlementStart:old.input.settlementStart,settlementEnd:old.input.settlementEnd,eligibilityReason:old.input.eligibilityReason}: {})}}];
      })));
      setSelectionPage(1);setSourcePreview(null);setNotice("已带入来源可用数值；缺失、空值和非数值项目未覆盖现有草稿。请检查后保存。");
    } catch(cause) { if(!controller.signal.aborted&&alive.current) { setSourcePreview(null);setError(hrLoadErrorMessage(cause,"来源数值已变化，未修改草稿")); } }
    finally { lock.current=false;if(!controller.signal.aborted&&alive.current)setBusy(false); }
  };
  const save = async () => {
    if (lock.current || saved || !data || loading) return;
    const employees = Object.values(chosen).map(value => ({ ...value.input, ...(value.explicit ? {} : { settlementStart: undefined, settlementEnd: undefined, eligibilityReason: undefined }) }));
    if (!employees.length || employees.length > 2000 || !reason.trim()) { setError("请选择 1 至 2000 位员工并填写准备说明。"); return; }
    if (source && employees.length!==data.source?.recordCount) {setError("来源准备须保留本账套完整名单，请带入全部员工。");return;}
    if (correction && employees.length !== data.correctionEmployeeCount) { setError(`更正须保留原完整名单，请选择全部 ${data.correctionEmployeeCount} 位员工。`); return; }
    if (employees.some(employee => Object.values(employee.directItems).some(value => !/^-?\d{1,16}(?:\.\d{1,4})?$/u.test(value)))) { setError("请完整填写每位员工的直接输入项目，最多四位小数；零值也需明确填写。"); return; }
    if (Object.values(chosen).some(value => value.explicit && (!value.input.settlementStart || !value.input.settlementEnd || !value.input.eligibilityReason?.trim() || value.input.settlementStart < data.period.startDate || value.input.settlementEnd > data.period.endDate || value.input.settlementStart > value.input.settlementEnd))) { setError("补结算必须填写期间内的开始、结束日期和理由。"); return; }
    const body = { periodId, ...(correction ? { correctionWindowId: correction.windowId } : {}), ruleSetId: ruleId, ruleVersionId: data.rule.id, expectedHeadRevision: data.expectedHeadRevision, employees, reason: reason.trim() }, signature = JSON.stringify(body);
    if (retry.current?.signature !== signature) retry.current = { signature, key: createIdempotencyKey("hr-payroll-input") };
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await hrApi.createPayrollInput(body, getAccessToken(), retry.current.key);
      if (alive.current) {
        const intent = payrollInputReviewIntent(result, { periodId, ruleSetId: ruleId, ruleVersionId: data.rule.id, employeeCount: employees.length }, source ? { legacyBatchId: source.legacyBatchId, month: source.month } : undefined);
        if (!intent) throw new Error("保存回执与当前期间或规则不一致，请重新读取后核对输入批次。");
        setSavedIntent(intent); setSaved(true); setNotice(`第 ${result.revisionNo} 版输入草稿已保存。请先查看本次输入草稿；不会自动确认。`); retry.current = null;
      }
    } catch (cause) { if (alive.current) setError(hrLoadErrorMessage(cause, "保存工资输入失败")); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (!canPrepare) return null;
  const selections = Object.values(chosen), direct = data?.rule.definition.items.filter(item => item.expression === null) ?? [];
  return <section className={`ds-panel ${styles.workspace}`} aria-labelledby="payroll-preparation-heading">
    {source&&<div className={styles.actions}><p>{source.month} · {source.bookName} · 冻结来源完整名单 {source.recordCount} 人。来源仅用于本次准备范围，不自动填写金额或确认输入。</p><button className="secondary-button" disabled={busy} onClick={onExitSource}>退出账套来源准备</button></div>}
    <h2 id="payroll-preparation-heading">{correction ? "准备更正工资输入" : "准备工资输入"}</h2>{correction ? <div className={styles.actions}><p>{correction.month} · 更正原第 {correction.originalRunNo} 批 · {correction.ruleName}</p><button className="secondary-button" disabled={busy} onClick={onExitCorrection}>返回普通工资准备</button></div> : null}<p>选择当期员工并填写规则要求的项目。没有默认零值；需要补结算的员工填写明确日期和理由。</p>
    <div className={styles.fields}><label className="form-field"><span>工资期间</span><select value={periodId} disabled={busy || Boolean(correction)} onChange={event => { if (!lock.current) { reset(); setPeriodId(event.target.value); } }}><option value="">请选择期间</option>{correction ? <option value={correction.periodId}>{correction.month} · 更正期间</option> : null}{periods.map(row => <option key={row.id} value={row.id}>{row.periodMonth.slice(0, 7)}</option>)}</select></label><label className="form-field"><span>工资规则</span><select value={ruleId} disabled={busy || Boolean(correction)} onChange={event => { if (!lock.current) { reset(); setRuleId(event.target.value); } }}><option value="">请选择规则</option>{correction ? <option value={correction.ruleSetId}>{correction.ruleName}</option> : null}{rules.map(row => <option key={row.id} value={row.id}>{row.displayName}</option>)}</select></label></div>
    {!correction ? <div className={styles.actions}><button className="secondary-button" disabled={busy || rulePage <= 1} onClick={() => { reset(); setRuleId(""); setRulePage(value => value - 1); }}>规则上一页</button><span>规则第 {rulePage} / {Math.max(1, Math.ceil(ruleTotal / 20))} 页</span><button className="secondary-button" disabled={busy || rulePage * 20 >= ruleTotal} onClick={() => { reset(); setRuleId(""); setRulePage(value => value + 1); }}>规则下一页</button></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    {periodId && ruleId ? <><form className={styles.actions} onSubmit={event => { event.preventDefault(); if (!lock.current) { setKeyword(query.trim()); setPage(1); setRefresh(value => value + 1); } }}><label className="form-field"><span>搜索员工</span><input value={query} maxLength={100} disabled={busy || saved} onChange={event => setQuery(event.target.value)}/></label><button className="secondary-button" disabled={busy || saved}>查询员工</button></form>{loading ? <p>正在读取员工和生效规则…</p> : null}</> : null}
    {source&&data&&<div className={styles.actions}><button className="secondary-button" disabled={busy||loading||saved} onClick={()=>void selectCompleteRoster()}>带入本账套全部 {source.recordCount} 位员工</button>{canReadSourceValues?<button className="secondary-button" disabled={busy||loading||saved} onClick={()=>void previewSourceValues()}>预览本账套全部 {source.recordCount} 位员工来源数值</button>:<span>需要园区历史工资读取权限才能预览来源数值。</span>}<button className="secondary-button" disabled={busy||saved} onClick={()=>{setSourcePreview(null);setRefresh(value=>value+1);}}>刷新来源名单</button></div>}
    {sourcePreview ? <section className={`ds-panel ${styles.workspace} ${styles.bulkInput}`} aria-label="来源数值预览"><h3>来源数值预览 · {sourcePreview.rows.length} 位员工</h3><p>预览不会保存或确认。缺失、来源空值、非数值和歧义项目不会填零，也不会清除已有人工输入。</p><label><input type="checkbox" checked={sourcePreview.replaceExisting} onChange={event=>setSourcePreview(value=>value?{...value,replaceExisting:event.target.checked,acknowledged:false}:value)}/>明确以可用来源数值覆盖已有人工输入</label><div className={`ds-mobile-record-list ${styles.records}`}>{sourcePreview.rows.slice((sourcePreview.page-1)*20,sourcePreview.page*20).map(row=><article className="ds-mobile-record" key={row.employeeId}><strong>{row.fullName} · {row.employeeCode}</strong>{(data?.rule.definition.items.filter(item=>item.expression===null).map(item=>item.code)??[]).map(code=>{const current=chosen[row.employeeId]?.input.directItems[code]??"",fromSource=row.sourceValues?.values[code],next=sourcePreview.replaceExisting?(fromSource??current):(current||fromSource||"");return <span key={code}>{code}：当前 {current||"空白"} → 来源 {fromSource??"不可用"} → 本次带入 {next||"保持空白"}</span>;})}{row.sourceValues?.issues.map(issue=><span key={`issue-${issue.code}`}>{issue.code}：{issue.reason==="missing"?"缺失":issue.reason==="source_null"?"来源为空":issue.reason==="non_decimal"?"非数值":"歧义"}</span>)}</article>)}</div><div className={styles.actions}><button className="secondary-button" disabled={busy||sourcePreview.page<=1} onClick={()=>setSourcePreview(value=>value?{...value,page:value.page-1}:value)}>预览上一页</button><span>预览第 {sourcePreview.page} / {Math.max(1,Math.ceil(sourcePreview.rows.length/20))} 页</span><button className="secondary-button" disabled={busy||sourcePreview.page*20>=sourcePreview.rows.length} onClick={()=>setSourcePreview(value=>value?{...value,page:value.page+1}:value)}>预览下一页</button></div><label><input type="checkbox" disabled={busy} checked={sourcePreview.acknowledged} onChange={event=>setSourcePreview(value=>value?{...value,acknowledged:event.target.checked}:value)}/>我已核对完整来源预览并确认带入本地草稿</label><button className="primary-button" disabled={!sourcePreview.acknowledged||busy||loading||saved} onClick={()=>void applySourcePreview()}>带入当前本地草稿</button></section> : null}
    {data ? <><p>{data.rule.displayName} · {data.period.month} · 结算期间 {data.period.startDate} 至 {data.period.endDate}</p><div className={`ds-mobile-record-list ${styles.records}`}>{data.items.map(employee => <article className="ds-mobile-record" key={employee.employeeId}><strong>{employee.fullName} · {employee.employeeCode}</strong><span>{employee.requiresSettlementWindow ? "需明确补结算日期和理由" : `结算范围 ${employee.eligibility!.eligibleStart} 至 ${employee.eligibility!.eligibleEnd}`}</span><label><input type="checkbox" checked={Boolean(chosen[employee.employeeId])} disabled={busy || saved || (!chosen[employee.employeeId] && selections.length >= 2000)} onChange={event => { if (lock.current || saved) return; const checked = event.target.checked; setSourcePreview(null); setChosen(values => { const next = { ...values }; if (checked) next[employee.employeeId] = { employee, explicit: employee.requiresSettlementWindow, input: { employeeId: employee.employeeId, expectedEmployeeVersion: employee.expectedEmployeeVersion, directItems: Object.fromEntries(direct.map(item => [item.code, ""])) } }; else delete next[employee.employeeId]; return next; }); }}/>{`选择 ${employee.fullName}（${employee.employeeCode}）`}</label></article>)}</div><div className={styles.actions}><button className="secondary-button" disabled={busy || loading || saved || page <= 1} onClick={() => setPage(value => value - 1)}>候选上一页</button><span>第 {page} / {Math.max(1, Math.ceil(data.total / 20))} 页 · 共 {data.total} 位员工</span><button className="secondary-button" disabled={busy || loading || saved || page * 20 >= data.total} onClick={() => setPage(value => value + 1)}>候选下一页</button></div></> : null}
    <h3>已选员工 · {selections.length} 人</h3>
    {data && selections.length ? <PayrollInputBulkCsv context={{
      binding: JSON.stringify({ scope: [user?.tenant_id, user?.park_id], period: data.period.id, rule: data.rule.id,
        ruleSet: data.rule.ruleSetId, head: data.expectedHeadRevision, source: data.source, correction: correction?.windowId }),
      month: data.period.month, ruleName: data.rule.displayName, revisionLabel: `准备第${data.expectedHeadRevision + 1}版输入`,
    }} employees={selections.map(value => ({ ...value.input, employeeCode: value.employee.employeeCode, fullName: value.employee.fullName }))}
      draftKey={JSON.stringify([reason, selections.map(value => value.explicit)])} disabled={busy || loading || saved}
      onApply={preview => {
        if (lock.current || saved || loading || !data || preview.updates.length !== selections.length) return false;
        const values = new Map(preview.updates.map(row => [row.employeeId, row.directItems]));
        if (values.size !== selections.length || selections.some(row => !values.has(row.input.employeeId))) return false;
        setChosen(current => Object.fromEntries(Object.entries(current).map(([id, row]) => [id,
          values.has(id) ? { ...row, input: { ...row.input, directItems: values.get(id)! } } : row])));
        setSelectionPage(1); setNotice(`已将表中 ${preview.changedCells} 个金额带入当前草稿，请检查后保存。`); return true;
      }} /> : null}
    <div className={`ds-mobile-record-list ${styles.records}`}>{selections.slice((selectionPage - 1) * 20, selectionPage * 20).map(value => <article className="ds-mobile-record" key={value.input.employeeId}><strong>{value.employee.fullName} · {value.employee.employeeCode}</strong><div className={styles.fields}>{Object.keys(value.input.directItems).map(code => <label className="form-field" key={code}><span>{value.employee.fullName} · {code}</span><input type="number" step="0.0001" min="-9999999999999999.9999" max="9999999999999999.9999" required value={value.input.directItems[code]} disabled={busy || saved} onFocus={event => event.target.select()} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, directItems: { ...old.input.directItems, [code]: event.target.value } } }))}/></label>)}</div><label><input type="checkbox" checked={value.explicit} disabled={busy || saved || value.employee.requiresSettlementWindow} onChange={event => change(value.input.employeeId, old => ({ ...old, explicit: event.target.checked }))}/>明确补结算范围</label>{value.explicit ? <div className={styles.fields}><label className="form-field"><span>{value.employee.fullName} · 结算开始</span><input type="date" required min={data?.period.startDate} max={data?.period.endDate} value={value.input.settlementStart ?? ""} disabled={busy || saved} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, settlementStart: event.target.value } }))}/></label><label className="form-field"><span>{value.employee.fullName} · 结算结束</span><input type="date" required min={value.input.settlementStart || data?.period.startDate} max={data?.period.endDate} value={value.input.settlementEnd ?? ""} disabled={busy || saved} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, settlementEnd: event.target.value } }))}/></label><label className="form-field"><span>{value.employee.fullName} · 补结算理由</span><textarea required maxLength={500} value={value.input.eligibilityReason ?? ""} disabled={busy || saved} onChange={event => change(value.input.employeeId, old => ({ ...old, input: { ...old.input, eligibilityReason: event.target.value } }))}/></label></div> : null}<button className="secondary-button" disabled={busy || saved} onClick={() => { if (!lock.current) setChosen(values => { const next = { ...values }; delete next[value.input.employeeId]; return next; }); }}>移除 {value.employee.fullName}</button></article>)}</div>
    <div className={styles.actions}><button className="secondary-button" disabled={busy || selectionPage <= 1} onClick={() => setSelectionPage(value => value - 1)}>已选上一页</button><span>已选第 {selectionPage} / {Math.max(1, Math.ceil(selections.length / 20))} 页</span><button className="secondary-button" disabled={busy || selectionPage * 20 >= selections.length} onClick={() => setSelectionPage(value => value + 1)}>已选下一页</button></div>
    <label className="form-field"><span>工资准备说明</span><textarea required maxLength={1000} value={reason} disabled={busy || saved} onChange={event => setReason(event.target.value)}/></label><div className={styles.actions}><button className="primary-button" disabled={busy || saved || loading || !data || !selections.length || !reason.trim()} onClick={() => void save()}>保存工资输入草稿</button>{saved ? <><button className="secondary-button" disabled={busy || !savedIntent} onClick={() => { if (!lock.current && savedIntent) onViewDraft?.(savedIntent); }}>查看本次输入草稿</button><button className="secondary-button" onClick={() => { reset(); setRefresh(value => value + 1); }}>准备下一版输入</button></> : null}</div>
  </section>;
}
