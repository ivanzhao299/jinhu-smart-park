"use client";
import type {PaginatedResult} from "@jinhu/shared";
import {useCallback,useEffect,useState} from "react";
import {hrApi,type HrFeedback360EmployeeOption,type HrFeedback360SubjectOption} from "../../../lib/hr-api";
import {getAccessToken} from "../../../lib/authz";
import {useHrResource} from "../use-hr-resource";
import styles from "./feedback-reference.module.css";
export type FeedbackPageReader<T>=(page:number,keyword:string,signal:AbortSignal)=>Promise<PaginatedResult<T>>;
const employeeValid=(r:HrFeedback360EmployeeOption)=>typeof r.employeeCode==="string"&&typeof r.fullName==="string";
const subjectValid=(r:HrFeedback360SubjectOption)=>[r.cycleCode,r.cycleName,r.employeeCode,r.subjectName].every(v=>typeof v==="string");
const nominationValid=(r:HrFeedback360SubjectOption)=>subjectValid(r)&&["nominating","responding"].includes(r.status);
const publicationValid=(r:HrFeedback360SubjectOption)=>subjectValid(r)&&["responding","closed"].includes(r.status);
export const employeeReferences={read:(page:number,keyword:string,signal:AbortSignal)=>hrApi.feedback360EmployeeOptions(page,keyword,getAccessToken(),signal),valid:employeeValid,label:(r:HrFeedback360EmployeeOption)=>`${r.fullName} · ${r.employeeCode}`};
export const nominationReferences={read:(page:number,keyword:string,signal:AbortSignal)=>hrApi.feedback360SubjectOptions("nominate",page,keyword,getAccessToken(),signal),valid:nominationValid,label:(r:HrFeedback360SubjectOption)=>`${r.cycleName} · ${r.cycleCode} · ${r.subjectName} · ${r.employeeCode}`};
export const publicationReferences={read:(page:number,keyword:string,signal:AbortSignal)=>hrApi.feedback360SubjectOptions("publish",page,keyword,getAccessToken(),signal),valid:publicationValid,label:nominationReferences.label};
function checkedPage<T extends {id:string}>(value:PaginatedResult<T>,page:number,valid:(r:T)=>boolean){
 if(!value||value.page!==page||value.page_size!==20||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.items)||value.items.length>20||value.items.length>value.total||value.items.some(r=>!r||typeof r.id!=="string"||!r.id.trim()||!valid(r))||new Set(value.items.map(r=>r.id)).size!==value.items.length||((page-1)*20>=value.total&&value.items.length>0))throw Error("360候选分页响应无效，请重试。");
 return value;
}
export function useFeedbackReferencePage<T extends {id:string}>(enabled:boolean,reader:FeedbackPageReader<T>,valid:(r:T)=>boolean){
 const [page,setPage]=useState(1),[draft,setDraft]=useState(""),[keyword,setKeyword]=useState("");
 const read=useCallback((signal:AbortSignal)=>reader(page,keyword,signal).then(v=>checkedPage(v,page,valid)),[reader,page,keyword,valid]);
 const resource=useHrResource(enabled,read,"读取360候选失败");
 useEffect(()=>{if(resource.data&&page>Math.max(1,Math.ceil(resource.data.total/20)))setPage(1);},[resource.data,page]);
 const search=()=>{const next=draft.trim();if(page===1&&next===keyword)void resource.load();else{setPage(1);setKeyword(next);}};
 return {resource,page,setPage,draft,setDraft,search};
}
type PageControls={resource:{data:{total:number}|null;error:string;loading:boolean;load:()=>Promise<boolean>};page:number;setPage:(v:number)=>void;draft:string;setDraft:(v:string)=>void;search:()=>void};
export function FeedbackPageControls({view,label,disabled=false}:{view:PageControls;label:string;disabled?:boolean}){
 const {resource,page,setPage,draft,setDraft,search}=view,pages=Math.max(1,Math.ceil((resource.data?.total??0)/20));
 return <div className={styles.controls}><label className="form-field"><span>搜索{label}</span><input type="search" maxLength={100} placeholder="姓名、编号或周期" value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(!disabled)search();}}}/></label><nav aria-label={`${label}分页`} className={styles.pages}><button type="button" className="ds-button" disabled={disabled} onClick={search}>搜索{label}</button><button type="button" className="ds-button" disabled={disabled||resource.loading||!!resource.error||page<=1} onClick={()=>setPage(page-1)}>{label}上一页</button><span>{resource.loading?"正在读取…":resource.error?"读取未完成":`第 ${page} / ${pages} 页 · 共 ${resource.data?.total??0} 条`}</span><button type="button" className="ds-button" disabled={disabled||resource.loading||!!resource.error||!resource.data||page>=pages} onClick={()=>setPage(page+1)}>{label}下一页</button></nav>{resource.error?<p role="alert" className="form-error">{label}：{resource.error}<button type="button" className="ds-button" disabled={disabled||resource.loading} onClick={()=>void resource.load()}>重试{label}</button></p>:null}</div>;
}
export function FeedbackReferencePicker<T extends {id:string}>({label,references,selected,onChange,onReady,disabled=false,multiple=false}:{label:string;references:{read:FeedbackPageReader<T>;valid:(r:T)=>boolean;label:(r:T)=>string};selected:T[];onChange:(rows:T[])=>void;onReady:(ready:boolean)=>void;disabled?:boolean;multiple?:boolean}){
 const view=useFeedbackReferencePage(true,references.read,references.valid),[error,setError]=useState("");
 useEffect(()=>{onReady(!!view.resource.data&&!view.resource.loading&&!view.resource.error);},[view.resource.data,view.resource.loading,view.resource.error,onReady]);
 const toggle=(row:T)=>{if(disabled)return;setError("");if(selected.some(r=>r.id===row.id)){onChange(selected.filter(r=>r.id!==row.id));return;}if(multiple&&selected.length>=500){setError("每个周期最多选择500名评价对象，请先移除已选对象。");return;}onChange(multiple?[...selected,row]:[row]);};
 return <fieldset className={styles.picker} disabled={disabled}><legend>{label}{multiple?"（可多选）":""}</legend><FeedbackPageControls view={view} label={label} disabled={disabled}/><p>已选 {selected.length}{multiple?" / 500":""}，搜索和翻页保留选择。</p>{error?<p role="alert" className="form-error">{error}</p>:null}<div className={styles.records} aria-label={`已选${label}`}>{selected.map(row=><div key={row.id} className={`ds-mobile-record ${styles.selected}`}><span>{references.label(row)}</span><button type="button" className="ds-button" onClick={()=>toggle(row)} aria-label={`移除${label} ${references.label(row)}`}>移除</button></div>)}</div><div className={styles.records} aria-label={`${label}候选`}>{view.resource.data?.items.map(row=><label key={row.id} className={`ds-mobile-record ${styles.choice}`}><input type="checkbox" checked={selected.some(r=>r.id===row.id)} onChange={()=>toggle(row)}/><span>{references.label(row)}</span></label>)}{view.resource.data&&!view.resource.data.items.length?<p>没有匹配的{label}。</p>:null}</div></fieldset>;
}
