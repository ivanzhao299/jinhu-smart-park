"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {getAccessToken} from "../../lib/authz";
import {collectScopedExport,downloadCsv,type ExportPage} from "../../lib/scoped-csv-export";

/** Scoped live export. Pagination validation is shared with employee/payroll exports. */
export function ScopedLedgerExport<T extends {id:string}>({contextKey,enabled,label,fetchPage,serialize,fileName,successMessage}:{
 contextKey:string;enabled:boolean;label:string;
 fetchPage:(page:number,size:number,signal:AbortSignal,token?:string)=>Promise<ExportPage<T>>;
 serialize:(rows:readonly T[])=>string;fileName:string;successMessage?:(rows:readonly T[])=>string;
}){
 // Passive cleanup belongs to its committed context, never to a later request.
 const owner=useMemo(()=>({request:null as AbortController|null,active:true}),[contextKey,enabled]);
 const context=useRef(owner);context.current=owner;
 const [state,setState]=useState({owner,busy:false,message:""});
 useEffect(()=>{owner.active=true;return()=>{owner.active=false;owner.request?.abort();owner.request=null;};},[owner]);
 const exportLedger=async()=>{
  if(!enabled||!owner.active||owner.request)return;
  const controller=new AbortController();owner.request=controller;
  const current=()=>!controller.signal.aborted&&owner.active&&owner.request===controller&&context.current===owner;
  setState({owner,busy:true,message:""});
  try{
   const token=getAccessToken();
   const rows=await collectScopedExport((page,size)=>fetchPage(page,size,controller.signal,token),current,{pageSize:100,limit:5000,label});
   if(!rows||!current())return;
   const csv=serialize(rows);if(!current())return;
   downloadCsv(csv,fileName);setState({owner,busy:true,message:successMessage?.(rows)??`已导出 ${rows.length} 条匹配${label}。`});
  }catch(error){if(current())setState({owner,busy:true,message:error instanceof Error?error.message:"导出失败，请重新尝试。"});}
  finally{if(owner.request===controller){owner.request=null;if(context.current===owner&&owner.active)setState(previous=>previous.owner===owner?{...previous,busy:false}:previous);}}
 };
 const visible=state.owner===owner;
 return <div><button type="button" className="ds-button ds-button-secondary" style={{minHeight:44}} disabled={!enabled||(visible&&state.busy)} onClick={()=>void exportLedger()}>{visible&&state.busy?"正在导出…":`导出筛选${label}`}</button>{visible&&state.message?<p role="status">{state.message}</p>:null}</div>;
}
