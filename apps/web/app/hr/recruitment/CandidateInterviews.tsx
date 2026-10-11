"use client";

import {useCallback,useEffect,useRef,useState,type ChangeEvent} from "react";
import {createIdempotencyKey} from "../../../lib/api-client";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrCandidateInterview,type HrCandidateInterviewHistory} from "../../../lib/hr-api";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "./recruitment.module.css";

type Draft={roundLabel:string;startsAt:string;endsAt:string;location:string;interviewerName:string;status:HrCandidateInterview["status"];outcome:HrCandidateInterview["outcome"];resultNotes:string;cancellationReason:string};
type Snapshot=Omit<HrCandidateInterview,"updatedAt">;
type Page<T>={items:T[];total:number;page:number;page_size:number};
const size=10;
const statuses={scheduled:"已安排",completed:"已完成",cancelled:"已取消"};
const outcomes={pending:"待面试",pass:"通过",fail:"未通过",hold:"待复议"};
const blank=():Draft=>({roundLabel:"",startsAt:"",endsAt:"",location:"",interviewerName:"",status:"scheduled",outcome:"pending",resultNotes:"",cancellationReason:""});
const record=(x:unknown):x is Record<string,unknown>=>typeof x==="object"&&x!==null;
const conflictError=(x:unknown)=>record(x)&&(x.status===409||x.statusCode===409);
const text=(x:unknown,max:number)=>typeof x==="string"&&x.trim().length>0&&x.length<=max;
function timestamp(x:unknown):x is string {
 if(typeof x!=="string")return false;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(x);
 if(!m||!Number.isFinite(Date.parse(x)))return false;
 const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
 return y>0&&month>=1&&month<=12&&day>=1&&day<=(days[month-1]??0)&&Number(m[4])<24&&Number(m[5])<60&&Number(m[6])<60;
}
function validSnapshot(x:unknown):x is Snapshot {
 if(!record(x)||!text(x.id,100)||!text(x.candidateId,100)||!Number.isSafeInteger(x.version)||Number(x.version)<1||!text(x.roundLabel,120)||!timestamp(x.startsAt)||!timestamp(x.endsAt)||Date.parse(x.endsAt)<=Date.parse(x.startsAt)||!text(x.location,240)||!text(x.interviewerName,100))return false;
 if(x.status==="scheduled")return x.outcome==="pending"&&x.resultNotes===null&&x.cancellationReason===null;
 if(x.status==="completed")return ["pass","fail","hold"].includes(String(x.outcome))&&text(x.resultNotes,2000)&&x.cancellationReason===null;
 return x.status==="cancelled"&&x.outcome==="pending"&&x.resultNotes===null&&text(x.cancellationReason,1000);
}
const validCurrent=(x:unknown):x is HrCandidateInterview=>record(x)&&timestamp(x.updatedAt)&&validSnapshot(x);
const validHistory=(x:unknown):x is HrCandidateInterviewHistory=>record(x)&&text(x.interviewId,100)&&timestamp(x.occurredAt)&&text(x.actorDisplayName,200)&&validSnapshot(x);
function validPage<T>(x:unknown,page:number,guard:(row:unknown)=>row is T):x is Page<T>{
 return record(x)&&Array.isArray(x.items)&&x.items.every(guard)&&x.items.length<=size&&Number.isSafeInteger(x.total)&&Number(x.total)>=x.items.length&&x.page===page&&x.page_size===size&&new Set(x.items.map(row=>(row as {id:string}).id)).size===x.items.length;
}
function local(value:string){
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
 const g=(type:string)=>p.find(x=>x.type===type)?.value??"";
 return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}
function beijing(value:string){const normalized=/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)?`${value}:00`:value;return timestamp(`${normalized}+08:00`)?`${normalized}+08:00`:"";}
const draftOf=(x:HrCandidateInterview):Draft=>({roundLabel:x.roundLabel,startsAt:local(x.startsAt),endsAt:local(x.endsAt),location:x.location,interviewerName:x.interviewerName,status:x.status,outcome:x.outcome,resultNotes:x.resultNotes??"",cancellationReason:x.cancellationReason??""});
function SnapshotFields({row}:{row:Snapshot}){return <div className={styles.interviewSnapshot}><strong>{row.roundLabel} · {statuses[row.status]} · 版本 {row.version}</strong><span>北京时间：{local(row.startsAt).replace("T"," ")} 至 {local(row.endsAt).replace("T"," ")}</span><span>地点：{row.location}</span><span>面试人：{row.interviewerName}</span><span>结论：{outcomes[row.outcome]}</span><span>面试记录：{row.resultNotes??"未填写"}</span><span>取消原因：{row.cancellationReason??"无"}</span></div>;}

export function CandidateInterviews({candidateId,canManage,disabled,onBusyChange}:{candidateId:string;canManage:boolean;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
 const [items,setItems]=useState<HrCandidateInterview[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[listError,setListError]=useState("");
 const [formOpen,setFormOpen]=useState(false),[draft,setDraft]=useState<Draft>(blank),[editing,setEditing]=useState<string|null>(null),[baseVersion,setBaseVersion]=useState(0),[baseStatus,setBaseStatus]=useState<HrCandidateInterview["status"]>("scheduled"),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(""),[success,setSuccess]=useState("");
 const [conflict,setConflict]=useState(false),[server,setServer]=useState<HrCandidateInterview|null>(null),[conflictLoading,setConflictLoading]=useState(false);
 const [selected,setSelected]=useState<HrCandidateInterview|null>(null),[history,setHistory]=useState<HrCandidateInterviewHistory[]>([]),[historyPage,setHistoryPage]=useState(1),[historyTotal,setHistoryTotal]=useState(0),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState("");
 const request=useRef<AbortController|null>(null),historyRequest=useRef<AbortController|null>(null),conflictRequest=useRef<AbortController|null>(null),generation=useRef(0),historyGeneration=useRef(0),savingRef=useRef(false),candidate=useRef(candidateId),editTarget=useRef<string|null>(null),historyTarget=useRef<string|null>(null);
 const intent=useRef<{body:string;key:string;id:string|null}|null>(null);
 candidate.current=candidateId;
 const busy=disabled||saving,locked=busy||loading||!ready||conflictLoading;
 const load=useCallback(async(target:number)=>{
  request.current?.abort();const ctl=new AbortController(),gen=++generation.current;request.current=ctl;setLoading(true);setReady(false);
  try{const result=await hrApi.recruitmentCandidateInterviews(candidateId,getAccessToken(),target,size,ctl.signal);if(ctl.signal.aborted||gen!==generation.current||candidate.current!==candidateId)return;
   if(!validPage(result,target,validCurrent)||result.items.some(x=>x.candidateId!==candidateId))throw Error("面试列表响应格式无效");
   setItems(result.items);setTotal(result.total);setPage(target);setReady(true);setListError("");
  }catch(e){if(!ctl.signal.aborted&&gen===generation.current&&candidate.current===candidateId)setListError(hrLoadErrorMessage(e,"读取候选人面试失败"));}
  finally{if(gen===generation.current&&candidate.current===candidateId)setLoading(false);}
 },[candidateId]);
 const loadHistory=useCallback(async(id:string,target:number)=>{
  historyRequest.current?.abort();const ctl=new AbortController(),gen=++historyGeneration.current;historyRequest.current=ctl;setHistoryLoading(true);
  try{const result=await hrApi.recruitmentCandidateInterviewHistory(candidateId,id,getAccessToken(),target,size,ctl.signal);if(ctl.signal.aborted||gen!==historyGeneration.current||candidate.current!==candidateId||historyTarget.current!==id)return;
   if(!validPage(result,target,validHistory)||result.items.some(x=>x.candidateId!==candidateId||x.interviewId!==id))throw Error("面试历史响应格式无效");
   setHistory(result.items);setHistoryTotal(result.total);setHistoryPage(target);setHistoryError("");
  }catch(e){if(!ctl.signal.aborted&&gen===historyGeneration.current&&candidate.current===candidateId&&historyTarget.current===id)setHistoryError(hrLoadErrorMessage(e,"读取面试历史失败"));}
  finally{if(gen===historyGeneration.current&&candidate.current===candidateId&&historyTarget.current===id)setHistoryLoading(false);}
 },[candidateId]);
 useEffect(()=>{
  setItems([]);setPage(1);setTotal(0);setSelected(null);historyTarget.current=null;editTarget.current=null;setHistory([]);setHistoryTotal(0);setHistoryPage(1);setHistoryError("");setFormOpen(false);setEditing(null);setDraft(blank());setBaseVersion(0);setConflict(false);setServer(null);setSaveError("");setSuccess("");intent.current=null;void load(1);
  return()=>{request.current?.abort();historyRequest.current?.abort();conflictRequest.current?.abort();generation.current++;historyGeneration.current++;};
 },[candidateId,load]);
 const selectedId=selected?.id;
 useEffect(()=>{if(selectedId){historyTarget.current=selectedId;setHistory([]);setHistoryTotal(0);setHistoryPage(1);void loadHistory(selectedId,1);}},[selectedId,loadHistory]);
 const selectHistory=(row:HrCandidateInterview)=>{if(savingRef.current||disabled)return;if(historyTarget.current===row.id)void loadHistory(row.id,1);else{historyTarget.current=row.id;setSelected(row);}};
 const begin=(row?:HrCandidateInterview)=>{if(savingRef.current||locked||!canManage)return;editTarget.current=row?.id??null;setEditing(row?.id??null);setBaseVersion(row?.version??0);setBaseStatus(row?.status??"scheduled");setDraft(row?draftOf(row):blank());setFormOpen(true);setConflict(false);setServer(null);setSaveError("");setSuccess("");intent.current=null;if(row)selectHistory(row);};
 const close=()=>{if(savingRef.current||disabled)return;editTarget.current=null;setEditing(null);setFormOpen(false);setDraft(blank());setConflict(false);setServer(null);setSaveError("");intent.current=null;conflictRequest.current?.abort();};
 const refreshConflict=async(id:string)=>{
  conflictRequest.current?.abort();const ctl=new AbortController();conflictRequest.current=ctl;setConflictLoading(true);setServer(null);
  try{const row=await hrApi.recruitmentCandidateInterview(candidateId,id,getAccessToken(),ctl.signal);if(ctl.signal.aborted||candidate.current!==candidateId||editTarget.current!==id)return;
   if(!validCurrent(row)||row.id!==id||row.candidateId!==candidateId)throw Error("面试冲突记录响应格式无效");setServer(row);
  }catch(e){if(!ctl.signal.aborted&&candidate.current===candidateId&&editTarget.current===id)setSaveError(hrLoadErrorMessage(e,"无法读取服务器面试记录，请重新读取后比较"));}
  finally{if(!ctl.signal.aborted&&candidate.current===candidateId&&editTarget.current===id)setConflictLoading(false);}
 };
 const change=(key:keyof Draft)=>(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>{
  if(savingRef.current||locked)return;const value=event.target.value;intent.current=null;setSaveError("");setDraft(x=>{const next={...x,[key]:value};if(key==="status"){next.outcome="pending";next.resultNotes="";next.cancellationReason="";}return next;});
 };
 const save=async()=>{
  if(savingRef.current||locked||!canManage||conflict||!formOpen)return;
  if(editing&&baseStatus!=="scheduled"&&draft.status!==baseStatus){setSaveError("服务器面试已结束，请选择服务器现行状态后更正，不能重新安排或转换结束状态。");return;}
  const startsAt=beijing(draft.startsAt),endsAt=beijing(draft.endsAt);
  if(!draft.roundLabel.trim()||!draft.location.trim()||!draft.interviewerName.trim()||!startsAt||!endsAt||Date.parse(endsAt)<=Date.parse(startsAt)){setSaveError("请完整填写有效的北京时间安排，结束时间必须晚于开始时间。");return;}
  if(draft.status==="completed"&&(!draft.resultNotes.trim()||draft.outcome==="pending")){setSaveError("完成面试须填写结论和非空记录。");return;}
  if(draft.status==="cancelled"&&!draft.cancellationReason.trim()){setSaveError("取消面试须填写非空原因。");return;}
  const submittedId=editing,expectedVersion=submittedId?baseVersion:0;
  const fields={expectedVersion,roundLabel:draft.roundLabel.trim(),startsAt,endsAt,location:draft.location.trim(),interviewerName:draft.interviewerName.trim(),status:draft.status,outcome:draft.outcome,resultNotes:draft.status==="completed"?draft.resultNotes.trim():null,cancellationReason:draft.status==="cancelled"?draft.cancellationReason.trim():null};
  const body=JSON.stringify(fields);if(intent.current?.body!==body||intent.current.id!==submittedId)intent.current={body,key:createIdempotencyKey(submittedId?"hr-candidate-interview-update":"hr-candidate-interview-create"),id:submittedId};
  const attempt=intent.current;savingRef.current=true;setSaving(true);setSaveError("");setSuccess("");onBusyChange(true);
  try{const saved=submittedId?await hrApi.updateRecruitmentCandidateInterview(candidateId,submittedId,fields,getAccessToken(),attempt.key):await hrApi.createRecruitmentCandidateInterview(candidateId,fields,getAccessToken(),attempt.key);
   if(candidate.current!==candidateId)return;
   if(!validCurrent(saved)||saved.candidateId!==candidateId||(submittedId!==null&&saved.id!==submittedId)||saved.version!==expectedVersion+1||Date.parse(saved.startsAt)!==Date.parse(fields.startsAt)||Date.parse(saved.endsAt)!==Date.parse(fields.endsAt)||saved.roundLabel!==fields.roundLabel||saved.location!==fields.location||saved.interviewerName!==fields.interviewerName||saved.status!==fields.status||saved.outcome!==fields.outcome||saved.resultNotes!==fields.resultNotes||saved.cancellationReason!==fields.cancellationReason)throw Error("面试保存回执无效");
   intent.current=null;editTarget.current=null;setEditing(null);setFormOpen(false);setDraft(blank());setConflict(false);setServer(null);setSuccess(`面试已保存，版本 ${saved.version}。`);
   if(historyTarget.current===saved.id){setSelected(saved);void loadHistory(saved.id,1);}else{historyTarget.current=saved.id;setSelected(saved);}
   await load(1);
  }catch(e){if(candidate.current!==candidateId)return;if(conflictError(e)&&submittedId){setConflict(true);setSaveError("服务器记录已变化。草稿已保留，请比较并明确确认后再保存。");await refreshConflict(submittedId);}else setSaveError("面试保存失败或回执无效；输入已保留，可保持原内容重试。");}
  finally{savingRef.current=false;if(candidate.current===candidateId)setSaving(false);onBusyChange(false);}
 };
 const acknowledge=()=>{if(savingRef.current||locked||!server||!editing||server.id!==editing)return;setBaseVersion(server.version);setBaseStatus(server.status);intent.current=null;setConflict(false);setSaveError("");setSuccess("已采用服务器当前版本作为基线，草稿保留，请核对后再次保存。");};
 return <section className={styles.interviews} aria-label="候选人面试办理">
  <div className={styles.sectionTitle}><h3>面试安排、记录与结果</h3>{canManage?<button className="ds-button" type="button" disabled={locked} onClick={()=>begin()}>新建面试</button>:null}</div>
  {listError?<div className="form-error" role="alert">{listError}<button type="button" className="ds-button" disabled={busy||loading} onClick={()=>{if(!savingRef.current&&!disabled)void load(page);}}>重读面试列表</button></div>:null}
  {success?<p role="status">{success}</p>:null}
  {saveError?<p className="form-error" role="alert">{saveError}</p>:null}
  {conflict?<section className={styles.interviewConflict} aria-label="面试冲突比较"><h4>服务器记录与保留草稿</h4><div><h5>服务器当前记录</h5>{server?<SnapshotFields row={server}/>:<p>{conflictLoading?"正在读取服务器记录…":"服务器记录尚未读取成功"}</p>}</div><div><h5>保留的草稿</h5><p>{draft.roundLabel} · {statuses[draft.status]}</p><p>北京时间：{draft.startsAt.replace("T"," ")} 至 {draft.endsAt.replace("T"," ")}</p><p>地点：{draft.location}；面试人：{draft.interviewerName}</p><p>结论：{outcomes[draft.outcome]}；面试记录：{draft.resultNotes||"未填写"}；取消原因：{draft.cancellationReason||"无"}</p></div><div className={styles.actionRow}><button type="button" className="ds-button" disabled={busy||conflictLoading} onClick={()=>{if(!savingRef.current&&editing)void refreshConflict(editing);}}>重读冲突记录</button><button type="button" className="ds-button" disabled={locked||!server} onClick={acknowledge}>确认以草稿更新</button></div></section>:null}
  {canManage&&formOpen?<form className={styles.interviewForm} aria-label={editing?"更正面试":"安排面试"} onSubmit={e=>{e.preventDefault();void save();}}>
   <label className="form-field"><span>轮次名称</span><input required maxLength={120} value={draft.roundLabel} disabled={locked} onChange={change("roundLabel")}/></label>
   <label className="form-field"><span>开始时间（北京时间）</span><input required type="datetime-local" step="1" value={draft.startsAt} disabled={locked} onChange={change("startsAt")}/></label>
   <label className="form-field"><span>结束时间（北京时间）</span><input required type="datetime-local" step="1" value={draft.endsAt} disabled={locked} onChange={change("endsAt")}/></label>
   <label className="form-field"><span>地点</span><input required maxLength={240} value={draft.location} disabled={locked} onChange={change("location")}/></label>
   <label className="form-field"><span>面试人姓名</span><input required maxLength={100} value={draft.interviewerName} disabled={locked} onChange={change("interviewerName")}/></label>
   {editing?<label className="form-field"><span>面试状态</span><select value={draft.status} disabled={locked} onChange={change("status")}><option value="scheduled" disabled={baseStatus!=="scheduled"}>已安排</option><option value="completed" disabled={baseStatus==="cancelled"}>已完成</option><option value="cancelled" disabled={baseStatus==="completed"}>已取消</option></select></label>:null}
   {draft.status==="completed"?<><label className="form-field"><span>面试结论</span><select value={draft.outcome} disabled={locked} onChange={change("outcome")}><option value="pending" disabled>请选择结论</option><option value="pass">通过</option><option value="fail">未通过</option><option value="hold">待复议</option></select></label><label className="form-field"><span>面试记录</span><textarea required maxLength={2000} value={draft.resultNotes} disabled={locked} onChange={change("resultNotes")}/></label></>:null}
   {draft.status==="cancelled"?<label className="form-field"><span>取消原因</span><textarea required maxLength={1000} value={draft.cancellationReason} disabled={locked} onChange={change("cancellationReason")}/></label>:null}
   <div className={styles.assessmentActions}><button type="submit" className="ds-button ds-button-primary" disabled={locked||conflict}>{saving?"保存中…":editing?"保存更正":"安排面试"}</button><button type="button" className="ds-button" disabled={busy} onClick={close}>取消编辑</button></div>
  </form>:null}
  {loading?<p role="status">正在读取候选人面试…</p>:null}
  {!loading&&ready&&items.length===0?<p>暂无面试安排。</p>:null}
  <div className={`ds-mobile-record-list ${styles.historyRecords}`}>{items.map(row=><article className="ds-mobile-record" key={row.id}><SnapshotFields row={row}/><small>更新时间（北京时间）：{local(row.updatedAt).replace("T"," ")}</small><div className={styles.actionRow}><button className="ds-button" type="button" disabled={busy} onClick={()=>selectHistory(row)}>查看面试历史</button>{canManage?<button className="ds-button" type="button" disabled={locked} onClick={()=>begin(row)}>办理/更正</button>:null}</div></article>)}</div>
  {total>size||page>1?<nav className={styles.pagination} aria-label="候选人面试分页"><button type="button" className="ds-button" disabled={busy||loading||page<=1} onClick={()=>{if(!savingRef.current&&!disabled)void load(page-1);}}>上一页面试</button><span>第 {page} / {Math.max(1,Math.ceil(total/size))} 页 · 共 {total} 条</span><button type="button" className="ds-button" disabled={busy||loading||page*size>=total} onClick={()=>{if(!savingRef.current&&!disabled)void load(page+1);}}>下一页面试</button></nav>:null}
  {selected?<section className={styles.interviewHistory} aria-label="面试完整历史"><h4>{selected.roundLabel} · 完整历史</h4>{historyError?<div className="form-error" role="alert">{historyError}<button type="button" className="ds-button" disabled={busy||historyLoading} onClick={()=>{if(!savingRef.current&&!disabled)void loadHistory(selected.id,historyPage);}}>重读面试历史</button></div>:null}{historyLoading?<p role="status">正在读取面试历史…</p>:null}<div className={`ds-mobile-record-list ${styles.historyRecords}`}>{history.map(row=><article className="ds-mobile-record" key={row.id}><SnapshotFields row={row}/><small>{row.actorDisplayName} · 北京时间 {local(row.occurredAt).replace("T"," ")}</small></article>)}</div>{historyTotal>size||historyPage>1?<nav className={styles.pagination} aria-label="面试历史分页"><button type="button" className="ds-button" disabled={busy||historyLoading||historyPage<=1} onClick={()=>{if(!savingRef.current&&!disabled)void loadHistory(selected.id,historyPage-1);}}>上一页历史</button><span>第 {historyPage} / {Math.max(1,Math.ceil(historyTotal/size))} 页 · 共 {historyTotal} 个版本</span><button type="button" className="ds-button" disabled={busy||historyLoading||historyPage*size>=historyTotal} onClick={()=>{if(!savingRef.current&&!disabled)void loadHistory(selected.id,historyPage+1);}}>下一页历史</button></nav>:null}</section>:null}
 </section>;
}
