"use client";

import { HR_PERMISSIONS } from "@jinhu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { ApiError, createIdempotencyKey } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrApproval, type HrApprovalRevision } from "../../../lib/hr-api";
import { hasAnyPermission, hasPermission } from "../../../lib/permissions";
import styles from "../hr-workbench.module.css";
import { ApprovalRecordDetails } from "./ApprovalRecordDetails";
import { ApprovedProfileRequestsPanel } from "./ApprovedProfileRequestsPanel";
import { ApprovedEmploymentRequestsPanel } from "./ApprovedEmploymentRequestsPanel";

const labels: Record<string, string> = { employment_change: "任职变动", profile_change: "档案变更", compensation_change: "薪酬变更", draft: "草稿", submitted: "待审核", pending: "待审核", approved: "已通过", returned: "已退回", withdrawn: "已撤回" };
type Draft = { requestType: string; title: string; description: string };
type Operation = { generation: number; key: string; token: string; kind: "create"; body: { requestType: string; title: string; payload: { description: string } } } | { generation: number; key: string; token: string; kind: "action" | "review"; id: string; body: { action: string; comment?: string } } | { generation:number; key:string; token:string; kind:"revise"; id:string; body:HrApprovalRevision };
const emptyDraft: Draft = { requestType: "employment_change", title: "", description: "" };
const description = (item: HrApproval) => item.payload&&typeof item.payload==="object"&&typeof item.payload.description === "string" ? item.payload.description : "未填写申请说明。";
const uncertain = (error: unknown) => !(error instanceof ApiError) || error.status >= 500;
const responseMatches = (operation:Operation,result:unknown):result is HrApproval => {
 if(!result||typeof result!=="object"||typeof (result as HrApproval).id!=="string"||typeof (result as HrApproval).status!=="string")return false;
 const approval=result as HrApproval;
 if(operation.kind==="create")return approval.status==="draft"&&approval.requestType===operation.body.requestType&&approval.title===operation.body.title&&description(approval)===operation.body.payload.description;
 if(approval.id!==operation.id)return false;
 if(operation.kind==="revise")return ["draft","returned"].includes(approval.status)&&approval.version===operation.body.expectedVersion+1&&approval.title===operation.body.title&&description(approval)===operation.body.description;
 const expected=operation.kind==="review"?operation.body.action==="approve"?"approved":operation.body.action==="return"?"returned":null:({submit:"submitted",resubmit:"submitted",withdraw:"withdrawn"} as Record<string,string|undefined>)[operation.body.action];
 return expected!==undefined&&expected!==null&&approval.status===expected;
};

export function HrApprovalsClient() {
 const user = useAuthUser(), canSelf = hasPermission(user, HR_PERMISSIONS.HR_APPROVAL_SELF_MANAGE), canReview = hasAnyPermission(user, [HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW, HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW]);
 const [fulfillmentBlocked,setFulfillmentBlocked]=useState(false),[profileFulfillmentBlocked,setProfileFulfillmentBlocked]=useState(false);
 const contextKey = JSON.stringify([user?.id, user?.park_id, user?.permissions]);
 const [mine,setMine] = useState<HrApproval[]>([]), [pending,setPending] = useState<HrApproval[]>([]), [mineLoading,setMineLoading] = useState(false), [pendingLoading,setPendingLoading] = useState(false), [mineError,setMineError] = useState(""), [pendingError,setPendingError] = useState("");
 const [message,setMessage] = useState(""), [showCreate,setShowCreate] = useState(false), [draft,setDraft] = useState<Draft>(emptyDraft), [reviewDrafts,setReviewDrafts] = useState<Record<string,{action:string;comment:string}>>({}), [retry,setRetry] = useState<Operation|null>(null), [writing,setWriting] = useState(false);
 const [editingId,setEditingId] = useState<string|null>(null);
 const generation = useRef(0), mineRequest = useRef<AbortController|null>(null), pendingRequest = useRef<AbortController|null>(null), writeLock = useRef(false), unresolved = useRef<Operation|null>(null);
 const confirmedMine = useRef(new Map<string,HrApproval>()), removedPending = useRef(new Set<string>());
 const loadMine = useCallback(async()=>{
  mineRequest.current?.abort();
  if(!canSelf){setMine([]);setMineLoading(false);setMineError("");return;}
  const generationAtStart=generation.current,controller=new AbortController();
  mineRequest.current=controller;setMineLoading(true);setMineError("");
  try{const rows=await hrApi.myApprovals(getAccessToken(),controller.signal);if(generation.current===generationAtStart&&!controller.signal.aborted){const next=rows.map(row=>{const confirmed=confirmedMine.current.get(row.id);if(confirmed&&confirmed.status===row.status&&(confirmed.version===undefined||row.version!==undefined&&row.version>=confirmed.version)){confirmedMine.current.delete(row.id);return row;}return confirmed??row;});for(const confirmed of confirmedMine.current.values())if(!next.some(row=>row.id===confirmed.id))next.unshift(confirmed);setMine(next);}}
  catch(error){if(generation.current===generationAtStart&&!controller.signal.aborted)setMineError(error instanceof Error?error.message:"加载我的申请失败");}
  finally{if(generation.current===generationAtStart&&mineRequest.current===controller)setMineLoading(false);}
 },[canSelf]);
 const loadPending = useCallback(async()=>{
  pendingRequest.current?.abort();
  if(!canReview){setPending([]);setPendingLoading(false);setPendingError("");return;}
  const generationAtStart=generation.current,controller=new AbortController();
  pendingRequest.current=controller;setPendingLoading(true);setPendingError("");
  try{const rows=await hrApi.pendingApprovals(getAccessToken(),controller.signal);if(generation.current===generationAtStart&&!controller.signal.aborted){for(const id of removedPending.current)if(!rows.some(row=>row.id===id))removedPending.current.delete(id);setPending(rows.filter(row=>!removedPending.current.has(row.id)));}}
  catch(error){if(generation.current===generationAtStart&&!controller.signal.aborted)setPendingError(error instanceof Error?error.message:"加载待审核申请失败");}
  finally{if(generation.current===generationAtStart&&pendingRequest.current===controller)setPendingLoading(false);}
 },[canReview]);
 useEffect(()=>{
  generation.current+=1;setEditingId(null);writeLock.current=false;unresolved.current=null;confirmedMine.current.clear();removedPending.current.clear();setRetry(null);setWriting(false);setMessage("");setShowCreate(false);setDraft(emptyDraft);setReviewDrafts({});setMine([]);setPending([]);
  void loadMine();void loadPending();
  return()=>{generation.current+=1;mineRequest.current?.abort();pendingRequest.current?.abort();};
 },[contextKey,loadMine,loadPending]);
 const active = useMemo(()=>mine.filter(item=>["draft","submitted","pending","returned"].includes(item.status)).length,[mine]);
 const refreshAfterWrite = useCallback((operation:Operation)=>{void (operation.kind==="review"?loadPending():loadMine());},[loadMine,loadPending]);
 const publish = useCallback((operation:Operation,result:HrApproval)=>{
  if(operation.generation!==generation.current)return;
  if(operation.kind==="create"){confirmedMine.current.set(result.id,result);mineRequest.current?.abort();setMine(rows=>[result,...rows.filter(row=>row.id!==result.id)]);setShowCreate(false);setDraft(emptyDraft);setMessage("申请草稿已保存。");}
  else if(operation.kind==="review"){removedPending.current.add(result.id);pendingRequest.current?.abort();setPending(rows=>rows.filter(row=>row.id!==result.id));setReviewDrafts(rows=>{const next={...rows};delete next[result.id];return next;});setMessage(`审核${labels[result.status]??"已保存"}。`);}
  else if(operation.kind==="revise"){confirmedMine.current.set(result.id,result);mineRequest.current?.abort();setMine(rows=>rows.map(row=>row.id===result.id?result:row));setEditingId(null);setMessage("申请内容已修改，请核对后重新提交。");}
  else{confirmedMine.current.set(result.id,result);mineRequest.current?.abort();setMine(rows=>rows.map(row=>row.id===result.id?result:row));setMessage(`${operation.body.action==="withdraw"?"撤回":"提交"}申请已保存。`);}
  unresolved.current=null;setRetry(null);refreshAfterWrite(operation);
 },[refreshAfterWrite]);
 const execute = useCallback(async(operation:Operation)=>{
  if(operation.generation!==generation.current||writeLock.current||unresolved.current&&unresolved.current.key!==operation.key)return;
  writeLock.current=true;setWriting(true);setMessage("");
  try{
   const result=operation.kind==="revise"?await hrApi.reviseApproval(operation.id,operation.body,operation.token,operation.key):operation.kind==="create"?await hrApi.createApproval(operation.body,operation.token,operation.key):operation.kind==="review"?await hrApi.reviewApproval(operation.id,operation.body,operation.token,operation.key):await hrApi.approvalAction(operation.id,operation.body,operation.token,operation.key);
   if(!responseMatches(operation,result))throw new Error("审批响应无法核对，请按原请求重试。");
   publish(operation,result);
  }catch(error){
   if(operation.generation!==generation.current)return;
   const errorMessage=error instanceof Error?error.message:"操作失败";
   if(uncertain(error)||errorMessage.includes("无法核对")){unresolved.current=operation;setRetry(operation);setMessage(`${errorMessage}。结果尚未确认，请按原请求重试，不要重复发起新操作。`);}
   else{if(unresolved.current?.key===operation.key){unresolved.current=null;setRetry(null);}setMessage(errorMessage);}
  }finally{if(operation.generation===generation.current){writeLock.current=false;setWriting(false);}}
 },[publish]);
 const create=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!canSelf||unresolved.current||editingId!==null)return;void execute({generation:generation.current,kind:"create",body:{requestType:draft.requestType,title:draft.title,payload:{description:draft.description}},token:getAccessToken(),key:createIdempotencyKey("hr-approval-create")});};
 const act=(id:string,action:string)=>{if(!canSelf||unresolved.current||editingId!==null)return;void execute({generation:generation.current,kind:"action",id,body:{action},token:getAccessToken(),key:createIdempotencyKey(`hr-approval-${action}`)});};
 const review=(event:React.FormEvent<HTMLFormElement>,id:string)=>{event.preventDefault();if(!canReview||unresolved.current||editingId!==null)return;const body=reviewDrafts[id]??{action:"approve",comment:""};void execute({generation:generation.current,kind:"review",id,body,token:getAccessToken(),key:createIdempotencyKey("hr-approval-review")});};
 const revise=(id:string,body:HrApprovalRevision)=>{if(!canSelf||unresolved.current||editingId!==id)return;void execute({generation:generation.current,kind:"revise",id,body:{...body},token:getAccessToken(),key:createIdempotencyKey("hr-approval-revise")});};
 const noAccess=!canSelf&&!canReview, blocked=writing||!!unresolved.current||editingId!==null||fulfillmentBlocked||profileFulfillmentBlocked;
 return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_APPROVALS_PAGE} fallback={<main className={`content ds-page ${styles.page}`}><section className="ds-panel"><h1>无权访问人事审批</h1><p>请联系管理员配置本人申请或审批权限。</p></section></main>}><main className={`content ds-page ${styles.page}`}>
  <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">人事流程</span><h1>人事审批</h1><p>查看申请进度并按职责办理审核；已批准的任职和档案申请可在本页完成正式办理，薪酬调整仍在对应业务页面办理。</p></div><div className={styles.heroActions}>{canSelf?<button type="button" className="ds-button ds-button-primary" disabled={blocked} onClick={()=>setShowCreate(value=>!value)}>{showCreate?"收起申请":"发起申请"}</button>:null}</div></section>
  {noAccess?<section className="ds-panel"><h2>暂无可用审批权限</h2><p>当前账号尚未配置申请或审核权限，请联系管理员。</p></section>:<>
   <ApprovedEmploymentRequestsPanel blocked={writing||!!retry||editingId!==null||profileFulfillmentBlocked} onBlockedChange={setFulfillmentBlocked}/>
   <ApprovedProfileRequestsPanel blocked={writing||!!retry||editingId!==null||fulfillmentBlocked} onBlockedChange={setProfileFulfillmentBlocked}/>
   <section className="ds-kpi-grid" aria-label="审批概览">{canSelf?<><article className="ds-kpi-card"><span>我的申请</span><strong>{mine.length}</strong><small>当前可见记录</small></article><article className="ds-kpi-card"><span>进行中</span><strong>{active}</strong><small>草稿、待审或退回</small></article></>:null}{canReview?<article className="ds-kpi-card"><span>待我审核</span><strong>{pending.length}</strong><small>需要审批处理</small></article>:null}</section>
   {showCreate&&canSelf?<form className={`ds-panel ${styles.formGrid}`} onSubmit={create}><div className={styles.sectionHeading}><div><span className="ds-eyebrow">新申请</span><h2>发起人事申请</h2></div></div><label className="form-field"><span>申请类型</span><select value={draft.requestType} disabled={blocked} onChange={event=>setDraft(value=>({...value,requestType:event.target.value}))}><option value="employment_change">任职变动</option><option value="profile_change">档案变更</option><option value="compensation_change">薪酬变更</option></select></label><label className="form-field"><span>申请标题</span><input value={draft.title} disabled={blocked} required maxLength={200} onChange={event=>setDraft(value=>({...value,title:event.target.value}))}/></label><label className="form-field"><span>申请说明</span><textarea value={draft.description} disabled={blocked} required maxLength={3000} onChange={event=>setDraft(value=>({...value,description:event.target.value}))}/></label><div className={styles.formActions}><button className="ds-button ds-button-primary" disabled={blocked}>保存草稿</button><button type="button" className="ds-button" disabled={blocked} onClick={()=>setShowCreate(false)}>取消</button></div></form>:null}
   {message?<p className="form-error" role="alert">{message}</p>:null}{retry?<button type="button" className="ds-button ds-button-secondary" disabled={writing} onClick={()=>void execute(retry)}>按原请求重试</button>:null}
   {canReview?<ApprovalSection title="待审核申请" eyebrow="审批队列" count={`${pending.length} 项待处理`} loading={pendingLoading} error={pendingError} empty="当前没有待审核的人事申请。" onRefresh={loadPending} refreshBlocked={blocked}>{pending.map(item=>{const value=reviewDrafts[item.id]??{action:"approve",comment:""};return <article className="ds-mobile-record" key={item.id}><strong>{item.title}</strong><span>{labels[item.requestType]??item.requestType} · {item.requestNo}</span><p>{description(item)}</p><form className={styles.formGrid} onSubmit={event=>review(event,item.id)}><label className="form-field"><span>审核结果</span><select value={value.action} disabled={blocked} onChange={event=>setReviewDrafts(rows=>({...rows,[item.id]:{...value,action:event.target.value}}))}><option value="approve">通过</option><option value="return">退回补充</option></select></label><label className="form-field"><span>审核意见</span><input value={value.comment} disabled={blocked} required maxLength={1000} onChange={event=>setReviewDrafts(rows=>({...rows,[item.id]:{...value,comment:event.target.value}}))}/></label><button className="ds-button ds-button-primary" disabled={blocked}>提交审核</button></form><ApprovalRecordDetails key={`${item.id}:${contextKey}:${item.version??0}`} item={item} canEdit={false} blocked={blocked} onRevise={()=>undefined} onEditingChange={()=>undefined}/></article>;})}</ApprovalSection>:null}
   {canSelf?<ApprovalSection title="我的申请" eyebrow="申请记录" count={`${active} 项进行中`} loading={mineLoading} error={mineError} empty="暂无申请，可使用右上角“发起申请”开始办理。" onRefresh={loadMine} refreshBlocked={blocked}>{mine.map(item=><article className="ds-mobile-record" key={item.id}><strong>{item.title}</strong><span>{labels[item.requestType]??item.requestType} · {labels[item.status]??item.status}</span><span>{item.requestNo}</span><p>{description(item)}</p><div className={styles.recordActions}>{item.status==="draft"?<button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>act(item.id,"submit")}>提交审核</button>:null}{item.status==="returned"?<button className="ds-button ds-button-primary" disabled={blocked} onClick={()=>act(item.id,"resubmit")}>重新提交审核</button>:null}{["submitted","pending"].includes(item.status)?<button className="ds-button" disabled={blocked} onClick={()=>act(item.id,"withdraw")}>撤回</button>:null}</div><ApprovalRecordDetails key={`${item.id}:${contextKey}:${item.version??0}`} item={item} canEdit={canSelf} blocked={writing||!!retry||editingId!==null&&editingId!==item.id} onRevise={body=>revise(item.id,body)} onEditingChange={active=>setEditingId(current=>active?item.id:current===item.id?null:current)}/></article>)}</ApprovalSection>:null}
  </>}
 </main></PermissionGuard>;
}

function ApprovalSection({title,eyebrow,count,loading,error,empty,onRefresh,refreshBlocked,children}:{title:string;eyebrow:string;count:string;loading:boolean;error:string;empty:string;onRefresh:()=>Promise<void>;refreshBlocked:boolean;children:React.ReactNode}){const hasRows=Array.isArray(children)&&children.length>0;return <section className="ds-panel"><div className={styles.sectionHeading}><div><span className="ds-eyebrow">{eyebrow}</span><h2>{title}</h2></div><div className={styles.heroActions}><strong>{count}</strong><button type="button" className="ds-button ds-button-secondary" disabled={loading||refreshBlocked} onClick={()=>void onRefresh()}>刷新</button></div></div>{error?<p className="form-error" role="alert">{error}</p>:null}{loading?<p role="status">正在加载…</p>:null}<div className={styles.employeeRecordList}>{!loading&&!hasRows&&!error?<p className={styles.emptyState}>{empty}</p>:children}</div></section>;}
