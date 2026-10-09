"use client";
import {useEffect,useRef,useState} from "react";
import {getAccessToken} from "../../../lib/authz";
import {hrApi} from "../../../lib/hr-api";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "./recruitment.module.css";

export type RecruitmentReference={id:string;label:string;employeeId?:string};
type Kind="requisition"|"candidate";
function referencePage(value:unknown,page:number,kind:Kind,status:string){
 const invalid=()=>{throw new Error("业务选择响应无效，请重试。");};
 if(!value||typeof value!=="object")return invalid();
 const result=value as Record<string,unknown>;
 if(result.page!==page||result.page_size!==20||!Number.isSafeInteger(result.total)||Number(result.total)<0||!Array.isArray(result.items)||result.items.length>20)return invalid();
 const items:RecruitmentReference[]=[];
 for(const value of result.items){
  if(!value||typeof value!=="object")return invalid();const row=value as Record<string,unknown>;
  if(typeof row.id!=="string"||!row.id.trim())return invalid();
  if(kind==="requisition"){
   if(row.status!==status||typeof row.title!=="string"||!row.title.trim()||typeof row.requisitionCode!=="string")return invalid();
   items.push({id:row.id,label:`${row.title} · ${row.requisitionCode}`});
  }else{
   if(row.stage!=="hired"||typeof row.fullName!=="string"||!row.fullName.trim()||typeof row.candidateNo!=="string")return invalid();
   if(row.convertedEmployeeId===null)continue;
   if(typeof row.convertedEmployeeId!=="string"||!row.convertedEmployeeId.trim())return invalid();
   items.push({id:row.id,label:`${row.fullName} · ${row.candidateNo}`,employeeId:row.convertedEmployeeId});
  }
 }
 return {items:[...new Map(items.map(row=>[row.id,row])).values()],total:Number(result.total)};
}
export function RecruitmentReferencePicker({kind,selected,onChange,canRead,disabled=false,refreshKey=0}:{kind:Kind;selected:RecruitmentReference|null;onChange:(value:RecruitmentReference|null)=>void;canRead:boolean;disabled?:boolean;refreshKey?:number}){
 const title=kind==="requisition"?"招聘需求选择":"预入职人员选择";
 const [keyword,setKeyword]=useState(""),[page,setPage]=useState(1),[status,setStatus]=useState("open"),[items,setItems]=useState<RecruitmentReference[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 const generation=useRef(0);
 useEffect(()=>{
  if(!canRead){setLoading(false);return;}
  const controller=new AbortController(),current=++generation.current;setLoading(true);setItems([]);setTotal(0);setError("");
  const request=kind==="requisition"?hrApi.recruitmentRequisitions(getAccessToken(),page,20,{keyword:keyword.trim(),status},controller.signal):hrApi.recruitmentCandidates(getAccessToken(),page,20,{keyword:keyword.trim(),stage:"hired"},controller.signal);
  void request.then(result=>{
   if(controller.signal.aborted||current!==generation.current)return;
   const valid=referencePage(result,page,kind,status),last=Math.max(1,Math.ceil(valid.total/20));
   if(page>last){setPage(last);return;}setItems(valid.items);setTotal(valid.total);
  }).catch(e=>{if(!controller.signal.aborted&&current===generation.current)setError(hrLoadErrorMessage(e,`加载${title}失败`));}).finally(()=>{if(!controller.signal.aborted&&current===generation.current)setLoading(false);});
  return()=>controller.abort();
 },[kind,canRead,page,keyword,status,retry,refreshKey,title]);
 return <fieldset className={styles.picker} disabled={disabled}><legend>{title}</legend>
  {!canRead?<p role="alert">当前账号缺少{kind==="requisition"?"招聘需求":"候选人"}读取权限，无法选择办理对象。请由有对应权限的人员办理。</p>:<>
   <label className="form-field"><span>{title}搜索</span><input type="search" maxLength={100} placeholder={kind==="requisition"?"岗位或需求编号":"姓名或候选人编号"} value={keyword} onChange={event=>{setKeyword(event.target.value);setPage(1);}}/></label>
   {kind==="requisition"?<label className="form-field"><span>需求状态</span><select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="open">在招</option><option value="draft">草稿</option></select></label>:null}
   <div className={`ds-mobile-record ${styles.chosen}`} aria-label={`${title}已选`}><span>{selected?`已选：${selected.label}`:"尚未选择办理对象"}</span>{selected?<button type="button" className="ds-button" onClick={()=>onChange(null)}>清除{title}</button>:null}</div>
   <p>切换搜索或分页会保留已选对象。{kind==="candidate"?"仅列出已录用并转入预入职的人员。":""}</p>
   {error?<p className="form-error" role="alert">{error}<button type="button" className="ds-button" onClick={()=>setRetry(value=>value+1)}>重试{title}</button></p>:null}
   <div className={styles.choices} aria-label={`${title}结果`}>{loading?<p role="status">正在加载{title}…</p>:items.length?items.map(item=><div key={item.id} className={`ds-mobile-record ${styles.choice}`}><span>{item.label}</span><button type="button" className="ds-button" aria-pressed={selected?.id===item.id} onClick={()=>onChange(item)}>选择 {item.label}</button></div>):!error?<p>本页没有可选对象。可更换搜索条件{kind==="candidate"?"或先将人员转入预入职":"或需求状态"}。</p>:null}</div>
   <nav aria-label={`${title}分页`} className={styles.pages}><button type="button" className="ds-button" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>{title}上一批</button><span role="status">第 {page} / {Math.max(1,Math.ceil(total/20))} 页 · 共 {total} 条</span><button type="button" className="ds-button" disabled={loading||Boolean(error)||page*20>=total} onClick={()=>setPage(value=>value+1)}>{title}下一批</button></nav>
  </>}
 </fieldset>;
}
