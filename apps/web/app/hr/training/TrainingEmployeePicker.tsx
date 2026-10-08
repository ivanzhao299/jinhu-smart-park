"use client";
import { useEffect,useRef,useState } from "react";
import { getAccessToken } from "../../../lib/authz";
import { hrApi,type HrEmployee } from "../../../lib/hr-api";
import { hrLoadErrorMessage } from "../hr-errors";
import styles from "./training-employee-picker.module.css";
export type TrainingEmployeeOption=Pick<HrEmployee,"id"|"employeeCode"|"fullName">;
export const TRAINING_EMPLOYEE_LIMIT=500;
function candidatePage(value:unknown,page:number):{items:TrainingEmployeeOption[];total:number}{
 const invalid=()=>{throw new Error("员工候选响应无效，请重试。");};
 if(!value||typeof value!=="object")return invalid();
 const result=value as Record<string,unknown>;
 if(result.page!==page||result.page_size!==20||typeof result.total!=="number"||!Number.isSafeInteger(result.total)||result.total<0||!Array.isArray(result.items)||result.items.length>20)return invalid();
 const items:TrainingEmployeeOption[]=[];
 for(const item of result.items){
  if(!item||typeof item!=="object")return invalid();
  const row=item as Record<string,unknown>;
  if(typeof row.id!=="string"||!row.id.trim()||typeof row.employeeCode!=="string"||typeof row.fullName!=="string")return invalid();
  items.push({id:row.id,employeeCode:row.employeeCode,fullName:row.fullName});
 }
 return {items:[...new Map(items.map(item=>[item.id,item])).values()],total:result.total};
}
export function TrainingEmployeePicker({selected,onChange,disabled=false}:{selected:TrainingEmployeeOption[];onChange:(value:TrainingEmployeeOption[])=>void;disabled?:boolean}){
 const [keyword,setKeyword]=useState(""),[page,setPage]=useState(1),[items,setItems]=useState<TrainingEmployeeOption[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0),[selectionError,setSelectionError]=useState("");
 const generation=useRef(0);
 useEffect(()=>{
  const controller=new AbortController(),current=++generation.current;setLoading(true);setError("");setItems([]);
  void hrApi.trainingEmployeeOptions(page,keyword.trim(),getAccessToken(),controller.signal).then(result=>{
   if(controller.signal.aborted||current!==generation.current)return;
   const valid=candidatePage(result,page),last=Math.max(1,Math.ceil(valid.total/20));if(page>last){setPage(last);return;}
   setItems(valid.items);setTotal(valid.total);
  }).catch(e=>{if(!controller.signal.aborted&&current===generation.current)setError(hrLoadErrorMessage(e,"加载参训员工失败"));}).finally(()=>{if(!controller.signal.aborted&&current===generation.current)setLoading(false);});
  return()=>controller.abort();
 },[page,keyword,retry]);
 const toggle=(item:TrainingEmployeeOption)=>{
  if(disabled)return;setSelectionError("");
  if(selected.some(value=>value.id===item.id)){onChange(selected.filter(value=>value.id!==item.id));return;}
  const unique=[...new Map(selected.map(value=>[value.id,value])).values()];
  if(unique.length>=TRAINING_EMPLOYEE_LIMIT){setSelectionError("每个计划最多选择500名员工，请先移除已选员工。");return;}
  onChange([...unique,item]);
 };
 return <fieldset className={styles.picker} disabled={disabled}><legend>参训员工</legend>
  <label className="form-field"><span>员工搜索</span><input type="search" placeholder="姓名或员工编号" maxLength={100} value={keyword} onChange={event=>{setKeyword(event.target.value);setPage(1);}}/></label>
  <p role="status">已选 {selected.length} / {TRAINING_EMPLOYEE_LIMIT} 人，切换搜索和分页会保留选择。</p>
  {selectionError?<p className="form-error" role="alert">{selectionError}</p>:null}
  <div className={styles.records} aria-label="已选参训员工">{selected.map(item=><div key={item.id} className={`ds-mobile-record ${styles.record}`}><span>{item.fullName} · {item.employeeCode}</span><button type="button" className="ds-button" aria-label={`移除 ${item.fullName} ${item.employeeCode}`} onClick={()=>toggle(item)}>移除</button><input type="hidden" name="employees" value={item.id}/></div>)}</div>
  {error?<p className="form-error" role="alert">{error}<button type="button" className="ds-button" onClick={()=>setRetry(value=>value+1)}>重试员工候选</button></p>:null}
  <div className={styles.records} aria-label="参训员工候选">{loading?<p>正在加载员工…</p>:items.length?items.map(item=><label key={item.id} className={`ds-mobile-record ${styles.choice}`}><input type="checkbox" checked={selected.some(value=>value.id===item.id)} onChange={()=>toggle(item)}/><span>{item.fullName} · {item.employeeCode}</span></label>):!error?<p>没有匹配的参训员工。</p>:null}</div>
  <nav className={styles.pages} aria-label="参训员工候选分页"><button type="button" className="ds-button" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}>上一批</button><span>{loading?"加载中":`第 ${page} / ${Math.max(1,Math.ceil(total/20))} 页 · ${total} 人`}</span><button type="button" className="ds-button" disabled={loading||Boolean(error)||page*20>=total} onClick={()=>setPage(value=>value+1)}>下一批</button></nav>
 </fieldset>;
}
