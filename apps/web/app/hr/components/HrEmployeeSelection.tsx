"use client";

import {HR_PERMISSIONS} from "@jinhu/shared";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrEmployee} from "../../../lib/hr-api";
import {hasAnyPermission} from "../../../lib/permissions";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "./hr-employee-selection.module.css";

export type HrEmployeeOption=Pick<HrEmployee,"id"|"fullName"|"employeeCode">;
interface Props {selectedId:string;currentEmployee?:HrEmployeeOption;onChange:(id:string,employee?:HrEmployeeOption)=>void;disabled:boolean;purpose:"contract"|"lifecycle"|"probation";}
const pageSize=20;
const contractEligible=(employee:HrEmployee)=>["preboarding","probation","active"].includes(employee.employmentStatus);

/** Uses the existing scoped directory; opening a contract never scans all employee pages. */
export function HrEmployeeSelection({selectedId,currentEmployee,onChange,disabled,purpose}:Props){
 const user=useAuthUser(),allowed=hasAnyPermission(user,[HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ]);
 const eligible=(employee:HrEmployee)=>purpose==="lifecycle"?true:purpose==="probation"?employee.employmentStatus==="probation":contractEligible(employee);
 const domain=purpose==="contract"?"合同":purpose==="probation"?"转正":"清单";
 const [draft,setDraft]=useState(""),[keyword,setKeyword]=useState("");
 const [rows,setRows]=useState<HrEmployee[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0);
 const [retained,setRetained]=useState<HrEmployeeOption|undefined>(currentEmployee);
 const [loading,setLoading]=useState(false),[error,setError]=useState("");
 const pending=useRef<AbortController|null>(null);
 const load=useCallback(async function loadPage(requestedPage=1,query=keyword):Promise<void>{
  if(!allowed)return;
  const controller=new AbortController();pending.current?.abort();pending.current=controller;
  const current=()=>pending.current===controller&&!controller.signal.aborted;
  setLoading(true);setRows([]);setError("");
  try{
   const result=await hrApi.employees(getAccessToken(),requestedPage,pageSize,purpose==="probation"?{keyword:query,status:"probation"}:{keyword:query},controller.signal);
   if(!current())return;
   if(result.page!==requestedPage||result.page_size!==pageSize||!Number.isSafeInteger(result.total)||result.total<0||result.items.length>pageSize||new Set(result.items.map(row=>row.id)).size!==result.items.length)throw new Error("员工候选分页响应无效，请重试。");
   if(requestedPage>Math.max(1,Math.ceil(result.total/pageSize))){await loadPage(1,query);return;}
   setRows(result.items);setPage(requestedPage);setTotal(result.total);
  }catch(reason){if(current()){setRows([]);setPage(1);setTotal(0);setError(hrLoadErrorMessage(reason,`加载${domain}员工候选失败`));}}
  finally{if(current())setLoading(false);}
 },[allowed,keyword,purpose,domain]);
 useEffect(()=>{void load();return()=>pending.current?.abort();},[load]);
 const selected=rows.find(row=>row.id===selectedId)??(retained?.id===selectedId?retained:currentEmployee?.id===selectedId?currentEmployee:undefined);
 const pages=Math.max(1,Math.ceil(total/pageSize));
 const search=()=>{const next=draft.trim();if(next===keyword)void load(1,next);else setKeyword(next);};
 return <div className={styles.employeeSelector}>
  <div className={styles.employeeFields}>
   <label className="form-field"><span>搜索{domain}员工</span><input maxLength={100} placeholder="姓名或员工编号" value={draft} disabled={disabled||!allowed} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();search();}}}/></label>
   <label className="form-field"><span>员工</span><select required={purpose!=="probation"} value={selectedId} disabled={disabled||loading||!allowed} onChange={event=>{
    const row=rows.find(employee=>employee.id===event.target.value);
    if(row&&eligible(row)){setRetained(row);if(purpose==="probation")onChange(row.id,row);else onChange(row.id);}
    else if(event.target.value===""){setRetained(undefined);onChange("");}
   }}><option value="">请选择员工</option>
    {selected&&!rows.some(row=>row.id===selected.id)?<option value={selected.id}>{selected.fullName} · {selected.employeeCode}（已选）</option>:null}
    {rows.map(row=><option key={row.id} value={row.id} disabled={!eligible(row)&&row.id!==selectedId}>{row.fullName} · {row.employeeCode}{eligible(row)?"":row.employmentStatus==="departed"?"（已离职）":"（停职）"}</option>)}
   </select></label>
  </div>
  {allowed?<nav className={styles.employeeControls} aria-label={`${domain}员工候选分页`}>
   <button type="button" className="ds-button ds-button-secondary" disabled={disabled} onClick={search}>搜索员工</button>
   <button type="button" className="ds-button ds-button-secondary" disabled={disabled||loading||page<=1} onClick={()=>void load(page-1)}>员工上一页</button>
   <span role="status">{loading?"正在加载员工…":`员工目录第 ${page} / ${pages} 页 · 共 ${total} 人`}</span>
   <button type="button" className="ds-button ds-button-secondary" disabled={disabled||loading||page>=pages} onClick={()=>void load(page+1)}>员工下一页</button>
  </nav>:<p>{purpose==="contract"?"当前权限不能查询员工目录；可保留本合同的员工，选择其他员工需要员工读取权限。":purpose==="probation"?"当前权限不能查询员工目录；可维护已授权申请的参与人，增加员工需要员工读取权限。":"当前权限不能查询员工目录；选择清单员工需要员工读取权限。"}</p>}
  {selected?<p>当前{domain}员工：{selected.fullName} · {selected.employeeCode}</p>:null}
  {error?<p className="form-error" role="alert">{error}</p>:allowed&&!loading&&!rows.length?<p>{purpose==="contract"?"当前条件下没有员工。离职或停职员工不能作为新的合同办理对象。":"当前条件下没有员工。"}</p>:null}
 </div>;
}
