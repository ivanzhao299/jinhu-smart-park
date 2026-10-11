"use client";
import {Fragment,useEffect,useRef,useState} from "react";
import {businessDate,addBusinessDateDays} from "../../../lib/business-date";
import {getAccessToken} from "../../../lib/authz";
import {createIdempotencyKey} from "../../../lib/api-client";
import {workCalendarApi,workCalendarLabels,type WorkCalendarBody,type WorkCalendarDay,type WorkCalendarHistory,type WorkCalendarKind} from "../../../lib/hr-work-calendar-api";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "../hr-workbench.module.css";
import local from "./work-calendar.module.css";

export function monthDates(month:string){
 if(!/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month))return [];
 const days:string[]=[];for(let d=`${month}-01`;d.startsWith(month);d=addBusinessDateDays(d,1))days.push(d);
 return days;
}
export function WorkCalendarPanel(){
 const [month,setMonth]=useState(businessDate().slice(0,7)),[rows,setRows]=useState<WorkCalendarDay[]>([]);
 const [ready,setReady]=useState(false),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0),[error,setError]=useState("");
 const [date,setDate]=useState(""),[draft,setDraft]=useState<WorkCalendarBody|null>(null),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [history,setHistory]=useState<WorkCalendarHistory[]>([]),[historyTotal,setHistoryTotal]=useState(0),[page,setPage]=useState(1),[historyLoading,setHistoryLoading]=useState(false),[historyRevision,setHistoryRevision]=useState(0),[historyError,setHistoryError]=useState("");
 const mounted=useRef(false),flight=useRef(false),retry=useRef<{signature:string;key:string}|null>(null);
 const token=getAccessToken(),previousToken=useRef(token),owner=useRef(token);owner.current=token;
 const days=monthDates(month),rangeKey=JSON.stringify([month,token]),rangeOwner=useRef(rangeKey);rangeOwner.current=rangeKey;
 const draftKey=JSON.stringify([date,token]),draftOwner=useRef(draftKey);draftOwner.current=draftKey;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{
  const abort=new AbortController(),context=rangeKey;
  setReady(false);setRows([]);setError("");setDate("");setDraft(null);setNotice(previousToken.current===token?"":"登录状态已变化，请重新进入工作日历。");previousToken.current=token;
  if(!days.length){setError("请选择1900至2199年的有效月份。");setLoading(false);return}
  setLoading(true);
  void workCalendarApi.range(days[0]!,days[days.length-1]!,token,abort.signal).then(result=>{
   if(!abort.signal.aborted&&rangeOwner.current===context){setRows(result.items);setReady(true)}
  }).catch(failure=>{if(!abort.signal.aborted&&rangeOwner.current===context)setError(hrLoadErrorMessage(failure,"工作日历读取失败；当前设置未知。"))}).finally(()=>{if(!abort.signal.aborted&&rangeOwner.current===context)setLoading(false)});
  return()=>abort.abort();
 // The month string defines the exact complete day range.
 },[rangeKey,revision]);
 useEffect(()=>{
  const abort=new AbortController();setHistory([]);setHistoryTotal(0);setHistoryError("");
  if(!date){setHistoryLoading(false);return}
  setHistoryLoading(true);
  void workCalendarApi.history(date,page,token,abort.signal).then(result=>{
   if(abort.signal.aborted)return;
   if(page>Math.max(1,Math.ceil(result.total/20))){setPage(Math.max(1,Math.ceil(result.total/20)));return}
   setHistory(result.items);setHistoryTotal(result.total);
  }).catch(failure=>{if(!abort.signal.aborted)setHistoryError(hrLoadErrorMessage(failure,"日历历史读取失败。"))}).finally(()=>{if(!abort.signal.aborted)setHistoryLoading(false)});
  return()=>abort.abort();
 },[date,page,token,historyRevision]);
 const select=(value:string)=>{
  if(flight.current||!ready)return;
  const row=rows.find(r=>r.workDate===value);setDate(value);setPage(1);setNotice("");
  setDraft({expectedVersion:row?.version??0,dayKind:row?.dayKind??"working",dayName:row?.dayName??"",reason:""});
 };
 const save=async()=>{
  if(flight.current||!ready||!draft||!date||!draft.dayName.trim()||!draft.reason.trim())return;
  if(getAccessToken()!==token){setNotice("登录状态已变化，请重新进入工作日历。");return}
  const body={...draft,dayName:draft.dayName.trim(),reason:draft.reason.trim()},target=date,context=draftKey;
  const signature=JSON.stringify([token,target,body]);
  if(retry.current?.signature!==signature)retry.current={signature,key:createIdempotencyKey("hr-work-calendar")};
  flight.current=true;setSaving(true);setNotice("");
  try{
   const saved=await workCalendarApi.put(target,body,token,retry.current.key);
   if(!mounted.current||owner.current!==token||draftOwner.current!==context||getAccessToken()!==token)return;
   setRows(current=>[...current.filter(r=>r.workDate!==target),saved].sort((a,b)=>a.workDate.localeCompare(b.workDate)));
   setDraft({...body,expectedVersion:saved.version,reason:""});setNotice("日历设置已保存。排班请重新读取日历；已有排班、考勤和工资保持原结果。");
   retry.current=null;
   try{const result=await workCalendarApi.history(target,1,token);if(mounted.current&&draftOwner.current===context){setPage(1);setHistory(result.items);setHistoryTotal(result.total);setHistoryError("")}}
   catch{if(mounted.current&&draftOwner.current===context)setHistoryError("日历已保存；历史刷新失败，请重新读取历史。")}
  }catch(failure){if(mounted.current&&draftOwner.current===context)setNotice(hrLoadErrorMessage(failure,"保存未确认完成，草稿已保留。"))}
  finally{flight.current=false;if(mounted.current)setSaving(false)}
 };
 const editor=date&&draft?<section className={local.editor} aria-label="日期性质编辑">
   <h3>{date} · {draft.expectedVersion?`当前版本 V${draft.expectedVersion}`:"尚未设置"}</h3>
   <div className={styles.operationFields}>
    <label className="form-field"><span>日期性质</span><select value={draft.dayKind} disabled={saving} onChange={e=>setDraft({...draft,dayKind:e.target.value as WorkCalendarKind})}>{Object.entries(workCalendarLabels).map(([value,label])=><option key={value} value={value}>{value==="unset"?"撤销设置（保留历史）":label}</option>)}</select></label>
    <label className="form-field"><span>日期名称</span><input required maxLength={100} value={draft.dayName} disabled={saving} onChange={e=>setDraft({...draft,dayName:e.target.value})}/></label>
    <label className="form-field"><span>日历修改原因</span><textarea required maxLength={500} value={draft.reason} disabled={saving} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>
   </div>
   <button type="button" className="ds-button ds-button-primary" disabled={saving||!draft.dayName.trim()||!draft.reason.trim()} onClick={()=>void save()}>保存日历设置</button>
   {notice?<p role="status">{notice}</p>:null}
   <h3>设置历史</h3>
   {historyError?<p role="alert" className="form-error">{historyError}</p>:null}
   <div className={`ds-mobile-record-list ${local.history}`}>{historyLoading?<p>正在读取设置历史…</p>:history.map(row=><article key={row.id} className="ds-mobile-record"><strong>V{row.version} · {workCalendarLabels[row.dayKind]} · {row.dayName}</strong><span>{row.reason}</span><span>操作人：{row.actorName}</span><time>{row.occurredAt}</time></article>)}</div>
   <nav aria-label="日历设置历史分页" className={styles.actionRow}><button type="button" className="ds-button ds-button-secondary" disabled={saving||historyLoading||page<=1} onClick={()=>setPage(v=>v-1)}>日历历史上一页</button><span>第 {page} / {Math.max(1,Math.ceil(historyTotal/20))} 页 · 共 {historyTotal} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={saving||historyLoading||page>=Math.ceil(historyTotal/20)} onClick={()=>setPage(v=>v+1)}>日历历史下一页</button><button type="button" className="ds-button ds-button-secondary" disabled={saving||historyLoading} onClick={()=>setHistoryRevision(v=>v+1)}>重新读取历史</button></nav>
  </section>:null;
 return <section className={`ds-panel ${local.panel}`} aria-label="工作日历维护">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">排班基础</span><h2>工作日历</h2><small>维护公共假日、休息日及调休工作日；未设置日期由排班人员明确选择。</small></div></div>
  <div className={styles.actionRow}><label className="form-field"><span>工作日历月份</span><input type="month" min="1900-01" max="2199-12" value={month} disabled={saving} onChange={e=>setMonth(e.target.value)}/></label><button className="ds-button ds-button-secondary" type="button" disabled={saving||loading} onClick={()=>setRevision(v=>v+1)}>重新读取工作日历</button></div>
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {loading?<p role="status">正在读取工作日历…</p>:null}
  <div className={local.days}>{ready?days.map(value=>{const row=rows.find(r=>r.workDate===value);return <Fragment key={value}><button type="button" className="ds-button ds-button-secondary" disabled={saving} aria-pressed={date===value} onClick={()=>select(value)}><strong>{value}</strong><span>{row?workCalendarLabels[row.dayKind]:"未设置"}</span>{row?<small>{row.dayName} · V{row.version}</small>:null}</button>{date===value?editor:null}</Fragment>}):null}</div>
  {!draft&&notice?<p role="status">{notice}</p>:null}
 </section>;
}
