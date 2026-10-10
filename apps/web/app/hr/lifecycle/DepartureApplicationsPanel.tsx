"use client";
import Link from "next/link";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {ApiError,createIdempotencyKey} from "../../../lib/api-client";
import {hrApi,type HrDepartureApplication} from "../../../lib/hr-api";
import {hasAnyPermission,hasPermission} from "../../../lib/permissions";
import {hrLoadErrorMessage} from "../hr-errors";
import {DepartureEmployeePicker} from "./DepartureEmployeePicker";
import styles from "../hr-workbench.module.css";

const labels:Record<string,string>={draft:"草稿",submitted:"待审批",returned:"已退回",approved:"清场办理中",cancelled:"已取消",applied:"已离职",pending:"待办理",completed:"已完成",waived:"已豁免",settled:"已结算",open:"待归档",closed:"已归档"};
const localToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
type Draft={applicationName:string;applicationDate:string;plannedDepartureDate:string;departureType:string;reason:string};
type Kind="create"|"update"|"submit"|"resubmit"|"cancel"|"approve"|"return"|"apply"|"interview"|"survey"|"handover"|"wage"|"archive";
type Operation={kind:Kind;id?:string;version?:number;employeeId?:string;body?:Record<string,unknown>;comment?:string;token:string|undefined;key:string;expectedStatus:string};
const newDraft=():Draft=>({applicationName:"员工离职办理",applicationDate:localToday(),plannedDepartureDate:localToday(),departureType:"主动离职",reason:""});
const validVersion=(v:number)=>Number.isSafeInteger(v)&&v>0;
const done=(value:string)=>["completed","waived","settled","closed"].includes(value);

export function DepartureApplicationsPanel({employeeId}:{employeeId?:string}){
 const user=useAuthUser();
 return <DepartureApplicationsView key={`${JSON.stringify(user)}:${employeeId??"all"}`} employeeId={employeeId}/>;
}
function DepartureApplicationsView({employeeId}:{employeeId?:string}){
 const user=useAuthUser(),canRead=hasAnyPermission(user,[HR_PERMISSIONS.HR_DEPARTURE_READ,HR_PERMISSIONS.HR_DEPARTURE_TEAM_READ,HR_PERMISSIONS.HR_DEPARTURE_SELF_READ]),canOperateScope=hasAnyPermission(user,[HR_PERMISSIONS.HR_DEPARTURE_READ,HR_PERMISSIONS.HR_DEPARTURE_TEAM_READ]),canManage=canOperateScope&&hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_MANAGE),canReview=hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_REVIEW),canInterview=hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_INTERVIEW),canSurvey=hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_SURVEY),canHandover=canOperateScope&&hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_HANDOVER),canWage=hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_WAGE_SETTLE),canArchive=hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_ARCHIVE_CLOSE),canApply=hasPermission(user,HR_PERMISSIONS.HR_DEPARTURE_APPLY);
 const [page,setPage]=useState(1),[total,setTotal]=useState(0);
 const [rows,setRows]=useState<HrDepartureApplication[]>([]),[draftVersion,setDraftVersion]=useState(0),[editing,setEditing]=useState<HrDepartureApplication|null>(null),[processing,setProcessing]=useState<HrDepartureApplication|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),abortRef=useRef<AbortController|null>(null),busyRef=useRef(false);
 const [draft,setDraft]=useState<Draft>(newDraft),[reviewing,setReviewing]=useState<string|null>(null),[opinion,setOpinion]=useState(""),[retry,setRetry]=useState<Operation|null>(null),[message,setMessage]=useState("");
 const alive=useRef(true),unresolved=useRef<Operation|null>(null),receipts=useRef(new Map<string,HrDepartureApplication>());
 const blocked=busy||!!retry;
 const [clearanceDrafts,setClearanceDrafts]=useState<Record<string,string|boolean>>({});
 const clearValue=(kind:string,field:string)=>String(clearanceDrafts[`${processing?.id}:${kind}:${field}`]??""),clearSet=(kind:string,field:string,value:string|boolean)=>setClearanceDrafts(current=>({...current,[`${processing?.id}:${kind}:${field}`]:value}));
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async(requestedPage=1)=>{
  if(!canRead){setLoading(false);return;}
  const c=new AbortController();abortRef.current?.abort();abortRef.current=c;setLoading(true);setError("");
  try{const list=await hrApi.departureApplications(getAccessToken(),requestedPage,50,undefined,c.signal,employeeId);
   if(c.signal.aborted||abortRef.current!==c)return;
   if(list.page!==requestedPage||list.page_size!==50||!Number.isSafeInteger(list.total)||list.total<0||!Array.isArray(list.items)||list.items.some(row=>!row?.id||!validVersion(row.version)))throw new Error("离职申请分页响应无效，请重试。");
   if(requestedPage>Math.max(1,Math.ceil(list.total/50))){void load(1);return;}
   const items=list.items.map(row=>{const saved=receipts.current.get(row.id);if(!saved)return row;if(row.version>saved.version||row.version===saved.version&&JSON.stringify(row)===JSON.stringify(saved)){receipts.current.delete(row.id);return row;}return saved;});
   for(const saved of receipts.current.values())if(!items.some(row=>row.id===saved.id))items.unshift(saved);
   setRows(items);setTotal(Math.max(list.total,items.length));setPage(requestedPage);setProcessing(current=>current?items.find(row=>row.id===current.id)??null:null);
  }catch(e){if(!c.signal.aborted&&abortRef.current===c)setError(hrLoadErrorMessage(e,"加载离职申请失败"));}
  finally{if(!c.signal.aborted&&abortRef.current===c)setLoading(false);}
 },[canRead,employeeId]);
 useEffect(()=>{void load();return()=>abortRef.current?.abort();},[load]);
 if(!canRead)return null;
 const reset=()=>{setEditing(null);setDraft(newDraft());setDraftVersion(value=>value+1);};
 const edit=(row:HrDepartureApplication)=>{if(busyRef.current||unresolved.current)return;setEditing(row);setDraft({applicationName:row.applicationName,applicationDate:row.applicationDate,plannedDepartureDate:row.plannedDepartureDate,departureType:row.departureType,reason:row.reason??""});};
 const execute=async(op:Operation)=>{
  if(!alive.current||busyRef.current||unresolved.current&&unresolved.current.key!==op.key)return;
  busyRef.current=true;setBusy(true);setMessage("");setError("");
  try{
   const args=[op.token,op.key] as const;
   const result=op.kind==="create"?await hrApi.createDepartureApplication(op.body!,...args):op.kind==="update"?await hrApi.updateDepartureApplication(op.id!,op.body!,...args):op.kind==="approve"||op.kind==="return"?await hrApi.reviewDepartureApplication(op.id!,op.kind,op.comment??"",...args):op.kind==="apply"?await hrApi.applyDepartureApplication(op.id!,...args):op.kind==="interview"?await hrApi.recordDepartureInterview(op.id!,op.body!,...args):op.kind==="survey"?await hrApi.recordDepartureSurvey(op.id!,op.body!,...args):op.kind==="handover"?await hrApi.recordDepartureHandover(op.id!,op.body!,...args):op.kind==="wage"?await hrApi.recordDepartureWage(op.id!,op.body!,...args):op.kind==="archive"?await hrApi.closeDepartureArchive(op.id!,op.body!,...args):await hrApi.departureApplicationAction(op.id!,op.kind,...args);
   if(!alive.current)return;
   let valid=!!result?.id&&(!op.id||result.id===op.id)&&validVersion(result.version)&&(op.version===undefined||result.version>op.version)&&result.status===op.expectedStatus&&(!op.employeeId||result.employeeId===op.employeeId);
   if(op.kind==="create"||op.kind==="update")valid=valid&&Object.entries(op.body!).every(([k,v])=>result[k as keyof HrDepartureApplication]===v);
   if(op.kind==="return")valid=valid&&(result.reviewComment===undefined||result.reviewComment===op.comment);
   if(op.kind==="interview")valid=valid&&result.interviewStatus===op.body!.status&&(result.interviewSummary===undefined||result.interviewSummary===op.body!.summary);
   if(op.kind==="survey")valid=valid&&result.surveyStatus===op.body!.status&&(result.surveySummary===undefined||result.surveySummary===op.body!.summary);
   if(op.kind==="handover")valid=valid&&result.handoverStatus===op.body!.status&&(result.handoverSummary===undefined||result.handoverSummary===op.body!.summary);
   if(op.kind==="wage")valid=valid&&result.wageStatus===op.body!.status&&(result.wageNote===undefined||result.wageNote===op.body!.note);
   if(op.kind==="archive")valid=valid&&result.archiveStatus==="closed"&&(result.archiveNote===undefined||result.archiveNote===op.body!.note);
   if(op.kind==="apply")valid=valid&&!!result.appliedAt&&!Number.isNaN(Date.parse(result.appliedAt));
   if(!valid)throw new Error("办理响应无法核对，请按原请求重试。");
   receipts.current.set(result.id,result);setRows(current=>[result,...current.filter(row=>row.id!==result.id)]);setProcessing(current=>current?.id===result.id?result:current);unresolved.current=null;setRetry(null);setReviewing(null);setOpinion("");
   if(op.kind==="create"||op.kind==="update")reset();
   setMessage(op.kind==="apply"?"离职已生效，员工任职和离职日期已保存。":`办理已保存：${labels[result.status]??result.status}。`);void load(page);
  }catch(e){if(!alive.current)return;const idempotencyStillPending=e instanceof ApiError&&e.status===409&&(e.message==="The same idempotency key is still processing"||e.message==="Idempotency reservation changed; retry request");const definite=e instanceof ApiError&&e.status>=400&&e.status<500&&!idempotencyStillPending;
   if(definite){unresolved.current=null;setRetry(null);}else{unresolved.current=op;setRetry(op);}
   setError(hrLoadErrorMessage(e,"办理失败"));setMessage(definite?"":"结果尚未确认，请按原请求重试。");
  }finally{if(alive.current){busyRef.current=false;setBusy(false);}}
 };
 const save=(form:FormData)=>{if(busyRef.current||unresolved.current)return;const body={...draft,employeeId:String(form.get("employeeId")??"")};void execute({kind:editing?"update":"create",id:editing?.id,version:editing?.version,employeeId:body.employeeId,body,expectedStatus:editing?.status??"draft",token:getAccessToken(),key:createIdempotencyKey("hr-departure-save")});};
 const action=(row:HrDepartureApplication,kind:"submit"|"resubmit"|"cancel"|"approve"|"return"|"apply")=>{if(busyRef.current||unresolved.current||editing)return;const comment=opinion.trim();if(kind==="return"&&!comment){setMessage("请填写退回意见");return;}void execute({kind,id:row.id,version:row.version,employeeId:row.employeeId,comment,expectedStatus:kind==="submit"||kind==="resubmit"?"submitted":kind==="cancel"?"cancelled":kind==="approve"?"approved":kind==="return"?"returned":"applied",token:getAccessToken(),key:createIdempotencyKey(`hr-departure-${kind}`)});};
 const clearance=(kind:"interview"|"survey"|"handover"|"wage"|"archive",form:FormData)=>{if(!processing||busyRef.current||unresolved.current)return;const note=String(form.get("note")),waived=form.get("waived")==="on";let body:Record<string,unknown>={note};
  if(kind==="interview")body={status:waived?"waived":"completed",place:String(form.get("place"))||undefined,summary:note};
  if(kind==="survey")body={status:waived?"waived":"completed",reasonCodes:[...new Set(String(form.get("reasonCodes")).split(/[，,]/).map(x=>x.trim()).filter(Boolean))],summary:note};
  if(kind==="handover")body={status:waived?"waived":"completed",handoverToEmployeeId:String(form.get("handoverToEmployeeId"))||undefined,summary:note};
  if(kind==="wage")body={status:waived?"waived":"settled",note};
  void execute({kind,id:processing.id,version:processing.version,employeeId:processing.employeeId,body,expectedStatus:"approved",token:getAccessToken(),key:createIdempotencyKey(`hr-departure-${kind}`)});
 };
 return <section id="departure-clearance" className="ds-panel">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">人事运营 · 离职办理</span><h2>离职申请与清场</h2></div><span>{loading?"加载中":`共 ${total} 条 · 本页 ${rows.length} 条`}</span></div>
  {employeeId?<p className="muted-text">已按当前员工筛选。<Link className="ds-button ds-button-secondary" href="/hr/lifecycle#departure-clearance">查看全部离职流程</Link></p>:null}
  {error?<p className="form-error" role="alert">{error}<button className="ds-button ds-button-secondary" disabled={busy} onClick={()=>void load(page)}>重试列表</button></p>:null}
  {message?<p role="status">{message}</p>:null}{retry?<div className={styles.actionRow}><button className="ds-button ds-button-primary" disabled={busy} onClick={()=>void execute(retry)}>按原请求重试</button><button className="ds-button ds-button-secondary" disabled={busy} onClick={()=>{unresolved.current=null;setRetry(null);setMessage("已停止重试，请核对办理结果后再操作。");void load(page);}}>停止重试并核对</button></div>:null}
  {canManage?<form key={editing?.id??`new:${employeeId??"all"}:${draftVersion}`} className={styles.formGrid} onSubmit={event=>{event.preventDefault();void save(new FormData(event.currentTarget));}}>
   <label className="form-field"><span>申请名称</span><input name="applicationName" maxLength={128} value={draft.applicationName} disabled={blocked} onChange={event=>setDraft(current=>({...current,applicationName:event.target.value}))} required/></label>
   <DepartureEmployeePicker purpose="application" name="employeeId" label="员工" initialSelection={editing?{id:editing.employeeId,employeeName:editing.employeeName,employeeCode:editing.employeeCode}:undefined} initialId={employeeId} required disabled={blocked}/>
   <label className="form-field"><span>离职类型</span><select name="departureType" value={draft.departureType} disabled={blocked} onChange={event=>setDraft(current=>({...current,departureType:event.target.value}))}><option>主动离职</option><option>协商解除</option><option>合同终止</option><option>公司解除</option><option>退休</option><option>其他</option></select></label>
   <label className="form-field"><span>申请日期</span><input name="applicationDate" type="date" value={draft.applicationDate} disabled={blocked} onChange={event=>setDraft(current=>({...current,applicationDate:event.target.value}))} required/></label>
   <label className="form-field"><span>计划离职日期</span><input name="plannedDepartureDate" type="date" min={draft.applicationDate} value={draft.plannedDepartureDate} disabled={blocked} onChange={event=>setDraft(current=>({...current,plannedDepartureDate:event.target.value}))} required/></label>
   <label className={`form-field ${styles.fullWidth}`}><span>离职原因</span><textarea name="reason" maxLength={2000} value={draft.reason} disabled={blocked} onChange={event=>setDraft(current=>({...current,reason:event.target.value}))} required/></label>
   <div className={styles.actionRow}><button className="ds-button ds-button-primary" disabled={blocked}>{editing?"保存修改":"保存申请草稿"}</button>{editing?<button type="button" className="ds-button ds-button-secondary" disabled={blocked} onClick={reset}>放弃修改</button>:null}</div>
  </form>:null}
  <div className={`ds-mobile-record-list ${styles.departureRecords}`}>{rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}>
   <strong>{row.employeeName} · {labels[row.status]??row.status}</strong><span>{row.applicationNo} · {row.applicationDate} 申请 · {row.plannedDepartureDate} 计划离职</span><span>{row.orgName??"未设部门"} · {row.departureType}</span>
   {["approved","applied"].includes(row.status)?<span>面谈 {labels[row.interviewStatus]??row.interviewStatus} · 调查 {labels[row.surveyStatus]??row.surveyStatus} · 交接 {labels[row.handoverStatus]??row.handoverStatus} · 工资 {labels[row.wageStatus]??row.wageStatus} · 档案 {labels[row.archiveStatus]??row.archiveStatus}</span>:null}
   {row.reviewComment!==undefined&&row.reviewComment?<p>审核意见：{row.reviewComment} · {row.reviewedAt??"时间未登记"}</p>:null}
   {row.appliedAt?<p>离职生效办理时间：{row.appliedAt}</p>:null}
   {["approved","applied"].includes(row.status)?<dl><dt>面谈地点</dt><dd>{row.interviewPlace??"未提供"}</dd><dt>面谈纪要</dt><dd>{row.interviewSummary??"未提供"}</dd><dt>调查原因代码</dt><dd>{row.surveyReasonCodes?.length?row.surveyReasonCodes.join("、"):"未提供"}</dd><dt>调查结论</dt><dd>{row.surveySummary??"未提供"}</dd><dt>接交员工</dt><dd>{row.handoverToEmployeeId??"未指定或已豁免"}</dd><dt>交接说明</dt><dd>{row.handoverSummary??"未提供"}</dd><dt>结算说明</dt><dd>{row.wageNote??"未提供"}</dd><dt>归档说明</dt><dd>{row.archiveNote??"未提供"}</dd></dl>:null}
   <div className={styles.actionRow}>{canManage&&["draft","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>edit(row)}>修改</button>:null}{canManage&&row.status==="draft"?<button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>void action(row,"submit")}>提交审批</button>:null}{canManage&&row.status==="returned"?<button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>void action(row,"resubmit")}>重新提交</button>:null}{canManage&&["draft","submitted","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>void action(row,"cancel")}>取消</button>:null}{canReview&&row.status==="submitted"&&reviewing!==row.id?<button className="ds-button ds-button-secondary" disabled={blocked||!!editing} onClick={()=>{setReviewing(row.id);setOpinion("");}}>填写审核意见</button>:canReview&&row.status==="submitted"?<><textarea aria-label="审核意见" maxLength={1000} value={opinion} disabled={blocked} onChange={event=>setOpinion(event.target.value)}/><button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>void action(row,"approve")}>批准</button><button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>void action(row,"return")}>退回</button></>:null}{row.status==="approved"&&(canInterview||canSurvey||canHandover||canWage||canArchive)?<button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>setProcessing(row)}>办理清场</button>:null}{canApply&&row.status==="approved"?<button className="ds-button ds-button-primary" disabled={blocked||row.plannedDepartureDate>localToday()||![row.interviewStatus,row.surveyStatus,row.handoverStatus,row.wageStatus,row.archiveStatus].every(done)} onClick={()=>void action(row,"apply")}>确认离职生效</button>:null}</div>
  </article>):loading?<p>正在加载离职申请…</p>:<p>暂无离职申请。</p>}</div>
  <nav aria-label="离职申请分页" className={styles.heroActions}><button type="button" className="ds-button ds-button-secondary" disabled={loading||blocked||page<=1} onClick={()=>void load(page-1)}>上一页</button><span role="status">第 {page} / {Math.max(1,Math.ceil(total/50))} 页 · 共 {total} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={loading||blocked||page>=Math.max(1,Math.ceil(total/50))} onClick={()=>void load(page+1)}>下一页</button></nav>
  {processing?<div key={processing.id} className={styles.operationGroup}><header><div><span className="ds-eyebrow">清场办理</span><h3>{processing.employeeName} · {processing.applicationNo}</h3></div><button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>setProcessing(null)}>关闭</button></header><fieldset disabled={blocked} style={{border:0,padding:0,minWidth:0}}><div className={styles.operationGrid}>
   {canInterview&&!done(processing.interviewStatus)?<form onSubmit={event=>{event.preventDefault();void clearance("interview",new FormData(event.currentTarget));}}><strong>离职面谈</strong><label className="form-field"><span>地点</span><input name="place" value={clearValue("interview","place")} onChange={event=>clearSet("interview","place",event.target.value)} maxLength={200}/></label><label className="form-field"><span>面谈纪要</span><textarea name="note" value={clearValue("interview","note")} onChange={event=>clearSet("interview","note",event.target.value)} required maxLength={2000}/></label><label><input name="waived" checked={clearanceDrafts[`${processing.id}:interview:waived`]===true} onChange={event=>clearSet("interview","waived",event.target.checked)} type="checkbox"/> 经审批豁免</label><button className="ds-button ds-button-primary" disabled={blocked}>确认</button></form>:null}
   {canSurvey&&!done(processing.surveyStatus)?<form onSubmit={event=>{event.preventDefault();void clearance("survey",new FormData(event.currentTarget));}}><strong>离职调查</strong><label className="form-field"><span>原因代码（逗号分隔）</span><input name="reasonCodes" value={clearValue("survey","reasonCodes")} onChange={event=>clearSet("survey","reasonCodes",event.target.value)} maxLength={500}/></label><label className="form-field"><span>调查结论</span><textarea name="note" value={clearValue("survey","note")} onChange={event=>clearSet("survey","note",event.target.value)} required maxLength={2000}/></label><label><input name="waived" checked={clearanceDrafts[`${processing.id}:survey:waived`]===true} onChange={event=>clearSet("survey","waived",event.target.checked)} type="checkbox"/> 经审批豁免</label><button className="ds-button ds-button-primary" disabled={blocked}>确认</button></form>:null}
   {canHandover&&!done(processing.handoverStatus)?<form key={processing.id} onSubmit={event=>{event.preventDefault();void clearance("handover",new FormData(event.currentTarget));}}><strong>工作交接</strong><DepartureEmployeePicker purpose="handover" name="handoverToEmployeeId" label="接交员工" excludeEmployeeId={processing.employeeId} disabled={blocked}/><label className="form-field"><span>交接说明</span><textarea name="note" value={clearValue("handover","note")} onChange={event=>clearSet("handover","note",event.target.value)} required maxLength={2000}/></label><label><input name="waived" checked={clearanceDrafts[`${processing.id}:handover:waived`]===true} onChange={event=>clearSet("handover","waived",event.target.checked)} type="checkbox"/> 经审批豁免</label><button className="ds-button ds-button-primary" disabled={blocked}>确认</button></form>:null}
   {canWage&&!done(processing.wageStatus)?<form onSubmit={event=>{event.preventDefault();void clearance("wage",new FormData(event.currentTarget));}}><strong>工资结算</strong><label className="form-field"><span>结算说明</span><textarea name="note" value={clearValue("wage","note")} onChange={event=>clearSet("wage","note",event.target.value)} required maxLength={1000}/></label><label><input name="waived" checked={clearanceDrafts[`${processing.id}:wage:waived`]===true} onChange={event=>clearSet("wage","waived",event.target.checked)} type="checkbox"/> 经审批豁免</label><button className="ds-button ds-button-primary" disabled={blocked}>确认</button></form>:null}
   {canArchive&&done(processing.interviewStatus)&&done(processing.surveyStatus)&&done(processing.handoverStatus)&&done(processing.wageStatus)&&processing.archiveStatus!=="closed"?<form onSubmit={event=>{event.preventDefault();void clearance("archive",new FormData(event.currentTarget));}}><strong>人事档案关闭</strong><label className="form-field"><span>归档说明</span><textarea name="note" value={clearValue("archive","note")} onChange={event=>clearSet("archive","note",event.target.value)} required maxLength={1000}/></label><button className="ds-button ds-button-primary" disabled={blocked}>关闭档案</button></form>:null}
  </div></fieldset></div>:null}
 </section>;
}
