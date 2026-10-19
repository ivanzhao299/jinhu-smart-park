"use client";
import { useEffect, useRef, useState } from "react";
import { HR_PERMISSIONS, type FormalPayrollSourcePreparation, type FormalPayrollRunOptions, type PayrollTrialBookSelection, type PayrollTrialOptions, type PayrollTrialResult, type PayrollTrialSelection } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { createIdempotencyKey } from "../../../lib/api-client";
import { hrApi } from "../../../lib/hr-api";
import { downloadCsv } from "../../../lib/scoped-csv-export";
import { hrLoadErrorMessage } from "../hr-errors";
import { payrollTrialCsv, trialStatus } from "./payroll-trial-export";
import { ReconciliationSourcePreparation } from "./ReconciliationSourcePreparation";
import type { HrPayrollReconciliationSource } from "../../../lib/hr-api";
import styles from "./payroll-modern.module.css";
import type { PayrollRuleHandoffIntent } from "./payroll-rule-handoff";

type Book = PayrollTrialOptions["books"][number];
type Draft = { ready: boolean; selection: PayrollTrialBookSelection };
type PreparationProps = {onPrepareSource?:(source:FormalPayrollSourcePreparation|null)=>void;onPrepareRule?:(intent:PayrollRuleHandoffIntent)=>void;onWritingChange?:(writing:boolean)=>void;returnTrial?:(Pick<PayrollRuleHandoffIntent,"legacyBatchId"|"month">&{nonce?:number})|null};
export function PayrollTrialComparison(props:PreparationProps) {
  const user = useAuthUser(); return <TrialWorkspace key={JSON.stringify(user)} {...props}/>;
}
function TrialWorkspace({onPrepareSource,onPrepareRule,onWritingChange,returnTrial}:PreparationProps) {
  const [preparing,setPreparing]=useState(false);
  const restoredReturn=useRef<string|null>(null), returnAbort=useRef<AbortController|null>(null);
  const user = useAuthUser();
  const allowed = [HR_PERMISSIONS.HR_PAYROLL_MANAGE,HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ,HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_PAYROLL_RULE_READ,HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE].every(permission => hasPermission(user,permission));
  const [periods,setPeriods]=useState<PayrollTrialOptions["periods"]>([]),[period,setPeriod]=useState(""),[refresh,setRefresh]=useState(0),[selectionEpoch,setSelectionEpoch]=useState(0),[error,setError]=useState("");
  useEffect(()=>{if(!allowed)return;const abort=new AbortController();setError("");void hrApi.payrollTrialOptions({},getAccessToken(),abort.signal).then(result=>{if(!abort.signal.aborted)setPeriods(result.periods);}).catch(cause=>{if(!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"加载试算月份失败"));});return()=>abort.abort();},[allowed,refresh]);
  useEffect(()=>{if(!returnTrial||preparing)return;const value=`${returnTrial.legacyBatchId}:${returnTrial.month}:${returnTrial.nonce??"external"}`;if(restoredReturn.current===value)return;const abort=new AbortController();returnAbort.current?.abort();returnAbort.current=abort;const token=getAccessToken();setError("");void hrApi.payrollTrialOptions({},token,abort.signal).then(result=>{if(abort.signal.aborted||getAccessToken()!==token)return;const target=`${returnTrial.legacyBatchId}:${returnTrial.month}`;if(!result.periods.some(row=>`${row.legacyBatchId}:${row.month}`===target))throw new Error("原账套月份已变化或不可读取，请刷新后重新选择。");restoredReturn.current=value;setPeriods(result.periods);setPeriod(target);setSelectionEpoch(current=>current+1);}).catch(cause=>{if(!abort.signal.aborted&&getAccessToken()===token)setError(hrLoadErrorMessage(cause,"刷新原账套月份失败"));});return()=>abort.abort();},[returnTrial?.legacyBatchId,returnTrial?.month,returnTrial?.nonce,preparing]);
  if(!allowed)return null;
  const selected=periods.find(row=>`${row.legacyBatchId}:${row.month}`===period);
  return <section className={`ds-panel ${styles.workspace}`} aria-label="全账套只算不发">
    <h2>全账套只算不发</h2><p>使用已确认的现代工资输入和已批准规则，对照本月全部账套的冻结原工资。跨账套同一员工分别核对；结果供业务核对，不代表业务签署。</p>
    <label className="form-field">试算来源与月份<select value={period} disabled={preparing} onChange={event=>{onPrepareSource?.(null);setPeriod(event.target.value);setSelectionEpoch(current=>current+1);}}><option value="">请选择实际来源月份</option>{periods.map(row=><option key={`${row.legacyBatchId}:${row.month}`} value={`${row.legacyBatchId}:${row.month}`}>{row.month} · {row.recordCount} 条原工资 · {row.batchCode}</option>)}</select></label>
    <div className={styles.actions}><button className="secondary-button" disabled={preparing} onClick={()=>setRefresh(value=>value+1)}>刷新来源月份</button></div>
    {error&&<p role="alert">{error}</p>}{selected&&<MonthTrial key={`${period}:${selectionEpoch}`} legacyBatchId={selected.legacyBatchId} month={selected.month} batchLabel={selected.batchCode} onPrepareSource={onPrepareSource} onPrepareRule={onPrepareRule} onWritingChange={value=>{setPreparing(value);onWritingChange?.(value);}}/>}
  </section>;
}
function MonthTrial({legacyBatchId,month,batchLabel,onPrepareSource,onPrepareRule,onWritingChange}:{legacyBatchId:string;month:string;batchLabel:string;onWritingChange:(value:boolean)=>void}&PreparationProps) {
  const [freezing,setFreezing]=useState(false);
  const [options,setOptions]=useState<PayrollTrialOptions|null>(null),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[error,setError]=useState(""),[refresh,setRefresh]=useState(0),[validOptions,setValidOptions]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<PayrollTrialResult|null>(null),[page,setPage]=useState(1);
  const flight=useRef(false),abortRef=useRef<AbortController|null>(null),retry=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>()=>abortRef.current?.abort(),[]);
  useEffect(()=>{const abort=new AbortController();setLoading(true);setValidOptions(false);setError("");void hrApi.payrollTrialOptions({legacyBatchId,month},getAccessToken(),abort.signal).then(response=>{if(!abort.signal.aborted){if(response.legacyBatchId!==legacyBatchId||response.month!==month)throw new Error("试算来源发生变化，请刷新。");setOptions(response);setValidOptions(true);}}).catch(cause=>{if(!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"加载全部账套失败"));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[legacyBatchId,month,refresh]);
  const calculate=async()=>{
    if(flight.current||loading||!options||!validOptions)return;
    const selections=options.books.map(book=>drafts[book.bookId]);
    if(!selections.length||selections.some(row=>!row?.ready)){setError("请补齐每个账套的冻结来源、确认输入及所需资料。");return;}
    const body:PayrollTrialSelection={legacyBatchId,month,books:selections.map(row=>row!.selection)};
    const signature=JSON.stringify(body);if(retry.current?.signature!==signature)retry.current={signature,key:createIdempotencyKey("hr-payroll-trial")};
    flight.current=true;setBusy(true);setError("");setResult(null);const abort=new AbortController();abortRef.current=abort;
    try{const response=await hrApi.calculatePayrollTrial(body,getAccessToken(),retry.current.key,abort.signal);if(abort.signal.aborted)return;
      if(response.month!==month||response.legacyBatchId!==legacyBatchId||response.complete!==true||response.records.length!==response.recordCount||response.recordCount!==options.recordCount||response.employeeCount!==options.employeeCount||new Set(response.records.map(row=>`${row.bookId}:${row.sourceRecordId}`)).size!==response.recordCount||response.bookCount!==options.books.length)throw new Error("试算完整性校验失败，请重新核对全部账套。");
      setResult(response);setPage(1);
    }catch(cause){if(!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"全账套试算失败，选择已保留"));}
    finally{flight.current=false;if(!abort.signal.aborted)setBusy(false);}
  };
  return <div className={styles.workspace}>
    {options&&<p>本月全部 {options.books.length} 个账套，共 {options.recordCount} 条工资记录、{options.employeeCount} 位员工。逐账套的准备须全部完成。</p>}
    {options?.books.map(book=><TrialBook key={book.bookId} book={book} month={month} legacyBatchId={legacyBatchId} batchLabel={batchLabel} onPrepareSource={onPrepareSource} onPrepareRule={onPrepareRule} onFrozen={()=>{setResult(null);setRefresh(value=>value+1);}} onWritingChange={value=>{setFreezing(value);onWritingChange(value);}} disabled={busy||loading||freezing} onChange={draft=>{setDrafts(current=>({...current,[book.bookId]:draft}));setResult(null);}}/>)}
    <div className={styles.actions}><button className="secondary-button" disabled={busy||loading||freezing} onClick={()=>{setResult(null);setRefresh(value=>value+1);}}>刷新全部账套</button><button className="primary-button" disabled={busy||loading||freezing||!validOptions||!options||options.books.some(book=>!drafts[book.bookId]?.ready)} onClick={()=>void calculate()}>{busy?"正在完整核算…":"全账套试算并逐项核对"}</button></div>
    {loading&&<p role="status">正在读取全部账套…</p>}{error&&<p role="alert">{error}</p>}
    {result&&<section className={styles.workspace} aria-label="本次试算结果"><h3>本次完整试算结果</h3><p>{result.bookCount} 个账套 · {result.recordCount} 条记录 · {result.employeeCount} 人 · {result.comparableLineCount}/{result.lineCount} 个可比分项 · {result.differentLineCount} 个分项有差异。缺项和不可比项目需业务补齐后再次核对。</p><p>净额核对：{result.records.filter(row=>row.net.status!=="missing_source").length} 条可比，{result.records.filter(row=>row.net.status==="different").length} 条有差异，{result.records.filter(row=>row.net.status==="missing_source").length} 条缺少原净额。</p>
      <p>结果仅保留在本次页面，可导出全部记录和版本证据交吴恩国核对。真实月份须先确认规则与输入。</p>
      <div className={styles.actions}><button className="secondary-button" onClick={()=>downloadCsv(payrollTrialCsv(result),`工资只算不发-${month}.csv`)}>导出全部 {result.recordCount} 条及分项</button></div>
      <div className={`ds-mobile-record-list ${styles.records}`}>{result.records.slice((page-1)*20,page*20).map(record=><article className="ds-mobile-record" key={`${record.bookId}:${record.sourceRecordId}`}><strong>{record.bookName} · {record.fullName}（{record.employeeCode}）</strong><p>现代净额 {record.net.modernValue} · 原净额 {record.net.sourceValue??"缺失"} · 差值 {record.net.difference??"不可比"} · {trialStatus[record.net.status]}</p><details><summary>查看 {record.lines.length} 个项目</summary><dl className={styles.amounts}>{record.lines.map((line,index)=><div className={styles.project} key={index}><dt>{line.modernCode??"仅原项目"} → {line.sourceName??"无映射"} · {trialStatus[line.status]}</dt><dd>现代 {line.modernValue??"无"} / 原值 {line.sourceValue??"缺失或非数值"} / 差值 {line.difference??"不可比"}</dd></div>)}</dl></details></article>)}</div>
      <div className={styles.actions}><button className="secondary-button" disabled={page===1} onClick={()=>setPage(value=>value-1)}>上一页结果</button><span>第 {page} / {Math.max(1,Math.ceil(result.recordCount/20))} 页</span><button className="secondary-button" disabled={page*20>=result.recordCount} onClick={()=>setPage(value=>value+1)}>下一页结果</button></div>
    </section>}
  </div>;
}
function TrialBook({book,month,legacyBatchId,batchLabel,disabled,onChange,onFrozen,onWritingChange,onPrepareSource,onPrepareRule}:{book:Book;month:string;legacyBatchId:string;batchLabel:string;disabled:boolean;onChange:(draft:Draft)=>void;onFrozen:()=>void;onWritingChange:(value:boolean)=>void}&PreparationProps) {
  const [preparing,setPreparing]=useState(false),[committedSource,setCommittedSource]=useState<HrPayrollReconciliationSource|null>(null);
  const user=useAuthUser(),insuranceAllowed=[HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ].every(permission=>hasPermission(user,permission));
  const [inputId,setInputId]=useState(""),[sourceId,setSourceId]=useState(""),[attendanceId,setAttendanceId]=useState(""),[mapping,setMapping]=useState<Record<string,string>>({}),[options,setOptions]=useState<FormalPayrollRunOptions|null>(null),[insurance,setInsurance]=useState<NonNullable<PayrollTrialBookSelection["insuranceSources"]>>([]),[acceptInsurance,setAcceptInsurance]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[refresh,setRefresh]=useState(0),[page,setPage]=useState(1);
  const sources=[...book.sources,...(committedSource&&!book.sources.some(row=>row.id===committedSource.id)?[{id:committedSource.id,recordCount:committedSource.snapshotCount,itemCount:committedSource.itemCount,sourceHash:""}]:[])];
  const input=book.inputs.find(row=>row.id===inputId),notify=useRef(onChange);notify.current=onChange;
  useEffect(()=>{
    setOptions(null);setInsurance([]);setAcceptInsurance(false);if(!input)return;
    const abort=new AbortController();setLoading(true);setError("");
    void(async()=>{const all:FormalPayrollRunOptions["items"]=[];let first:FormalPayrollRunOptions|null=null;
      for(let current=1;;current++){
        const result=await hrApi.trialSourceOptions({inputId:input.id,expectedInputVersion:input.version,attendanceInputBatchId:attendanceId||undefined,page:current,pageSize:100},getAccessToken(),abort.signal);
        if(abort.signal.aborted)return;
        if(result.inputId!==input.id||result.inputVersion!==input.version||result.month!==month||result.total<1||result.total>2000||result.page!==current||result.page_size!==100||result.selectedAttendanceBatchId!==(attendanceId||null)||result.items.length!==Math.min(100,result.total-(current-1)*100)||(first&&result.total!==first.total))throw new Error("完整工资来源名单已变化，请刷新后核对。");
        first??=result;all.push(...result.items);if(all.length===result.total)break;
      }
      if(!first||new Set(all.map(row=>row.employeeId)).size!==first.total)throw new Error("工资来源名单不完整。");
      setOptions(first);setInsurance(all.flatMap(row=>row.insuranceSource?[row.insuranceSource]:[]));
    })().catch(cause=>{if(!abort.signal.aborted)setError(hrLoadErrorMessage(cause,"读取正式试算资料失败"));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[input,attendanceId,month,refresh]);
  const compensationMissing=options?.compensationCoverage?Object.entries(options.compensationCoverage).filter(([key])=>key!=="coveredCount").reduce((sum,[,count])=>sum+count,0):0;
  const ready=!!input&&!!sourceId&&sources.some(row=>row.id===sourceId)&&!!options&&options.inputId===inputId&&options.inputVersion===input.version&&!loading&&!error&&book.unavailableCount===0&&book.duplicateCount===0&&options.employeeCount===book.recordCount&&compensationMissing===0&&(!options.requires.attendance||!!attendanceId&&options.attendanceBatches.some(row=>row.id===attendanceId&&row.missingEmployeeCount===0))&&(!options.requires.insurance||insuranceAllowed&&acceptInsurance&&insurance.length===options.employeeCount);
  useEffect(()=>{notify.current({ready,selection:{bookId:book.bookId,reconciliationSourceId:sourceId,inputId,expectedInputVersion:input?.version??0,...(attendanceId?{attendanceInputBatchId:attendanceId}:{}),...(options?.requires.insurance?{insuranceSources:insurance}:{}),mappings:Object.entries(mapping).filter(([,id])=>id).map(([modernCode,sourceItemVersionId])=>({modernCode,sourceItemVersionId}))}});},[ready,book.bookId,sourceId,inputId,input?.version,attendanceId,options,insurance,mapping]);
  return <fieldset className={`ds-panel ${styles.workspace}`} disabled={disabled}><legend>{book.bookName}（账套 {book.scheme}）· {book.recordCount} 条 / {book.employeeCount} 人</legend>
    {(book.unavailableCount>0||book.duplicateCount>0)&&<p role="alert">来源有 {book.unavailableCount} 条不可用记录、{book.duplicateCount} 条同账套重复人员记录，请先处理来源。</p>}
    <div className={styles.fields}><label className="form-field">冻结原工资来源<select value={sourceId} onChange={event=>{onPrepareSource?.(null);setSourceId(event.target.value);}}><option value="">请选择经复核的冻结来源</option>{sources.map((row,index)=><option key={row.id} value={row.id}>已冻结来源 {index+1} · {row.recordCount} 条 · {row.itemCount} 项</option>)}</select>{!sources.length&&<span>请先在下方预览并冻结此账套来源。</span>}</label>
      <label className="form-field">现代确认输入<select value={inputId} onChange={event=>{setInputId(event.target.value);setAttendanceId("");setMapping({});setPage(1);}}><option value="">请选择已确认输入</option>{book.inputs.map(row=><option key={row.id} value={row.id}>{row.ruleName} · 输入第 {row.revisionNo} 版 · {row.employeeCount} 人</option>)}</select>{!book.inputs.length&&<span>请先关联本账套规则，批准规则并确认本月完整员工输入。</span>}</label></div>
    <div className={styles.actions}>{hasPermission(user,HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW)&&<button className="secondary-button" onClick={()=>setPreparing(value=>!value)}>{preparing?"收起来源准备":"预览并冻结本账套来源"}</button>}{onPrepareSource&&<button className="secondary-button" disabled={!sourceId||!sources.some(row=>row.id===sourceId)} onClick={()=>{const source=sources.find(row=>row.id===sourceId)!;onPrepareSource({reconciliationSourceId:source.id,legacyBatchId,bookId:book.bookId,bookName:book.bookName,month,recordCount:source.recordCount});document.getElementById("payroll-preparation-heading")?.scrollIntoView?.({behavior:"smooth",block:"start"});}}>准备本账套完整员工输入</button>}{onPrepareRule&&hasPermission(user,HR_PERMISSIONS.HR_PAYROLL_RULE_READ)&&hasPermission(user,HR_PERMISSIONS.HR_PAYROLL_MANAGE)&&<button className="secondary-button" disabled={disabled} onClick={()=>onPrepareRule({legacyBatchId,month,bookId:book.bookId,bookName:book.bookName,scheme:book.scheme})}>准备本账套工资规则</button>}</div>
    {preparing&&<ReconciliationSourcePreparation context={{legacyBatchId,bookId:book.bookId,bookName:book.bookName,month,batchLabel}} onWritingChange={onWritingChange} onPrepared={source=>{onPrepareSource?.(null);setCommittedSource(source);setSourceId(source.id);onFrozen();}}/>}
    {options?.requires.attendance&&<label className="form-field">试算考勤来源<select value={attendanceId} onChange={event=>setAttendanceId(event.target.value)}><option value="">请选择当月已封账考勤</option>{options.attendanceBatches.map(row=><option key={row.id} value={row.id}>批次 {row.batchNo} · 缺 {row.missingEmployeeCount} 人</option>)}</select></label>}
    {compensationMissing>0&&<p role="alert">{compensationMissing} 位员工的现行薪酬资料或有效区间待补齐。</p>}
    {options?.requires.insurance&&<label className="form-field"><span>此规则引用保险金额：已找到 {insurance.length}/{options.employeeCount} 位员工的当月确认版本。</span>{!insuranceAllowed?<span>还需要保险读取及金额读取权限。</span>:insurance.length!==options.employeeCount?<span>请先补齐当月保险确认资料，不会按零计算。</span>:<span><input type="checkbox" checked={acceptInsurance} onChange={event=>setAcceptInsurance(event.target.checked)}/>采用已读取的全部当月确认保险版本</span>}</label>}
    {input&&<><h4>明确项目映射</h4><p>按用途核对后逐项选择原项目版本。未映射项目和仅原项目会保留并标记不可比。</p><div className={styles.fields}>{input.definition.items.slice((page-1)*20,page*20).map(item=><label className="form-field" key={item.code}>{item.code} → 原项目<select value={mapping[item.code]??""} onChange={event=>setMapping(current=>({...current,[item.code]:event.target.value}))}><option value="">未映射（保留不可比）</option>{book.items.map(old=><option value={old.id} key={old.id}>{old.name} · {old.code} · v{old.versionNo} · {{decimal:"数值",text:"文本",date:"日期"}[old.valueType]??"未知类型"}</option>)}</select></label>)}</div>{input.definition.items.length>20&&<div className={styles.actions}><button className="secondary-button" disabled={page===1} onClick={()=>setPage(value=>value-1)}>上一页项目</button><span>第 {page} 页</span><button className="secondary-button" disabled={page*20>=input.definition.items.length} onClick={()=>setPage(value=>value+1)}>下一页项目</button></div>}<div className={styles.actions}><button className="secondary-button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>刷新本账套计算资料</button></div></>}
    {loading&&<p role="status">读取完整计算资料…</p>}{error&&<p role="alert">{error}</p>}<p>{ready?"本账套准备完成":"本账套尚待准备"}</p>
  </fieldset>;
}
