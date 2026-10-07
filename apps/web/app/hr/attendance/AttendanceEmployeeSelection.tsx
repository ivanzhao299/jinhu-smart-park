"use client";

import {HR_PERMISSIONS} from "@jinhu/shared";
import {useCallback,useEffect,useRef,useState} from "react";
import {PermissionGuard} from "../../../components/auth/PermissionGuard";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrAttendanceEmployeeOption} from "../../../lib/hr-api";
import {hasPermission} from "../../../lib/permissions";
import {hrLoadErrorMessage} from "../hr-errors";
import styles from "./employee-selection.module.css";

interface Props {
 selected:HrAttendanceEmployeeOption|null;
 onChange:(employee:HrAttendanceEmployeeOption|null)=>void;
 disabled?:boolean;
}
const pageSize=20;

export function AttendanceEmployeeSelection(props:Props){
 const user=useAuthUser();
 return <PermissionGuard module="hr" permission={HR_PERMISSIONS.HR_ATTENDANCE_OPERATE}><SelectionView key={JSON.stringify(user)} {...props}/></PermissionGuard>;
}

function SelectionView({selected,onChange,disabled=false}:Props){
 const user=useAuthUser(),allowed=hasPermission(user,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE);
 const [draft,setDraft]=useState(""),[keyword,setKeyword]=useState("");
 const [rows,setRows]=useState<HrAttendanceEmployeeOption[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const pending=useRef<AbortController|null>(null);
 const load=useCallback(async function loadPage(requestedPage=1,query=keyword):Promise<void>{
  if(!allowed)return;
  const controller=new AbortController();pending.current?.abort();pending.current=controller;
  const current=()=>pending.current===controller&&!controller.signal.aborted;
  setRows([]);setLoading(true);setError("");
  try{
   const result=await hrApi.attendanceEmployeeOptions(getAccessToken(),requestedPage,query,controller.signal);
   if(!current())return;
   if(result.page!==requestedPage||result.page_size!==pageSize||!Number.isSafeInteger(result.total)||result.total<0||result.items.length>pageSize||new Set(result.items.map(row=>row.id)).size!==result.items.length)throw new Error("员工候选分页响应无效，请重试。");
   if(requestedPage>Math.max(1,Math.ceil(result.total/pageSize))){await loadPage(1,query);return;}
   setRows(result.items);setPage(requestedPage);setTotal(result.total);
  }catch(reason){if(current()){setRows([]);setTotal(0);setPage(1);setError(hrLoadErrorMessage(reason,"加载考勤员工候选失败"));}}
  finally{if(current())setLoading(false);}
 },[allowed,keyword]);
 useEffect(()=>{void load();return()=>pending.current?.abort();},[load]);
 const pages=Math.max(1,Math.ceil(total/pageSize));
 const search=()=>{const next=draft.trim();if(next===keyword)void load(1,next);else setKeyword(next);};
 return <div className={styles.selector}>
  <div className={styles.fields}>
   <label className="form-field"><span>搜索考勤员工</span><input maxLength={100} placeholder="姓名或员工编号" value={draft} disabled={disabled} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();search();}}}/></label>
   <label className="form-field"><span>考勤员工</span><select value={selected?.id??""} disabled={disabled||loading} onChange={event=>onChange(rows.find(row=>row.id===event.target.value)??(selected?.id===event.target.value?selected:null))}>
    <option value="">请选择员工</option>
    {selected&&!rows.some(row=>row.id===selected.id)?<option value={selected.id}>{selected.fullName} · {selected.employeeCode}（已选）</option>:null}
    {rows.map(row=><option key={row.id} value={row.id}>{row.fullName} · {row.employeeCode}</option>)}
   </select></label>
  </div>
  <nav className={styles.controls} aria-label="考勤员工候选分页">
   <button type="button" className="ds-button" disabled={disabled} onClick={search}>搜索员工</button>
   <button type="button" className="ds-button" disabled={disabled||loading||page<=1} onClick={()=>void load(page-1)}>员工上一页</button>
   <span role="status">{loading?"正在加载员工…":`员工第 ${page} / ${pages} 页 · 共 ${total} 人`}</span>
   <button type="button" className="ds-button" disabled={disabled||loading||page>=pages} onClick={()=>void load(page+1)}>员工下一页</button>
  </nav>
  {selected?<p>当前操作员工：{selected.fullName} · {selected.employeeCode}</p>:<p>请明确选择员工后办理排班、人工打卡或日考勤重算。</p>}
  {error?<p className="form-error" role="alert">{error}</p>:!loading&&!rows.length?<p>当前条件下没有在职员工。</p>:null}
 </div>;
}
