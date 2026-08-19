"use client";
import { useEffect,useState,type FormEvent } from "react";
import { getAccessToken } from "../../lib/authz";
import { apartmentsApi,type ApartmentRecord } from "../../lib/apartments-api";
import styles from "./ApartmentWorkbench.module.css";

export function ApartmentAllocationAction({application,onDone,onError}:{application:ApartmentRecord;onDone:()=>Promise<void>;onError:(value:string)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[beds,setBeds]=useState<ApartmentRecord[]>([]),[loading,setLoading]=useState(false);
 useEffect(()=>{if(!open)return;setLoading(true);apartmentsApi.availableBeds(String(application.approved_start_date??application.requested_start_date),String(application.approved_end_date??application.requested_end_date??"")||undefined,getAccessToken()).then(setBeds).catch(error=>onError(error instanceof Error?error.message:"可用床位加载失败")).finally(()=>setLoading(false))},[application,open,onError]);
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget),bed=beds.find(item=>item.id===form.get("bed_id"));if(!bed){onError("请选择可用床位");return}setBusy(true);try{await apartmentsApi.mutate(`/apartments/applications/${application.id}/allocate`,{room_id:bed.room_id,bed_id:bed.id,planned_end_date:application.approved_end_date??application.requested_end_date??undefined},getAccessToken());setOpen(false);await onDone()}catch(error){onError(error instanceof Error?error.message:"分配失败")}finally{setBusy(false)}};
 if(!open)return <button className="ds-button ds-button-primary" onClick={()=>setOpen(true)}>分配床位</button>;
 return <form className={styles.inlinePanel} onSubmit={submit}><label className="form-field"><span>可用床位</span><select name="bed_id" disabled={loading||!beds.length} required><option value="">{loading?"正在加载…":beds.length?"请选择":"当前批准期限内无可用床位"}</option>{beds.map(bed=><option key={bed.id} value={bed.id}>{String(bed.unit_name??bed.unit_code)} / {String(bed.bed_code)} 床</option>)}</select></label><div className={styles.actions}><button className="ds-button ds-button-primary" disabled={busy||loading||!beds.length}>{busy?"分配中…":"确认分配"}</button><button className="ds-button ds-button-secondary" type="button" onClick={()=>setOpen(false)}>取消</button></div></form>;
}
