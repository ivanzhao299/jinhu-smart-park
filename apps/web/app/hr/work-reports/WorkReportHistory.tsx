"use client";
import {useEffect,useRef,useState} from "react";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrWorkReportAction} from "../../../lib/hr-api";
import {hrLoadErrorMessage} from "../hr-errors";
import local from "./work-reports.module.css";

const actions:Record<string,string>={created:"建立草稿",updated:"补充草稿",submitted:"提交审核",resubmitted:"重新提交",confirmed:"主管确认",returned:"主管退回",cancelled:"撤销草稿"};
const statuses:Record<string,string>={draft:"草稿",submitted:"待审核",resubmitted:"重新待审",confirmed:"已确认",returned:"已退回"};
function projectHistory(value:unknown):HrWorkReportAction[]{
 if(!Array.isArray(value))throw new Error("办理记录响应无效，请重试读取。");
 const ids=new Set<string>();
 return value.map((row:unknown)=>{
  if(!row||typeof row!=="object")throw new Error("办理记录响应无效，请重试读取。");
  const r=row as Record<string,unknown>;
  if(typeof r.id!=="string"||!r.id||ids.has(r.id)||typeof r.actionType!=="string"||!Object.hasOwn(actions,r.actionType)||typeof r.toStatus!=="string"||!Object.hasOwn(statuses,r.toStatus)||(r.fromStatus!==null&&(typeof r.fromStatus!=="string"||!Object.hasOwn(statuses,r.fromStatus)))||!Number.isSafeInteger(r.submissionNo)||Number(r.submissionNo)<0||(r.comment!==null&&typeof r.comment!=="string")||typeof r.createTime!=="string"||!Number.isFinite(Date.parse(r.createTime)))throw new Error("办理记录响应无效，请重试读取。");
  ids.add(r.id);
  return{id:r.id,actionType:r.actionType,fromStatus:r.fromStatus as string|null,toStatus:r.toStatus,submissionNo:Number(r.submissionNo),comment:r.comment as string|null,createTime:r.createTime};
 });
}
export function WorkReportHistory({id,busy}:{id:string;busy:boolean}){
 const [open,setOpen]=useState(false),[attempt,setAttempt]=useState(0),[rows,setRows]=useState<HrWorkReportAction[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();request.current=controller;setLoading(true);setRows([]);setError("");
  void hrApi.workReportActions(id,getAccessToken(),controller.signal).then(value=>{if(!controller.signal.aborted)setRows(projectHistory(value));}).catch(e=>{if(!controller.signal.aborted)setError(hrLoadErrorMessage(e,"读取办理记录失败"));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[id,open,attempt]);
 return <div className={local.history}><button type="button" className="ds-button" disabled={busy} aria-expanded={open} onClick={()=>{request.current?.abort();setRows([]);setError("");setOpen(value=>!value);}}>{open?"收起办理记录":"查看办理记录"}</button>{open?<section aria-label="办理记录">{loading?<p>正在读取办理记录…</p>:error?<><p role="alert">{error}</p><button type="button" className="ds-button" disabled={busy} onClick={()=>setAttempt(n=>n+1)}>重试读取记录</button></>:rows.length?<ol>{rows.map(row=><li key={row.id}><strong>{actions[row.actionType]}</strong><span>{row.fromStatus?`${statuses[row.fromStatus]} → `:""}{statuses[row.toStatus]} · 第 {row.submissionNo} 次提交</span><time dateTime={row.createTime}>{new Date(row.createTime).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}</time>{row.comment?<p>办理意见：{row.comment}</p>:null}</li>)}</ol>:<p>暂无办理记录。</p>}</section>:null}</div>;
}
