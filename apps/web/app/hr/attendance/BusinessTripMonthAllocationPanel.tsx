"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { hrApi, type HrAttendanceRequest, type HrBusinessTripMonthAllocationEntry, type HrBusinessTripMonthAllocationRecord, type HrBusinessTripMonthAllocationSnapshot } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import { ApiError } from "../../../lib/api-client";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "../hr-workbench.module.css";
import local from "./request-workflow.module.css";

type Draft={reason:string;days:Record<string,string>;token:string;version:number};
type Attempt={body:{expectedVersion:number;reason:string;allocations:HrBusinessTripMonthAllocationEntry[]};key:string;token:string|undefined};
type Receipt={id:string;declaredDays:number|null;amendVersion:number};
const MAX_DAYS=2147483647;
function object(value:unknown):Record<string,unknown>|null{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function validMonth(value:unknown):value is string{return typeof value==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);}
function validMonths(value:unknown,allowEmpty=false):value is string[]{
 if(!Array.isArray(value)||(!allowEmpty&&(value.length<1||value.length>3))||value.length>3||value.some(month=>!validMonth(month))||new Set(value).size!==value.length)return false;
 for(let i=1;i<value.length;i++){const [py,pm]=value[i-1]!.split("-").map(Number),[y,m]=value[i]!.split("-").map(Number);if(y*12+m!==py*12+pm+1)return false;}
 return true;
}
function validDays(value:unknown):value is number{return Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=MAX_DAYS;}
function validInstant(value:unknown):value is string{return typeof value==="string"&&Number.isFinite(Date.parse(value));}
function validRecord(value:unknown,months?:string[]):value is HrBusinessTripMonthAllocationRecord{
 const row=object(value);if(!row||typeof row.id!=="string"||!Number.isSafeInteger(row.requestVersion)||Number(row.requestVersion)<1||!validDays(row.declaredDays)||typeof row.reason!=="string"||!row.reason.trim()||typeof row.createdAt!=="string"||!Number.isFinite(Date.parse(row.createdAt))||!Array.isArray(row.allocations))return false;
 const allocations=row.allocations as unknown[];if(!validMonths(allocations.map(item=>object(item)?.month),false)||allocations.some(item=>{const entry=object(item);return !entry||!validDays(entry.days);}))return false;
 const allocationMonths=allocations.map(item=>String(object(item)!.month));if(months&&(allocationMonths.length!==months.length||allocationMonths.some((month,index)=>month!==months[index])))return false;
 return allocations.reduce<number>((sum,item)=>sum+Number(object(item)!.days),0)===row.declaredDays;
}
function normalizeSnapshot(value:unknown,request:HrAttendanceRequest):HrBusinessTripMonthAllocationSnapshot|null{
 const row=object(value);if(!row||row.id!==request.id||row.amendVersion!==request.amendVersion||row.declaredDays!==(request.declaredDays??null)||row.startAt!==request.startAt||row.endAt!==request.endAt||!Number.isSafeInteger(row.amendVersion)||Number(row.amendVersion)<1||!(row.declaredDays===null||Number.isSafeInteger(row.declaredDays))||!(row.startAt===null||validInstant(row.startAt))||!(row.endAt===null||validInstant(row.endAt))||!validMonths(row.months,row.availability==="needs_correction")||!(row.availability==="ready"||row.availability==="needs_correction")||!(row.unavailableReason===null||typeof row.unavailableReason==="string"))return null;
 if(row.availability==="ready"&&(row.months.length<1||!validDays(row.declaredDays)||row.unavailableReason!==null||!row.startAt||!row.endAt||Date.parse(row.endAt)<=Date.parse(row.startAt)))return null;
 if(row.availability==="needs_correction"&&(!row.unavailableReason?.trim()||row.currentAllocation!==null))return null;
 if(row.availability==="ready"&&!validDays(row.declaredDays))return null;
 if(row.currentAllocation!==null&&(!validRecord(row.currentAllocation,row.months)||(row.currentAllocation as HrBusinessTripMonthAllocationRecord).requestVersion!==row.amendVersion||(row.currentAllocation as HrBusinessTripMonthAllocationRecord).declaredDays!==row.declaredDays))return null;
 return row as unknown as HrBusinessTripMonthAllocationSnapshot;
}
function summaryDays(value:number|null){return value===null?"未提供":`${value} 天`;}

export function BusinessTripMonthAllocationPanel({row,busy,onBusyChange,onSaved}: {row:HrAttendanceRequest;busy:boolean;onBusyChange:(value:boolean)=>void;onSaved:(receipt:Receipt)=>Promise<void>}){
 const [expanded,setExpanded]=useState(false),[snapshot,setSnapshot]=useState<HrBusinessTripMonthAllocationSnapshot|null>(null),[snapshotToken,setSnapshotToken]=useState<string|undefined>(undefined),[snapshotLoading,setSnapshotLoading]=useState(false),[snapshotError,setSnapshotError]=useState("");
 const [draft,setDraft]=useState<Draft|null>(null),[writing,setWriting]=useState(false),[uncertain,setUncertain]=useState(false),[committed,setCommitted]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [history,setHistory]=useState<HrBusinessTripMonthAllocationRecord[]|null>(null),[historyPage,setHistoryPage]=useState(1),[historyTotal,setHistoryTotal]=useState(0),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState("");
 const mounted=useRef(true),flight=useRef(false),ownsBusy=useRef(false),attempt=useRef<Attempt|null>(null),snapshotGeneration=useRef(0),historyGeneration=useRef(0),snapshotController=useRef<AbortController|null>(null),historyController=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;snapshotGeneration.current++;historyGeneration.current++;snapshotController.current?.abort();historyController.current?.abort();if(ownsBusy.current){ownsBusy.current=false;onBusyChange(false);}};},[onBusyChange]);

 const readSnapshot=async()=>{
  snapshotController.current?.abort();const controller=new AbortController(),owner=++snapshotGeneration.current,token=getAccessToken();snapshotController.current=controller;setSnapshotLoading(true);setSnapshotError("");setSnapshot(null);setSnapshotToken(undefined);setDraft(null);setHistory(null);setHistoryError("");
  attempt.current=null;
  try{const raw=await hrApi.businessTripMonthAllocation(row.id,token,controller.signal);if(!mounted.current||controller.signal.aborted||owner!==snapshotGeneration.current||token!==getAccessToken())return;const result=normalizeSnapshot(raw,row);if(!result)throw new Error("当前出差版本已变化或跨月分配资料不匹配，请刷新出差申请后重新登记。");setSnapshot(result);setSnapshotToken(token);setCommitted(false);setMessage("");setError("");}
  catch(cause){if(mounted.current&&!controller.signal.aborted&&owner===snapshotGeneration.current&&token===getAccessToken())setSnapshotError(hrLoadErrorMessage(cause,"读取跨月分配资料失败"));}
  finally{if(mounted.current&&owner===snapshotGeneration.current)setSnapshotLoading(false);}
 };
 const toggle=()=>{const next=!expanded;setExpanded(next);if(next&&!snapshot&&!snapshotLoading)void readSnapshot();};
 const beginEdit=()=>{if(!snapshot||snapshot.availability!=="ready"||committed)return;if(snapshotToken!==getAccessToken()){setError("身份范围已变化，请重新读取跨月分配事实。");return;}const days:Record<string,string>={};for(const month of snapshot.months){const current=snapshot.currentAllocation?.allocations.find(item=>item.month===month);days[month]=current?String(current.days):"";}attempt.current=null;setUncertain(false);setError("");setMessage("");setDraft({reason:"",days,token:getAccessToken(),version:snapshot.amendVersion});};
 const readHistory=async(nextPage:number)=>{
  historyController.current?.abort();const controller=new AbortController(),owner=++historyGeneration.current,token=getAccessToken();historyController.current=controller;setHistoryLoading(true);setHistory(null);setHistoryError("");
  try{const result=await hrApi.businessTripMonthAllocationHistory(row.id,token,nextPage,20,controller.signal);if(!mounted.current||controller.signal.aborted||owner!==historyGeneration.current||token!==getAccessToken())return;if(!Number.isSafeInteger(result.total)||result.total<0||result.page!==nextPage||result.page_size!==20||!Array.isArray(result.items)||result.items.length>20||result.items.some(item=>!validRecord(item)))throw new Error("跨月分配历史返回不完整，请重试。");setHistory(result.items);setHistoryPage(nextPage);setHistoryTotal(result.total);}
  catch(cause){if(mounted.current&&!controller.signal.aborted&&owner===historyGeneration.current&&token===getAccessToken())setHistoryError(hrLoadErrorMessage(cause,"读取跨月分配历史失败"));}
  finally{if(mounted.current&&owner===historyGeneration.current)setHistoryLoading(false);}
 };
 const save=async(event:FormEvent)=>{
  event.preventDefault();if(busy||flight.current||!draft||!snapshot||committed)return;
  if(draft.token!==getAccessToken()||snapshotToken!==getAccessToken()||draft.version!==snapshot.amendVersion){setError("当前身份或出差版本已变化，请刷新月份后重新登记。");return;}
  if(!draft.reason.trim()){setError("请填写登记原因。");return;}
  const allocations=snapshot.months.map(month=>({month,days:draft.days[month]===""?NaN:Number(draft.days[month])}));if(allocations.some(item=>!validDays(item.days))){setError("每个月份都必须填写 0 至 2147483647 的整数天数。");return;}
  if(allocations.reduce((sum,item)=>sum+item.days,0)!==snapshot.declaredDays){setError(`各月登记天数合计必须等于出差申报天数 ${snapshot.declaredDays} 天。`);return;}
  const current=attempt.current??{body:{expectedVersion:draft.version,reason:draft.reason.trim(),allocations},key:crypto.randomUUID(),token:draft.token};attempt.current=current;flight.current=true;ownsBusy.current=true;onBusyChange(true);setWriting(true);setError("");setMessage("");
  try{const receipt=await hrApi.allocateBusinessTripMonth(row.id,current.body,current.token,current.key);if(!mounted.current)return;if(current.token!==getAccessToken()){setUncertain(true);setError("身份范围已变化，请回到原范围核对登记结果。");return;}const record=receipt.allocation;if(receipt.id!==row.id||receipt.amendVersion!==current.body.expectedVersion+1||!validRecord(record,snapshot.months)||record.requestVersion!==receipt.amendVersion||record.declaredDays!==snapshot.declaredDays)throw new Error("登记回执不匹配，请沿用原请求核对结果。");
   const matches=record.allocations.length===current.body.allocations.length&&record.allocations.every((item,index)=>item.month===current.body.allocations[index]?.month&&item.days===current.body.allocations[index]?.days);if(!matches)throw new Error("登记回执的逐月数量不匹配，请沿用原请求核对结果。");
   attempt.current=null;setUncertain(false);setCommitted(true);setDraft(null);setSnapshot({...snapshot,amendVersion:receipt.amendVersion,currentAllocation:record});setHistory(null);historyController.current?.abort();historyGeneration.current++;setMessage("跨月申报天数已登记。请重算涉及日期并核对月结；已封账月份通过更正批次接续。");
   try{await onSaved({id:receipt.id,declaredDays:snapshot.declaredDays,amendVersion:receipt.amendVersion});}catch(cause){if(mounted.current&&current.token===getAccessToken())setError(hrLoadErrorMessage(cause,"刷新期间失败；分配已保存，请勿重复登记。"));}
  }catch(cause){if(!mounted.current)return;if(current.token!==getAccessToken()){setUncertain(true);setError("身份范围已变化，请回到原范围核对登记结果。");return;}if(cause instanceof ApiError&&cause.status===409){attempt.current=null;setUncertain(false);setDraft(null);setSnapshot(null);setError("出差版本已变化，请刷新月份与分配事实后重新登记。");return;}const definite=cause instanceof ApiError&&[400,403,404,422].includes(cause.status);if(definite)attempt.current=null;setUncertain(!definite);setError(hrLoadErrorMessage(cause,"登记结果尚未确认，请保留原内容重试。"));}
  finally{flight.current=false;if(ownsBusy.current){ownsBusy.current=false;onBusyChange(false);}if(mounted.current)setWriting(false);}
 };

 if(row.requestType!=="business_trip"||row.status!=="approved"||!Number.isSafeInteger(row.amendVersion)||Number(row.amendVersion)<1)return null;
 const locked=busy||writing||snapshotLoading;
 return <section className={local.recalculation} aria-label={`出差 ${row.requestNo} 的跨月申报天数分配`}>
  <div className={styles.actionRow}><button type="button" className="ds-button ds-button-secondary" aria-expanded={expanded} disabled={locked} onClick={toggle}>{expanded?"收起跨月分配":"查看跨月申报分配"}</button>{expanded?<button type="button" className="ds-button ds-button-secondary" disabled={locked||uncertain||Boolean(draft)} onClick={()=>void readSnapshot()}>刷新月份与分配事实</button>:null}<button type="button" className="ds-button ds-button-secondary" disabled={locked||historyLoading} onClick={()=>void readHistory(1)}>查看分配历史</button></div>
  {expanded?<div className={`ds-panel ${local.recalculationPlan}`} aria-label="跨月申报分配事实">{snapshotLoading?<p role="status">正在读取服务器月份与分配事实…</p>:null}{snapshotError?<p role="alert" className="form-error">{snapshotError}</p>:null}{snapshot? <>
    <strong>{row.requestNo} · 当前申报 {summaryDays(snapshot.declaredDays)}</strong>
    {snapshot.availability==="needs_correction"?<p role="status">{snapshot.unavailableReason} 请先更正出差申报事实，再登记跨月天数。</p>:<><p>请按业务确认逐月登记；各月合计必须等于申报天数。系统不会按时间比例分摊。</p><div className={`ds-mobile-record-list ${local.records}`}>{snapshot.months.map(month=><article className="ds-mobile-record" key={month}><strong>{month}</strong><span>已登记：{snapshot.currentAllocation?.allocations.find(item=>item.month===month)?.days??"尚未登记"} 天</span></article>)}</div>{snapshot.currentAllocation?<p>当前版本 V{snapshot.currentAllocation.requestVersion} 已登记：{snapshot.currentAllocation.allocations.map(item=>`${item.month} ${item.days} 天`).join(" · ")}</p>:<p>当前版本尚无跨月登记。</p>}{!draft&&!committed?<button type="button" className="ds-button ds-button-primary" disabled={locked} onClick={beginEdit}>{snapshot.currentAllocation?"更正跨月分配":"登记跨月天数"}</button>:null}</>}
   </>:null}{snapshot===null&&!snapshotLoading&&!snapshotError&&error?<p role="alert" className="form-error">{error}</p>:null}
   {draft&&snapshot?.availability==="ready"?<form className={`ds-panel ${local.recalculationPlan}`} aria-label="登记出差跨月申报天数" onSubmit={event=>void save(event)}><strong>总申报 {snapshot.declaredDays} 天 · {snapshot.months.length} 个业务月份</strong>{snapshot.months.map(month=><label className="form-field" key={month}><span>{month} 申报天数</span><input type="number" min="0" max={MAX_DAYS} step="1" inputMode="numeric" onFocus={event=>event.currentTarget.select()} disabled={locked||uncertain} aria-label={`${month}申报天数`} value={draft.days[month]??""} onChange={event=>setDraft({...draft,days:{...draft.days,[month]:event.target.value}})}/></label>)}<label className="form-field"><span>登记原因</span><textarea required maxLength={1000} disabled={locked||uncertain} value={draft.reason} onChange={event=>setDraft({...draft,reason:event.target.value})}/></label>{uncertain?<p role="status">上次登记结果待确认，重试将沿用原内容和原请求编号。</p>:null}<div className={styles.actionRow}><button type="submit" className="ds-button ds-button-primary" disabled={locked}>{writing?"正在登记…":uncertain?"重试核对登记":"保存跨月分配"}</button><button type="button" className="ds-button ds-button-secondary" disabled={locked||uncertain} onClick={()=>{setDraft(null);setError("");}}>取消</button></div></form>:null}
   {message?<p role="status">{message}</p>:null}{error&&snapshot!==null?<p role="alert" className="form-error">{error}</p>:null}
  </div>:null}
  {historyLoading?<p role="status">正在加载跨月分配历史…</p>:null}{historyError?<p role="alert" className="form-error">{historyError}</p>:null}{history!==null?<div className={`ds-mobile-record-list ${local.records}`} aria-label="跨月分配历史">{history.length?history.map(item=><article className="ds-mobile-record" key={item.id}><strong>申报版本 {item.requestVersion} · 共 {item.declaredDays} 天</strong><span>{item.allocations.map(value=>`${value.month} ${value.days} 天`).join(" · ")}</span><span>{item.reason}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></article>):<p>暂无跨月分配历史。</p>}<nav className={`${styles.actionRow} ${local.pagination}`} aria-label="跨月分配历史分页"><button type="button" className="ds-button ds-button-secondary" disabled={locked||historyLoading||historyPage<=1} onClick={()=>void readHistory(historyPage-1)}>分配历史上一页</button><span>第 {historyPage} / {Math.max(1,Math.ceil(historyTotal/20))} 页 · 共 {historyTotal} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={locked||historyLoading||historyPage*20>=historyTotal} onClick={()=>void readHistory(historyPage+1)}>分配历史下一页</button></nav></div>:null}
 </section>;
}
