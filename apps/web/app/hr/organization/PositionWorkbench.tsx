"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ApiError} from "../../../lib/api-client";
import {getAccessToken} from "../../../lib/authz";
import {hrApi,type HrPosition,type HrPositionMaintenance,type HrPositionMaintenanceOptions} from "../../../lib/hr-api";
import {useHrResource} from "../use-hr-resource";
import {hrLoadErrorMessage} from "../hr-errors";
import local from "./position-maintenance.module.css";
import styles from "../hr-workbench.module.css";

const textFields=[{key:"positionCode",label:"岗位编码",max:64,required:true},{key:"positionName",label:"岗位名称",max:100,required:true},{key:"jobFamily",label:"职族",max:64},{key:"jobLevel",label:"职级",max:32},{key:"authority",label:"权限说明",max:1024},{key:"qualification",label:"任职资格",max:1024},{key:"responsibilities",label:"岗位职责",max:1024},{key:"positionManual",label:"岗位说明",max:256},{key:"remark",label:"备注",max:500}] as const;
const numericFields=[{key:"headcountLimit",label:"编制人数",max:100000},{key:"hierarchyLevel",label:"岗位层级",max:32767},{key:"sortOrder",label:"显示排序",max:2147483647}] as const;
function checkedOptions(value:HrPositionMaintenanceOptions){
 if(!value||!Array.isArray(value.orgs)||!Array.isArray(value.parents)||value.orgs.some(r=>!r||typeof r.id!=="string"||typeof r.orgName!=="string"||!["enabled","disabled"].includes(r.status))||value.parents.some(r=>!r||typeof r.id!=="string"||typeof r.positionName!=="string"||typeof r.positionCode!=="string"||typeof r.orgId!=="string"||!["enabled","disabled"].includes(r.status)))throw Error("岗位选项未完整返回，请重新读取。");return value;
}
function checkedPosition(row:HrPositionMaintenance,id?:string){
 if(!row||typeof row.id!=="string"||!row.id||id&&row.id!==id||!Number.isSafeInteger(row.version)||row.version<1||typeof row.orgId!=="string"||typeof row.positionCode!=="string"||typeof row.positionName!=="string"||!["enabled","disabled"].includes(row.status)||textFields.some(f=>("required" in f&&f.required)?typeof row[f.key]!=="string":row[f.key]!==null&&typeof row[f.key]!=="string")||numericFields.some(f=>row[f.key]!==null&&(!Number.isSafeInteger(row[f.key])||Number(row[f.key])<0||Number(row[f.key])>f.max))||row.sortOrder===null||row.reportsToPositionId!==null&&typeof row.reportsToPositionId!=="string")throw Error("岗位资料未完整返回，请重新读取。");return row;
}
export function PositionWorkbench({canManage,canRead}:{canManage:boolean;canRead:boolean}){
 const read=useCallback((signal:AbortSignal)=>hrApi.positions(getAccessToken(),signal),[]),list=useHrResource(canRead,read,"读取岗位列表失败");
 const [selection,setSelection]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const committed=useCallback(async()=>{if(canRead)await list.load();},[canRead,list.load]);
 return <>
  <section className="ds-panel" aria-label="岗位档案"><div className={styles.sectionHeader}><h2>岗位档案</h2><div className={local.actions}>{canManage?<button className="ds-button ds-button-primary" type="button" disabled={busy} onClick={()=>setSelection("new")}>新增岗位</button>:null}{canRead?<button className="ds-button" type="button" disabled={busy||list.loading} onClick={()=>void list.load()}>刷新岗位</button>:null}</div></div>
   {list.loading?<p role="status">正在读取岗位…</p>:null}{list.error?<p role="alert">{list.error}</p>:null}
   {canRead&&list.data?<div className={`ds-mobile-record-list ${local.records}`}>{list.data.length?list.data.map((row:HrPosition)=><article className="ds-mobile-record" key={row.id}><strong>{row.positionName}</strong><span>{row.positionCode} · {row.status==="enabled"?"启用":"停用"}</span><span>{row.jobFamily||"未设置职族"} · {row.jobLevel||"未设置职级"}</span><span>编制：{row.headcountLimit??"未限制"}</span>{canManage?<button className="ds-button" type="button" disabled={busy} onClick={()=>setSelection(row.id)}>维护岗位</button>:null}</article>):<p>当前范围暂无岗位。</p>}</div>:null}
  </section>
  {canManage&&selection?<PositionEditor key={selection} id={selection==="new"?undefined:selection} onBusy={setBusy} onCommitted={committed} onClose={()=>setSelection(null)}/>:null}
 </>;
}
function PositionEditor({id,onBusy,onCommitted,onClose}:{id?:string;onBusy:(busy:boolean)=>void;onCommitted:()=>Promise<void>;onClose:()=>void}){
 const read=useCallback(async(signal:AbortSignal)=>{if(!id)return {position:null,...checkedOptions(await hrApi.positionMaintenanceOptions(getAccessToken(),signal))};const value=await hrApi.positionMaintenance(id,getAccessToken(),signal);checkedOptions(value);return {...value,position:checkedPosition(value.position,id)};},[id]);
 const resource=useHrResource(true,read,"读取岗位维护资料失败"),[error,setError]=useState(""),[saved,setSaved]=useState(false),[warning,setWarning]=useState(""),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const alive=useRef(true),writing=useRef(false),key=useRef(crypto.randomUUID()),pending=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(writing.current||saved||!resource.data||resource.loading)return;
  const form=new FormData(event.currentTarget),body:Record<string,unknown>=pending.current?JSON.parse(pending.current):{orgId:String(form.get("orgId")??""),reportsToPositionId:String(form.get("reportsToPositionId")??"")||null,status:String(form.get("status")??"enabled")};
  if(!pending.current){
  for(const f of textFields){const value=String(form.get(f.key)??"").trim();if(("required" in f&&f.required&&!value)||value.length>f.max){setError(`请核对${f.label}，最多${f.max}字。`);return;}body[f.key]=value||null;}
  for(const f of numericFields){const value=String(form.get(f.key)??"");const number=value===""?(f.key==="sortOrder"?0:null):Number(value);if(number!==null&&(!Number.isSafeInteger(number)||number<0||number>f.max)){setError(`请核对${f.label}，范围为0至${f.max}的整数。`);return;}body[f.key]=number;}
  if(!body.orgId){setError("请选择所属组织。");return;}
  if(id){body.expectedVersion=resource.data.position!.version;body.reason=String(form.get("reason")??"").trim();if(!body.reason||String(body.reason).length>500){setError("请填写维护原因，最多500字。");return;}}
  }
  const fingerprint=JSON.stringify(body);if(pending.current!==null&&pending.current!==fingerprint){setError("上次保存结果尚未确认，请保持原内容重试。");return;}
  writing.current=true;onBusy(true);setBusy(true);setError("");pending.current=fingerprint;setUncertain(true);
  try{
   const row=id?await hrApi.updatePosition(id,body,getAccessToken(),key.current):await hrApi.createPosition(body,getAccessToken(),key.current);checkedPosition(row,id);
   if(!alive.current)return;pending.current=null;setUncertain(false);setSaved(true);setWarning("");try{await onCommitted();}catch{if(alive.current)setWarning("岗位已保存，列表刷新失败，请刷新岗位列表。");}
  }catch(e){if(alive.current){if(e instanceof ApiError&&([400,403,404,422].includes(e.status)||e.status===409&&/岗位已被修改|岗位编码已存在|岗位任职关系已变化/.test(e.message))){pending.current=null;key.current=crypto.randomUUID();setUncertain(false);}setError(hrLoadErrorMessage(e,"保存岗位失败，请保持原内容重试。"));}}
  finally{writing.current=false;if(alive.current){setBusy(false);onBusy(pending.current!==null);}}
 };
 const reload=async()=>{if(busy||uncertain)return;setSaved(false);setError("");key.current=crypto.randomUUID();if(!await resource.load())setWarning("岗位资料读取失败，请重试读取；不要重复提交已保存内容。");else setWarning("");};
 const row=resource.data?.position;
 return <section className={`ds-panel ${local.editor}`} aria-label={id?"维护岗位资料":"新增岗位资料"}><div className={styles.sectionHeader}><h2>{id?"维护岗位":"新增岗位"}</h2><button className="ds-button" type="button" disabled={busy||uncertain} onClick={onClose}>关闭岗位表单</button></div>
  {resource.loading?<p role="status">正在读取岗位维护资料…</p>:null}{resource.error?<div role="alert"><p>{resource.error}</p><button className="ds-button" type="button" onClick={()=>void reload()}>重试读取岗位资料</button></div>:null}
  {saved?<p role="status">岗位已保存。{id?<button className="ds-button" type="button" onClick={()=>void reload()}>继续维护此岗位</button>:null}</p>:null}{warning?<p role="alert">{warning}</p>:null}
  {resource.data?<form onSubmit={event=>void submit(event)}><fieldset className={`${styles.formGrid} ${local.form}`} disabled={busy||saved||uncertain} style={{border:0,padding:0,minWidth:0}}>
   <label className="form-field"><span>所属组织</span><select name="orgId" defaultValue={row?.orgId??""} required><option value="">请选择组织</option>{resource.data.orgs.map(org=><option key={org.id} value={org.id} disabled={org.status!=="enabled"&&org.id!==row?.orgId}>{org.orgName}{org.status==="disabled"?"（停用）":""}</option>)}</select></label>
   {textFields.slice(0,4).map(f=><label className="form-field" key={f.key}><span>{f.label}</span>{f.max>256?<textarea name={f.key} maxLength={f.max} defaultValue={row?.[f.key]??""} rows={3}/>:<input name={f.key} maxLength={f.max} required={"required" in f&&f.required===true} defaultValue={row?.[f.key]??""}/>}</label>)}
   <label className="form-field"><span>上级岗位</span><select name="reportsToPositionId" defaultValue={row?.reportsToPositionId??""}><option value="">无上级岗位</option>{resource.data.parents.map(parent=><option key={parent.id} value={parent.id} disabled={parent.status!=="enabled"&&parent.id!==row?.reportsToPositionId}>{parent.positionName} · {parent.positionCode}{parent.status==="disabled"?"（停用）":""}</option>)}</select></label>
   {numericFields.map(f=><label className="form-field" key={f.key}><span>{f.label}</span><input name={f.key} type="number" min={0} max={f.max} step={1} defaultValue={row?.[f.key]??(f.key==="sortOrder"?0:"")} onFocus={event=>event.target.select()}/></label>)}
   <label className="form-field"><span>启用状态</span><select name="status" defaultValue={row?.status??"enabled"}><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
   {textFields.slice(4).map(f=><label className={`form-field ${local.wideField}`} key={f.key}><span>{f.label}</span>{f.max>256?<textarea name={f.key} maxLength={f.max} defaultValue={row?.[f.key]??""} rows={3}/>:<input name={f.key} maxLength={f.max} required={"required" in f&&f.required===true} defaultValue={row?.[f.key]??""}/>}</label>)}
   {id?<label className="form-field"><span>维护原因</span><textarea name="reason" maxLength={500} rows={2} required/></label>:null}
  </fieldset><div className={local.actions}><button className="ds-button ds-button-primary" type="submit" disabled={busy||saved}>{busy?"正在保存…":uncertain?"按原内容重试保存":id?"保存岗位修改":"确认新增岗位"}</button>{id?<button className="ds-button" type="button" disabled={busy||uncertain} onClick={()=>void reload()}>重新读取岗位资料</button>:null}</div>{error?<p role="alert">{error}</p>:null}{uncertain&&!busy?<p>保存结果尚未确认，请按原内容重试。</p>:null}</form>:null}
 </section>;
}
