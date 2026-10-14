"use client";
import { useEffect,useMemo,useState,type FormEvent } from "react";
import { getAccessToken } from "../../lib/authz";
import { apartmentsApi,type ApartmentRecord } from "../../lib/apartments-api";
import styles from "./ApartmentWorkbench.module.css";
import { SearchSelect,type SearchSelectOption } from "./SearchSelect";

const roomTypeLabels:Record<string,string>={talent:"人才公寓",executive:"高管宿舍",employee:"员工宿舍"};

export function ApartmentAllocationAction({application,onDone,onError}:{application:ApartmentRecord;onDone:()=>Promise<void>;onError:(value:string)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[beds,setBeds]=useState<ApartmentRecord[]>([]),[loading,setLoading]=useState(false),[bedKeyword,setBedKeyword]=useState(''),[bedId,setBedId]=useState('');
 useEffect(()=>{if(!open)return;setLoading(true);apartmentsApi.availableBeds(String(application.approved_start_date??application.requested_start_date),String(application.approved_end_date??application.requested_end_date??"")||undefined,getAccessToken()).then(setBeds).catch(error=>onError(error instanceof Error?error.message:"可用床位加载失败")).finally(()=>setLoading(false))},[application,open,onError]);
 const bedOptions=useMemo<SearchSelectOption[]>(()=>{
  const keyword=bedKeyword.trim().toLowerCase();
  return beds.filter(bed=>{
   if(!keyword)return true;
   const haystack=`${String(bed.unit_name??'')}${String(bed.unit_code??'')}${String(bed.bed_code??'')}${roomTypeLabels[String(bed.room_type)]??''}`.toLowerCase();
   return haystack.includes(keyword);
  }).map(bed=>({value:bed.id,label:`${String(bed.unit_name??bed.unit_code)} / ${String(bed.bed_code)} 床`,detail:roomTypeLabels[String(bed.room_type)]??String(bed.room_type??'')}));
 },[beds,bedKeyword]);
 const selectedBed=beds.find(item=>item.id===bedId);
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;if(!selectedBed){onError("请选择可用床位");return}setBusy(true);try{await apartmentsApi.mutate(`/apartments/applications/${application.id}/allocate`,{room_id:selectedBed.room_id,bed_id:selectedBed.id,planned_end_date:toApiDate(application.approved_end_date??application.requested_end_date)},getAccessToken());setOpen(false);await onDone()}catch(error){onError(error instanceof Error?error.message:"分配失败")}finally{setBusy(false)}};
 if(!open)return <button className="ds-button ds-button-primary" onClick={()=>setOpen(true)}>分配床位</button>;
 return <form className={styles.inlinePanel} onSubmit={submit}><SearchSelect value={bedId} options={bedOptions} loading={loading} placeholder={beds.length?"请选择床位":"当前批准期限内无可用床位"} searchPlaceholder="输入房号、床位号或房型搜索" emptyText="没有匹配的床位" onSearchChange={setBedKeyword} onSelect={setBedId}/><div className={styles.actions}><button className="ds-button ds-button-primary" disabled={busy||loading||!beds.length}>{busy?"分配中…":"确认分配"}</button><button className="ds-button ds-button-secondary" type="button" onClick={()=>setOpen(false)}>取消</button></div></form>;
}

const toApiDate=(value:unknown)=>{if(typeof value!=="string"||!value)return undefined;if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}-${String(parsed.getDate()).padStart(2,"0")}`;};
