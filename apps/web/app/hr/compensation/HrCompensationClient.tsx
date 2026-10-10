"use client";

import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { hasPermission } from "../../../lib/permissions";
import { ApiError, createIdempotencyKey } from "../../../lib/api-client";
import { hrApi, type HrApprovedCompensationReceipt, type HrApprovedCompensationRequest, type HrCompensationAssignmentReceipt, type HrCompensationEmployeeOption, type HrCompensationPlan } from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";
import local from "./compensation-ledger.module.css";
import { CompensationAssignmentLedger } from "./CompensationAssignmentLedger";
import { CompensationAssignmentEditor } from "./CompensationAssignmentEditor";
import { CompensationEmployeePicker } from "./CompensationEmployeePicker";
import { ApprovedCompensationRequestsPanel } from "./ApprovedCompensationRequestsPanel";
import { validCompensationDate } from "./compensation-contract";

type Selection = {employee:HrCompensationEmployeeOption;source?:HrApprovedCompensationRequest};
export function HrCompensationClient() {
 const user=useAuthUser();
 return <PermissionGuard module="hr" permission={H.HR_COMPENSATION_PAGE}><CompensationContent key={JSON.stringify(user)}/></PermissionGuard>;
}
function CompensationContent() {
 const user=useAuthUser(),canManage=hasPermission(user,H.HR_COMPENSATION_MANAGE),canRead=hasPermission(user,H.HR_COMPENSATION_READ);
 const canFulfill=canManage && canRead && hasPermission(user,H.HR_APPROVAL_PARK_REVIEW);
 const [plans,setPlans]=useState<HrCompensationPlan[]|null>(null),[readError,setReadError]=useState(""),[revision,setRevision]=useState(0);
 const [action,setAction]=useState<"plan"|"assignment"|null>(null),[selection,setSelection]=useState<Selection|null>(null),[receipt,setReceipt]=useState<HrCompensationAssignmentReceipt|HrApprovedCompensationReceipt|null>(null),[planReceipt,setPlanReceipt]=useState<HrCompensationPlan|null>(null);
 const [busy,setBusy]=useState(false),[retry,setRetry]=useState<{body:{planCode:string;planName:string;effectiveFrom:string;effectiveTo?:string};token:string;key:string}|null>(null),[writeError,setWriteError]=useState("");
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!canRead)return;
  const controller=new AbortController();setPlans(null);setReadError("");
  void hrApi.compensationPlans(getAccessToken(),controller.signal).then(rows=>{if(controller.signal.aborted)return;if(!Array.isArray(rows) || !rows.every(row=>row && [row.id,row.planCode,row.planName,row.status,row.currency].every(value=>typeof value==="string" && !!value) && validCompensationDate(row.effectiveFrom) && (row.effectiveTo===null || validCompensationDate(row.effectiveTo) && row.effectiveTo>=row.effectiveFrom)))throw new Error("薪酬方案响应无法核对。");setPlans(rows);}).catch(reason=>{if(!controller.signal.aborted)setReadError(reason instanceof Error?reason.message:"读取薪酬方案失败。");});
  return()=>controller.abort();
 },[revision,canRead]);
 const saved=useCallback((value:HrCompensationAssignmentReceipt|HrApprovedCompensationReceipt)=>{setReceipt(value);setSelection(null);setAction(null);setRevision(current=>current+1);},[]);
 const executePlan=async(attempt:NonNullable<typeof retry>)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setWriteError("");
  try{const result=await hrApi.createCompensationPlan(attempt.body,attempt.token,attempt.key);if(!alive.current)return;if(!validPlanReceipt(result,attempt.body))throw new Error("方案保存回执无法核对，请按原请求重试。");setPlanReceipt(result);setRetry(null);setAction(null);setRevision(current=>current+1);}
  catch(reason){if(!alive.current)return;setWriteError(reason instanceof Error?reason.message:"保存方案失败。");const processing=reason instanceof ApiError && reason.status===409 && reason.message==="The same idempotency key is still processing";if(!(reason instanceof ApiError) || processing || ![400,403,404,409,422].includes(reason.status))setRetry(attempt);else setRetry(null);}
  finally{if(alive.current){lock.current=false;setBusy(false);}}
 };
 return <main className={`content ds-page ${styles.page} ${local.panel}`}>
  <section className="ds-hero"><div className="ds-hero-copy"><span className="ds-eyebrow">薪酬管理</span><h1>薪酬方案与员工定薪</h1><p>按生效期管理正式薪酬，保留变更前后的记录与审批来源。</p></div>{canManage?<div className={styles.heroActions}><button type="button" className="ds-button" disabled={!!action || !!selection || busy || !!retry} onClick={()=>setAction("plan")}>薪酬方案</button>{canRead?<button type="button" className="ds-button ds-button-primary" disabled={!!action || !!selection || busy || !!retry || !plans} onClick={()=>setAction("assignment")}>员工定薪</button>:null}</div>:null}</section>
  {receipt?<section className="ds-panel" role="status" aria-label="正式定薪回执"><h2>员工定薪已保存</h2><p>{receipt.assignment.employeeName} · {receipt.assignment.employeeCode} · {receipt.assignment.planName}</p><p>{receipt.assignment.effectiveFrom} 至 {receipt.assignment.effectiveTo || "长期"} · 基本工资 {receipt.assignment.baseSalary} 元 · 津贴 {receipt.assignment.allowanceAmount} 元 · 目标浮动 {receipt.assignment.variableTarget} 元</p>{receipt.replaced?<p>原记录版本 {receipt.replaced.beforeVersion} → {receipt.replaced.afterVersion}，截止 {receipt.replaced.effectiveTo}。</p>:null}{"sourceApprovalId" in receipt?<p>薪酬申请已关联正式定薪记录。</p>:null}<p>请在台账核对生效日期和金额。</p></section>:null}
  {planReceipt?<section className="ds-panel" role="status" aria-label="薪酬方案保存回执"><h2>薪酬方案已保存</h2><p>{planReceipt.planName} · {planReceipt.planCode}</p><p>{planReceipt.effectiveFrom} 至 {planReceipt.effectiveTo || "长期"}</p></section>:null}
  {readError?<div role="alert"><p>{readError}</p><button type="button" className="ds-button" disabled={!!selection || busy || !!retry} onClick={()=>setRevision(current=>current+1)}>重试读取薪酬方案</button></div>:canRead && !plans?<p role="status">正在读取薪酬方案…</p>:null}
  {action==="plan"?<form className={`ds-panel ${styles.formGrid}`} onSubmit={event=>{event.preventDefault();if(lock.current || busy || retry)return;const form=new FormData(event.currentTarget),end=String(form.get("effectiveTo") || ""),body={planCode:String(form.get("planCode")),planName:String(form.get("planName")),effectiveFrom:String(form.get("effectiveFrom")),...(end?{effectiveTo:end}:{})};if(!validCompensationDate(body.effectiveFrom) || end && (!validCompensationDate(end) || end<body.effectiveFrom)){setWriteError("请核对方案生效和截止日期。");return;}void executePlan({body,token:getAccessToken(),key:createIdempotencyKey("hr-compensation-plan")});}}><h2>创建薪酬方案</h2><fieldset className={local.editorFields} disabled={busy || !!retry}><div className={styles.formGrid}><label className="form-field"><span>方案编码</span><input name="planCode" maxLength={64} required/></label><label className="form-field"><span>方案名称</span><input name="planName" maxLength={128} required/></label><label className="form-field"><span>生效日期</span><input name="effectiveFrom" type="date" min="1900-01-01" max="2100-12-31" required/></label><label className="form-field"><span>失效日期</span><input name="effectiveTo" type="date" min="1900-01-01" max="2100-12-31"/></label></div><div className={styles.formActions}><button className="ds-button ds-button-primary">保存方案</button><button type="button" className="ds-button" onClick={()=>{setAction(null);setWriteError("");}}>取消</button></div></fieldset></form>:null}
  {writeError?<p role="alert">{writeError}</p>:null}{retry?<button type="button" className="ds-button" disabled={busy} onClick={()=>void executePlan(retry)}>按原请求重试方案保存</button>:null}
  {action==="assignment" && !selection?<section className={`ds-panel ${local.panel}`}><CompensationEmployeePicker onSelect={employee=>setSelection({employee})}/><button type="button" className="ds-button" onClick={()=>setAction(null)}>取消定薪办理</button></section>:null}
  {selection && plans?<section className={`ds-panel ${local.panel}`}><CompensationAssignmentEditor key={`${selection.employee.id}:${selection.source?.id || "ordinary"}`} employee={selection.employee} source={selection.source} plans={plans} onCancel={()=>{setSelection(null);setAction(null);}} onSaved={saved}/></section>:null}
  {canFulfill?<ApprovedCompensationRequestsPanel blocked={!!action || !!selection || !plans || busy || !!retry} receipt={receipt && "sourceApprovalId" in receipt?receipt:null} onChoose={source=>{if(action || selection || !plans || lock.current)return;setSelection({source,employee:{id:source.subjectEmployeeId,employeeCode:source.employeeCode,employeeName:source.employeeName,employmentStatus:""}});}}/>:null}
  <CompensationAssignmentLedger refreshVersion={revision}/>
  {canRead?<section className={`ds-panel ${local.panel}`}><h2>薪酬方案</h2>{plans?<div className={local.records}>{plans.length?plans.map(plan=><article className="ds-mobile-record" key={plan.id}><strong>{plan.planName}</strong><span>{plan.planCode} · {plan.status==="active"?"启用":"停用"}</span><span>{plan.effectiveFrom} 起生效{plan.effectiveTo?` · ${plan.effectiveTo} 截止`:""}</span></article>):<p>暂无薪酬方案。</p>}</div>:null}</section>:null}
 </main>;
}

function validPlanReceipt(value: unknown, body: {planCode:string;planName:string;effectiveFrom:string;effectiveTo?:string}): value is HrCompensationPlan {
 if (!value || typeof value !== "object") return false;
 const plan=value as HrCompensationPlan;
 return typeof plan.id === "string" && !!plan.id && plan.planCode===body.planCode && plan.planName===body.planName && plan.effectiveFrom===body.effectiveFrom && plan.effectiveTo===(body.effectiveTo || null) && plan.status==="active" && plan.currency==="CNY";
}
