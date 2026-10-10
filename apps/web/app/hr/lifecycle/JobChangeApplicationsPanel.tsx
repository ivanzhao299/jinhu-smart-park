"use client";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrJobChangeApplication,type HrJobChangeOptions} from "../../../lib/hr-api";
import {hasAnyPermission,hasPermission} from "../../../lib/permissions";
import {hrLoadErrorMessage} from "../hr-errors";
import {ApiError,createIdempotencyKey} from "../../../lib/api-client";
import {HrEmployeeSelection} from "../components/HrEmployeeSelection";
import {JobChangeHistory} from "./JobChangeHistory";
import {businessDate} from "../../../lib/business-date";
import lifecycleStyles from "./lifecycle.module.css";
import styles from "../hr-workbench.module.css";

const labels:Record<string,string>={draft:"草稿",submitted:"待审批",returned:"已退回",approved:"已批准",cancelled:"已取消",applied:"已生效"};
const pageSize=20;
type Draft={applicationName:string;applicationDate:string;effectiveDate:string;changeType:string;reason:string};
const emptyDraft=():Draft=>({applicationName:"",applicationDate:businessDate(),effectiveDate:businessDate(),changeType:"transfer",reason:""});
type Operation={kind:"create"|"update"|"submit"|"resubmit"|"cancel"|"approve"|"return"|"apply";id?:string;status?:string;body?:Draft&{employeeId:string;afterOrgId:string;afterPositionId?:string};comment?:string;token:string|undefined;key:string};

export function JobChangeApplicationsPanel(){
 const user=useAuthUser();
 return <JobChangeApplicationsContent key={JSON.stringify(user)}/>;
}

function JobChangeApplicationsContent(){
 const user=useAuthUser(),canRead=hasAnyPermission(user,[HR_PERMISSIONS.HR_JOB_CHANGE_READ,HR_PERMISSIONS.HR_JOB_CHANGE_TEAM_READ,HR_PERMISSIONS.HR_JOB_CHANGE_SELF_READ]),canManage=hasPermission(user,HR_PERMISSIONS.HR_JOB_CHANGE_MANAGE),canReview=hasPermission(user,HR_PERMISSIONS.HR_JOB_CHANGE_REVIEW),canApply=hasPermission(user,HR_PERMISSIONS.HR_JOB_CHANGE_APPLY);
 const [rows,setRows]=useState<HrJobChangeApplication[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[options,setOptions]=useState<HrJobChangeOptions>({employees:[],orgs:[],positions:[]}),[editing,setEditing]=useState<HrJobChangeApplication|null>(null),[employeeId,setEmployeeId]=useState(""),[afterOrgId,setAfterOrgId]=useState(""),[afterPositionId,setAfterPositionId]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[optionsError,setOptionsError]=useState(""),abortRef=useRef<AbortController|null>(null),optionsAbort=useRef<AbortController|null>(null);
 const [draft,setDraft]=useState<Draft>(emptyDraft),[opinions,setOpinions]=useState<Record<string,string>>({}),[retry,setRetry]=useState<Operation|null>(null),[message,setMessage]=useState("");
 const lock=useRef(false),unresolved=useRef<Operation|null>(null),alive=useRef(true),confirmed=useRef(new Map<string,HrJobChangeApplication>());
 const blocked=busy||!!retry;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async(requestedPage=page)=>{
  if(!canRead){setLoading(false);return;}
  const c=new AbortController();abortRef.current?.abort();abortRef.current=c;setLoading(true);setError("");
  try{
   const result=await hrApi.jobChangeApplications(getAccessToken(),requestedPage,pageSize,undefined,c.signal);
   if(c.signal.aborted||abortRef.current!==c)return;
   if(result.page!==requestedPage||result.page_size!==pageSize||!Number.isSafeInteger(result.total)||result.total<0)throw new Error("岗位变更申请分页响应无效，请重试。");
   if(requestedPage>Math.max(1,Math.ceil(result.total/pageSize))){setPage(1);return;}
   const reconciled=result.items.map(row=>{const saved=confirmed.current.get(row.id);if(!saved)return row;if(row.status===saved.status&&typeof row.version==="number"&&typeof saved.version==="number"&&row.version>=saved.version){confirmed.current.delete(row.id);return row;}return saved;});
   for(const saved of confirmed.current.values())if(!reconciled.some(row=>row.id===saved.id))reconciled.unshift(saved);
   setRows(reconciled);setTotal(Math.max(result.total,reconciled.length));
  }catch(reason){if(!c.signal.aborted&&abortRef.current===c)setError(hrLoadErrorMessage(reason,"加载岗位变更申请失败"));}
  finally{if(!c.signal.aborted&&abortRef.current===c)setLoading(false);}
 },[canRead,page]);
 const loadOptions=useCallback(async()=>{
  if(!canManage)return;
  const c=new AbortController();optionsAbort.current?.abort();optionsAbort.current=c;setOptionsError("");
  try{const refs=await hrApi.jobChangeOptions(getAccessToken(),c.signal,false);if(!c.signal.aborted&&optionsAbort.current===c)setOptions(refs);}
  catch(reason){if(!c.signal.aborted&&optionsAbort.current===c)setOptionsError(hrLoadErrorMessage(reason,"加载岗位变更基础数据失败"));}
 },[canManage]);
 useEffect(()=>{void load();return()=>abortRef.current?.abort();},[load]);
 useEffect(()=>{void loadOptions();return()=>optionsAbort.current?.abort();},[loadOptions]);
 const positions=useMemo(()=>options.positions.filter(x=>x.orgId===afterOrgId),[afterOrgId,options.positions]);
 if(!canRead)return null;
 const edit=(row:HrJobChangeApplication)=>{setEditing(row);setEmployeeId(row.employeeId);setAfterOrgId(row.afterOrgId);setAfterPositionId(row.afterPositionId??"");setDraft({applicationName:row.applicationName,applicationDate:row.applicationDate,effectiveDate:row.effectiveDate,changeType:row.changeType,reason:row.reason});};
 const reset=()=>{setEditing(null);setEmployeeId("");setAfterOrgId("");setAfterPositionId("");setDraft(emptyDraft());};
 const execute=async(op:Operation)=>{
  if(!alive.current||lock.current||unresolved.current&&unresolved.current.key!==op.key)return;
  lock.current=true;setBusy(true);setMessage("");
  try{
   const result=op.kind==="create"?await hrApi.createJobChangeApplication(op.body!,op.token,op.key):op.kind==="update"?await hrApi.updateJobChangeApplication(op.id!,op.body!,op.token,op.key):op.kind==="approve"||op.kind==="return"?await hrApi.reviewJobChangeApplication(op.id!,op.kind,op.comment??"",op.token,op.key):op.kind==="apply"?await hrApi.applyJobChangeApplication(op.id!,op.token,op.key):await hrApi.jobChangeApplicationAction(op.id!,op.kind,op.token,op.key);
   if(!alive.current)return;
   const expected=op.kind==="create"?"draft":op.kind==="update"?op.status:op.kind==="submit"||op.kind==="resubmit"?"submitted":op.kind==="cancel"?"cancelled":op.kind==="approve"?"approved":op.kind==="return"?"returned":"applied";
   if(!result?.id||op.id&&result.id!==op.id||result.status!==expected||typeof result.version!=="number"||!Number.isSafeInteger(result.version)||result.version<1||op.body&&(result.employeeId!==op.body.employeeId||result.applicationName!==op.body.applicationName||result.applicationDate!==op.body.applicationDate||result.effectiveDate!==op.body.effectiveDate||result.changeType!==op.body.changeType||result.reason!==op.body.reason||result.afterOrgId!==op.body.afterOrgId||result.afterPositionId!==(op.body.afterPositionId??null))||op.kind==="return"&&result.reviewComment!==op.comment||op.kind==="apply"&&(typeof result.appliedAt!=="string"||Number.isNaN(Date.parse(result.appliedAt))))throw new Error("办理响应无法核对，请按原请求重试。");
   confirmed.current.set(result.id,result);abortRef.current?.abort();setRows(rows=>rows.some(row=>row.id===result.id)?rows.map(row=>row.id===result.id?result:row):[result,...rows]);
   unresolved.current=null;setRetry(null);setError("");setMessage(op.kind==="apply"?"岗位变更已生效，员工任职与办理记录已保存。":`申请已保存：${labels[result.status]??result.status}。`);
   if(op.kind==="create"||op.kind==="update")reset();
   if(op.kind==="approve"||op.kind==="return")setOpinions(values=>{const next={...values};delete next[result.id];return next;});
   void load();
  }catch(reason){if(!alive.current)return;const text=hrLoadErrorMessage(reason,"办理岗位变更申请失败");if(!(reason instanceof ApiError)||reason.status>=500||reason.status<400){unresolved.current=op;setRetry(op);setMessage(`${text}。结果尚未确认，请按原请求重试。`);}else{unresolved.current=null;setRetry(null);setMessage(text);}}
  finally{if(alive.current){lock.current=false;setBusy(false);}}
 };
 const save=()=>{if(lock.current||unresolved.current)return;if(afterPositionId&&!positions.some(position=>position.id===afterPositionId)&&!(editing?.afterOrgId===afterOrgId&&editing.afterPositionId===afterPositionId)){setMessage("所选岗位不属于当前部门，请重新选择。");return;}
  const body={...draft,applicationName:draft.applicationName.trim(),reason:draft.reason.trim(),employeeId,afterOrgId,afterPositionId:afterPositionId||undefined};
  void execute({kind:editing?"update":"create",id:editing?.id,status:editing?.status,body,token:getAccessToken(),key:createIdempotencyKey("hr-job-change-save")});
 };
 const action=(row:HrJobChangeApplication,kind:Operation["kind"])=>{if(lock.current||unresolved.current||editing)return;const comment=opinions[row.id]?.trim()??"";if(kind==="return"&&!comment){setMessage("请填写具体退回意见，便于申请人修改。");return;}void execute({kind,id:row.id,status:row.status,comment,token:getAccessToken(),key:createIdempotencyKey(`hr-job-change-${kind}`)});};
 return <section id="job-change-applications" className="ds-panel">
  <div className={styles.sectionHeading}><div><span className="ds-eyebrow">人事办理</span><h2>岗位变更申请</h2></div><span>{loading?"加载中":`共 ${total} 条`}</span></div>
  {message?<p role="status">{message}</p>:null}{retry?<button type="button" className="ds-button ds-button-secondary" disabled={busy} onClick={()=>void execute(retry)}>按原请求重试</button>:null}
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {optionsError?<p className="form-error" role="alert">{optionsError}</p>:null}
  {(error||optionsError)?<button type="button" className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>{void load();void loadOptions();}}>重试申请和基础数据</button>:null}
  {canManage?<form key={editing?.id??"new"} className={styles.formGrid} onSubmit={event=>{event.preventDefault();save();}}>
   <label className="form-field"><span>申请名称</span><input name="applicationName" maxLength={128} value={draft.applicationName} disabled={blocked} onChange={event=>setDraft({...draft,applicationName:event.target.value})} required/></label>
   <HrEmployeeSelection purpose="job_change" selectedId={employeeId} currentEmployee={editing?{id:editing.employeeId,fullName:editing.employeeName,employeeCode:editing.employeeCode}:undefined} onChange={setEmployeeId} disabled={blocked||!!editing?.sourceApprovalId}/>

   {editing?.sourceApprovalId?<p>员工已绑定原任职申请；可修改岗位和办理信息，不能更换办理对象。</p>:null}
   <label className="form-field"><span>变更类型</span><select name="changeType" value={draft.changeType} disabled={blocked} onChange={event=>setDraft({...draft,changeType:event.target.value})}><option value="transfer">岗位调动</option><option value="promotion">晋升</option><option value="demotion">降职</option><option value="rotation">轮岗</option><option value="organization_change">部门调整</option></select></label>
   <label className="form-field"><span>申请日期</span><input name="applicationDate" type="date" value={draft.applicationDate} disabled={blocked} onChange={event=>setDraft({...draft,applicationDate:event.target.value})} required/></label>
   <label className="form-field"><span>生效日期</span><input name="effectiveDate" type="date" value={draft.effectiveDate} disabled={blocked} onChange={event=>setDraft({...draft,effectiveDate:event.target.value})} required/></label>
   <label className="form-field"><span>调整后部门</span><select name="afterOrgId" disabled={blocked} value={afterOrgId} onChange={e=>{setAfterOrgId(e.target.value);setAfterPositionId(e.target.value===editing?.afterOrgId?editing.afterPositionId??"":"");}} required><option value="">请选择</option>{editing?.afterOrgId&&!options.orgs.some(x=>x.id===editing.afterOrgId)?<option value={editing.afterOrgId}>{editing.afterOrgName??"当前申请部门"}（当前申请）</option>:null}{options.orgs.map(x=><option key={x.id} value={x.id}>{x.orgName}</option>)}</select></label>
   <label className="form-field"><span>调整后岗位</span><select name="afterPositionId" disabled={blocked} value={afterPositionId} onChange={e=>setAfterPositionId(e.target.value)}><option value="">暂不指定</option>{editing?.afterPositionId&&afterOrgId===editing.afterOrgId&&!positions.some(x=>x.id===editing.afterPositionId)?<option value={editing.afterPositionId}>{editing.afterPositionName??"当前申请岗位"}（当前申请）</option>:null}{positions.map(x=><option key={x.id} value={x.id}>{x.positionName} · {x.positionCode}</option>)}</select></label>
   <label className={`form-field ${styles.fullWidth}`}><span>变更原因</span><textarea name="reason" maxLength={2000} value={draft.reason} disabled={blocked} onChange={event=>setDraft({...draft,reason:event.target.value})} required/></label>
   <div className={styles.actionRow}><button className="ds-button ds-button-primary" disabled={blocked||!employeeId||!afterOrgId}>{editing?"保存修改":"保存申请草稿"}</button>{editing?<button type="button" className="ds-button ds-button-secondary" disabled={blocked} onClick={reset}>放弃修改</button>:null}</div>
  </form>:null}
  <div className={`ds-mobile-record-list ${lifecycleStyles.checklistRecords}`}>{rows.length?rows.map(row=><article className="ds-mobile-record" key={row.id}>
   <strong>{row.employeeName} · {labels[row.status]??row.status}</strong><span>{row.applicationNo} · {row.applicationDate} 申请 · {row.effectiveDate} 生效</span><span>{row.beforeOrgName??"未设部门"} / {row.beforePositionName??"未设岗位"} → {row.afterOrgName??"未设部门"} / {row.afterPositionName??"未设岗位"}</span><span>{row.reason}</span>{row.reviewComment?<p>审批意见：{row.reviewComment}</p>:null}{row.status==="approved"?<p>已批准，待授权人员办理生效。</p>:null}{row.appliedAt?<p>办理生效时间：{new Date(row.appliedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</p>:null}
   {canReview&&row.status==="submitted"?<label className="form-field"><span>审批意见 · {row.applicationNo}</span><textarea maxLength={1000} disabled={blocked||!!editing} value={opinions[row.id]??""} onChange={event=>setOpinions(values=>({...values,[row.id]:event.target.value}))}/></label>:null}
   <JobChangeHistory application={row}/>

   <div className={styles.actionRow}>{canManage&&["draft","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={blocked} onClick={()=>edit(row)}>修改</button>:null}{canManage&&row.status==="draft"?<button className="ds-button ds-button-primary" disabled={blocked||!!editing} onClick={()=>void action(row,"submit")}>提交审批</button>:null}{canManage&&row.status==="returned"?<button className="ds-button ds-button-primary" disabled={blocked||!!editing} onClick={()=>void action(row,"resubmit")}>重新提交</button>:null}{canManage&&["draft","submitted","returned"].includes(row.status)?<button className="ds-button ds-button-secondary" disabled={blocked||!!editing} onClick={()=>void action(row,"cancel")}>取消申请</button>:null}{canReview&&row.status==="submitted"?<><button className="ds-button ds-button-primary" disabled={blocked||!!editing} onClick={()=>void action(row,"approve")}>批准</button><button className="ds-button ds-button-secondary" disabled={blocked||!!editing} onClick={()=>void action(row,"return")}>退回</button></>:null}{canApply&&row.status==="approved"?<button className="ds-button ds-button-primary" disabled={blocked||!!editing||row.effectiveDate>businessDate()} title={row.effectiveDate>businessDate()?"到生效日期后方可办理":""} onClick={()=>void action(row,"apply")}>生效变更</button>:null}</div>
  </article>):loading?<p>正在加载岗位变更申请…</p>:<p>暂无岗位变更申请。</p>}</div>
  <nav className={styles.actionRow} aria-label="岗位变更申请分页"><button type="button" className="ds-button ds-button-secondary" disabled={blocked||loading||page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button><span>第 {page} / {Math.max(1,Math.ceil(total/pageSize))} 页 · 共 {total} 条</span><button type="button" className="ds-button ds-button-secondary" disabled={blocked||loading||page>=Math.max(1,Math.ceil(total/pageSize))} onClick={()=>setPage(value=>value+1)}>下一页</button></nav>
 </section>;
}
