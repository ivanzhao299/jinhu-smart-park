"use client";

import {useEffect,useRef,useState} from "react";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrJobChangeApplication,type HrJobChangeHistory} from "../../../lib/hr-api";
import styles from "../hr-workbench.module.css";

const actions:Record<string,string>={created:"创建申请",updated:"修改申请",submitted:"提交审批",resubmitted:"重新提交",approved:"审批通过",returned:"退回修改",cancelled:"取消申请",applied:"办理生效"};
const statuses:Record<string,string>={draft:"草稿",submitted:"待审批",returned:"已退回",approved:"已批准待办理",cancelled:"已取消",applied:"已生效"};

export function JobChangeHistory({application}:{application:HrJobChangeApplication}){
 const [open,setOpen]=useState(false),[history,setHistory]=useState<HrJobChangeHistory|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();request.current?.abort();request.current=controller;setLoading(true);setError("");setHistory(null);
  void hrApi.jobChangeHistory(application.id,getAccessToken(),controller.signal).then(result=>{
   if(controller.signal.aborted)return;
   if(result?.applicationId!==application.id||!Array.isArray(result.actions)||result.actions.some((action,index)=>!action.id||!Number.isSafeInteger(action.sequenceNo)||action.sequenceNo<1||index>0&&action.sequenceNo<=result.actions[index-1]!.sequenceNo))throw new Error("办理记录无法核对，请刷新重试。");
   setHistory(result);
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"加载办理记录失败");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[open,application.id,application.version,application.status,refresh]);
 return <div>
  <button type="button" className="ds-button ds-button-secondary" onClick={()=>setOpen(value=>!value)}>{open?"收起办理记录":"查看办理记录"}</button>
  {open?<section aria-label={`${application.applicationNo}办理记录`}>
   <div className={styles.actionRow}><h3>办理记录</h3><button type="button" className="ds-button ds-button-secondary" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>刷新记录</button></div>
   {loading?<p role="status">正在加载办理记录…</p>:null}
   {error?<p className="form-error" role="alert">{error}</p>:null}
   {history?<div className={styles.approvalHistoryList}>{history.actions.length?history.actions.map(action=><article className={`ds-mobile-record ${styles.approvalHistoryRecord}`} key={action.id}>
    <strong>{actions[action.action]??action.action}</strong>
    <span>{action.actorDisplayName||"办理人姓名未记录"} · {new Date(action.createTime).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</span>
    <span>{action.fromStatus?statuses[action.fromStatus]??action.fromStatus:"开始办理"} → {statuses[action.toStatus]??action.toStatus}</span>
    {action.comment?<p>{action.comment}</p>:null}
   </article>):<p>暂无办理记录。</p>}</div>:null}
  </section>:null}
 </div>;
}
