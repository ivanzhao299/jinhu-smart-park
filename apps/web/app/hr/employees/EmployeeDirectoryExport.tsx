"use client";
import {useEffect,useRef,useState} from "react";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {hrApi} from "../../../lib/hr-api";
import {hasAnyPermission} from "../../../lib/permissions";
import {collectEmployeeDirectory,downloadEmployeeDirectory,employeeDirectoryCsv} from "./employee-directory-export";
import styles from "./employees.module.css";

export function EmployeeDirectoryExport({keyword,status,orgId,disabled=false}:{keyword:string;status:string;orgId?:string;disabled?:boolean}){
 const user=useAuthUser(),allowed=hasAnyPermission(user,[HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_EMPLOYEE_TEAM_READ]);
 const key=JSON.stringify([user,keyword,status,orgId,disabled]),context=useRef(key);context.current=key;
 const request=useRef<AbortController|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{setMessage("");setBusy(false);return()=>{request.current?.abort();request.current=null;};},[key]);
 const exportDirectory=async()=>{
  if(!allowed||disabled||request.current)return;
  const controller=new AbortController();request.current=controller;
  const current=()=>!controller.signal.aborted&&request.current===controller&&context.current===key;
  setBusy(true);setMessage("");
  try{
   const token=getAccessToken();
   const rows=await collectEmployeeDirectory((page,size)=>hrApi.employees(token,page,size,{keyword,status,...(orgId?{orgId}:{})},controller.signal),current);
   if(!rows||!current())return;
   const csv=employeeDirectoryCsv(rows);if(!current())return;
   downloadEmployeeDirectory(csv);setMessage(`已导出 ${rows.length} 条匹配员工记录。`);
  }catch(error){if(current())setMessage(error instanceof Error?error.message:"导出失败，请重新尝试。");}
  finally{if(request.current===controller){request.current=null;if(context.current===key)setBusy(false);}}
 };
 if(!allowed)return null;
 return <div className={styles.exportControl}><button type="button" className="ds-button ds-button-secondary" disabled={disabled||busy} onClick={()=>void exportDirectory()}>{busy?"正在导出…":"导出筛选员工"}</button>{message?<span role="status">{message}</span>:null}</div>;
}
