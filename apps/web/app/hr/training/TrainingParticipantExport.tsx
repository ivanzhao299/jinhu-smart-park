"use client";

import {useEffect,useRef,useState} from "react";
import {getAccessToken} from "../../../lib/authz";
import {hrApi} from "../../../lib/hr-api";
import {downloadCsv} from "../../../lib/scoped-csv-export";
import {trainingParticipantLedgerCsv} from "./training-ledger-export";

export function TrainingParticipantExport({planId,contextKey,enabled,selfOnly,teamOnly,canCost}:{
 planId:string;contextKey:string;enabled:boolean;selfOnly:boolean;teamOnly:boolean;canCost:boolean;
}){
 const exportContextKey=JSON.stringify([contextKey,planId,enabled,selfOnly,teamOnly,canCost]);
 const context=useRef({key:exportContextKey,enabled});context.current={key:exportContextKey,enabled};
 const request=useRef<AbortController|null>(null),[state,setState]=useState({key:exportContextKey,busy:false,message:""});
 useEffect(()=>{setState({key:exportContextKey,busy:false,message:""});return()=>{request.current?.abort();request.current=null;};},[exportContextKey]);
 const exportRecords=async()=>{
  if(!enabled||request.current)return;
  const controller=new AbortController();request.current=controller;
  const current=()=>!controller.signal.aborted&&request.current===controller&&context.current.key===exportContextKey&&context.current.enabled;
  setState({key:exportContextKey,busy:true,message:""});
  try{
   const detail=await hrApi.trainingPlan(planId,getAccessToken(),controller.signal);
   if(!current())return;
   if(detail.id!==planId||!Array.isArray(detail.participants)||typeof detail.code!=="string"||typeof detail.name!=="string"
    ||detail.participants.some(row=>!row||typeof row.employeeName!=="string"||typeof row.status!=="string"))throw new Error("培训记录响应无法核对，请重新导出。");
   if(detail.participants.length>5000)throw new Error("本计划可见培训记录超过5000条，请联系HR按业务范围分批核对。");
   const csv=trainingParticipantLedgerCsv(detail,{selfOnly,teamOnly,canCost});
   if(!current())return;
   downloadCsv(csv,"培训参训记录.csv");
   setState({key:exportContextKey,busy:true,message:`已导出本计划 ${detail.participants.length} 条可见培训记录。`});
  }catch(error){if(current())setState({key:exportContextKey,busy:true,message:error instanceof Error?error.message:"导出培训记录失败，请重试。"});}
  finally{if(request.current===controller){request.current=null;if(context.current.key===exportContextKey)setState(previous=>({...previous,busy:false}));}}
 };
 const visible=state.key===exportContextKey;
 return <div><button type="button" className="ds-button ds-button-secondary" disabled={!enabled||(visible&&state.busy)} onClick={()=>void exportRecords()}>{visible&&state.busy?"正在导出…":"导出本计划培训记录"}</button>{visible&&state.message?<p role="status">{state.message}</p>:null}</div>;
}
