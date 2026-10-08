"use client";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
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

export function ProbationApplicationsPanel(){
 const user=useAuthUser();
 return <ProbationApplicationsContent key={JSON.stringify(user)}/>;
}

function ProbationApplicationsContent(){
 const user=useAuthUser(),canRead=hasPermission(user,HR_PERMISSIONS.HR_LIFECYCLE_READ),canAssign=hasPermission(user,HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN),canReview=hasPermission(user,HR_PERMISSIONS.HR_LIFECYCLE_REVIEW),canConfirm=hasPermission(user,HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION),canAdd=hasAnyPermission(user,[HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ]);
 const [rows,setRows]=useState<HrProbationApplication[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[editing,setEditing]=useState<HrProbationApplication|null>(null),[participants,setParticipants]=useState<Participant[]>([]),[candidateId,setCandidateId]=useState(""),[candidate,setCandidate]=useState<HrEmployeeOption|undefined>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),abortRef=useRef<AbortController|null>(null);
 const load=useCallback(async(requestedPage=page)=>{
  if(!canRead){setLoading(false);return;}
  const c=new AbortController();abortRef.current?.abort();abortRef.current=c;setLoading(true);setError("");
  try{
   const result=await hrApi.probationApplications(getAccessToken(),requestedPage,pageSize,undefined,c.signal);
   if(c.signal.aborted||abortRef.current!==c)return;
   if(result.page!==requestedPage||result.page_size!==pageSize||!Number.isSafeInteger(result.total)||result.total<0)throw new Error("转正申请分页响应无效，请重试。");
   if(requestedPage>Math.max(1,Math.ceil(result.total/pageSize))){setPage(1);return;}
   setRows(result.items);setTotal(result.total);
  }catch(reason){if(!c.signal.aborted&&abortRef.current===c)setError(hrLoadErrorMessage(reason,"加载转正申请失败"));}
  finally{if(!c.signal.aborted&&abortRef.current===c)setLoading(false);}
 },[canRead,page]);
 useEffect(()=>{void load();return()=>abortRef.current?.abort();},[load]);
 if(!canRead)return null;
 const beginEdit=(row:HrProbationApplication)=>{setEditing(row);setParticipants(row.participants.map(p=>({id:p.employeeId,fullName:p.employeeName,employeeCode:p.employeeCode,plannedConfirmationDate:p.plannedConfirmationDate})));setCandidateId("");setCandidate(undefined);setError("");};
 const reset=()=>{setEditing(null);setParticipants([]);setCandidateId("");setCandidate(undefined);};
 const addCandidate=()=>{if(!canAdd||!candidateId||!candidate)return;if(participants.some(p=>p.id===candidateId)){setError("该员工已在参与名单中。");return;}setParticipants(current=>[...current,{...candidate,plannedConfirmationDate:""}]);setCandidateId("");setCandidate(undefined);setError("");};
 const save=async(form:FormData,element:HTMLFormElement)=>{
  if(busy)return;
  if(!participants.length){setError("请至少选择一名试用期员工");return;}
  if(participants.some(item=>!item.plannedConfirmationDate)){setError("请填写所有已选员工的计划转正日期");return;}
  const body={applicationName:String(form.get("applicationName")),applicationDate:String(form.get("applicationDate")),reason:String(form.get("reason")),participants:participants.map(item=>({employeeId:item.id,plannedConfirmationDate:item.plannedConfirmationDate}))};
  setBusy(true);setError("");
  try{if(editing)await hrApi.updateProbationApplication(editing.id,body,getAccessToken());else await hrApi.createProbationApplication(body,getAccessToken());element.reset();reset();await load();}
  catch(reason){setError(hrLoadErrorMessage(reason,editing?"修改转正申请失败":"创建转正申请失败"));}
  finally{setBusy(false);}
 };
 const action=async(row:HrProbationApplication,kind:"submit"|"resubmit"|"cancel"|"approve"|"return"|"confirm")=>{if(busy)return;setBusy(true);setError("");try{if(kind==="approve"||kind==="return")await hrApi.reviewProbationApplication(row.id,kind,kind==="return"?"请补充或修正转正信息":"",getAccessToken());else if(kind==="confirm")await hrApi.confirmProbationApplication(row.id,getAccessToken());else await hrApi.probationApplicationAction(row.id,kind,getAccessToken());await load();}catch(e){setError(hrLoadErrorMessage(e,"办理转正申请失败"));}finally{setBusy(false);}};
 const pages=Math.max(1,Math.ceil(total/pageSize));
 return <section className="ds-panel">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">人事办理</span><h2>员工转正申请</h2></div><span>{loading?"加载中":`共 ${total} 条`}</span></div>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {error?<button type="button" className="ds-button ds-button-secondary" onClick={()=>void load()} disabled={loading}>重试申请列表</button>:null}
  {canAssign?<form key={editing?.id??"new"} className={styles.formGrid} onSubmit={event=>{event.preventDefault();void save(new FormData(event.currentTarget),event.currentTarget);}}>
   <label className="form-field"><span>申请名称</span><input name="applicationName" maxLength={128} defaultValue={editing?.applicationName} required/></label>
   <label className="form-field"><span>申请日期</span><input name="applicationDate" type="date" defaultValue={editing?.applicationDate} required/></label>
   <label className={`form-field ${styles.fullWidth}`}><span>申请内容</span><textarea name="reason" maxLength={2000} defaultValue={editing?.reason} required/></label>
   <fieldset className={`${styles.fullWidth} ${styles.profileGroup}`}><legend>试用期员工与计划转正日期</legend>
    <HrEmployeeSelection key={editing?.id??"new"} selectedId={candidateId} currentEmployee={candidate} onChange={(id,option)=>{setCandidateId(id);setCandidate(option);}} disabled={busy} purpose="probation"/>
    <button type="button" className={`ds-button ds-button-secondary ${lifecycleStyles.participantAdd}`} disabled={busy||!canAdd||!candidateId} onClick={addCandidate}>加入参与名单</button>
    {participants.length?<div className={lifecycleStyles.participantList}>{participants.map(participant=><div className={lifecycleStyles.participantRow} key={participant.id}>
     <strong>{participant.fullName} · {participant.employeeCode}</strong>
     <label className="form-field"><span>计划转正日期</span><input type="date" value={participant.plannedConfirmationDate} onChange={event=>setParticipants(current=>current.map(item=>item.id===participant.id?{...item,plannedConfirmationDate:event.target.value}:item))}/></label>
     <button type="button" className="ds-button ds-button-secondary" disabled={busy} onClick={()=>setParticipants(current=>current.filter(item=>item.id!==participant.id))}>移除 {participant.fullName}</button>
    </div>)}</div>:<p>参与名单为空，请明确选择并加入试用期员工。</p>}
   </fieldset>
   <div className={styles.actionRow}><button className="ds-button ds-button-primary" disabled={busy}>{editing?"保存修改":"保存申请草稿"}</button>{editing?<button className="ds-button ds-button-secondary" type="button" disabled={busy} onClick={reset}>放弃修改</button>:null}</div>
  </form>:null}
  <div className={`ds-mobile-record-list ${lifecycleStyles.checklistRecords}`}>{rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}><strong>{row.applicationName} · {statusLabels[row.status]??row.status}</strong><span>{row.applicationNo} · {row.applicationDate}</span><p>计划日期在确认前不会作为已生效转正日期。</p><div className={lifecycleStyles.participantList}>{row.participants.map(p=><section className="ds-mobile-record" key={p.id} aria-label={`${p.employeeName} · 转正日期`}><strong>{p.employeeName} · {p.employeeCode}</strong><span>{participantStatusLabels[p.status]??"状态待核对"}</span><dl><dt>计划转正日期</dt><dd>{p.plannedConfirmationDate||"未登记"}</dd><dt>已确认转正日期</dt><dd>{p.confirmedDate||"未登记"}</dd></dl></section>)}</div><span>确认办理时间：{row.confirmedAt??"未登记"}</span><div className={styles.actionRow}>{canAssign&&["draft","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={busy} onClick={()=>beginEdit(row)}>修改</button>:null}{canAssign&&row.status==="draft"?<button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void action(row,"submit")}>提交审批</button>:null}{canAssign&&row.status==="returned"?<button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void action(row,"resubmit")}>重新提交</button>:null}{canAssign&&["draft","submitted","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={busy} onClick={()=>void action(row,"cancel")}>取消申请</button>:null}{canReview&&row.status==="submitted"?<><button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void action(row,"approve")}>批准</button><button className="ds-button ds-button-secondary" disabled={busy} onClick={()=>void action(row,"return")}>退回</button></>:null}{canConfirm&&row.status==="approved"?<button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void action(row,"confirm")}>确认转正</button>:null}</div></article>):loading?<p>正在加载转正申请…</p>:<p>暂无转正申请。</p>}</div>
  <nav className={styles.actionRow} aria-label="转正申请分页"><button type="button" className="ds-button ds-button-secondary" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button><span>第 {page} / {pages} 页 · 共 {total} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={loading||page>=pages} onClick={()=>setPage(value=>value+1)}>下一页</button></nav>
 </section>;
}
