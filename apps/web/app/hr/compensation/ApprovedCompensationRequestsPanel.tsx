"use client";
import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "../../../lib/authz";
import { hrApi, type HrApprovedCompensationReceipt, type HrApprovedCompensationRequest } from "../../../lib/hr-api";
import local from "./compensation-ledger.module.css";

type Props = { blocked:boolean; receipt:HrApprovedCompensationReceipt|null; onChoose:(source:HrApprovedCompensationRequest)=>void };
export function ApprovedCompensationRequestsPanel({blocked,receipt,onChoose}:Props) {
 const [query,setQuery]=useState({page:1,keyword:"",revision:0}),[search,setSearch]=useState("");
 const [result,setResult]=useState<{items:HrApprovedCompensationRequest[];total:number}|null>(null),[error,setError]=useState("");
 const generation=useRef(0);
 useEffect(()=>{
  const controller=new AbortController(),request=++generation.current;setResult(null);setError("");
  void hrApi.approvedCompensationRequests(getAccessToken(),query.page,query.keyword,controller.signal).then(value=>{
   if(controller.signal.aborted || request!==generation.current)return;
   if(!value || value.page!==query.page || value.page_size!==20 || !Number.isSafeInteger(value.total) || value.total<0 || !Array.isArray(value.items) || value.items.length>20 || !value.items.every(row=>row && [row.id,row.requestNo,row.title,row.subjectEmployeeId,row.employeeCode,row.employeeName].every(field=>typeof field==="string" && !!field) && Number.isSafeInteger(row.version) && row.version>=1 && (row.description===null || typeof row.description==="string") && (row.fulfillment===null || typeof row.fulfillment.assignmentId==="string" && Number.isSafeInteger(row.fulfillment.assignmentVersion) && row.fulfillment.assignmentVersion>=1 && typeof row.fulfillment.fulfilledAt==="string")))throw new Error("薪酬办理队列响应无法核对。");
   if(query.page>Math.max(1,Math.ceil(value.total/20))){setQuery(current=>({...current,page:1}));return;}
   setResult(value);
  }).catch(reason=>{if(!controller.signal.aborted && request===generation.current)setError(reason instanceof Error?reason.message:"读取薪酬申请失败。");});
  return()=>controller.abort();
 },[query,receipt]);
 return <section id="approved-salary" className={`ds-panel ${local.panel}`} aria-label="已批准薪酬申请办理"><h2>已批准薪酬申请</h2><p>核对申请说明后填写正式金额和生效期，保存定薪并关联本次审批。</p>
  <form className={local.search} onSubmit={event=>{event.preventDefault();if(!blocked)setQuery(current=>({...current,page:1,keyword:search.trim(),revision:current.revision+1}));}}><label className="form-field"><span>查找已批准薪酬申请</span><input value={search} maxLength={100} disabled={blocked} onChange={event=>setSearch(event.target.value)}/></label><button className="ds-button" disabled={blocked}>查询薪酬申请</button><button type="button" className="ds-button" disabled={blocked} onClick={()=>setQuery(current=>({...current,revision:current.revision+1}))}>刷新薪酬办理队列</button></form>
  {error?<p role="alert">{error}</p>:!result?<p role="status">正在读取薪酬办理队列…</p>:null}
  {result?<><div className={local.records}>{result.items.map(row=>{const done=!!row.fulfillment || receipt?.sourceApprovalId===row.id;return <article className="ds-mobile-record" key={row.id}><strong>{row.title}</strong><span>{row.requestNo} · {row.employeeName}（{row.employeeCode}）</span><p>{row.description}</p>{done?<span>正式定薪已办理</span>:<button type="button" className="ds-button ds-button-primary" disabled={blocked} onClick={()=>onChoose(row)}>办理薪酬变更</button>}</article>;})}</div>{!result.items.length?<p>暂无已批准薪酬申请。</p>:null}<div className={local.pagination}><button type="button" className="ds-button" disabled={blocked || query.page===1} onClick={()=>setQuery(current=>({...current,page:current.page-1}))}>薪酬申请上一页</button><span>第 {query.page} 页 · 共 {result.total} 项</span><button type="button" className="ds-button" disabled={blocked || query.page*20>=result.total} onClick={()=>setQuery(current=>({...current,page:current.page+1}))}>薪酬申请下一页</button></div></>:null}
 </section>;
}
