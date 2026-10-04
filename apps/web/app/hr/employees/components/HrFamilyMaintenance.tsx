"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";
import { hrApi, type HrEmployeeFamilyRecord, type HrFamilyFields } from "../../../../lib/hr-api";
import styles from "./hr-family-maintenance.module.css";

type Props={employeeId:string;members:HrEmployeeFamilyRecord[];canReadFull:boolean;captureScope:()=>()=>boolean;onReload:()=>void};
const ordinary=[{key:"relationship",label:"关系",max:32},{key:"birthDate",label:"出生日期",max:10},{key:"workUnit",label:"工作单位",max:200},{key:"jobTitle",label:"职务",max:160},{key:"politicalStatus",label:"政治面貌",max:64}] as const;
type Draft={relationship:string;birthDate:string;workUnit:string;jobTitle:string;politicalStatus:string;fullName:string;contact:string;identityNumber:string};
function FamilyForm({employeeId,record,canReadFull,captureScope,onReload,onCancel}:Omit<Props,"members">&{record:HrEmployeeFamilyRecord|null;onCancel:()=>void}){
  const initial:Draft={relationship:record?.relationship??"",birthDate:record?.birthDate??"",workUnit:record?.workUnit??"",jobTitle:record?.jobTitle??"",politicalStatus:record?.politicalStatus??"",fullName:canReadFull?record?.fullName??"":"",contact:canReadFull?record?.contact??"":"",identityNumber:""};
  const [draft,setDraft]=useState(initial),[emergency,setEmergency]=useState(record?.isEmergencyContact??false);
  const [clearIdentity,setClearIdentity]=useState(false),[clearContact,setClearContact]=useState(false),[confirmArchive,setConfirmArchive]=useState(false);
  const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[message,setMessage]=useState("");
  const mounted=useRef(true),saving=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;}},[]);
  const admitted=record===null||(Number.isInteger(record.version)&&record.version!>=1&&record.version!<=2147483646);
  async function save(archive=false){
    if(!admitted||busy||blocked||saving.current||(archive&&!confirmArchive))return;
    const current=captureScope();saving.current=true;setBusy(true);setMessage("");
    try{
      const patch:HrFamilyFields={};
      for(const field of ordinary){if(record===null||draft[field.key]!==initial[field.key]){
        const value=draft[field.key].trim();if(field.key==="relationship")patch.relationship=value;else patch[field.key]=value||null;
      }}
      if(record===null||draft.fullName!==initial.fullName)patch.fullName=draft.fullName.trim();
      if(clearIdentity)patch.identityNumber=null;else if(draft.identityNumber.trim())patch.identityNumber=draft.identityNumber.trim();
      if(clearContact)patch.contact=null;else if(record===null||draft.contact!==initial.contact)patch.contact=draft.contact.trim()||null;
      if(record===null||emergency!==record.isEmergencyContact)patch.isEmergencyContact=emergency;
      if(!archive&&record!==null&&!Object.keys(patch).length){setMessage("没有需要保存的修改。");return;}
      const token=getAccessToken();
      const result=record===null?await hrApi.createFamily(employeeId,{...patch,fullName:patch.fullName!,relationship:patch.relationship!},token)
        :archive?await hrApi.archiveFamily(employeeId,record.id,record.version!,token)
        :await hrApi.updateFamily(employeeId,record.id,{...patch,expectedVersion:record.version!},token);
      if(!mounted.current||!current())return;
      if(!result.id||result.recordType!=="family"||result.version!==(record?record.version!+1:1)||(record&&result.id!==record.id)||(archive&&result.archived!==true))throw new Error("家庭成员保存响应无效");
      onReload();
    }catch(error){if(!mounted.current||!current())return;setBlocked(true);setMessage(error instanceof ApiError&&error.status===409?"资料已被其他操作更新，草稿已保留。请重新加载后核对。":"操作未确认，草稿已保留。请重新加载档案核对结果后再操作。");}
    finally{saving.current=false;if(mounted.current&&current())setBusy(false);}
  }
  const disabled=!admitted||busy||blocked;
  return <form className={`ds-scene-card ${styles.form}`} aria-label={record?"维护家庭成员":"新增家庭成员"} onSubmit={event=>{event.preventDefault();void save();}}>
    {ordinary.map(field=><label className="form-field" key={field.key}><span>{field.label}</span><input type={field.key==="birthDate"?"date":"text"} maxLength={field.max} required={field.key==="relationship"} value={draft[field.key]} disabled={disabled} onChange={event=>setDraft(previous=>({...previous,[field.key]:event.target.value}))}/></label>)}
    <label className="form-field"><span>{record&&!canReadFull?"新姓名（不填保留）":"姓名"}</span><input maxLength={100} required={!record||Boolean(initial.fullName)} value={draft.fullName} disabled={disabled} onChange={event=>setDraft(previous=>({...previous,fullName:event.target.value}))}/></label>
    <label className="form-field"><span>新证件号（不填保留）</span><input maxLength={64} value={draft.identityNumber} disabled={disabled||clearIdentity} onChange={event=>setDraft(previous=>({...previous,identityNumber:event.target.value}))}/></label>
    <label className={styles.check}><input type="checkbox" checked={clearIdentity} disabled={disabled} onChange={event=>setClearIdentity(event.target.checked)}/>清空证件号</label>
    <label className="form-field"><span>{record&&!canReadFull?"新联系方式（不填保留）":"联系方式"}</span><input maxLength={64} value={draft.contact} disabled={disabled||clearContact} onChange={event=>setDraft(previous=>({...previous,contact:event.target.value}))}/></label>
    <label className={styles.check}><input type="checkbox" checked={clearContact} disabled={disabled} onChange={event=>setClearContact(event.target.checked)}/>清空联系方式</label>
    <label className={styles.check}><input type="checkbox" checked={emergency} disabled={disabled} onChange={event=>setEmergency(event.target.checked)}/>紧急联系人</label>
    {!admitted?<p className={styles.wide}>维护版本尚未加载，请重新加载档案。</p>:null}
    {message?<p role="status" className={styles.wide}>{message}</p>:null}
    <div className={`${styles.actions} ${styles.wide}`}><button className="ds-button ds-button-primary" disabled={disabled}>{busy?"处理中…":"保存家庭成员"}</button><button type="button" className="ds-button" disabled={busy||blocked} onClick={onCancel}>取消</button>{blocked||!admitted?<button type="button" className="ds-button" disabled={busy} onClick={onReload}>重新加载档案</button>:null}</div>
    {record?<div className={`${styles.wide} ${styles.actions}`}><label className={styles.check}><input type="checkbox" checked={confirmArchive} disabled={disabled} onChange={event=>setConfirmArchive(event.target.checked)}/>确认移除此家庭成员</label><button type="button" className="ds-button" disabled={disabled||!confirmArchive} onClick={()=>void save(true)}>移除家庭成员</button><span>移除后不在当前档案显示，记录仍保留。</span></div>:null}
  </form>;
}
export function HrFamilyMaintenance(props:Props){
  const [editing,setEditing]=useState<string|null>(null);
  const record=props.members.find(member=>member.id===editing)??null;
  return <section className={`ds-panel ${styles.panel}`} aria-label="家庭成员维护"><h3>家庭成员维护</h3><div className={styles.actions}><button type="button" className="ds-button" disabled={editing!==null} onClick={()=>setEditing("new")}>新增家庭成员</button>{props.members.map(member=><button key={member.id} type="button" className="ds-button" disabled={editing!==null} onClick={()=>setEditing(member.id)}>维护{props.canReadFull?member.fullName||member.fullNameMasked:member.fullNameMasked}</button>)}</div>
    {editing!==null?(editing!=="new"&&!record?<p role="status">家庭成员已不在当前档案中，请重新加载核对。<button type="button" className="ds-button" onClick={props.onReload}>重新加载档案</button></p>:<FamilyForm key={`${editing}:${record?.version??0}:${props.canReadFull}`} {...props} record={record} onCancel={()=>setEditing(null)} onReload={()=>{setEditing(null);props.onReload();}}/>):null}
  </section>;
}
