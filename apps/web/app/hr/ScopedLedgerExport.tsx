"use client";
import {useEffect,useRef,useState} from "react";
import {getAccessToken} from "../../lib/authz";
import {collectScopedExport,downloadCsv,type ExportPage} from "../../lib/scoped-csv-export";

/** Scoped live export. Pagination validation is shared with employee/payroll exports. */
export function ScopedLedgerExport<T extends {id:string}>({contextKey,enabled,label,fetchPage,serialize,fileName,successMessage}:{
 contextKey:string;enabled:boolean;label:string;
 fetchPage:(page:number,size:number,signal:AbortSignal,token?:string)=>Promise<ExportPage<T>>;
 serialize:(rows:readonly T[])=>string;fileName:string;successMessage?:(rows:readonly T[])=>string;
}){
 const context=useRef({contextKey,enabled});context.current={contextKey,enabled};
 const request=useRef<AbortController|null>(null),[state,setState]=useState({key:contextKey,busy:false,message:""});
 useEffect(()=>{setState({key:contextKey,busy:false,message:""});return()=>{request.current?.abort();request.current=null;};},[contextKey,enabled]);
 const exportLedger=async()=>{
  if(!enabled||request.current)return;
  const controller=new AbortController();request.current=controller;
  const current=()=>!controller.signal.aborted&&request.current===controller&&context.current.contextKey===contextKey&&context.current.enabled;
  setState({key:contextKey,busy:true,message:""});
  try{
   const token=getAccessToken();
   const rows=await collectScopedExport((page,size)=>fetchPage(page,size,controller.signal,token),current,{pageSize:100,limit:5000,label});
   if(!rows||!current())return;
   const csv=serialize(rows);if(!current())return;
   downloadCsv(csv,fileName);setState({key:contextKey,busy:true,message:successMessage?.(rows)??`已导出 ${rows.length} 条匹配${label}。`});
  }catch(error){if(current())setState({key:contextKey,busy:true,message:error instanceof Error?error.message:"导出失败，请重新尝试。"});}
  finally{if(request.current===controller){request.current=null;if(context.current.contextKey===contextKey)setState(previous=>({...previous,busy:false}));}}
 };
 const visible=state.key===contextKey;
 return <div><button type="button" className="ds-button ds-button-secondary" style={{minHeight:44}} disabled={!enabled||(visible&&state.busy)} onClick={()=>void exportLedger()}>{visible&&state.busy?"正在导出…":`导出筛选${label}`}</button>{visible&&state.message?<p role="status">{state.message}</p>:null}</div>;
}
