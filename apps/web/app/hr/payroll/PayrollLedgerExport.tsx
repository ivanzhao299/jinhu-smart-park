"use client";
import {useEffect,useRef,useState} from "react";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {useAuthUser} from "../../../lib/auth-context";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrPayrollHistoryFilters} from "../../../lib/hr-api";
import {hasAnyPermission} from "../../../lib/permissions";
import {PermissionGuard} from "../../../components/auth/PermissionGuard";
import {collectPayrollLedger,downloadPayrollLedger,payrollLedgerCsv} from "./payroll-ledger-export";

export function PayrollLedgerExport({filters,disabled=false}:{filters:HrPayrollHistoryFilters;disabled?:boolean}){
  const user=useAuthUser(),management=hasAnyPermission(user,[HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ]);
  const allowed=management||hasAnyPermission(user,[HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ]);
  const key=JSON.stringify([user,filters,disabled]),context=useRef(key);context.current=key;
  const request=useRef<AbortController|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{setMessage("");setBusy(false);return()=>{request.current?.abort();request.current=null;};},[key]);
  const exportLedger=async()=>{
    if(!allowed||disabled||request.current)return;
    if(management&&(!filters.periodFrom||!filters.periodTo)){setMessage("请先查询开始和结束月份，再导出工资台账。");return;}
    const controller=new AbortController();request.current=controller;
    const current=()=>!controller.signal.aborted&&request.current===controller&&context.current===key;
    setBusy(true);setMessage("");
    try{
      const token=getAccessToken();
      const rows=await collectPayrollLedger((page,size)=>hrApi.payrollHistory(token,page,size,filters,controller.signal),current);
      if(!rows||!current())return;
      const csv=payrollLedgerCsv(rows,!management);if(!current())return;
      downloadPayrollLedger(csv);setMessage(`已导出 ${rows.length} 条匹配工资记录。`);
    }catch(error){if(current())setMessage(error instanceof Error?error.message:"导出失败，请重新尝试。");}
    finally{if(request.current===controller){request.current=null;if(context.current===key)setBusy(false);}}
  };
  if(!allowed)return null;
  return <PermissionGuard module="hr"><div><button type="button" className="ds-button ds-button-secondary" style={{minHeight:44}} disabled={disabled||busy} onClick={()=>void exportLedger()}>{busy?"正在导出…":"导出筛选工资"}</button>{message?<p role="status">{message}</p>:null}</div></PermissionGuard>;
}
