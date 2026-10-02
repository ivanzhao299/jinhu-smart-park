"use client";
import { useEffect,useRef,useState } from "react";
import { hrApi,type HrDirectoryUserOption,type HrEmployee } from "../../../lib/hr-api";
import { getAccessToken } from "../../../lib/authz";
import styles from "./employee-account-link.module.css";

export function EmployeeAccountLink({employee,users,onSaved}:{employee:HrEmployee;users:HrDirectoryUserOption[];onSaved:(employee:HrEmployee)=>void}){
 const [account,setAccount]=useState(employee.userId??""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const active=useRef(true),lock=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 const save=async(form:FormData)=>{
  if(lock.current||account===(employee.userId??""))return;
  lock.current=true;setBusy(true);setMessage("");
  try{
   const updated=await hrApi.linkEmployeeAccount(employee.id,{userId:account||null,expectedUserId:employee.userId,reason:String(form.get("reason")??"").trim()},getAccessToken());
   if(active.current){setMessage("账号关联已保存");onSaved(updated)}
  }catch{if(active.current)setMessage("保存失败，请刷新员工详情后核对账号是否可用或已被占用。")}
  finally{lock.current=false;if(active.current)setBusy(false)}
 };
 const current=users.find(user=>user.id===employee.userId);
 return <section className={`ds-panel ${styles.panel}`}>
 <header className={styles.heading}><span className="ds-eyebrow">员工账号</span><h2 className="panel-title">系统账号关联</h2><p className="muted-text">{employee.fullName} · {employee.employeeCode}</p></header>
 <p className={styles.currentAccount}>当前关联：{employee.userId?(current?`${current.displayName||current.username}（${current.username}）`:"已有账号，当前候选中不可用"):"尚未关联"}</p>
 <p className={`muted-text ${styles.description}`}>请核对员工编号和账号用户名。保存后，该账号可按已有权限访问本人档案。</p>
 <form action={save} className={styles.form}>
 <label className="form-field"><span>系统账号</span><select aria-label="关联员工的系统账号" value={account} disabled={busy} onChange={event=>setAccount(event.target.value)}><option value="">不关联账号</option>{employee.userId&&!current?<option value={employee.userId}>保留当前关联</option>:null}{employee.employmentStatus!=="departed"?users.map(user=><option key={user.id} value={user.id}>{user.displayName||user.username}（{user.username}）</option>):current?<option value={current.id}>{current.displayName||current.username}（{current.username}）</option>:null}</select></label>
 <label className="form-field"><span>核对与变更原因</span><input name="reason" required maxLength={500} disabled={busy}/></label>
 <label className={styles.confirmation}><input type="checkbox" name="confirmed" required disabled={busy}/><span>已核对该员工与账号归属</span></label>
 <div className={styles.actions}><button className="ds-button ds-button-primary" disabled={busy||account===(employee.userId??"")}>{busy?"正在保存…":"确认保存账号关联"}</button></div>
 </form>{message?<p className="ds-field-help" role="status">{message}</p>:null}
 </section>;
}
