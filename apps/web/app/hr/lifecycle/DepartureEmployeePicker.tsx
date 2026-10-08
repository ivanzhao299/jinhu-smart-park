"use client";
import {useEffect,useRef,useState} from "react";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrDepartureEmployeeOption} from "../../../lib/hr-api";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "../hr-workbench.module.css";

type Selection=Pick<HrDepartureEmployeeOption,"id"|"employeeName"|"employeeCode">;
export function DepartureEmployeePicker({purpose,name,label,initialSelection,initialId,excludeEmployeeId,required=false,disabled=false}:{purpose:"application"|"handover";name:string;label:string;initialSelection?:Selection;initialId?:string;excludeEmployeeId?:string;required?:boolean;disabled?:boolean}){
 const [selected,setSelected]=useState<Selection|undefined>(initialSelection),[keyword,setKeyword]=useState(""),[page,setPage]=useState(1),[items,setItems]=useState<HrDepartureEmployeeOption[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 const generation=useRef(0),boundId=initialSelection?.id,hydrated=useRef(Boolean(initialSelection));
 useEffect(()=>{
  const controller=new AbortController(),current=++generation.current;
  setLoading(true);setError("");setItems([]);
  void hrApi.departureEmployeeOptions(purpose,page,keyword.trim(),getAccessToken(),controller.signal,boundId?undefined:initialId,excludeEmployeeId).then(result=>{
   if(controller.signal.aborted||current!==generation.current)return;
   const lastPage=Math.max(1,Math.ceil(result.total/20));
   if(page>lastPage){setPage(lastPage);return;}
   setItems(result.items);setTotal(result.total);
   if(!hydrated.current){hydrated.current=true;if(result.selected){setSelected(result.selected);}}
  }).catch(e=>{if(!controller.signal.aborted&&current===generation.current)setError(hrLoadErrorMessage(e,"加载离职员工候选失败"));}).finally(()=>{if(!controller.signal.aborted&&current===generation.current)setLoading(false);});
  return()=>controller.abort();
 },[purpose,page,keyword,initialId,boundId,excludeEmployeeId,retry]);
 const choices=selected&&!items.some(item=>item.id===selected.id)?[selected,...items]:items;
 return <div style={{minWidth:0}}>
  <label className="form-field"><span>{label}搜索</span><input type="search" aria-label={`${label}搜索`} placeholder="姓名或员工编号" maxLength={100} value={keyword} disabled={disabled} onChange={event=>{setKeyword(event.target.value);setPage(1);}}/></label>
  <label className="form-field"><span>{label}</span><select name={name} aria-label={label} value={selected?.id??""} required={required} disabled={disabled} onChange={event=>{hydrated.current=true;const choice=choices.find(item=>item.id===event.target.value);setSelected(choice);}}><option value="">请选择{purpose==="handover"?"或勾选豁免":""}</option>{choices.filter(item=>item.id!==excludeEmployeeId).map(item=><option key={item.id} value={item.id}>{item.employeeName} · {item.employeeCode}</option>)}</select></label>
  {error?<p className="form-error" role="alert">{error}<button type="button" className="ds-button" disabled={disabled} onClick={()=>setRetry(value=>value+1)}>重试</button></p>:null}
  <nav aria-label={`${label}候选分页`} className={`${styles.actionRow} ${styles.departurePickerPages}`}>
   <button type="button" className="ds-button" disabled={disabled||loading||page<=1} onClick={()=>setPage(value=>value-1)}>上一批</button>
   <span role="status">{loading?"加载中":`第 ${page} / ${Math.max(1,Math.ceil(total/20))} 页 · ${total} 人`}</span>
   <button type="button" className="ds-button" disabled={disabled||loading||Boolean(error)||page>=Math.max(1,Math.ceil(total/20))} onClick={()=>setPage(value=>value+1)}>下一批</button>
  </nav>
 </div>;
}
