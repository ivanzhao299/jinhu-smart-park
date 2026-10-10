"use client";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {ApiError,createIdempotencyKey} from "../../../lib/api-client";
import {hrApi,type HrProbationApplication} from "../../../lib/hr-api";
import {hasAnyPermission,hasPermission} from "../../../lib/permissions";
import {hrLoadErrorMessage} from "../hr-errors";
import {HrEmployeeSelection,type HrEmployeeOption} from "../components/HrEmployeeSelection";
import styles from "../hr-workbench.module.css";
import lifecycleStyles from "./lifecycle.module.css";

const participantStatusLabels:Record<string,string>={pending:"待确认",confirmed:"已确认",cancelled:"已取消"};
const statusLabels:Record<string,string>={draft:"草稿",submitted:"待审批",returned:"已退回",approved:"已批准",cancelled:"已取消",confirmed:"已转正"};
const pageSize=20;
type Participant=HrEmployeeOption&{plannedConfirmationDate:string};
type Draft={applicationName:string;applicationDate:string;reason:string};
type Body=Draft&{participants:Array<{employeeId:string;plannedConfirmationDate:string}>};
type Operation={kind:"create"|"update"|"submit"|"resubmit"|"cancel"|"approve"|"return"|"confirm";id?:string;body?:Body;targets?:Body["participants"];comment?:string;version?:number;token:string|undefined;key:string};
const emptyDraft=():Draft=>({applicationName:"",applicationDate:"",reason:""});
const validVersion=(value:number)=>Number.isSafeInteger(value)&&value>0;
const sameFacts=(a:HrProbationApplication,b:HrProbationApplication)=>a.status===b.status&&a.applicationName===b.applicationName&&a.applicationDate===b.applicationDate&&a.reason===b.reason&&a.reviewComment===b.reviewComment&&a.reviewedAt===b.reviewedAt&&a.confirmedAt===b.confirmedAt&&JSON.stringify(a.participants)===JSON.stringify(b.participants);

export function ProbationApplicationsPanel(){
 const user=useAuthUser();
 return <ProbationApplicationsContent key={JSON.stringify(user)}/>;
}

function ProbationApplicationsContent(){
 const user=useAuthUser(),canRead=hasPermission(user,HR_PERMISSIONS.HR_LIFECYCLE_READ),canAssign=hasPermission(user,HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN),canReview=hasPermission(user,HR_PERMISSIONS.HR_LIFECYCLE_REVIEW),canConfirm=hasPermission(user,HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION),canAdd=hasAnyPermission(user,[HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ]);
 const [rows,setRows]=useState<HrProbationApplication[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[editing,setEditing]=useState<HrProbationApplication|null>(null),[participants,setParticipants]=useState<Participant[]>([]),[candidateId,setCandidateId]=useState(""),[candidate,setCandidate]=useState<HrEmployeeOption|undefined>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[reviewing,setReviewing]=useState<string|null>(null),[reviewComment,setReviewComment]=useState(""),abortRef=useRef<AbortController|null>(null),actionFlight=useRef(false);
 const [draft,setDraft]=useState<Draft>(emptyDraft),[retry,setRetry]=useState<Operation|null>(null),[message,setMessage]=useState("");
 const alive=useRef(true),unresolved=useRef<Operation|null>(null),confirmed=useRef(new Map<string,HrProbationApplication>());
 const blocked=busy||!!retry;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async(requestedPage=page)=>{
  if(!canRead){setLoading(false);return;}
  const c=new AbortController();abortRef.current?.abort();abortRef.current=c;setLoading(true);setError("");
  try{
   const result=await hrApi.probationApplications(getAccessToken(),requestedPage,pageSize,undefined,c.signal);
   if(c.signal.aborted||abortRef.current!==c)return;
   if(result.page!==requestedPage||result.page_size!==pageSize||!Number.isSafeInteger(result.total)||result.total<0||!Array.isArray(result.items)||result.items.some(row=>!row?.id||!validVersion(row.version)||!Array.isArray(row.participants)))throw new Error("转正申请分页响应无效，请重试。");
   if(requestedPage>Math.max(1,Math.ceil(result.total/pageSize))){setPage(1);return;}
   const reconciled=result.items.map(row=>{const saved=confirmed.current.get(row.id);if(!saved)return row;if(row.version>saved.version||row.version===saved.version&&sameFacts(row,saved)){confirmed.current.delete(row.id);return row;}return saved;});
   for(const saved of confirmed.current.values())if(!reconciled.some(row=>row.id===saved.id))reconciled.unshift(saved);
   setRows(reconciled);setTotal(Math.max(result.total,reconciled.length));
  }catch(reason){if(!c.signal.aborted&&abortRef.current===c)setError(hrLoadErrorMessage(reason,"加载转正申请失败"));}
  finally{if(!c.signal.aborted&&abortRef.current===c)setLoading(false);}
 },[canRead,page]);
 useEffect(()=>{void load();return()=>abortRef.current?.abort();},[load]);
 if(!canRead)return null;
 const beginEdit=(row:HrProbationApplication)=>{if(actionFlight.current||unresolved.current)return;setEditing(row);setDraft({applicationName:row.applicationName,applicationDate:row.applicationDate,reason:row.reason});setParticipants(row.participants.map(p=>({id:p.employeeId,fullName:p.employeeName,employeeCode:p.employeeCode,plannedConfirmationDate:p.plannedConfirmationDate})));setCandidateId("");setCandidate(undefined);setError("");};
 const reset=()=>{setEditing(null);setDraft(emptyDraft());setParticipants([]);setCandidateId("");setCandidate(undefined);};
 const addCandidate=()=>{if(!canAdd||!candidateId||!candidate)return;if(participants.some(p=>p.id===candidateId)){setError("该员工已在参与名单中。");return;}setParticipants(current=>[...current,{...candidate,plannedConfirmationDate:""}]);setCandidateId("");setCandidate(undefined);setError("");};
 const execute=async(op:Operation)=>{
  if(!alive.current||actionFlight.current||unresolved.current&&unresolved.current.key!==op.key)return;
  actionFlight.current=true;setBusy(true);setMessage("");
  try{
   const result=op.kind==="create"?await hrApi.createProbationApplication(op.body!,op.token,op.key):op.kind==="update"?await hrApi.updateProbationApplication(op.id!,op.body!,op.token,op.key):op.kind==="approve"||op.kind==="return"?await hrApi.reviewProbationApplication(op.id!,op.kind,op.comment??"",op.token,op.key):op.kind==="confirm"?await hrApi.confirmProbationApplication(op.id!,op.token,op.key):await hrApi.probationApplicationAction(op.id!,op.kind,op.token,op.key);
   if(!alive.current)return;
   const expected=op.kind==="create"||op.kind==="update"?"draft":op.kind==="submit"||op.kind==="resubmit"?"submitted":op.kind==="cancel"?"cancelled":op.kind==="approve"?"approved":op.kind==="return"?"returned":"confirmed";
   const actual=result?.participants;
   const targets=op.body?.participants??op.targets;
   if(!result?.id||op.id&&result.id!==op.id||result.status!==expected||!validVersion(result.version)||op.version!==undefined&&result.version<=op.version||!Array.isArray(actual)||!actual.length||new Set(actual.map(p=>p.employeeId)).size!==actual.length||targets&&(actual.length!==targets.length||targets.some(p=>!actual.some(saved=>saved.employeeId===p.employeeId&&saved.plannedConfirmationDate===p.plannedConfirmationDate)))||op.body&&(result.applicationName!==op.body.applicationName||result.applicationDate!==op.body.applicationDate||result.reason!==op.body.reason||actual.length!==op.body.participants.length||op.body.participants.some(p=>!actual.some(saved=>saved.employeeId===p.employeeId&&saved.plannedConfirmationDate===p.plannedConfirmationDate)))||op.kind==="return"&&result.reviewComment!==op.comment||op.kind==="confirm"&&(!result.confirmedAt||Number.isNaN(Date.parse(result.confirmedAt))||actual.some(p=>p.status!=="confirmed"||p.confirmedDate!==p.plannedConfirmationDate)))throw new Error("办理响应无法核对，请按原请求重试。");
   confirmed.current.set(result.id,result);abortRef.current?.abort();setRows(current=>current.some(row=>row.id===result.id)?current.map(row=>row.id===result.id?result:row):[result,...current]);
   unresolved.current=null;setRetry(null);setError("");setMessage(op.kind==="confirm"?"转正已办理，员工任职和转正日期已保存。":`申请已保存：${statusLabels[result.status]??result.status}。`);
   if(op.kind==="create"||op.kind==="update")reset();
   if(op.kind==="approve"||op.kind==="return"){setReviewing(null);setReviewComment("");}
   void load();
  }catch(reason){if(!alive.current)return;const text=hrLoadErrorMessage(reason,"办理转正申请失败");if(!(reason instanceof ApiError)||reason.status>=500||reason.status<400){unresolved.current=op;setRetry(op);setMessage(`${text}。结果尚未确认，请按原请求重试。`);}else{unresolved.current=null;setRetry(null);setMessage(text);}}
  finally{if(alive.current){actionFlight.current=false;setBusy(false);}}
 };
 const save=()=>{
  if(actionFlight.current||unresolved.current)return;
  if(!draft.applicationName.trim()||!draft.applicationDate||!draft.reason.trim()){setError("请填写申请名称、申请日期和申请内容");return;}
  if(!participants.length){setError("请至少选择一名试用期员工");return;}
  if(participants.some(item=>!item.plannedConfirmationDate)){setError("请填写所有已选员工的计划转正日期");return;}
  const body={...draft,applicationName:draft.applicationName.trim(),reason:draft.reason.trim(),participants:participants.map(item=>({employeeId:item.id,plannedConfirmationDate:item.plannedConfirmationDate}))};
  void execute({kind:editing?"update":"create",id:editing?.id,version:editing?.version,body,token:getAccessToken(),key:createIdempotencyKey("hr-probation-save")});
 };
 const action=(row:HrProbationApplication,kind:Operation["kind"])=>{if(actionFlight.current||unresolved.current||editing)return;const comment=reviewComment.trim();if(kind==="return"&&!comment){setMessage("请填写退回意见");return;}void execute({kind,id:row.id,version:row.version,targets:row.participants.map(p=>({employeeId:p.employeeId,plannedConfirmationDate:p.plannedConfirmationDate})),comment,token:getAccessToken(),key:createIdempotencyKey(`hr-probation-${kind}`)});};
 const pages=Math.max(1,Math.ceil(total/pageSize));
 return <section className="ds-panel">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">人事办理</span><h2>员工转正申请</h2></div><span>{loading?"加载中":`共 ${total} 条`}</span></div>
  {message?<p role="status">{message}</p>:null}{retry?<button type="button" className="ds-button ds-button-secondary" disabled={busy} onClick={()=>void execute(retry)}>按原请求重试</button>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {error?<button type="button" className="ds-button ds-button-secondary" onClick={()=>void load()} disabled={loading||busy}>重试申请列表</button>:null}
  {canAssign?<form key={editing?.id??"new"} className={styles.formGrid} onSubmit={event=>{event.preventDefault();save();}}>
   <label className="form-field"><span>申请名称</span><input name="applicationName" maxLength={128} value={draft.applicationName} disabled={blocked} onChange={event=>setDraft({...draft,applicationName:event.target.value})} required/></label>
   <label className="form-field"><span>申请日期</span><input name="applicationDate" type="date" value={draft.applicationDate} disabled={blocked} onChange={event=>setDraft({...draft,applicationDate:event.target.value})} required/></label>
   <label className={`form-field ${styles.fullWidth}`}><span>申请内容</span><textarea name="reason" maxLength={2000} value={draft.reason} disabled={blocked} onChange={event=>setDraft({...draft,reason:event.target.value})} required/></label>
   <fieldset className={`${styles.fullWidth} ${styles.profileGroup}`}><legend>试用期员工与计划转正日期</legend>
    <HrEmployeeSelection key={editing?.id??"new"} selectedId={candidateId} currentEmployee={candidate} onChange={(id,option)=>{setCandidateId(id);setCandidate(option);}} disabled={blocked} purpose="probation"/>
    <button type="button" className={`ds-button ds-button-secondary ${lifecycleStyles.participantAdd}`} disabled={blocked||!canAdd||!candidateId} onClick={addCandidate}>加入参与名单</button>
    {participants.length?<div className={lifecycleStyles.participantList}>{participants.map(participant=><div className={lifecycleStyles.participantRow} key={participant.id}>
     <strong>{participant.fullName} · {participant.employeeCode}</strong>
     <label className="form-field"><span>计划转正日期</span><input type="date" value={participant.plannedConfirmationDate} disabled={blocked} onChange={event=>setParticipants(current=>current.map(item=>item.id===participant.id?{...item,plannedConfirmationDate:event.target.value}:item))}/></label>
     <button type="button" className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>setParticipants(current=>current.filter(item=>item.id!==participant.id))}>移除 {participant.fullName}</button>
    </div>)}</div>:<p>参与名单为空，请明确选择并加入试用期员工。</p>}
   </fieldset>
   <div className={styles.actionRow}><button className="ds-button ds-button-primary" disabled={blocked}>{editing?"保存修改":"保存申请草稿"}</button>{editing?<button className="ds-button ds-button-secondary" type="button" disabled={blocked} onClick={reset}>放弃修改</button>:null}</div>
  </form>:null}
  <div className={`ds-mobile-record-list ${lifecycleStyles.checklistRecords}`}>{rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.applicationName} · {statusLabels[row.status]??row.status}</strong><span>{row.applicationNo} · {row.applicationDate}</span>{row.reviewComment?<span>审核意见：{row.reviewComment} · {row.reviewedAt??"时间未登记"}</span>:null}<p>{row.status==="approved"?"已批准，待授权人员确认转正。":"计划日期在确认前不会作为已生效转正日期。"}</p><div className={lifecycleStyles.participantList}>{row.participants.map(p=><section className="ds-mobile-record" key={p.id} aria-label={`${p.employeeName} · 转正日期`}><strong>{p.employeeName} · {p.employeeCode}</strong><span>{participantStatusLabels[p.status]??"状态待核对"}</span><dl><dt>计划转正日期</dt><dd>{p.plannedConfirmationDate||"未登记"}</dd><dt>已确认转正日期</dt><dd>{p.confirmedDate||"未登记"}</dd></dl></section>)}</div><span>确认办理时间：{row.confirmedAt??"未登记"}</span><div className={styles.actionRow}>{canAssign&&["draft","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>beginEdit(row)}>修改</button>:null}{canAssign&&row.status==="draft"?<button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>void action(row,"submit")}>提交审批</button>:null}{canAssign&&row.status==="returned"?<button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>void action(row,"resubmit")}>重新提交</button>:null}{canAssign&&["draft","submitted","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>void action(row,"cancel")}>取消申请</button>:null}{canReview&&row.status==="submitted"&&reviewing===row.id?<><textarea aria-label="审核意见" maxLength={1000} value={reviewComment} disabled={blocked} onChange={event=>setReviewComment(event.target.value)}/><button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>void action(row,"approve")}>批准</button><button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>void action(row,"return")}>退回</button></>:canReview&&row.status==="submitted"?<button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>{setReviewing(row.id);setReviewComment("");}}>填写审核意见</button>:null}{canConfirm&&row.status==="approved"?<button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>void action(row,"confirm")}>确认转正</button>:null}</div></article>):loading?<p>正在加载…</p>:<p>暂无转正申请。</p>}</div>
  <nav className={styles.actionRow} aria-label="转正申请分页"><button type="button" className="ds-button ds-button-secondary" disabled={loading||blocked||page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button><span>第 {page} / {pages} 页 · 共 {total} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={loading||blocked||page>=pages} onClick={()=>setPage(value=>value+1)}>下一页</button></nav>
 </section>;
}
