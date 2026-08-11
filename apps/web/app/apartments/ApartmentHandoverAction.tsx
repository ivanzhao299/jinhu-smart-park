"use client";
import { useState } from "react";
import type { FileRecord } from "@jinhu/shared";
import { FileUploader } from "../../components/files/FileUploader";
import { apartmentsApi } from "../../lib/apartments-api";
import { getAccessToken } from "../../lib/authz";
import styles from "./ApartmentWorkbench.module.css";
export function ApartmentHandoverAction({stayId,type,onDone,onError}:{stayId:string;type:'check-in'|'check-out';onDone:()=>Promise<void>;onError:(v:string)=>void}){
 const [files,setFiles]=useState<string[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const uploaded=(file:FileRecord)=>setFiles(v=>[...v,file.id]);
 const submit=async()=>{if(!files.length){onError('现场交接至少上传一张照片');return}setBusy(true);try{await apartmentsApi.mutate(`/apartments/stays/${stayId}/${type}`,{items:[],keys:[],photo_file_ids:files},getAccessToken());setOpen(false);await onDone()}catch(e){onError(e instanceof Error?e.message:'交接失败')}finally{setBusy(false)}};
 if(!open)return <button className="primary-button" onClick={()=>setOpen(true)}>{type==='check-in'?'办理入住':'完成验收'}</button>;
 return <div className={styles.actions}><FileUploader bizType={type==='check-in'?'apartment_move_in_handover':'apartment_move_out_handover'} policyKey="image" bizId={stayId} compact onUploaded={uploaded}/><button className="primary-button" disabled={busy} onClick={()=>void submit()}>{busy?'提交中…':`确认（${files.length}张）`}</button><button className="secondary-button" onClick={()=>setOpen(false)}>取消</button></div>;
}
