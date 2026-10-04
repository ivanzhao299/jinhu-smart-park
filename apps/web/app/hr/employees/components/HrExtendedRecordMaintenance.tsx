"use client";
import { useEffect,useRef,useState } from "react";
import { ApiError } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";
import { hrApi,type HrEmployeeRecords,type HrExtendedRecordKind } from "../../../../lib/hr-api";
import { admitRecordVersion,buildRecordPatch,createRecordDraft,recordDefinitions,recordTitle,type ExtendedRecord } from "../record-maintenance";
import styles from "./hr-family-maintenance.module.css";

type Props={employeeId:string;records:HrEmployeeRecords;canReadCredential:boolean;canReadRecords:boolean;captureScope:()=>()=>boolean;onReload:()=>void};
function RecordForm({employeeId,kind,record,canReadCredential,canReadRecords,captureScope,onReload,onCancel}:Omit<Props,"records">&{kind:HrExtendedRecordKind;record:ExtendedRecord|null;onCancel:()=>void}){
 const initial=createRecordDraft(kind,record);
 if(kind==="credential"&&!canReadCredential)initial.credentialNumber="";
 const [draft,setDraft]=useState(initial),[clearNumber,setClearNumber]=useState(false),[confirmArchive,setConfirmArchive]=useState(false);
 const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[message,setMessage]=useState("");
 const mounted=useRef(true),saving=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const admitted=admitRecordVersion(record),definition=recordDefinitions[kind];
 async function save(archive=false){
  if(!admitted||busy||blocked||saving.current||(archive&&!confirmArchive))return;
  const current=captureScope();saving.current=true;setBusy(true);setMessage("");
  try{
   const patch=buildRecordPatch(kind,draft,initial,record===null,clearNumber);
   if(!archive&&record&&!Object.keys(patch).length){setMessage("没有需要保存的修改。");return;}
   if(!archive&&kind==="credential"&&typeof patch.credentialNumber==="string"&&patch.credentialNumber.includes("*")){setMessage("请填写完整编号，不能把掩码作为新的编号保存。");return;}
   const token=getAccessToken();
   const expectedType=kind==="experience"?(patch.type??(record as {type:string}|null)?.type):kind;
   const result=record===null?await hrApi.createEmployeeRecord(employeeId,{...patch,recordType:expectedType,...(kind==="experience"?{type:undefined}:{})},token)
    :archive?await hrApi.archiveEmployeeRecord(employeeId,kind,record.id,record.version!,token)
    :await hrApi.updateEmployeeRecord(employeeId,kind,record.id,{...patch,expectedVersion:record.version!},token);
   if(!mounted.current||!current())return;
   const resultType=record===null?expectedType:kind;
   if(!result.id||result.recordType!==resultType||result.version!==(record?record.version!+1:1)||(record&&result.id!==record.id)||(archive&&result.archived!==true))throw new Error("档案保存响应无效");
   onReload();
  }catch(error){if(!mounted.current||!current())return;setBlocked(true);setMessage(error instanceof ApiError&&error.status===409?"档案已被其他操作更新，草稿已保留。请重新加载后核对。":"操作未确认，草稿已保留。请重新加载档案核对结果后再操作。");}
  finally{saving.current=false;if(mounted.current&&current())setBusy(false);}
 }
 const disabled=!admitted||busy||blocked;
 return <form className={`ds-scene-card ${styles.form}`} aria-label={`${record?"维护":"新增"}${definition.label}`} onSubmit={event=>{event.preventDefault();void save();}}>
  {definition.fields.map(field=>{
   if(field.key==="legacyGrade"&&!canReadRecords)return null;
   const label=field.key==="credentialNumber"&&record&&!canReadCredential?"新证照编号（不填保留）":field.label;
   const props={value:draft[field.key]??"",disabled:disabled||(field.key==="credentialNumber"&&clearNumber),required:field.required,onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>setDraft(previous=>({...previous,[field.key]:event.target.value}))};
   const minimum=field.key==="endDate"?draft.startDate:field.key==="validTo"?draft.acquiredDate:undefined;
   return <label className={`form-field ${field.type==="textarea"?styles.wide:""}`} key={field.key}><span>{label}</span>{field.options?<select {...props}>{!field.required?<option value="">未登记</option>:null}{field.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:field.type==="textarea"?<textarea {...props} maxLength={field.max} rows={3}/>:<input {...props} type={field.type??"text"} maxLength={field.max} min={minimum||undefined}/>}</label>;
  })}
  {kind==="credential"?<label className={styles.check}><input type="checkbox" checked={clearNumber} disabled={disabled} onChange={event=>setClearNumber(event.target.checked)}/>清空证照编号</label>:null}
  {!admitted?<p className={styles.wide}>维护版本尚未加载，请重新加载档案。</p>:null}
  {message?<p role="alert" className={styles.wide}>{message}</p>:null}
  <div className={`${styles.actions} ${styles.wide}`}><button className="ds-button ds-button-primary" disabled={disabled}>{busy?"处理中…":`保存${definition.label}`}</button><button type="button" className="ds-button" disabled={busy||blocked} onClick={onCancel}>取消</button>{blocked||!admitted?<button type="button" className="ds-button" disabled={busy} onClick={onReload}>重新加载档案</button>:null}</div>
  {record?<div className={`${styles.wide} ${styles.actions}`}><label className={styles.check}><input type="checkbox" checked={confirmArchive} disabled={disabled} onChange={event=>setConfirmArchive(event.target.checked)}/>确认归档此{definition.label}</label><button type="button" className="ds-button" disabled={disabled||!confirmArchive} onClick={()=>void save(true)}>归档{definition.label}</button><span>归档后不在当前档案显示，记录仍保留。</span></div>:null}
 </form>;
}
export function HrExtendedRecordMaintenance(props:Props){
 const [editing,setEditing]=useState<{kind:HrExtendedRecordKind;id:string}|null>(null);
 const rows={experience:props.records.experiences,skill:props.records.skills,credential:props.records.fieldAccess.credential?props.records.credentials:[]};
 const record=editing?rows[editing.kind].find(row=>row.id===editing.id)??null:null;
 return <section className={`ds-panel ${styles.panel}`} aria-label="扩展档案维护"><h3>经历、技能与证照维护</h3>
  {(Object.keys(recordDefinitions) as HrExtendedRecordKind[]).map(kind=><div key={kind} className={styles.actions}><strong>{recordDefinitions[kind].label}</strong><button type="button" className="ds-button" disabled={editing!==null} onClick={()=>setEditing({kind,id:"new"})}>新增{recordDefinitions[kind].label}</button>{rows[kind].map(row=><button type="button" className="ds-button" key={row.id} disabled={editing!==null} onClick={()=>setEditing({kind,id:row.id})}>维护{recordTitle(kind,row)}</button>)}</div>)}
  {editing?(editing.id!=="new"&&!record?<p role="status">记录已不在当前档案中，请重新加载核对。<button type="button" className="ds-button" onClick={props.onReload}>重新加载档案</button></p>:<RecordForm key={`${editing.kind}:${editing.id}:${record?.version??0}:${props.canReadCredential}:${props.canReadRecords}`} {...props} kind={editing.kind} record={record} onCancel={()=>setEditing(null)} onReload={()=>{setEditing(null);props.onReload()}}/>):null}
 </section>;
}
