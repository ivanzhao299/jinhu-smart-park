"use client";
import { useState,type FormEvent } from "react";
import { getAccessToken } from "../../lib/authz";
import { apartmentsApi,type ApartmentRecord } from "../../lib/apartments-api";
import styles from "./ApartmentWorkbench.module.css";

export function ApartmentRoomEditAction({room,onDone,onError}:{room:ApartmentRecord;onDone:()=>Promise<void>;onError:(value:string)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const facilities=Array.isArray(room.facilities)?room.facilities.map(String).join("、"):"";
 const occupiedCount=Number(room.occupied_count??0);
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;setBusy(true);const form=event.currentTarget;const f=new FormData(form);try{
  await apartmentsApi.mutate(`/apartments/rooms/${room.id}`,{room_type:f.get('room_type'),gender_policy:f.get('gender_policy'),capacity:Number(f.get('capacity')),facilities:String(f.get('facilities')||'').split('、').map(x=>x.trim()).filter(Boolean),management_status:f.get('management_status')},getAccessToken(),"PUT");
  setOpen(false);await onDone();
 }catch(error){onError(error instanceof Error?error.message:"保存失败")}finally{setBusy(false)}};
 if(!open)return <button className="ds-button ds-button-secondary" onClick={()=>setOpen(true)}>编辑</button>;
 return <form className={styles.inlinePanel} onSubmit={submit}>
  <label className="form-field"><span>公寓类型</span><select name="room_type" defaultValue={String(room.room_type??"talent")}>
   <option value="talent">人才公寓</option><option value="executive">高管宿舍</option><option value="employee">员工宿舍</option></select></label>
  <label className="form-field"><span>入住性别</span><select name="gender_policy" defaultValue={String(room.gender_policy??"any")}>
   <option value="any">不限</option><option value="male">男</option><option value="female">女</option></select></label>
  <label className="form-field"><span>床位数</span><input name="capacity" type="number" min={Math.max(1,occupiedCount)} max="20" defaultValue={String(room.capacity??"1")} onFocus={e=>e.currentTarget.select()} required/>
   {occupiedCount>0?<small>当前占用 {occupiedCount} 个床位，不能低于该值</small>:null}</label>
  <label className="form-field"><span>设施（顿号分隔）</span><input name="facilities" defaultValue={facilities} placeholder="空调、衣柜、热水器"/></label>
  <label className="form-field"><span>管理状态</span><select name="management_status" defaultValue={String(room.management_status??"enabled")}>
   <option value="enabled">已启用</option><option value="maintenance">维护中</option><option value="disabled">已停用</option></select>
   <small>停用要求该房源无预留、在住或待退记录</small></label>
  <div className={styles.actions}><button className="ds-button ds-button-primary" disabled={busy}>{busy?"保存中…":"保存修改"}</button><button className="ds-button ds-button-secondary" type="button" onClick={()=>setOpen(false)}>取消</button></div>
 </form>;
}
