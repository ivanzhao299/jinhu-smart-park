"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ApiError} from "../../../lib/api-client";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrRewardPayrollCandidate,type HrRewardPayrollLinkOptions} from "../../../lib/hr-api";
import {hrLoadErrorMessage} from "../hr-errors";
import {useHrResource} from "../use-hr-resource";
import styles from "../hr-workbench.module.css";
import local from "./reward-workflow.module.css";
const positive=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0&&Number(value)<=2147483647;
const month=(value:unknown)=>typeof value==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
function checked(value:HrRewardPayrollLinkOptions,id:string,page:number){
 const x=value?.existing;
 if(!value||value.caseId!==id||value.status!=="approved"||value.page!==page||value.page_size!==20||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.items)||value.items.length!==Math.min(20,Math.max(0,value.total-(page-1)*20))||value.items.some(r=>!r||typeof r.id!=="string"||!r.id||!positive(r.version)||!month(r.periodMonth)||!positive(r.batchNo)||!["close","correction"].includes(r.batchType))||new Set(value.items.map(r=>r.id)).size!==value.items.length||x===undefined||(x!==null&&(!x||typeof x.id!=="string"||!x.id||typeof x.targetId!=="string"||!x.targetId||!positive(x.targetVersion)||!["pending","linked","failed","void"].includes(x.status)||typeof x.createdAt!=="string"||(x.periodMonth!==null&&!month(x.periodMonth))||(x.batchNo!==null&&!positive(x.batchNo))||(x.batchType!==null&&!["close","correction"].includes(x.batchType)))))throw Error("工资关联候选响应无效，请重新读取。");
 return value;
}
const label=(r:HrRewardPayrollCandidate)=>`${r.periodMonth} · ${r.batchType==="correction"?"补正":"月结"}批次 ${r.batchNo} · 版本 ${r.version}`;
const value=(r:HrRewardPayrollCandidate)=>`${r.id}@${r.version}`;
const statuses={pending:"待确认",linked:"已关联",failed:"关联异常",void:"已作废"};
export function RewardPayrollLink({id,busy,publish}:{id:string;busy:boolean;publish:(job:()=>Promise<unknown>)=>Promise<boolean>}){
 const [page,setPage]=useState(1),[selected,setSelected]=useState<HrRewardPayrollCandidate|null>(null),[saved,setSaved]=useState(false),[error,setError]=useState("");
 const alive=useRef(true),writing=useRef(false),key=useRef(crypto.randomUUID()),pending=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;}},[]);
 const read=useCallback((signal:AbortSignal)=>hrApi.rewardPayrollLinkOptions(id,page,getAccessToken(),signal).then(r=>checked(r,id,page)),[id,page]);
 const resource=useHrResource(true,read,"读取工资关联候选失败"),pages=Math.max(1,Math.ceil((resource.data?.total??0)/20)),ready=!!resource.data&&!resource.loading&&!resource.error;
 useEffect(()=>{if(resource.data&&page>Math.max(1,Math.ceil(resource.data.total/20)))setPage(Math.max(1,Math.ceil(resource.data.total/20)));},[page,resource.data]);
 const submit=async()=>{
  if(busy||writing.current||!ready||resource.data?.existing||saved||!selected)return;
  const body={targetType:"payroll_input" as const,targetId:selected.id,targetVersion:selected.version},fingerprint=JSON.stringify(body);
  if(pending.current!==null&&pending.current!==fingerprint){setError("上次关联结果尚未确认，请保持原对象和版本重试，确认后再办理。");return;}
  writing.current=true;setError("");
  try{await publish(async()=>{pending.current=fingerprint;try{
   const result=await hrApi.linkRewardPayrollInput(id,body,getAccessToken(),key.current);
   if(!result||typeof result.id!=="string"||!result.id||result.targetType!=="payroll_input"||result.targetVersion!==selected.version||result.status!=="linked")throw Error("关联响应未确认，请保持原对象和版本重试。");
   if(alive.current){setSaved(true);await resource.load();}return result;
  }catch(e){if(alive.current){if(e instanceof ApiError&&[400,403,404,422].includes(e.status)){pending.current=null;key.current=crypto.randomUUID();}setError(hrLoadErrorMessage(e,"关联工资输入失败"));}throw e;}});}finally{writing.current=false;}
 };
 const rows=resource.data?.items??[],options=selected&&!rows.some(r=>value(r)===value(selected))?[selected,...rows]:rows;
 return <section className={local.corrections} aria-label="奖惩工资输入关联"><h3>关联工资输入</h3><p>选择本员工有效的考勤工资输入版本，保留奖惩事项依据。工资金额由工资审批流程处理。</p>
 {saved?<p role="status">工资输入关联已保存，原奖惩审批记录保留。</p>:null}
 {resource.loading?<p>正在读取工资关联候选…</p>:null}
 {resource.error?<p role="alert">{saved?"关联已保存，读取关联信息失败：":""}{resource.error}</p>:null}
 {resource.data?.existing?<article className="ds-mobile-record"><strong>{statuses[resource.data.existing.status]}</strong><p>{resource.data.existing.periodMonth?`${resource.data.existing.periodMonth} · 批次 ${resource.data.existing.batchNo??"待核对"}`:"关联对象当前不可读取，引用已保留。"} · 版本 {resource.data.existing.targetVersion}</p><span>{resource.data.existing.createdAt}</span><p>此事项已有关联记录，保留原关联依据。</p></article>:!saved?<form aria-label="关联奖惩工资输入" className={styles.formGrid} onSubmit={e=>{e.preventDefault();void submit();}}>
 <label className={`form-field ${local.wide}`}><span>工资输入版本</span><select required disabled={busy||!ready} value={selected?value(selected):""} onChange={e=>{const next=options.find(r=>value(r)===e.target.value);setSelected(next??null);setError("");}}><option value="">请选择月份和批次</option>{options.map(r=><option key={value(r)} value={value(r)}>{label(r)}</option>)}</select></label>
 <button className="ds-button ds-button-primary" disabled={busy||!ready||!selected}>保存工资输入关联</button>
 </form>:null}
 {error?<p role="alert" className="form-error">{error}</p>:null}
 {ready&&!resource.data?.existing&&!saved?<div className={styles.recordActions}><button type="button" className="ds-button" disabled={busy||page<=1} onClick={()=>setPage(page-1)}>工资输入上一页</button><span>第 {page} / {pages} 页 · 共 {resource.data?.total??0} 条</span><button type="button" className="ds-button" disabled={busy||page>=pages} onClick={()=>setPage(page+1)}>工资输入下一页</button></div>:null}
 {ready&&resource.data?.total===0&&!resource.data.existing&&!saved?<p>本员工暂无有效工资输入，请先完成对应月份的考勤月结或补正。</p>:null}
 <button type="button" className="ds-button" disabled={busy||resource.loading} onClick={()=>void resource.load()}>重新读取工资关联</button>
 </section>;
}
