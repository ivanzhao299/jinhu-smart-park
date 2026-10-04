"use client";
import { useEffect, useRef, useState } from "react";
import { HR_EMPLOYMENT_TYPES } from "@jinhu/shared";
import { ApiError } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";
import { hrApi, type HrEmployeeBasicInformation, type HrEmployeeBasicInformationPatch } from "../../../../lib/hr-api";
import styles from "./hr-family-maintenance.module.css";

type Props={employeeId:string;captureScope:()=>()=>boolean;onSaved:(row:HrEmployeeBasicInformation)=>void};
const ordinary=[{key:"fullName",label:"姓名",max:100},{key:"hireDate",label:"本单位入职日期"},
 {key:"workLocation",label:"工作地点",max:128},{key:"workMobile",label:"工作电话",max:32},
 {key:"workEmail",label:"工作邮箱",max:128},{key:"remark",label:"备注",max:500}] as const;
const keys=["fullName","employmentType","hireDate","workLocation","workMobile","workEmail","remark"] as const;
type Draft=Record<typeof keys[number],string>;
const typeLabels:Record<string,string>={full_time:"全职",part_time:"兼职",intern:"实习",contractor:"合同制",temporary:"临时工"};
function valid(row:HrEmployeeBasicInformation,id:string){
 return row?.id===id&&Number.isInteger(row.version)&&row.version>0&&typeof row.fullName==="string"&&HR_EMPLOYMENT_TYPES.some(type=>type===row.employmentType)
  &&keys.slice(2).every(key=>row[key]===null||typeof row[key]==="string");
}
function initial(row:HrEmployeeBasicInformation):Draft{return Object.fromEntries(keys.map(key=>[key,row[key]??""])) as Draft;}
export function HrEmployeeBasicMaintenance({employeeId,captureScope,onSaved}:Props){
 const [editing,setEditing]=useState(false),[record,setRecord]=useState<HrEmployeeBasicInformation|null>(null),[draft,setDraft]=useState<Draft|null>(null);
 const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[message,setMessage]=useState("");
 const mounted=useRef(true),saving=useRef(false),generation=useRef(0),readAbort=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;readAbort.current?.abort();}},[]);
 async function load(){
  if(saving.current)return;
  const current=captureScope(),request=++generation.current,controller=new AbortController();readAbort.current?.abort();readAbort.current=controller;
  setEditing(true);setBusy(true);setBlocked(true);setRecord(null);setDraft(null);setMessage("");
  try{const row=await hrApi.employeeBasicInformation(employeeId,getAccessToken(),controller.signal);
   if(!mounted.current||!current()||request!==generation.current)return;
   if(!valid(row,employeeId))throw new Error("Invalid employee maintenance response");
   setRecord(row);setDraft(initial(row));setBlocked(false);
  }catch(error){if(mounted.current&&current()&&request===generation.current&&(error as Error).name!=="AbortError")setMessage("基本信息暂未成功读取，请重新加载后再维护。");}
  finally{if(mounted.current&&current()&&request===generation.current)setBusy(false);}
 }
 async function save(){
  if(saving.current||busy||blocked||!record||!draft)return;
  if(!draft.fullName.trim()){setMessage("请填写姓名。");return;}
  const patch:HrEmployeeBasicInformationPatch={expectedVersion:record.version};
  for(const key of keys){const value=draft[key].trim();if(value!==(record[key]??""))Object.assign(patch,{[key]:value||null});}
  if(Object.keys(patch).length===1){setMessage("没有需要保存的修改。");return;}
  const current=captureScope();saving.current=true;setBusy(true);setMessage("");
  try{const saved=await hrApi.updateEmployeeBasicInformation(employeeId,patch,getAccessToken());
   if(!mounted.current||!current())return;
   if(!valid(saved,employeeId)||saved.version!==record.version+1)throw new Error("Invalid employee save response");
   setRecord(saved);setDraft(initial(saved));setEditing(false);setMessage("员工基本信息已保存。");onSaved(saved);
  }catch(error){if(!mounted.current||!current())return;setBlocked(true);setMessage(error instanceof ApiError&&error.status===409?"资料已被其他操作更新，草稿已保留。请重新加载后核对。":"保存结果未确认，草稿已保留。请重新加载核对后再操作。");}
  finally{saving.current=false;if(mounted.current&&current())setBusy(false);}
 }
 const disabled=busy||blocked;
 return <section className={styles.panel} aria-label="员工基本信息维护"><h3>基本信息维护</h3>
  {!editing?<button type="button" className="ds-button" onClick={()=>void load()}>编辑基本信息</button>:null}
  {editing&&draft?<form className={`ds-scene-card ${styles.form}`} aria-label="编辑员工基本信息" onSubmit={event=>{event.preventDefault();void save();}}>
   {ordinary.map(field=><label className="form-field" key={field.key}><span>{field.label}</span><input name={field.key} type={field.key==="hireDate"?"date":field.key==="workEmail"?"email":field.key==="workMobile"?"tel":"text"} maxLength={"max" in field?field.max:undefined} required={field.key==="fullName"} value={draft[field.key]} disabled={disabled} onChange={event=>setDraft(previous=>previous?{...previous,[field.key]:event.target.value}:previous)}/></label>)}
   <label className="form-field"><span>用工类型</span><select name="employmentType" required value={draft.employmentType} disabled={disabled} onChange={event=>setDraft(previous=>previous?{...previous,employmentType:event.target.value}:previous)}>{HR_EMPLOYMENT_TYPES.map(type=><option value={type} key={type}>{typeLabels[type]}</option>)}</select></label>
   <div className={`${styles.actions} ${styles.wide}`}><button className="ds-button ds-button-primary" disabled={disabled}>保存基本信息</button><button type="button" className="ds-button" disabled={busy} onClick={()=>{generation.current++;readAbort.current?.abort();setEditing(false);setMessage("");}}>取消编辑</button></div>
  </form>:null}
  {busy&&!draft?<p role="status">正在读取基本信息…</p>:null}
  {message?<p role={blocked?"alert":"status"}>{message}</p>:null}
  {editing&&blocked?<button type="button" className="ds-button" disabled={busy} onClick={()=>void load()}>重新加载基本信息</button>:null}
 </section>;
}
